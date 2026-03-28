import { useState, useMemo } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Search, Camera, MapPin, Package, Loader2 } from "lucide-react"
import { apiFetch } from "@/api/client"
import { useLocations } from "@/hooks/useLocations"
import { useSearch } from "@/hooks/useSearch"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { QrScanner } from "@/components/QrScanner"

interface MoveItemsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  itemIds: string[]
  onSuccess?: () => void
}

/** A unified destination entry — either a location or a container item. */
interface Destination {
  id: string
  kind: "location" | "container"
  name: string
  code: string
  subtitle: string | null
}

export function MoveItemsDialog({ open, onOpenChange, itemIds, onSuccess }: MoveItemsDialogProps) {
  const [mode, setMode] = useState<"search" | "scan">("search")
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<Destination | null>(null)
  const [note, setNote] = useState("")
  const [scanError, setScanError] = useState<string | null>(null)
  const [resolving, setResolving] = useState(false)

  const { data: locData } = useLocations({ rootOnly: false })
  const { data: searchData } = useSearch(search.trim())
  const qc = useQueryClient()

  const movingSet = useMemo(() => new Set(itemIds), [itemIds])

  // When user hasn't typed enough for search, show all locations as defaults.
  // When search is active, merge locations + containers from search results.
  const destinations = useMemo<Destination[]>(() => {
    if (search.trim().length < 2) {
      // No active search — show locations only (they're typically fewer)
      return (locData?.locations ?? []).map((l) => ({
        id: l.id,
        kind: "location" as const,
        name: l.name,
        code: l.code,
        subtitle: l.path_text ?? null,
      }))
    }

    // Active search — use server-side search results
    const locs: Destination[] = (searchData?.locations ?? []).map((l) => ({
      id: l.id,
      kind: "location",
      name: l.name,
      code: l.code,
      subtitle: l.path_text ?? null,
    }))

    const containers: Destination[] = (searchData?.containers ?? [])
      .filter((c) => !movingSet.has(c.id))
      .map((c) => ({
        id: c.id,
        kind: "container",
        name: c.name,
        code: c.code,
        subtitle: c.brand || null,
      }))

    return [...locs, ...containers]
  }, [search, locData, searchData, movingSet])

  // For the pre-search state, do client-side filtering on locations
  const filtered = useMemo(() => {
    if (search.trim().length >= 2) {
      // Already server-filtered
      return destinations
    }
    if (!search.trim()) return destinations
    // 1 character typed — client-filter locations
    return destinations.filter(
      (d) =>
        d.name.toLowerCase().includes(search.toLowerCase()) ||
        d.code.toLowerCase().includes(search.toLowerCase()) ||
        (d.subtitle && d.subtitle.toLowerCase().includes(search.toLowerCase()))
    )
  }, [search, destinations])

  const mutation = useMutation({
    mutationFn: async (dest: Destination) => {
      const body =
        dest.kind === "location"
          ? { location_id: dest.id, note: note.trim() || undefined }
          : { container_id: dest.id, note: note.trim() || undefined }

      const results = await Promise.allSettled(
        itemIds.map((id) =>
          apiFetch(`/items/${id}/move`, {
            method: "POST",
            body: JSON.stringify(body),
          })
        )
      )
      const failures = results.filter((r) => r.status === "rejected")
      if (failures.length > 0) {
        throw new Error(`Failed to move ${failures.length} of ${itemIds.length} items`)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["items"] })
      qc.invalidateQueries({ queryKey: ["location-contents"] })
      resetState()
      onOpenChange(false)
      onSuccess?.()
    },
  })

  const handleSelect = (dest: Destination) => {
    setSelected(dest)
    setSearch("")
    setScanError(null)
  }

  const handleQrScan = async (code: string) => {
    setScanError(null)
    setResolving(true)
    try {
      const result = await apiFetch<{
        entity_type: string
        entity_id: string
        name: string
        code: string
        archived: boolean
        is_container?: boolean
      }>(`/scan/${encodeURIComponent(code)}`)

      if (result.archived) {
        setScanError("This entity is archived.")
        setResolving(false)
        return
      }

      if (result.entity_type === "location") {
        setSelected({
          id: result.entity_id,
          kind: "location",
          name: result.name,
          code: result.code,
          subtitle: null,
        })
      } else if (result.entity_type === "item") {
        if (!result.is_container) {
          setScanError("Scanned item is not a container.")
          setResolving(false)
          return
        }
        if (movingSet.has(result.entity_id)) {
          setScanError("Cannot move an item into itself.")
          setResolving(false)
          return
        }
        setSelected({
          id: result.entity_id,
          kind: "container",
          name: result.name,
          code: result.code,
          subtitle: null,
        })
      } else {
        setScanError(`Scanned code is a ${result.entity_type}, not a location or container.`)
      }
    } catch {
      setScanError("Could not resolve scanned code. Try again or search manually.")
    }
    setResolving(false)
  }

  const handleSubmit = () => {
    if (!selected) return
    mutation.mutate(selected)
  }

  const handleClear = () => {
    setSelected(null)
    setScanError(null)
  }

  const resetState = () => {
    setSelected(null)
    setSearch("")
    setNote("")
    setScanError(null)
    setMode("search")
  }

  const errorMessage = mutation.isError
    ? typeof (mutation.error as any)?.message === "string"
      ? (mutation.error as Error).message
      : "Failed to move items"
    : null

  const itemLabel = itemIds.length === 1 ? "item" : "items"

  const DestIcon = ({ kind }: { kind: "location" | "container" }) =>
    kind === "location" ? (
      <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
    ) : (
      <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
    )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move {itemIds.length} {itemLabel}</DialogTitle>
          <DialogDescription>Choose a destination location or container.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {/* Destination selected — show confirmation chip */}
          {selected ? (
            <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2">
              <DestIcon kind={selected.kind} />
              <div className="flex-1 min-w-0">
                <span className="text-sm truncate block">{selected.name}</span>
                {selected.subtitle && (
                  <span className="text-xs text-muted-foreground truncate block">{selected.subtitle}</span>
                )}
              </div>
              <span className="text-xs text-muted-foreground shrink-0 capitalize">{selected.kind}</span>
              <button
                onClick={handleClear}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Change
              </button>
            </div>
          ) : (
            <>
              {/* Mode toggle */}
              <div className="flex gap-1 rounded-md border p-1">
                <button
                  onClick={() => { setMode("search"); setScanError(null) }}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                    mode === "search"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Search className="h-3.5 w-3.5" />
                  Search
                </button>
                <button
                  onClick={() => { setMode("scan"); setScanError(null) }}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                    mode === "scan"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Camera className="h-3.5 w-3.5" />
                  Scan QR
                </button>
              </div>

              {mode === "search" ? (
                <div>
                  <Label>Search locations &amp; containers</Label>
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Type to search by name, code, or path..."
                    autoFocus
                  />
                  {filtered.length > 0 && (
                    <div className="mt-1 max-h-48 overflow-y-auto rounded-md border">
                      {filtered.slice(0, 30).map((dest) => (
                        <button
                          key={`${dest.kind}-${dest.id}`}
                          onClick={() => handleSelect(dest)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted min-h-[44px]"
                        >
                          <DestIcon kind={dest.kind} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{dest.name}</p>
                            {dest.subtitle && (
                              <p className="truncate text-xs text-muted-foreground">{dest.subtitle}</p>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground shrink-0">{dest.code}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {search.trim() && filtered.length === 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">No locations or containers found.</p>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {resolving ? (
                    <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Resolving...
                    </div>
                  ) : (
                    <QrScanner onScan={handleQrScan} />
                  )}
                  {scanError && (
                    <p className="text-sm text-destructive">{scanError}</p>
                  )}
                </div>
              )}
            </>
          )}
          <div>
            <Label>Note (optional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Movement note" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!selected || mutation.isPending}>
            {mutation.isPending ? "Moving..." : "Move"}
          </Button>
        </DialogFooter>
        {errorMessage && (
          <p className="text-sm text-destructive">{errorMessage}</p>
        )}
      </DialogContent>
    </Dialog>
  )
}
