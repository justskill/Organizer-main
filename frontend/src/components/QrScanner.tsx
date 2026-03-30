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

let instanceCounter = 0

interface CameraCapabilities {
  canTorch: boolean
  canZoom: boolean
  canFocus: boolean
  zoomMin: number
  zoomMax: number
  zoomStep: number
}

function getVideoTrack(wrapper: HTMLDivElement | null): MediaStreamTrack | null {
  if (!wrapper) return null
  const video = wrapper.querySelector("video")
  if (!video || !video.srcObject) return null
  return (video.srcObject as MediaStream).getVideoTracks()[0] ?? null
}

function readCapabilities(track: MediaStreamTrack): CameraCapabilities {
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
 * Fully stop an Html5Qrcode instance and release its camera.
 * Returns only after the camera stream is released.
 */
async function fullyStopScanner(scanner: Html5Qrcode | null): Promise<void> {
  if (!scanner) return
  try {
    const state = scanner.getState()
    if (state === 2) await scanner.stop()
  } catch { /* ignore */ }
  try { scanner.clear() } catch { /* ignore */ }
}

/**
 * QR/barcode scanner with camera controls.
 *
 * Camera switching uses native MediaStream track replacement instead of
 * tearing down and recreating the html5-qrcode scanner, which avoids the
 * lock-up that occurs when rapidly cycling cameras.
 */
export function QrScanner({ onScan }: { onScan: (code: string) => void }) {
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [torch, setTorch] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [caps, setCaps] = useState<CameraCapabilities | null>(null)
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([])
  const [activeCameraId, setActiveCameraId] = useState<string | null>(null)
  const [switching, setSwitching] = useState(false)

  const scannerRef = useRef<Html5Qrcode | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const scanCallbackRef = useRef(onScan)
  scanCallbackRef.current = onScan
  const elementIdRef = useRef(`qr-reader-${++instanceCounter}`)

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
    if (el) { el.innerHTML = ""; el.remove() }
  }, [])

  const updateCaps = useCallback(() => {
    const track = getVideoTrack(wrapperRef.current)
    if (track) {
      const c = readCapabilities(track)
      setCaps(c)
      setZoom(c.zoomMin)
      const settings = track.getSettings()
      if (settings.deviceId) setActiveCameraId(settings.deviceId)
    }
  }, [])

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current
    scannerRef.current = null
    await fullyStopScanner(scanner)
    removeScannerDiv()
    setScanning(false)
    setTorch(false)
    setCaps(null)
    setZoom(1)
  }, [removeScannerDiv])

  const startScanner = useCallback(async () => {
    setError(null)
    await stopScanner()
    ensureScannerDiv()
    try {
      const scanner = new Html5Qrcode(elementIdRef.current)
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
        () => {}
      )
      setScanning(true)

      // Enumerate cameras now that we have permission
      try {
        const devices = await Html5Qrcode.getCameras()
        setCameras(devices.map((d) => ({
          id: d.id,
          label: d.label || `Camera ${d.id.slice(0, 6)}`,
        })))
      } catch { /* ignore */ }

      setTimeout(updateCaps, 500)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not access camera. Check permissions.")
      removeScannerDiv()
      setScanning(false)
    }
  }, [stopScanner, ensureScannerDiv, removeScannerDiv, updateCaps])

  /**
   * Switch camera by replacing the video track on the existing MediaStream.
   * This avoids tearing down html5-qrcode entirely, which prevents lock-ups.
   */
  const handleSwitchCamera = useCallback(async () => {
    if (cameras.length < 2 || switching) return
    setSwitching(true)
    try {
      const currentIdx = cameras.findIndex((c) => c.id === activeCameraId)
      const nextIdx = (currentIdx + 1) % cameras.length
      const nextId = cameras[nextIdx].id

      const video = wrapperRef.current?.querySelector("video")
      if (!video || !video.srcObject) return

      const oldStream = video.srcObject as MediaStream
      const oldTrack = oldStream.getVideoTracks()[0]

      // Acquire a new stream for the target camera
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: nextId } },
      })
      const newTrack = newStream.getVideoTracks()[0]

      // Replace the track on the existing stream so html5-qrcode keeps scanning
      if (oldTrack) {
        oldStream.removeTrack(oldTrack)
        oldTrack.stop()
      }
      oldStream.addTrack(newTrack)

      // Point the video element at the (now-updated) stream
      video.srcObject = oldStream

      setActiveCameraId(nextId)
      setTorch(false)
      setTimeout(updateCaps, 300)
    } catch (err) {
      // If track replacement fails, fall back to full restart with the next camera
      try {
        const currentIdx = cameras.findIndex((c) => c.id === activeCameraId)
        const nextIdx = (currentIdx + 1) % cameras.length
        const nextId = cameras[nextIdx].id

        await stopScanner()
        await new Promise((r) => setTimeout(r, 400))
        ensureScannerDiv()

        const scanner = new Html5Qrcode(elementIdRef.current)
        scannerRef.current = scanner
        await scanner.start(
          { deviceId: { exact: nextId } },
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
        setActiveCameraId(nextId)
        setTimeout(updateCaps, 500)
      } catch {
        setError("Failed to switch camera. Try stopping and restarting.")
      }
    } finally {
      setSwitching(false)
    }
  }, [cameras, activeCameraId, switching, updateCaps, stopScanner, ensureScannerDiv])

  const handleToggleTorch = useCallback(async () => {
    const track = getVideoTrack(wrapperRef.current)
    if (!track) return
    const next = !torch
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] })
      setTorch(next)
    } catch { /* unsupported */ }
  }, [torch])

  const handleZoomChange = useCallback(async (newZoom: number) => {
    const track = getVideoTrack(wrapperRef.current)
    if (!track) return
    try {
      await track.applyConstraints({ advanced: [{ zoom: newZoom } as MediaTrackConstraintSet] })
      setZoom(newZoom)
    } catch { /* unsupported */ }
  }, [])

  const handleRefocus = useCallback(async () => {
    const track = getVideoTrack(wrapperRef.current)
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      fullyStopScanner(scannerRef.current)
      scannerRef.current = null
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

      {scanning && hasControls && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {cameras.length > 1 && (
            <Button variant="outline" size="sm" className="min-h-[36px]" onClick={handleSwitchCamera} disabled={switching}>
              <SwitchCamera className="mr-1.5 h-4 w-4" />
              {switching ? "Switching…" : "Switch"}
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
                min={caps.zoomMin} max={caps.zoomMax} step={caps.zoomStep}
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
          <Button onClick={startScanner} size="sm" className="min-h-[40px]">
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
