import { useState, useEffect, useRef, useCallback } from "react"
import { useNavigate, Link } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Camera,
  CameraOff,
  Search,
  FolderInput,
  PackageMinus,
  StickyNote,
  QrCode,
  ExternalLink,
  MapPin,
  Package,
  AlertCircle,
  Box,
  Loader2,
} from "lucide-react"
import { Html5Qrcode } from "html5-qrcode"
import { apiFetch } from "@/api/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { MoveItemsDialog } from "@/components/MoveItemsDialog"
import { MoveLocationDialog } from "@/components/MoveLocationDialog"
import type { LocationContents, ItemBrief } from "@/types"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScanResult {
  entity_type: string
  entity_id: string
  name: string
  code: string
  archived: boolean
}

// ---------------------------------------------------------------------------
// Hook: useScanResolve
// ---------------------------------------------------------------------------

function useScanResolve(code: string | null) {
  return useQuery<ScanResult>({
    queryKey: ["scan", code],
    queryFn: () => apiFetch<ScanResult>(`/scan/${encodeURIComponent(code!)}`),
    enabled: !!code,
    retry: false,
    staleTime: 60_000,
  })
}

function useContents(entityType: string | undefined, entityId: string | undefined) {
  const isLocation = entityType === "location"
  return useQuery<LocationContents>({
    queryKey: ["location-contents", entityId],
    queryFn: () => apiFetch<LocationContents>(`/locations/${entityId}/contents`),
    enabled: isLocation && !!entityId,
    staleTime: 30_000,
  })
}

// ---------------------------------------------------------------------------
// Helper: extract short code from QR payload
// ---------------------------------------------------------------------------

function extractCode(raw: string): string {
  // QR payload is `/scan/{SHORT_CODE}` or a full URL ending with `/scan/{code}`
  const scanMatch = raw.match(/\/scan\/([A-Za-z0-9_-]+)$/)
  if (scanMatch) return scanMatch[1]
  // Otherwise treat the whole string as a code
  return raw.trim()
}

// ---------------------------------------------------------------------------
// QR Scanner component
// ---------------------------------------------------------------------------

function QrScanner({ onScan }: { onScan: (code: string) => void }) {
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const scanCallbackRef = useRef(onScan)
  scanCallbackRef.current = onScan

  // Create / destroy the scanner's DOM element outside React's tree
  const ensureScannerDiv = useCallback(() => {
    if (!wrapperRef.current) return
    let el = wrapperRef.current.querySelector("#qr-reader") as HTMLDivElement | null
    if (!el) {
      el = document.createElement("div")
      el.id = "qr-reader"
      wrapperRef.current.appendChild(el)
    }
  }, [])

  const removeScannerDiv = useCallback(() => {
    if (!wrapperRef.current) return
    const el = wrapperRef.current.querySelector("#qr-reader")
    if (el) {
      // html5-qrcode leaves child nodes behind — nuke them first
      el.innerHTML = ""
      el.remove()
    }
  }, [])

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        const state = scannerRef.current.getState()
        if (state === 2) {
          await scannerRef.current.stop()
        }
      } catch {
        // ignore stop errors
      }
      try {
        scannerRef.current.clear()
      } catch {
        // ignore
      }
      scannerRef.current = null
    }
    removeScannerDiv()
    setScanning(false)
  }, [removeScannerDiv])

  const startScanner = useCallback(async () => {
    setError(null)
    // Make sure any previous scanner DOM is gone
    await stopScanner()
    ensureScannerDiv()
    try {
      const scanner = new Html5Qrcode("qr-reader")
      scannerRef.current = scanner
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          const code = extractCode(decodedText)
          if (code) {
            scanCallbackRef.current(code)
            stopScanner()
          }
        },
        () => {
          // ignore scan failures (no QR in frame)
        }
      )
      setScanning(true)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not access camera. Check permissions."
      )
      removeScannerDiv()
      setScanning(false)
    }
  }, [stopScanner, ensureScannerDiv, removeScannerDiv])

  useEffect(() => {
    return () => {
      // cleanup on unmount — fire-and-forget
      if (scannerRef.current) {
        const s = scannerRef.current
        scannerRef.current = null
        try {
          const state = s.getState()
          if (state === 2) {
            s.stop().catch(() => {})
          }
          s.clear()
        } catch {
          // ignore
        }
      }
    }
  }, [])

  return (
    <div className="space-y-3">
      {/* Wrapper that React owns — scanner div is injected imperatively inside */}
      <div
        ref={wrapperRef}
        className="mx-auto w-full max-w-sm overflow-hidden rounded-lg border bg-muted"
        style={{ minHeight: scanning ? 300 : 200 }}
      >
        {!scanning && (
          <div className="flex h-[200px] flex-col items-center justify-center gap-3 text-muted-foreground">
            <Camera className="h-10 w-10" />
            <p className="text-sm">Camera preview will appear here</p>
          </div>
        )}
      </div>

      <div className="flex justify-center gap-2">
        {!scanning ? (
          <Button onClick={startScanner} size="lg" className="min-h-[48px] min-w-[160px]">
            <Camera className="mr-2 h-5 w-5" />
            Start Camera
          </Button>
        ) : (
          <Button
            onClick={stopScanner}
            variant="outline"
            size="lg"
            className="min-h-[48px] min-w-[160px]"
          >
            <CameraOff className="mr-2 h-5 w-5" />
            Stop Camera
          </Button>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Manual Code Entry
// ---------------------------------------------------------------------------

function ManualEntry({ onSubmit }: { onSubmit: (code: string) => void }) {
  const [value, setValue] = useState("")

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const code = value.trim()
    if (code) {
      onSubmit(extractCode(code))
      setValue("")
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Enter short code (e.g. ITM-2F4K9Q)"
        className="min-h-[48px] flex-1 text-base"
        autoComplete="off"
        autoCapitalize="characters"
      />
      <Button type="submit" size="lg" className="min-h-[48px] min-w-[100px]" disabled={!value.trim()}>
        <Search className="mr-2 h-5 w-5" />
        Look Up
      </Button>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Entity Summary Card
// ---------------------------------------------------------------------------

function EntitySummary({
  result,
  onClear,
}: {
  result: ScanResult
  onClear: () => void
}) {
  const navigate = useNavigate()
  const isItem = result.entity_type === "item"
  const isLocation = result.entity_type === "location"
  const [moveOpen, setMoveOpen] = useState(false)
  const [moveLocationOpen, setMoveLocationOpen] = useState(false)

  const detailPath = isItem
    ? `/items/${result.entity_id}`
    : `/locations/${result.entity_id}`

  const entityLabel = isItem ? "Item" : "Location"
  const EntityIcon = isItem ? Package : MapPin

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <EntityIcon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">{result.name}</CardTitle>
              <div className="mt-0.5 flex items-center gap-2">
                <Badge variant="outline">{entityLabel}</Badge>
                <span className="text-sm text-muted-foreground">{result.code}</span>
                {result.archived && <Badge variant="destructive">Archived</Badge>}
              </div>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClear}>
            Clear
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Separator className="mb-4" />
        <div className="flex flex-wrap gap-2">
          {isItem && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="min-h-[44px]"
                onClick={() => navigate(detailPath)}
              >
                <ExternalLink className="mr-1.5 h-4 w-4" />
                Open Full Record
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="min-h-[44px]"
                onClick={() => setMoveOpen(true)}
              >
                <FolderInput className="mr-1.5 h-4 w-4" />
                Move
              </Button>
              <MoveItemsDialog
                open={moveOpen}
                onOpenChange={setMoveOpen}
                itemIds={[result.entity_id]}
              />
              <Button variant="outline" size="sm" className="min-h-[44px]" asChild>
                <Link to={detailPath} state={{ action: "adjust-stock" }}>
                  <PackageMinus className="mr-1.5 h-4 w-4" />
                  Adjust Qty
                </Link>
              </Button>
              <Button variant="outline" size="sm" className="min-h-[44px]" asChild>
                <Link to={detailPath} state={{ action: "note" }}>
                  <StickyNote className="mr-1.5 h-4 w-4" />
                  Add Note
                </Link>
              </Button>
              <Button variant="outline" size="sm" className="min-h-[44px]" disabled>
                <QrCode className="mr-1.5 h-4 w-4" />
                Reprint Label
              </Button>
            </>
          )}
          {isLocation && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="min-h-[44px]"
                onClick={() => navigate(detailPath)}
              >
                <ExternalLink className="mr-1.5 h-4 w-4" />
                Open Full Record
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="min-h-[44px]"
                onClick={() => setMoveLocationOpen(true)}
              >
                <FolderInput className="mr-1.5 h-4 w-4" />
                Move
              </Button>
              <MoveLocationDialog
                open={moveLocationOpen}
                onOpenChange={setMoveLocationOpen}
                locationId={result.entity_id}
                locationName={result.name}
              />
              <Button variant="outline" size="sm" className="min-h-[44px]" disabled>
                <QrCode className="mr-1.5 h-4 w-4" />
                Reprint Label
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Contents Panel (for locations/containers)
// ---------------------------------------------------------------------------

function ContentsPanel({ entityId }: { entityId: string }) {
  const { data, isLoading, isError } = useContents("location", entityId)

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Box className="h-4 w-4" /> Contents
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-3/4" />
        </CardContent>
      </Card>
    )
  }

  if (isError || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Box className="h-4 w-4" /> Contents
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Could not load contents.</p>
        </CardContent>
      </Card>
    )
  }

  const items = data.items ?? []
  const childLocations = data.child_locations ?? []
  const isEmpty = items.length === 0 && childLocations.length === 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Box className="h-4 w-4" /> Contents
          <span className="ml-auto text-sm font-normal text-muted-foreground">
            {items.length} item{items.length !== 1 ? "s" : ""}
            {childLocations.length > 0 &&
              `, ${childLocations.length} sub-location${childLocations.length !== 1 ? "s" : ""}`}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <p className="text-sm text-muted-foreground">This location is empty.</p>
        ) : (
          <div className="space-y-3">
            {childLocations.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground uppercase">
                  Sub-locations
                </p>
                <div className="space-y-1">
                  {childLocations.map((loc) => (
                    <Link
                      key={loc.id}
                      to={`/locations/${loc.id}`}
                      className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted/50 min-h-[44px]"
                    >
                      <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="font-medium">{loc.name}</span>
                      <span className="text-muted-foreground">{loc.code}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
            {items.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground uppercase">
                  Items
                </p>
                <div className="space-y-1">
                  {items.map((item: ItemBrief) => (
                    <Link
                      key={item.id}
                      to={`/items/${item.id}`}
                      className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted/50 min-h-[44px]"
                    >
                      <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="font-medium">{item.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {item.item_type.replace("_", " ")}
                      </Badge>
                      <span className="ml-auto text-muted-foreground text-xs">{item.code}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Main Scan Page
// ---------------------------------------------------------------------------

export default function Scan() {
  const [scannedCode, setScannedCode] = useState<string | null>(null)
  const { data: result, isLoading, isError, error } = useScanResolve(scannedCode)

  const handleScan = useCallback((code: string) => {
    setScannedCode(code)
  }, [])

  const handleClear = useCallback(() => {
    setScannedCode(null)
  }, [])

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Scan</h1>
        <p className="text-muted-foreground mt-1">
          Scan a QR code or enter a short code to find items and locations.
        </p>
      </div>

      {/* QR Scanner */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Camera className="h-4 w-4" /> Camera Scan
          </CardTitle>
        </CardHeader>
        <CardContent>
          <QrScanner onScan={handleScan} />
        </CardContent>
      </Card>

      {/* Manual Entry */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Search className="h-4 w-4" /> Manual Entry
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ManualEntry onSubmit={handleScan} />
        </CardContent>
      </Card>

      {/* Loading state */}
      {scannedCode && isLoading && (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              Looking up {scannedCode}...
            </span>
          </CardContent>
        </Card>
      )}

      {/* Error state */}
      {scannedCode && isError && (
        <Card>
          <CardContent className="py-6">
            <div className="flex flex-col items-center gap-3 text-center">
              <AlertCircle className="h-8 w-8 text-destructive" />
              <div>
                <p className="font-medium text-destructive">Code not found</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  No entity matches the code "{scannedCode}".
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={handleClear}>
                Try Again
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Result */}
      {result && (
        <div className="space-y-4">
          <EntitySummary result={result} onClear={handleClear} />
          {result.entity_type === "location" && (
            <ContentsPanel entityId={result.entity_id} />
          )}
        </div>
      )}
    </div>
  )
}
