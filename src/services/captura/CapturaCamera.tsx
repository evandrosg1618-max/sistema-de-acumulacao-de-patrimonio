/**
 * Captura direta pela câmera (getUserMedia, facingMode: environment) —
 * SAP v0.0.98. A foto volta direto ao SAP (canvas → dataURL), sem passar
 * pela galeria. Fallback: input capture="environment" se sem permissão.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'

export interface CapturaCameraProps {
  onCapturar: (dataUrl: string) => void
  onFechar: () => void
}

export function CapturaCamera({ onCapturar, onFechar }: CapturaCameraProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pronta, setPronta] = useState(false)

  const parar = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [])

  useEffect(() => {
    let ativo = true
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then((stream) => {
        if (!ativo) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play().catch(() => undefined)
          setPronta(true)
        }
      })
      .catch(() => {
        setErro('Não foi possível abrir a câmera. Verifique a permissão do navegador.')
      })
    return () => {
      ativo = false
      parar()
    }
  }, [parar])

  const fotografar = () => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    parar()
    onCapturar(canvas.toDataURL('image/jpeg', 0.9))
  }

  return (
    <div className="w-full">
      <div className="relative rounded-lg overflow-hidden bg-black aspect-[3/4] max-h-[55vh] mx-auto">
        <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
        {!pronta && !erro && (
          <div className="absolute inset-0 flex items-center justify-center text-white text-sm">
            Abrindo câmera…
          </div>
        )}
        {erro && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white text-sm p-4 text-center">
            {erro}
            <Button variant="outline" size="sm" onClick={onFechar} className="mt-3">
              Fechar
            </Button>
          </div>
        )}
      </div>
      <p className="text-xs text-slate-500 mt-2 text-center">
        Mantenha o cupom plano e reto, preenchendo o quadro, com boa iluminação.
      </p>
      <div className="flex gap-2 mt-3">
        <Button variant="outline" onClick={onFechar} className="flex-1 h-11">
          Voltar
        </Button>
        <Button
          onClick={fotografar}
          disabled={!pronta}
          className="flex-1 h-11 bg-indigo-600 hover:bg-indigo-700"
        >
          Fotografar
        </Button>
      </div>
    </div>
  )
}
