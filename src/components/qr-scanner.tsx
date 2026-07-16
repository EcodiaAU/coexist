import { useState, useRef, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Camera } from 'lucide-react'
import jsQR from 'jsqr'
import { Capacitor } from '@capacitor/core'

/* ------------------------------------------------------------------ */
/*  Web QR Scanner (getUserMedia + jsQR)                               */
/* ------------------------------------------------------------------ */

function WebQrScanner({ onScan, onError }: { onScan: (value: string) => void; onError: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number>(0)
  const [cameraReady, setCameraReady] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        })
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.setAttribute('playsinline', 'true')
          await videoRef.current.play()
          setCameraReady(true)
        }
      } catch {
        if (!cancelled) onError()
      }
    }

    startCamera()

    return () => {
      cancelled = true
      cancelAnimationFrame(rafRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [onError])

  // Scan loop
  useEffect(() => {
    if (!cameraReady) return
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return

    function tick() {
      if (!video || video.readyState !== video.HAVE_ENOUGH_DATA) {
        rafRef.current = requestAnimationFrame(tick)
        return
      }
      canvas!.width = video.videoWidth
      canvas!.height = video.videoHeight
      ctx!.drawImage(video, 0, 0, canvas!.width, canvas!.height)
      const imageData = ctx!.getImageData(0, 0, canvas!.width, canvas!.height)
      const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' })
      if (code?.data) {
        onScan(code.data)
        return // Stop scanning once we find a code
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [cameraReady, onScan])

  return (
    <div data-eos-id="src/components/qr-scanner.tsx#0" data-eos-v="2" className="relative w-full aspect-square max-w-[280px] mx-auto rounded-md overflow-hidden bg-black">
      <video data-eos-id="src/components/qr-scanner.tsx#1" ref={videoRef} className="absolute inset-0 w-full h-full object-cover" muted playsInline />
      <canvas data-eos-id="src/components/qr-scanner.tsx#2" ref={canvasRef} className="hidden" />
      {/* Scan overlay */}
      <div data-eos-id="src/components/qr-scanner.tsx#3" className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div data-eos-id="src/components/qr-scanner.tsx#4" className="w-[70%] aspect-square border-2 border-white/60 rounded-sm relative">
          <motion.div data-eos-id="src/components/qr-scanner.tsx#5"
            className="absolute left-2 right-2 h-0.5 bg-primary-400 rounded-full"
            animate={{ top: ['10%', '90%', '10%'] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>
      </div>
      {!cameraReady && (
        <div data-eos-id="src/components/qr-scanner.tsx#6" className="absolute inset-0 flex items-center justify-center bg-black/80">
          <div data-eos-id="src/components/qr-scanner.tsx#7" className="text-center">
            <Camera data-eos-id="src/components/qr-scanner.tsx#8" size={32} className="text-white/40 mx-auto mb-2" />
            <p data-eos-id="src/components/qr-scanner.tsx#9" className="text-sm text-white/60">Opening camera...</p>
          </div>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  QR Scanner - native (Capacitor ML Kit) or web (getUserMedia)       */
/* ------------------------------------------------------------------ */

export interface QrScannerProps {
  eventId: string
  isOffline: boolean
  /** Called with the matched event ID from the QR code */
  onScan: (scannedEventId: string) => void
  /** Called when the QR code is invalid for this event */
  onInvalidQr: () => void
  /** Called when camera is unavailable (web only - falls back to manual) */
  onCameraError: () => void
  /** Called when user cancels scanning or scanner closes */
  onCancel: () => void
  /** Called to set native scanner active state (for body class management) */
  onNativeScannerActive?: (active: boolean) => void
  /** Called when a ticket code is scanned (coexist://ticket/{code}) */
  onTicketScan?: (ticketCode: string) => void
}

export function QrScanner({
  eventId,
  isOffline: _isOffline,
  onScan,
  onInvalidQr,
  onCameraError,
  onCancel,
  onNativeScannerActive,
  onTicketScan,
}: QrScannerProps) {
  const isNative = Capacitor.isNativePlatform()

  const parseQrValue = useCallback((value: string): { type: 'event'; eventId: string } | { type: 'ticket'; code: string } | null => {
    const eventMatch = value.match(/^coexist:\/\/event\/(.+)$/)
    if (eventMatch) return { type: 'event', eventId: eventMatch[1] }
    const ticketMatch = value.match(/^coexist:\/\/ticket\/(.+)$/)
    if (ticketMatch) return { type: 'ticket', code: ticketMatch[1] }
    return null
  }, [])

  const handleWebQrScan = useCallback((value: string) => {
    const parsed = parseQrValue(value)
    if (!parsed) {
      onInvalidQr()
      return
    }
    if (parsed.type === 'ticket') {
      if (onTicketScan) {
        onTicketScan(parsed.code)
      } else {
        onInvalidQr()
      }
      return
    }
    if (parsed.eventId !== eventId) {
      onInvalidQr()
      return
    }
    onScan(parsed.eventId)
  }, [eventId, parseQrValue, onScan, onInvalidQr, onTicketScan])

  // Native: launch Capacitor barcode scanner on mount
  useEffect(() => {
    if (!isNative) return
    let cancelled = false

    async function startNativeScan() {
      try {
        const { BarcodeScanner, BarcodeFormat } = await import('@capacitor-mlkit/barcode-scanning')

        const permStatus = await BarcodeScanner.checkPermissions()
        let camPerm = permStatus.camera

        if (camPerm !== 'granted' && camPerm !== 'limited') {
          const result = await BarcodeScanner.requestPermissions()
          camPerm = result.camera
        }

        if (camPerm !== 'granted' && camPerm !== 'limited') {
          if (!cancelled) onCameraError()
          return
        }

        onNativeScannerActive?.(true)
        document.body.classList.add('scanner-active')

        const { barcodes } = await BarcodeScanner.scan({ formats: [BarcodeFormat.QrCode] })

        document.body.classList.remove('scanner-active')
        onNativeScannerActive?.(false)

        if (cancelled) return

        if (barcodes.length > 0 && barcodes[0].rawValue) {
          const parsed = parseQrValue(barcodes[0].rawValue)
          if (!parsed) {
            onInvalidQr()
          } else if (parsed.type === 'ticket') {
            if (onTicketScan) onTicketScan(parsed.code)
            else onInvalidQr()
          } else if (parsed.eventId !== eventId) {
            onInvalidQr()
          } else {
            onScan(parsed.eventId)
          }
        } else {
          onCancel()
        }
      } catch {
        document.body.classList.remove('scanner-active')
        onNativeScannerActive?.(false)
        if (!cancelled) onCancel()
      }
    }

    startNativeScan()
    return () => { cancelled = true }
  }, [isNative, eventId, parseQrValue, onScan, onInvalidQr, onCancel, onNativeScannerActive])

  if (isNative) {
    // Native: Capacitor handles the camera overlay
    return (
      <div data-eos-id="src/components/qr-scanner.tsx#10" className="relative w-52 h-52 rounded-md bg-neutral-50 shadow-sm flex items-center justify-center mb-5">
        <Camera data-eos-id="src/components/qr-scanner.tsx#11" size={44} className="text-primary-300" />
        <motion.div data-eos-id="src/components/qr-scanner.tsx#12"
          className="absolute left-4 right-4 h-0.5 bg-primary-500 rounded-full"
          animate={{ top: ['20%', '80%', '20%'] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        />
        <p data-eos-id="src/components/qr-scanner.tsx#13" className="absolute bottom-3 text-[11px] text-primary-400">
          Point camera at event QR code
        </p>
      </div>
    )
  }

  // Web: live camera feed with jsQR scanning
  return (
    <>
      <p data-eos-id="src/components/qr-scanner.tsx#14" className="text-sm font-semibold text-neutral-900 mb-3">
        Point your camera at the QR code
      </p>
      <WebQrScanner data-eos-id="src/components/qr-scanner.tsx#15" onScan={handleWebQrScan} onError={onCameraError} />
    </>
  )
}
