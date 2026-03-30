import { useState, useEffect, useRef, useCallback } from "react"
import { Camera, CameraOff, AlertCircle, Zap, ZapOff, ZoomIn, ZoomOut, Focus } from "lucide-react"
import { Html5Qrcode } from "html5-qrcode"
import { Button } from "@/components/ui/button"

export function extractCode(raw: string): string {
  const scanMatch = raw.match(/\/scan\/([A-Za-z0-9_-]+)$/)
  if (scanMatch) return scanMatch[1]
  return raw.trim()
}

let instanceCounter = 0

interface CamCaps {
  canTorch: boolean
  canZoom: boolean
  canFocus: boolean
  zoomMin: number
  zoomMax: number
  zoomStep: number
}

function getTrack(wrapper: HTMLDivElement | null): MediaStreamTrack | null {
  const video = wrapper?.querySelector("video")
  if (!video?.srcObject) return null
  return (video.srcObject as MediaStream).getVideoTracks()[0] ?? null
}

function detectCaps(track: MediaStreamTrack): CamCaps {
  const c: CamCaps = { canTorch: false, canZoom: false, canFocus: false, zoomMin: 1, zoomMax: 1, zoomStep: 0.1 }
  if (!("getCapabilities" in track)) return c
  try {
    const raw = track.getCapabilities() as Record<string, unknown>
    if (raw.torch) c.canTorch = true
    if (raw.zoom && typeof raw.zoom === "object") {
      const z = raw.zoom as { min?: number; max?: number; step?: number }
      c.canZoom = true; c.zoomMin = z.min ?? 1; c.zoomMax = z.max ?? 1; c.zoomStep = z.step ?? 0.1
    }
    if (raw.focusMode && Array.isArray(raw.focusMode)) {
      c.canFocus = (raw.focusMode as string[]).some((m) => m === "continuous" || m === "manual")
    }
  } catch { /* unsupported */ }
  return c
}

export function QrScanner({ onScan }: { onScan: (code: string) => void }) {
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [torch, setTorch] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [caps, setCaps] = useState<CamCaps | null>(null)

  const scannerRef = useRef<Html5Qrcode | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const onScanRef = useRef(onScan)
  onScanRef.current = onScan
  const elId = useRef(`qr-${++instanceCounter}`)

  const addDiv = useCallback(() => {
    if (!wrapperRef.current) return
    if (!wrapperRef.current.querySelector(`#${elId.current}`)) {
      const d = document.createElement("div")
      d.id = elId.current
      wrapperRef.current.appendChild(d)
    }
  }, [])

  const removeDiv = useCallback(() => {
    const el = wrapperRef.current?.querySelector(`#${elId.current}`)
    if (el) { el.innerHTML = ""; el.remove() }
  }, [])

  const stop = useCallback(async () => {
    const s = scannerRef.current
    scannerRef.current = null
    if (s) {
      try { if (s.getState() === 2) await s.stop() } catch { /* ok */ }
      try { s.clear() } catch { /* ok */ }
    }
    removeDiv()
    setScanning(false)
    setTorch(false)
    setCaps(null)
    setZoom(1)
  }, [removeDiv])

  const handleStart = useCallback(async () => {
    setError(null)
    await stop()
    addDiv()
    try {
      const scanner = new Html5Qrcode(elId.current)
      scannerRef.current = scanner

      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decoded) => {
          const code = extractCode(decoded)
          if (code) { onScanRef.current(code); stop() }
        },
        () => {}
      )
      setScanning(true)

      // Read capabilities after video initializes
      setTimeout(() => {
        const track = getTrack(wrapperRef.current)
        if (track) {
          setCaps(detectCaps(track))
          setZoom(1)
        }
      }, 400)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not access camera.")
      removeDiv()
      setScanning(false)
    }
  }, [stop, addDiv, removeDiv])

  // --- Torch ---
  const handleTorch = useCallback(async () => {
    const track = getTrack(wrapperRef.current)
    if (!track) return
    const next = !torch
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] })
      setTorch(next)
    } catch { /* unsupported */ }
  }, [torch])

  // --- Zoom ---
  const handleZoom = useCallback(async (val: number) => {
    const track = getTrack(wrapperRef.current)
    if (!track) return
    try {
      await track.applyConstraints({ advanced: [{ zoom: val } as MediaTrackConstraintSet] })
      setZoom(val)
    } catch { /* unsupported */ }
  }, [])

  // --- Refocus ---
  const handleRefocus = useCallback(async () => {
    const track = getTrack(wrapperRef.current)
    if (!track) return
    try {
      await track.applyConstraints({ advanced: [{ focusMode: "manual" } as MediaTrackConstraintSet] })
      setTimeout(async () => {
        try {
          await track.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] })
        } catch { /* ok */ }
      }, 100)
    } catch { /* unsupported */ }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const s = scannerRef.current
      scannerRef.current = null
      if (s) {
        try { if (s.getState() === 2) s.stop().catch(() => {}) } catch { /* ok */ }
        try { s.clear() } catch { /* ok */ }
      }
    }
  }, [])

  return (
    <div className="space-y-3">
      <div
        ref={wrapperRef}
        className="relative mx-auto w-full overflow-hidden rounded-lg border bg-muted"
        style={{ minHeight: scanning ? 260 : 160 }}
        onClick={scanning && caps?.canFocus ? handleRefocus : undefined}
      >
        {!scanning && (
          <div className="flex h-[160px] flex-col items-center justify-center gap-2 text-muted-foreground">
            <Camera className="h-8 w-8" />
            <p className="text-sm">Camera preview will appear here</p>
          </div>
        )}
        {scanning && caps?.canFocus && (
          <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
            <span className="flex items-center gap-1 rounded-full bg-black/50 px-2 py-0.5 text-[10px] text-white">
              <Focus className="h-3 w-3" /> Tap to refocus
            </span>
          </div>
        )}
      </div>

      {/* Controls toolbar — only while scanning */}
      {scanning && caps && (caps.canTorch || caps.canZoom) && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {caps.canTorch && (
            <Button variant="outline" size="sm" className="min-h-[36px]" onClick={handleTorch}>
              {torch ? <ZapOff className="mr-1.5 h-4 w-4" /> : <Zap className="mr-1.5 h-4 w-4" />}
              {torch ? "Light Off" : "Light On"}
            </Button>
          )}
          {caps.canZoom && caps.zoomMax > caps.zoomMin && (
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline" size="icon" className="h-8 w-8"
                disabled={zoom <= caps.zoomMin}
                onClick={() => handleZoom(Math.max(caps.zoomMin, zoom - caps.zoomStep * 5))}
                aria-label="Zoom out"
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <input
                type="range" min={caps.zoomMin} max={caps.zoomMax} step={caps.zoomStep}
                value={zoom} onChange={(e) => handleZoom(parseFloat(e.target.value))}
                className="w-24 accent-primary" aria-label="Zoom level"
              />
              <Button
                variant="outline" size="icon" className="h-8 w-8"
                disabled={zoom >= caps.zoomMax}
                onClick={() => handleZoom(Math.min(caps.zoomMax, zoom + caps.zoomStep * 5))}
                aria-label="Zoom in"
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground w-8">{zoom.toFixed(1)}×</span>
            </div>
          )}
        </div>
      )}

      <div className="flex justify-center">
        {!scanning ? (
          <Button onClick={handleStart} size="sm" className="min-h-[40px]">
            <Camera className="mr-2 h-4 w-4" />
            Start Camera
          </Button>
        ) : (
          <Button onClick={stop} variant="outline" size="sm" className="min-h-[40px]">
            <CameraOff className="mr-2 h-4 w-4" />
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
