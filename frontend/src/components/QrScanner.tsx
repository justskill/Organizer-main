import { useState, useEffect, useRef, useCallback } from "react"
import { Camera, CameraOff, AlertCircle } from "lucide-react"
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

/**
 * Reusable QR scanner component using html5-qrcode.
 * Calls `onScan` with the extracted short code when a QR is detected.
 */
export function QrScanner({ onScan }: { onScan: (code: string) => void }) {
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const scanCallbackRef = useRef(onScan)
  scanCallbackRef.current = onScan

  const ensureScannerDiv = useCallback(() => {
    if (!wrapperRef.current) return
    let el = wrapperRef.current.querySelector("#qr-reader-move") as HTMLDivElement | null
    if (!el) {
      el = document.createElement("div")
      el.id = "qr-reader-move"
      wrapperRef.current.appendChild(el)
    }
  }, [])

  const removeScannerDiv = useCallback(() => {
    if (!wrapperRef.current) return
    const el = wrapperRef.current.querySelector("#qr-reader-move")
    if (el) {
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
    await stopScanner()
    ensureScannerDiv()
    try {
      const scanner = new Html5Qrcode("qr-reader-move")
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
      <div
        ref={wrapperRef}
        className="mx-auto w-full overflow-hidden rounded-lg border bg-muted"
        style={{ minHeight: scanning ? 260 : 160 }}
      >
        {!scanning && (
          <div className="flex h-[160px] flex-col items-center justify-center gap-2 text-muted-foreground">
            <Camera className="h-8 w-8" />
            <p className="text-sm">Camera preview will appear here</p>
          </div>
        )}
      </div>

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
