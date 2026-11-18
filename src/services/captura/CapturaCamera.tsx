/**
 * Captura direta pela câmera (getUserMedia, facingMode: environment) —
 * SAP v0.0.103. A foto volta direto ao SAP (canvas → dataURL), sem passar
 * pela galeria. Fallback: input capture="environment" se sem permissão.
 * R1: foco contínuo + toque-para-focar (pointsOfInterest) quando o track
 * suportar, com degradação silenciosa; resolução ideal ≥1920px.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'

export interface CapturaCameraProps {
  onCapturar: (dataUrl: string) => void
  onFechar: () => void
}

type CapabilitiesComFoco = MediaTrackCapabilities & {
  focusMode?: string[]
  zoom?: { min: number; max: number; step?: number }
  pointsOfInterest?: unknown
}

type TrackComFoco = MediaStreamTrack & {
  getCapabilities?: () => CapabilitiesComFoco
}

/** Aplica constraints de foco sem propagar erro (degradação silenciosa). */
const tentarConstraints = async (
  track: TrackComFoco,
  constraints: MediaTrackConstraints,
): Promise<boolean> => {
  try {
    await track.applyConstraints(constraints)
    return true
  } catch {
    return false
  }
}

export function CapturaCamera({ onCapturar, onFechar }: CapturaCameraProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const inputFallbackRef = useRef<HTMLInputElement | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pronta, setPronta] = useState(false)
  const [modoFallback, setModoFallback] = useState(false)
  const [focoTocado, setFocoTocado] = useState<{ x: number; y: number } | null>(null)
  const suporteMedia = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia

  const parar = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [])

  useEffect(() => {
    // Sem suporte a getUserMedia (ou contexto inseguro): fallback direto para
    // input capture="environment" — a câmera nativa do aparelho fotografa.
    if (!suporteMedia) {
      setModoFallback(true)
      return
    }
    let ativo = true
    navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          // Resolução ideal alta para OCR legível (recusada sem erro se indisponível)
          width: { ideal: 1920 },
          height: { ideal: 1920 },
        },
        audio: false,
      })
      .then(async (stream) => {
        if (!ativo) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        // Foco nítido: foco contínuo (e zoom, se suportado), sem erro se recusado
        const track = stream.getVideoTracks()[0] as TrackComFoco | undefined
        if (track) {
          const caps = track.getCapabilities?.() as CapabilitiesComFoco | undefined
          const avancado: Record<string, unknown>[] = []
          if (caps?.focusMode?.includes('continuous')) {
            avancado.push({ focusMode: 'continuous' })
          }
          if (caps?.zoom && caps.zoom.max > caps.zoom.min) {
            avancado.push({ zoom: Math.min(caps.zoom.min, caps.zoom.max) })
          }
          if (avancado.length > 0) {
            await tentarConstraints(track, { advanced: avancado } as MediaTrackConstraints)
          }
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play().catch(() => undefined)
          setPronta(true)
        }
      })
      .catch(() => {
        // Permissão negada ou câmera indisponível: fallback de captura nativa
        setErro(null)
        setModoFallback(true)
      })
    return () => {
      ativo = false
      parar()
    }
  }, [parar, suporteMedia])

  // Toque no preview: tenta focar no ponto tocado (pointsOfInterest) — sem erro
  const tocarParaFocar = async (e: React.PointerEvent<HTMLDivElement>) => {
    const video = videoRef.current
    if (!video || !pronta) return
    const rect = video.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    // Coordenadas normalizadas (0..1) do ponto tocado dentro do quadro
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
    setFocoTocado({ x: e.clientX - rect.left, y: e.clientY - rect.top })
    const track = streamRef.current?.getVideoTracks()[0] as TrackComFoco | undefined
    if (!track) return
    const caps = track.getCapabilities?.() as CapabilitiesComFoco | undefined
    const avancado: Record<string, unknown>[] = []
    if (caps?.pointsOfInterest) {
      avancado.push({ pointsOfInterest: [{ x, y }] })
    }
    if (caps?.focusMode) {
      if (caps.focusMode.includes('single-shot')) avancado.push({ focusMode: 'single-shot' })
      else if (caps.focusMode.includes('continuous')) avancado.push({ focusMode: 'continuous' })
    }
    if (avancado.length > 0) {
      await tentarConstraints(track, { advanced: avancado } as MediaTrackConstraints)
    }
  }

  const aoEscolherFallback = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') onCapturar(reader.result)
    }
    reader.readAsDataURL(file)
  }

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

  if (modoFallback) {
    return (
      <div className="w-full">
        <p className="text-xs text-slate-600 bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-center">
          Câmera direta indisponível (sem permissão ou sem suporte). Use a câmera do aparelho:
        </p>
        <input
          ref={inputFallbackRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={aoEscolherFallback}
        />
        <div className="flex gap-2 mt-3">
          <Button variant="outline" onClick={onFechar} className="flex-1 h-11">
            Voltar
          </Button>
          <Button
            onClick={() => inputFallbackRef.current?.click()}
            className="flex-1 h-11 bg-indigo-600 hover:bg-indigo-700"
          >
            Abrir câmera
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full">
      <div
        className="relative rounded-lg overflow-hidden bg-black aspect-[3/4] max-h-[55vh] mx-auto cursor-crosshair touch-none"
        onPointerDown={tocarParaFocar}
      >
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
        {focoTocado && pronta && (
          <div
            className="pointer-events-none absolute w-14 h-14 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-emerald-400/90 transition-opacity"
            style={{ left: focoTocado.x, top: focoTocado.y }}
          />
        )}
      </div>
      <p className="text-xs text-slate-500 mt-2 text-center">
        Toque na tela para focar. Mantenha o cupom plano e reto, preenchendo o quadro, com boa
        iluminação.
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
