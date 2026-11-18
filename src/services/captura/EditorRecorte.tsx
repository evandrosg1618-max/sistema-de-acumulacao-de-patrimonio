/**
 * Editor de recorte por toque/mouse (canvas) — SAP v0.0.103
 *
 * Mobile-first: arrastar retângulo com dedo ou mouse; [Cancelar]
 * [Recortar novamente] [Usar esta região]. OCR usa a região confirmada.
 * R2.1: sem região selecionada, oferece "Usar a imagem inteira" (sem
 * re-encode — a compressão de upload existente cuida do tamanho).
 * R2.2: quadro maior (72vh) com auto-scroll nas bordas durante o arrasto,
 * usando coordenadas do canvas (não da tela).
 * R2.3: anti duplo clique — confirmação trava os botões ("Adicionando…")
 * até o pai concluir a gravação; idempotente (1 clique = 1 captura).
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'

export interface EditorRecorteProps {
  imagemSrc: string
  onConfirmar: (recorteDataUrl: string) => void | Promise<void>
  onCancelar: () => void
}

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

const MARGEM_AUTOSCROLL = 48 // px de zona sensível nas bordas
const VELOCIDADE_AUTOSCROLL = 9 // px por quadro

export function EditorRecorte({ imagemSrc, onConfirmar, onCancelar }: EditorRecorteProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const inicioRef = useRef<{ x: number; y: number } | null>(null)
  const ultimoClienteRef = useRef<{ x: number; y: number } | null>(null)
  const arrastandoRef = useRef(false)
  const rafAutoScrollRef = useRef<number | null>(null)
  const [rect, setRect] = useState<Rect | null>(null)
  const [arrastando, setArrastando] = useState(false)
  const [confirmando, setConfirmando] = useState<false | 'regiao' | 'inteira'>(false)

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

  useEffect(() => {
    return () => {
      if (rafAutoScrollRef.current !== null) cancelAnimationFrame(rafAutoScrollRef.current)
    }
  }, [])

  // Converte coordenadas de TELA para coordenadas do CANVAS (respeitando scroll)
  const posicaoDeCliente = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const r = canvas.getBoundingClientRect()
    const scaleX = canvas.width / r.width
    const scaleY = canvas.height / r.height
    return {
      x: (clientX - r.left) * scaleX,
      y: (clientY - r.top) * scaleY,
    }
  }

  const posicaoEvento = (e: React.PointerEvent<HTMLCanvasElement>) =>
    posicaoDeCliente(e.clientX, e.clientY)

  const aplicarRetanguloDoCliente = (clientX: number, clientY: number) => {
    const i = inicioRef.current
    if (!i) return
    const p = posicaoDeCliente(clientX, clientY)
    setRect({
      x: Math.min(i.x, p.x),
      y: Math.min(i.y, p.y),
      w: Math.abs(p.x - i.x),
      h: Math.abs(p.y - i.y),
    })
  }

  // R2.2: auto-scroll contínuo quando o ponteiro encosta nas bordas do container
  const cicloAutoScroll = useCallback(() => {
    const container = containerRef.current
    const cliente = ultimoClienteRef.current
    if (!container || !cliente || !arrastandoRef.current) {
      rafAutoScrollRef.current = null
      return
    }
    const r = container.getBoundingClientRect()
    let delta = 0
    if (cliente.y > r.bottom - MARGEM_AUTOSCROLL) delta = VELOCIDADE_AUTOSCROLL
    else if (cliente.y < r.top + MARGEM_AUTOSCROLL) delta = -VELOCIDADE_AUTOSCROLL
    if (delta !== 0) {
      container.scrollTop += delta
      // Após rolar, o ponto sob o dedo muda em coordenadas do canvas: reapply
      aplicarRetanguloDoCliente(cliente.x, cliente.y)
    }
    rafAutoScrollRef.current = requestAnimationFrame(cicloAutoScroll)
  }, [])

  const aoIniciar = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (confirmando) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = posicaoEvento(e)
    inicioRef.current = p
    ultimoClienteRef.current = { x: e.clientX, y: e.clientY }
    setRect({ x: p.x, y: p.y, w: 0, h: 0 })
    setArrastando(true)
    arrastandoRef.current = true
    if (rafAutoScrollRef.current === null) {
      rafAutoScrollRef.current = requestAnimationFrame(cicloAutoScroll)
    }
  }

  const aoMover = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!arrastando || !inicioRef.current) return
    ultimoClienteRef.current = { x: e.clientX, y: e.clientY }
    aplicarRetanguloDoCliente(e.clientX, e.clientY)
  }

  const aoTerminar = () => {
    setArrastando(false)
    arrastandoRef.current = false
    inicioRef.current = null
    ultimoClienteRef.current = null
  }

  const regiaoValida = !!rect && rect.w >= 4 && rect.h >= 4

  // R2.3: trava imediata; o pai confirma a gravação antes de liberar
  const confirmar = async (tipo: 'regiao' | 'inteira') => {
    if (confirmando) return // idempotente: 1 clique = 1 captura
    if (tipo === 'regiao') {
      const canvas = canvasRef.current
      const img = imgRef.current
      if (!canvas || !img || !rect || rect.w < 4 || rect.h < 4) return
      setConfirmando('regiao')
      try {
        const saida = document.createElement('canvas')
        saida.width = Math.round(rect.w)
        saida.height = Math.round(rect.h)
        const ctx = saida.getContext('2d')
        if (!ctx) return
        ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h, 0, 0, saida.width, saida.height)
        await onConfirmar(saida.toDataURL('image/jpeg', 0.92))
      } finally {
        setConfirmando(false)
      }
    } else {
      // Imagem inteira SEM re-encode: entrega o src original (compressão de
      // upload existente em imagemUtils cuida do tamanho, mantendo o OCR)
      setConfirmando('inteira')
      try {
        await onConfirmar(imagemSrc)
      } finally {
        setConfirmando(false)
      }
    }
  }

  return (
    <div className="w-full">
      <div
        ref={containerRef}
        className="rounded-lg border border-slate-200 bg-slate-50 p-2 overflow-auto max-h-[72vh]"
      >
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
        {regiaoValida
          ? 'Arraste sobre a imagem para selecionar SOMENTE a região dos itens do cupom.'
          : 'Arraste para selecionar a região dos itens — ou use a imagem inteira abaixo.'}
      </p>
      <div className="flex flex-wrap gap-2 mt-3">
        <Button
          variant="outline"
          onClick={onCancelar}
          disabled={!!confirmando}
          className="flex-1 min-w-[110px] h-11"
        >
          Cancelar
        </Button>
        <Button
          variant="outline"
          onClick={() => setRect(null)}
          disabled={!!confirmando}
          className="flex-1 min-w-[110px] h-11"
        >
          Recortar novamente
        </Button>
        {regiaoValida ? (
          <Button
            onClick={() => confirmar('regiao')}
            disabled={!!confirmando}
            className="flex-1 min-w-[110px] h-11 bg-indigo-600 hover:bg-indigo-700"
          >
            {confirmando === 'regiao' ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="w-4 h-4 animate-spin" /> Adicionando…
              </span>
            ) : (
              'Usar esta região'
            )}
          </Button>
        ) : (
          <Button
            onClick={() => confirmar('inteira')}
            disabled={!!confirmando}
            className="flex-1 min-w-[110px] h-11 bg-indigo-600 hover:bg-indigo-700"
          >
            {confirmando === 'inteira' ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="w-4 h-4 animate-spin" /> Adicionando…
              </span>
            ) : (
              'Usar a imagem inteira'
            )}
          </Button>
        )}
      </div>
    </div>
  )
}
