/**
 * TESTE CAPTURA 6 / Parte C.3 (T2) — campo ÚNICO digitável do agrupamento.
 * Substitui os DOIS seletores (SeletorCategoriaFatura + SeletorSubcategoriaFatura)
 * do ModalAgruparCaptura por UM campo, no MESMO padrão lan-filtro-subcat do
 * ModalLancamento (C.2): ao digitar, a lista abre em tempo real (alfabética,
 * "Subcategoria (Categoria)" com a categoria em menor contraste); escolher a
 * subcategoria marca automaticamente a categoria dela. X e "— Nenhuma —"
 * preservados. A lista vive em PORTAL no <body> com position fixed (mesmo
 * esquema da C.2/C.3: nunca cortada pelo DialogContent no PC); o clique na
 * lista não fecha o Dialog.
 *
 * C.4 — data-lista-portal="true" + pointer-events auto + stopPropagation no
 * pointerdown na lista em portal: o Dialog Radix põe pointer-events:none no
 * <body> (toque ATRAVESSA) e o listener de dismissal do DismissableLayer
 * vive no document (fecharia o Dialog antes do onClick da opção rodar).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Categoria, Subcategoria } from '@/types/sap'

interface Props {
  categorias: Categoria[]
  /** Todas as subcategorias do workspace (o campo filtra em tempo real). */
  subcategorias: Subcategoria[]
  categoriaId: string | null
  subcategoriaId: string | null
  aoMudarCategoria: (categoriaId: string | null) => void
  aoMudarSubcategoria: (subcategoriaId: string | null) => void
}

type OpcaoSub = { id: string; nome: string; categoriaId: string; categoriaNome: string }

const normalizar = (v: string) => v.toLowerCase().trim()

const CampoUnicoClassificacao: React.FC<Props> = ({
  categorias,
  subcategorias,
  categoriaId,
  subcategoriaId,
  aoMudarCategoria,
  aoMudarSubcategoria,
}) => {
  const [busca, setBusca] = useState('')
  const [aberto, setAberto] = useState(false)
  const raizRef = useRef<HTMLDivElement | null>(null)
  const listaPortalRef = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState<{
    left: number
    width: number
    top?: number
    bottom?: number
    alturaMax: number
  } | null>(null)

  // Opções: TODAS as subcategorias do workspace, alfabéticas; categoria sem
  // subcategoria cadastrada entra como opção própria (padrão do ModalLancamento).
  const opcoes = useMemo<OpcaoSub[]>(() => {
    const lista: OpcaoSub[] = []
    const nomeCat = new Map(categorias.map((c) => [c.id, c.nome]))
    subcategorias.forEach((s) => {
      if (nomeCat.has(s.categoria_id)) {
        lista.push({
          id: s.id,
          nome: s.nome,
          categoriaId: s.categoria_id,
          categoriaNome: nomeCat.get(s.categoria_id) || '',
        })
      }
    })
    categorias.forEach((c) => {
      const temSub = subcategorias.some((s) => s.categoria_id === c.id)
      if (!temSub) {
        lista.push({
          id: `cat-fallback-${c.id}`,
          nome: c.nome,
          categoriaId: c.id,
          categoriaNome: c.nome,
        })
      }
    })
    return lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }))
  }, [categorias, subcategorias])

  const listaFiltrada = useMemo(() => {
    const termo = normalizar(busca)
    if (!termo) return opcoes
    return opcoes.filter(
      (o) => normalizar(o.nome).includes(termo) || normalizar(o.categoriaNome).includes(termo),
    )
  }, [opcoes, busca])

  // Rótulo do campo fechado: nome da sub escolhida, ou "(Categoria)" quando a
  // classificação é só pela categoria (fallback).
  const subEscolhida = useMemo(
    () => opcoes.find((o) => o.id === subcategoriaId) || null,
    [opcoes, subcategoriaId],
  )
  const catEscolhida = useMemo(
    () => categorias.find((c) => c.id === categoriaId) || null,
    [categorias, categoriaId],
  )
  const rotuloFechado = subEscolhida
    ? subEscolhida.nome
    : catEscolhida
      ? `(${catEscolhida.nome})`
      : ''

  // Escolher a sub marca a categoria dela (regra do agrupamento).
  const escolher = (opcao: OpcaoSub | null) => {
    setBusca('')
    setAberto(false)
    if (!opcao) {
      aoMudarSubcategoria(null)
      aoMudarCategoria(null)
      return
    }
    if (opcao.id.startsWith('cat-fallback-')) {
      aoMudarSubcategoria(null)
      aoMudarCategoria(opcao.categoriaId)
      return
    }
    aoMudarSubcategoria(opcao.id)
    aoMudarCategoria(opcao.categoriaId)
  }

  // Fecho ao clicar fora (o clique DENTRO da lista não fecha).
  useEffect(() => {
    if (!aberto) return
    const aoClicarFora = (e: MouseEvent) => {
      const alvo = e.target as Node
      if (
        raizRef.current &&
        !raizRef.current.contains(alvo) &&
        !listaPortalRef.current?.contains(alvo)
      )
        setAberto(false)
    }
    document.addEventListener('mousedown', aoClicarFora)
    return () => document.removeEventListener('mousedown', aoClicarFora)
  }, [aberto])

  // C.2/C.3 — posição FIXA calculada do input; lista em portal no <body>,
  // segue scroll/resize, abre para cima quando falta espaço abaixo.
  const recalcular = React.useCallback(() => {
    const raiz = raizRef.current
    if (!raiz) return
    const r = raiz.getBoundingClientRect()
    const espacoAbaixo = window.innerHeight - r.bottom
    const abrirParaCima = espacoAbaixo < 160 && r.top > espacoAbaixo
    setPos({
      left: r.left,
      width: r.width,
      ...(abrirParaCima ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
      alturaMax: Math.max(120, Math.min(288, (abrirParaCima ? r.top : espacoAbaixo) - 8)),
    })
  }, [])

  useEffect(() => {
    if (!aberto) {
      setPos(null)
      return
    }
    recalcular()
    window.addEventListener('scroll', recalcular, true)
    window.addEventListener('resize', recalcular)
    return () => {
      window.removeEventListener('scroll', recalcular, true)
      window.removeEventListener('resize', recalcular)
    }
  }, [aberto, recalcular])

  return (
    <div ref={raizRef} className="relative">
      <div className="relative">
        <Input
          type="text"
          inputMode="text"
          value={aberto ? busca : rotuloFechado || busca}
          onChange={(e) => {
            setBusca(e.target.value)
            setAberto(true)
          }}
          onFocus={() => setAberto(true)}
          placeholder="Filtrar categoria ou subcategoria..."
          title="Digite para filtrar a lista pela categoria ou subcategoria"
          className="h-9 bg-white text-slate-900 border-slate-300 text-xs font-medium pr-8"
          autoComplete="off"
        />
        {(subcategoriaId || categoriaId) && (
          <button
            type="button"
            title="Limpar categoria e subcategoria"
            aria-label="Limpar categoria e subcategoria"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.stopPropagation()
              escolher(null)
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-20 rounded-full p-0.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {aberto &&
        pos &&
        createPortal(
          <div
            ref={listaPortalRef}
            data-lista-portal=""
            className="fixed z-[70] overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg"
            style={{
              // C.4 — o Dialog Radix põe pointer-events:none no <body>; sem
              // 'auto' aqui o toque ATRAVESSA a lista e aciona o que está
              // por baixo (ex.: botão Agrupar).
              pointerEvents: 'auto',
              left: pos.left,
              width: pos.width,
              maxHeight: pos.alturaMax,
              ...(pos.top !== undefined ? { top: pos.top } : { bottom: pos.bottom }),
            }}
            // C.4 — o pointerdown NÃO pode chegar ao listener do documento do
            // DismissableLayer: para o Radix, a lista em portal é "fora" do
            // Dialog e ele demitiria o modal antes do onClick da opção rodar.
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.preventDefault()}
          >
            <div
              role="option"
              aria-selected={!subcategoriaId && !categoriaId}
              tabIndex={-1}
              onMouseDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
              }}
              onClick={(e) => {
                e.stopPropagation()
                escolher(null)
              }}
              className="relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-2 pr-2 text-xs outline-none hover:bg-slate-100 focus:bg-slate-100 text-slate-500"
            >
              — Nenhuma —
            </div>
            {listaFiltrada.length === 0 ? (
              <div className="p-3 text-center text-xs text-slate-400">
                {busca.trim()
                  ? 'Nenhuma subcategoria encontrada para o filtro digitado'
                  : 'Nenhuma subcategoria encontrada'}
              </div>
            ) : (
              listaFiltrada.map((o) => (
                <div
                  key={o.id}
                  role="option"
                  aria-selected={subcategoriaId === o.id}
                  tabIndex={-1}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                  }}
                  onClick={(e) => {
                    e.stopPropagation()
                    escolher(o)
                  }}
                  className="relative flex w-full cursor-pointer select-none items-center gap-2 rounded-sm py-1.5 pl-2 pr-2 text-xs outline-none hover:bg-slate-100 focus:bg-slate-100"
                >
                  <span className="font-semibold text-slate-900">{o.nome}</span>
                  <span className="text-[11px] text-slate-400 font-normal">
                    ({o.categoriaNome})
                  </span>
                </div>
              ))
            )}
          </div>,
          document.body,
        )}
    </div>
  )
}

export default CampoUnicoClassificacao
