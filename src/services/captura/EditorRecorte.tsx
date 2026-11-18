/**
 * Editor de recorte por toque/mouse (canvas) — SAP v0.0.98
 *
 * Mobile-first: arrastar retângulo com dedo ou mouse; [Cancelar]
 * [Recortar novamente] [Usar esta região]. OCR usa a região confirmada.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'

export interface EditorRecorteProps {
  imagemSrc: string
  onConfirmar: (recorteDataUrl: string) => void
  onCancelar: () => void
}

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export function EditorRecorte({ imagemSrc, onConfirmar, onCancelar }: EditorRecorteProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const inicioRef = useRef<{ x: number; y: number } | null>(null)
  const [rect, setRect] = useState<Rect | null>(null)
  const [arrastando, setArrastando] = useState(false)

  const desenhar = useCallback(() => {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    ctx.drawImage(img, 0, 0)
    if (rect && rect.w > 2 && rect.h > 2) {
      // escurece fora da seleção
      ctx.fillStyle = 'rgba(0,0,0,0.45)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.clearRect(rect.x, rect.y, rect.w, rect.h)
      ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h, rect.x, rect.y, rect.w, rect.h)
      ctx.strokeStyle = '#4f46e5'
      ctx.lineWidth = Math.max(2, canvas.width / 200)
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h)
    }
  }, [rect])

  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      desenhar()
    }
    img.src = imagemSrc
  }, [imagemSrc, desenhar])

  useEffect(() => {
    desenhar()
  }, [desenhar])

  const posicaoEvento = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const r = canvas.getBoundingClientRect()
    const scaleX = canvas.width / r.width
    const scaleY = canvas.height / r.height
    return {
      x: (e.clientX - r.left) * scaleX,
      y: (e.clientY - r.top) * scaleY,
    }
  }

  const aoIniciar = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = posicaoEvento(e)
    inicioRef.current = p
    setRect({ x: p.x, y: p.y, w: 0, h: 0 })
    setArrastando(true)
  }

  const aoMover = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!arrastando || !inicioRef.current) return
    const p = posicaoEvento(e)
    const i = inicioRef.current
    setRect({
      x: Math.min(i.x, p.x),
      y: Math.min(i.y, p.y),
      w: Math.abs(p.x - i.x),
      h: Math.abs(p.y - i.y),
    })
  }

  const aoTerminar = () => {
    setArrastando(false)
    inicioRef.current = null
  }

  const usarRegiao = () => {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img || !rect || rect.w < 4 || rect.h < 4) return
    const saida = document.createElement('canvas')
    saida.width = Math.round(rect.w)
    saida.height = Math.round(rect.h)
    const ctx = saida.getContext('2d')
    if (!ctx) return
    ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h, 0, 0, saida.width, saida.height)
    onConfirmar(saida.toDataURL('image/jpeg', 0.92))
  }

  return (
    <div className="w-full">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 overflow-auto max-h-[60vh]">
        <canvas
          ref={canvasRef}
          className="w-full h-auto touch-none select-none cursor-crosshair rounded"
          onPointerDown={aoIniciar}
          onPointerMove={aoMover}
          onPointerUp={aoTerminar}
          onPointerLeave={aoTerminar}
        />
      </div>
      <p className="text-xs text-slate-500 mt-2">
        Arraste sobre a imagem para selecionar SOMENTE a região dos itens do cupom.
      </p>
      <div className="flex flex-wrap gap-2 mt-3">
        <Button variant="outline" onClick={onCancelar} className="flex-1 min-w-[110px] h-11">
          Cancelar
        </Button>
        <Button
          variant="outline"
          onClick={() => setRect(null)}
          className="flex-1 min-w-[110px] h-11"
        >
          Recortar novamente
        </Button>
        <Button
          onClick={usarRegiao}
          disabled={!rect || rect.w < 4 || rect.h < 4}
          className="flex-1 min-w-[110px] h-11 bg-indigo-600 hover:bg-indigo-700"
        >
          Usar esta região
        </Button>
      </div>
    </div>
  )
}
