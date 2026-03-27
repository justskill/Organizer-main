import { useState } from "react"
import { Search, Camera, MapPin, Loader2 } from "lucide-react"
import { apiFetch } from "@/api/client"
import { useLocations, useUpdateLocation } from "@/hooks/useLocations"
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

interface MoveLocationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  locationId: string
  locationName: string
  onSuccess?: () => void
}

export function MoveLocationDialog({ open, onOpenChange, locationId, locationName, onSuccess }: MoveLocationDialogProps) {
  const [mode, setMode] = useState<"search" | "scan">("search")
  const [search, setSearch] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedName, setSelectedName] = useState("")
  const [scanError, setScanError] = useState<string | null>(null)
  const [resolving, setResolving] = useState(false)

  const { data } = useLocations({ rootOnly: false })
  const updateLocation = useUpdateLocation(locationId)

  // Exclude the location itself and its descendants from the list
  const allLocations = (data?.locations ?? []).filter((l) => l.id !== locationId)

  const filtered = search.trim()
    ? allLocations.filter(
        (l) =>
          l.name.toLowerCase().includes(search.toLowerCase()) ||
          l.code.toLowerCase().includes(search.toLowerCase()) ||
          (l.path_text && l.path_text.toLowerCase().includes(search.toLowerCase()))
      )
    : allLocations

  const handleSelect = (loc: { id: string; name: string; path_text?: string | null }) => {
    setSelectedId(loc.id)
    setSelectedName(loc.path_text || loc.name)
    setSearch("")
    setScanError(null)
  }

  const handleSelectRoot = () => {
    setSelectedId("")
    setSelectedName("Root (no parent)")
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
      }>(`/scan/${encodeURIComponent(code)}`)

      if (result.entity_type !== "location") {
        setScanError(`Scanned code is a ${result.entity_type}, not a location.`)
        setResolving(false)
        return
      }
      if (result.archived) {
        setScanError("This location is archived.")
        setResolving(false)
        return
      }
      if (result.entity_id === locationId) {
        setScanError("Cannot move a location into itself.")
        setResolving(false)
        return
      }
      const match = allLocations.find((l) => l.id === result.entity_id)
      setSelectedId(result.entity_id)
      setSelectedName(match?.path_text || match?.name || result.name)
    } catch {
      setScanError("Could not resolve scanned code. Try again or search manually.")
    }
    setResolving(false)
  }

  const handleSubmit = () => {
    if (selectedId === null) return
    updateLocation.mutate(
      { parent_location_id: selectedId || null },
      {
        onSuccess: () => {
          resetState()
          onOpenChange(false)
          onSuccess?.()
        },
      }
    )
  }

  const handleClear = () => {
    setSelectedId(null)
    setSelectedName("")
    setScanError(null)
  }

  const resetState = () => {
    setSelectedId(null)
    setSelectedName("")
    setSearch("")
    setScanError(null)
    setMode("search")
  }

  const errorMessage = updateLocation.isError
    ? typeof (updateLocation.error as any)?.message === "string"
      ? (updateLocation.error as Error).message
      : "Failed to move location"
    : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move "{locationName}"</DialogTitle>
          <DialogDescription>Choose a new parent location, or make it a root location.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {selectedId !== null ? (
            <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2">
              <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm flex-1 truncate">{selectedName}</span>
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
                  <Label>Search locations</Label>
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Type to search by name, code, or path..."
                    autoFocus
                  />
                  <div className="mt-1 max-h-48 overflow-y-auto rounded-md border">
                    <button
                      onClick={handleSelectRoot}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted min-h-[44px] border-b"
                    >
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <p className="font-medium text-muted-foreground italic">Root (no parent)</p>
                    </button>
                    {filtered.slice(0, 20).map((loc) => (
                      <button
                        key={loc.id}
                        onClick={() => handleSelect(loc)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted min-h-[44px]"
                      >
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{loc.name}</p>
                          {loc.path_text && (
                            <p className="truncate text-xs text-muted-foreground">{loc.path_text}</p>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">{loc.code}</span>
                      </button>
                    ))}
                    {search.trim() && filtered.length === 0 && (
                      <p className="px-3 py-2 text-xs text-muted-foreground">No locations found.</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {resolving ? (
                    <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Resolving location...
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={selectedId === null || updateLocation.isPending}>
            {updateLocation.isPending ? "Moving..." : "Move"}
          </Button>
        </DialogFooter>
        {errorMessage && (
          <p className="text-sm text-destructive">{errorMessage}</p>
        )}
      </DialogContent>
    </Dialog>
  )
}
