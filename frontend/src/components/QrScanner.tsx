import { useState, useEffect, useRef, useCallback } from "react"
import { Camera, CameraOff, AlertCircle, SwitchCamera, Zap, ZapOff, ZoomIn, ZoomOut, Focus } from "lucide-react"
import { Html5Qrcode } from "html5-qrcode"
import { Button } from "@/components/ui/button"

/**
 * Extract a short code from a QR payload.
 * QR payload is `/scan/{SHORT_CODE}` or a full URL ending with `/scan/{code}`.
 */
export function extractCode(raw: string): string {
  const scanMatch = raw.match(/\/scan\/([A-Za-z0-9_-]+)$/)
  if (scanMatch) return scanMatch[1]
  return raw.trim()
}

// Unique ID counter to avoid DOM collisions when multiple scanners mount
let instanceCounter = 0

interface CameraCapabilities {
  canTorch: boolean
  canZoom: boolean
  canFocus: boolean
  zoomMin: number
  zoomMax: number
  zoomStep: number
}

function getTrackFromScanner(wrapper: HTMLDivElement | null): MediaStreamTrack | null {
  if (!wrapper) return null
  const video = wrapper.querySelector("video")
  if (!video || !video.srcObject) return null
  const stream = video.srcObject as MediaStream
  return stream.getVideoTracks()[0] ?? null
}

function getCapabilities(track: MediaStreamTrack): CameraCapabilities {
  const caps: CameraCapabilities = {
    canTorch: false, canZoom: false, canFocus: false,
    zoomMin: 1, zoomMax: 1, zoomStep: 0.1,
  }
  if (!("getCapabilities" in track)) return caps
  try {
    const c = track.getCapabilities() as Record<string, unknown>
    if (c.torch) caps.canTorch = true
    if (c.zoom && typeof c.zoom === "object") {
      const z = c.zoom as { min?: number; max?: number; step?: number }
      caps.canZoom = true
      caps.zoomMin = z.min ?? 1
      caps.zoomMax = z.max ?? 1
      caps.zoomStep = z.step ?? 0.1
    }
    if (c.focusMode && Array.isArray(c.focusMode)) {
      caps.canFocus = (c.focusMode as string[]).includes("continuous") ||
                      (c.focusMode as string[]).includes("manual")
    }
  } catch { /* unsupported */ }
  return caps
}

/**
 * Reusable QR/barcode scanner with camera controls:
 * - Switch camera (front/back/other)
 * - Torch/flashlight toggle
 * - Zoom slider
 * - Tap-to-refocus
 *
 * Camera enumeration is deferred until the user starts scanning to avoid
 * triggering a premature camera-access permission prompt.
 */
export function QrScanner({ onScan }: { onScan: (code: string) => void }) {
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [torch, setTorch] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [caps, setCaps] = useState<CameraCapabilities | null>(null)
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([])
  const [activeCameraId, setActiveCameraId] = useState<string | null>(null)

  const scannerRef = useRef<Html5Qrcode | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const scanCallbackRef = useRef(onScan)
  scanCallbackRef.current = onScan
  const elementIdRef = useRef(`qr-reader-${++instanceCounter}`)
  // Guard against starting a new scanner while one is still stopping
  const transitionRef = useRef(false)

  const ensureScannerDiv = useCallback(() => {
    if (!wrapperRef.current) return
    const id = elementIdRef.current
    let el = wrapperRef.current.querySelector(`#${id}`) as HTMLDivElement | null
    if (!el) {
      el = document.createElement("div")
      el.id = id
      wrapperRef.current.appendChild(el)
    }
  }, [])

  const removeScannerDiv = useCallback(() => {
    if (!wrapperRef.current) return
    const el = wrapperRef.current.querySelector(`#${elementIdRef.current}`)
    if (el) {
      el.innerHTML = ""
      el.remove()
    }
  }, [])

  const refreshCapabilities = useCallback(() => {
    const track = getTrackFromScanner(wrapperRef.current)
    if (track) {
      const c = getCapabilities(track)
      setCaps(c)
      setZoom(c.zoomMin)
    }
  }, [])

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current
    scannerRef.current = null
    if (scanner) {
      try {
        const state = scanner.getState()
        if (state === 2) await scanner.stop()
      } catch { /* ignore */ }
      try { scanner.clear() } catch { /* ignore */ }
    }
    removeScannerDiv()
    setScanning(false)
    setTorch(false)
    setCaps(null)
    setZoom(1)
  }, [removeScannerDiv])

  const startScanner = useCallback(async (cameraId?: string) => {
    if (transitionRef.current) return
    transitionRef.current = true
    setError(null)

    // Stop any existing scanner and wait for camera to fully release
    await stopScanner()
    await new Promise((r) => setTimeout(r, 300))

    ensureScannerDiv()
    try {
      const scanner = new Html5Qrcode(elementIdRef.current)
      scannerRef.current = scanner

      // Always prefer environment (rear) camera when no explicit ID is given
      const cameraConfig: MediaTrackConstraints = cameraId
        ? { deviceId: { exact: cameraId } }
        : { facingMode: "environment" }

      await scanner.start(
        cameraConfig,
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          const code = extractCode(decodedText)
          if (code) {
            scanCallbackRef.current(code)
            stopScanner()
          }
        },
        () => {}
      )
      setScanning(true)

      // Enumerate cameras now that we have permission (no extra prompt)
      if (cameras.length === 0) {
        try {
          const devices = await Html5Qrcode.getCameras()
          setCameras(devices.map((d) => ({ id: d.id, label: d.label || `Camera ${d.id.slice(0, 6)}` })))
        } catch { /* ignore */ }
      }

      // Detect the active camera's device ID from the running track
      const track = getTrackFromScanner(wrapperRef.current)
      if (track) {
        const settings = track.getSettings()
        if (settings.deviceId) setActiveCameraId(settings.deviceId)
      }

      // Small delay to let the video element fully initialize before reading capabilities
      setTimeout(refreshCapabilities, 500)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not access camera. Check permissions.")
      removeScannerDiv()
      setScanning(false)
    } finally {
      transitionRef.current = false
    }
  }, [stopScanner, ensureScannerDiv, removeScannerDiv, refreshCapabilities, cameras.length])

  // --- Camera control handlers ---

  const handleToggleTorch = useCallback(async () => {
    const track = getTrackFromScanner(wrapperRef.current)
    if (!track) return
    const next = !torch
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] })
      setTorch(next)
    } catch { /* unsupported */ }
  }, [torch])

  const handleZoomChange = useCallback(async (newZoom: number) => {
    const track = getTrackFromScanner(wrapperRef.current)
    if (!track) return
    try {
      await track.applyConstraints({ advanced: [{ zoom: newZoom } as MediaTrackConstraintSet] })
      setZoom(newZoom)
    } catch { /* unsupported */ }
  }, [])

  const handleRefocus = useCallback(async () => {
    const track = getTrackFromScanner(wrapperRef.current)
    if (!track) return
    try {
      await track.applyConstraints({ advanced: [{ focusMode: "manual" } as MediaTrackConstraintSet] })
      setTimeout(async () => {
        try {
          await track.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] })
        } catch { /* ignore */ }
      }, 100)
    } catch { /* unsupported */ }
  }, [])

  const handleSwitchCamera = useCallback(async () => {
    if (cameras.length < 2 || transitionRef.current) return
    // Find the next camera that isn't the currently active one
    const currentIdx = cameras.findIndex((c) => c.id === activeCameraId)
    const nextIdx = (currentIdx + 1) % cameras.length
    const nextId = cameras[nextIdx].id
    setActiveCameraId(nextId)
    await startScanner(nextId)
  }, [cameras, activeCameraId, startScanner])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const scanner = scannerRef.current
      scannerRef.current = null
      if (scanner) {
        try {
          const state = scanner.getState()
          if (state === 2) scanner.stop().catch(() => {})
          scanner.clear()
        } catch { /* ignore */ }
      }
    }
  }, [])

  const hasControls = caps && (caps.canTorch || caps.canZoom || caps.canFocus || cameras.length > 1)

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

      {/* Camera controls toolbar */}
      {scanning && hasControls && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {cameras.length > 1 && (
            <Button variant="outline" size="sm" className="min-h-[36px]" onClick={handleSwitchCamera}>
              <SwitchCamera className="mr-1.5 h-4 w-4" />
              Switch
            </Button>
          )}
          {caps.canTorch && (
            <Button variant="outline" size="sm" className="min-h-[36px]" onClick={handleToggleTorch}>
              {torch ? <ZapOff className="mr-1.5 h-4 w-4" /> : <Zap className="mr-1.5 h-4 w-4" />}
              {torch ? "Light Off" : "Light On"}
            </Button>
          )}
          {caps.canZoom && caps.zoomMax > caps.zoomMin && (
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline" size="icon" className="h-8 w-8"
                disabled={zoom <= caps.zoomMin}
                onClick={() => handleZoomChange(Math.max(caps.zoomMin, zoom - caps.zoomStep * 5))}
                aria-label="Zoom out"
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <input
                type="range"
                min={caps.zoomMin}
                max={caps.zoomMax}
                step={caps.zoomStep}
                value={zoom}
                onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
                className="w-24 accent-primary"
                aria-label="Zoom level"
              />
              <Button
                variant="outline" size="icon" className="h-8 w-8"
                disabled={zoom >= caps.zoomMax}
                onClick={() => handleZoomChange(Math.min(caps.zoomMax, zoom + caps.zoomStep * 5))}
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
          <Button onClick={() => startScanner()} size="sm" className="min-h-[40px]">
            <Camera className="mr-2 h-4 w-4" />
            Start Camera
          </Button>
        ) : (
          <Button onClick={stopScanner} variant="outline" size="sm" className="min-h-[40px]">
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
