import { useState, useRef, useCallback, useEffect } from "react"
import { Camera, CameraOff, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"

interface CameraCaptureProps {
  onCapture: (file: File) => void
  disabled?: boolean
}

export function CameraCapture({ onCapture, disabled = false }: CameraCaptureProps) {
  const [active, setActive] = useState(false)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setReady(false)
    setActive(false)
  }, [])

  const startCamera = useCallback(async () => {
    setError(null)
    setReady(false)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      })
      streamRef.current = stream
      setActive(true)
    } catch {
      setError("Could not access camera. Check permissions.")
    }
  }, [])

  // Attach stream to video element once both exist
  useEffect(() => {
    if (active && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
    }
  }, [active])

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const capture = useCallback(() => {
    const video = videoRef.current
    if (!video || video.videoWidth === 0) return
    const canvas = document.createElement("canvas")
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext("2d")?.drawImage(video, 0, 0)
    canvas.toBlob(
      (blob) => {
        if (blob) {
          const file = new File([blob], `capture-${Date.now()}.jpg`, {
            type: "image/jpeg",
          })
          onCapture(file)
        }
        stopCamera()
      },
      "image/jpeg",
      0.9
    )
  }, [onCapture, stopCamera])

  return (
    <div className="space-y-2">
      {active && (
        <>
          <div className="overflow-hidden rounded-lg border bg-black">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              onLoadedMetadata={() => setReady(true)}
              className="w-full max-h-64 object-contain"
            />
          </div>
          <div className="flex gap-2">
            <Button type="button" disabled={!ready} onClick={capture}>
              <Camera className="mr-1.5 h-4 w-4" />
              {ready ? "Capture" : "Starting…"}
            </Button>
            <Button type="button" variant="outline" onClick={stopCamera}>
              <CameraOff className="mr-1.5 h-4 w-4" />
              Cancel
            </Button>
          </div>
        </>
      )}

      {!active && (
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={startCamera}
        >
          <Camera className="mr-1.5 h-4 w-4" />
          Take Photo
        </Button>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
    </div>
  )
}
