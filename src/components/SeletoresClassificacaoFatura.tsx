import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Categoria, Subcategoria } from '@/types/sap'
import { cn } from '@/lib/utils'

/**
 * Seletores de Categoria e Subcategoria da IMPORTAÇÃO DE FATURAS (Teste
 * Captura 6 / Parte C — campo ÚNICO digitável).
 *
 * UM único campo por seletor: ao digitar, a lista abre automaticamente e
 * filtra em tempo real (case-insensitive, substring, ordem alfabética,
 * "Subcategoria (Categoria)" com menos contraste). O Select dedicado some —
 * não existe mais segundo campo para clicar. O input vive FORA de qualquer
 * portal do Radix (nada de SelectContent aqui), com stopPropagation nas
 * teclas e foco mantido até o clique na opção — o teclado do celular não
 * recolhe até a escolha. Botão X para LIMPAR (inclusive pré-preenchida pela
 * IA) e item "— Nenhuma —" preservados. Última gravação vence.
 */

const PLACEHOLDER_FILTRO = 'Filtrar categoria ou subcategoria...'

export const normalizarTextoFiltro = (v: string) => v.toLowerCase().trim()

const ItemNenhum: React.FC<{ aoEscolher: () => void }> = ({ aoEscolher }) => (
  <div
    role="option"
    aria-selected={false}
    tabIndex={-1}
    onMouseDown={(e) => {
      e.preventDefault()
      e.stopPropagation()
    }}
    onClick={(e) => {
      e.stopPropagation()
      aoEscolher()
    }}
    className="relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-2 pr-2 text-xs outline-none hover:bg-slate-100 focus:bg-slate-100 text-slate-500"
  >
    — Nenhuma —
  </div>
)

const ItemLista: React.FC<{
  selecionado: boolean
  destaque?: boolean
  aoEscolher: () => void
  children: React.ReactNode
}> = ({ selecionado, destaque, aoEscolher, children }) => (
  <div
    role="option"
    aria-selected={selecionado}
    tabIndex={-1}
    onMouseDown={(e) => {
      e.preventDefault()
      e.stopPropagation()
    }}
    onClick={(e) => {
      e.stopPropagation()
      aoEscolher()
    }}
    className={cn(
      'relative flex w-full cursor-pointer select-none items-center gap-2 rounded-sm py-1.5 pl-2 pr-2 text-[11px] outline-none hover:bg-slate-100 focus:bg-slate-100',
      destaque ? 'text-slate-400 font-normal' : 'font-semibold text-slate-900',
    )}
  >
    {children}
  </div>
)

const useSeletorLista = () => {
  const [busca, setBusca] = useState('')
  const [aberto, setAberto] = useState(false)
  const raizRef = useRef<HTMLDivElement>(null)
  // Parte C.3 — ref do container portado (fecho ao clicar fora não fecha
  // quando o clique é na própria lista).
  const listaPortalRef = useRef<HTMLDivElement | null>(null)

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

  return { busca, setBusca, aberto, setAberto, raizRef, listaPortalRef }
}

// Parte C.3 — posição FIXA da lista em portal (calculada do input), no mesmo
// esquema da C.2 no ModalLancamento: dentro do DialogContent
// (overflow-y-auto) o dropdown absolute era CORTADO no PC. A lista vive no
// <body> com position fixed, segue scroll/resize e vira para cima quando
// falta espaço abaixo. API de props dos seletores NÃO muda.
const usePosicaoListaPortal = (
  raizRef: React.RefObject<HTMLElement | null>,
  aberto: boolean,
  setAberto: (v: boolean) => void,
) => {
  const [pos, setPos] = useState<{
    left: number
    width: number
    top?: number
    bottom?: number
    alturaMax: number
  } | null>(null)

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
  }, [raizRef])

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

  return pos
}

const BotaoLimpar: React.FC<{ title: string; aoLimpar: () => void }> = ({ title, aoLimpar }) => (
  <button
    type="button"
    title={title}
    aria-label={title}
    onMouseDown={(e) => e.preventDefault()}
    onClick={(e) => {
      e.stopPropagation()
      aoLimpar()
    }}
    className="absolute right-6 top-1/2 -translate-y-1/2 z-20 rounded-full p-0.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
  >
    <X className="w-3 h-3" />
  </button>
)

export interface SeletorCategoriaFaturaProps {
  categorias: Categoria[]
  valor: string
  aoMudar: (categoriaId: string | null) => void
  desabilitado?: boolean
}

export const SeletorCategoriaFatura: React.FC<SeletorCategoriaFaturaProps> = ({
  categorias,
  valor,
  aoMudar,
  desabilitado,
}) => {
  const { busca, setBusca, aberto, setAberto, raizRef, listaPortalRef } = useSeletorLista()
  const posLista = usePosicaoListaPortal(raizRef, aberto, setAberto)

  const categoriasOrdenadas = useMemo(
    () =>
      [...categorias].sort((a, b) =>
        a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }),
      ),
    [categorias],
  )

  const listaFiltrada = useMemo(() => {
    const termo = normalizarTextoFiltro(busca)
    if (!termo) return categoriasOrdenadas
    return categoriasOrdenadas.filter((c) => normalizarTextoFiltro(c.nome).includes(termo))
  }, [categoriasOrdenadas, busca])

  const nomeSelecionado = useMemo(
    () => categorias.find((c) => c.id === valor)?.nome || '',
    [categorias, valor],
  )

  const limpar = () => {
    setBusca('')
    aoMudar(null)
  }

  return (
    <div ref={raizRef} className="relative flex-1 min-w-0">
      <div className="relative">
        <Input
          type="text"
          inputMode="text"
          value={aberto ? busca : valor && nomeSelecionado ? nomeSelecionado : busca}
          onChange={(e) => {
            setBusca(e.target.value)
            setAberto(true)
          }}
          onFocus={() => setAberto(true)}
          placeholder="Categoria..."
          title="Digite para filtrar a lista"
          className="bg-white border-slate-200 text-slate-900 h-7 text-[11px] w-full pr-6"
          autoComplete="off"
          disabled={desabilitado}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        />
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
        {!!valor && !desabilitado && <BotaoLimpar title="Limpar categoria" aoLimpar={limpar} />}
      </div>
      {aberto &&
        !desabilitado &&
        posLista &&
        createPortal(
          <div
            ref={listaPortalRef}
            className="fixed z-[70] overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg"
            style={{
              left: posLista.left,
              width: posLista.width,
              maxHeight: posLista.alturaMax,
              ...(posLista.top !== undefined ? { top: posLista.top } : { bottom: posLista.bottom }),
            }}
            onMouseDown={(e) => e.preventDefault()}
          >
            <ItemNenhum aoEscolher={limpar} />
            {listaFiltrada.length === 0 ? (
              <div className="p-3 text-center text-xs text-slate-400">
                Nenhuma categoria encontrada
              </div>
            ) : (
              listaFiltrada.map((c) => (
                <ItemLista
                  key={c.id}
                  selecionado={valor === c.id}
                  aoEscolher={() => {
                    setBusca('')
                    setAberto(false)
                    aoMudar(c.id)
                  }}
                >
                  {c.nome}
                </ItemLista>
              ))
            )}
          </div>,
          document.body,
        )}
    </div>
  )
}

export interface SeletorSubcategoriaFaturaProps {
  subcategorias: Subcategoria[]
  /** Mapa id → nome das categorias (para filtrar/exibir "(Categoria)") */
  nomesCategorias?: Record<string, string>
  valor: string
  aoMudar: (subcategoriaId: string | null) => void
  desabilitado?: boolean
  /** Rótulo alternativo do filtro (ex.: edição em massa) */
  placeholderFiltro?: string
}

export const SeletorSubcategoriaFatura: React.FC<SeletorSubcategoriaFaturaProps> = ({
  subcategorias,
  nomesCategorias = {},
  valor,
  aoMudar,
  desabilitado,
  placeholderFiltro,
}) => {
  const { busca, setBusca, aberto, setAberto, raizRef, listaPortalRef } = useSeletorLista()
  const posLista = usePosicaoListaPortal(raizRef, aberto, setAberto)

  const subcategoriasOrdenadas = useMemo(
    () =>
      [...subcategorias].sort((a, b) =>
        a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }),
      ),
    [subcategorias],
  )

  const listaFiltrada = useMemo(() => {
    const termo = normalizarTextoFiltro(busca)
    if (!termo) return subcategoriasOrdenadas
    return subcategoriasOrdenadas.filter(
      (s) =>
        normalizarTextoFiltro(s.nome).includes(termo) ||
        normalizarTextoFiltro(nomesCategorias[s.categoria_id] || '').includes(termo),
    )
  }, [subcategoriasOrdenadas, nomesCategorias, busca])

  const nomeSelecionado = useMemo(
    () => subcategorias.find((s) => s.id === valor)?.nome || '',
    [subcategorias, valor],
  )

  const limpar = () => {
    setBusca('')
    aoMudar(null)
  }

  return (
    <div ref={raizRef} className="relative flex-1 min-w-0">
      <div className="relative">
        <Input
          type="text"
          inputMode="text"
          value={aberto ? busca : valor && nomeSelecionado ? nomeSelecionado : busca}
          onChange={(e) => {
            setBusca(e.target.value)
            setAberto(true)
          }}
          onFocus={() => setAberto(true)}
          placeholder={placeholderFiltro || PLACEHOLDER_FILTRO}
          title="Digite para filtrar a lista"
          className="bg-white border-slate-200 text-slate-900 h-7 text-[11px] w-full pr-6"
          autoComplete="off"
          disabled={desabilitado}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        />
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
        {!!valor && !desabilitado && <BotaoLimpar title="Limpar subcategoria" aoLimpar={limpar} />}
      </div>
      {aberto &&
        !desabilitado &&
        posLista &&
        createPortal(
          <div
            ref={listaPortalRef}
            className="fixed z-[70] overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg"
            style={{
              left: posLista.left,
              width: posLista.width,
              maxHeight: posLista.alturaMax,
              ...(posLista.top !== undefined ? { top: posLista.top } : { bottom: posLista.bottom }),
            }}
            onMouseDown={(e) => e.preventDefault()}
          >
            <ItemNenhum aoEscolher={limpar} />
            {listaFiltrada.length === 0 ? (
              <div className="p-3 text-center text-xs text-slate-400">
                Nenhuma subcategoria encontrada
              </div>
            ) : (
              listaFiltrada.map((s) => (
                <ItemLista
                  key={s.id}
                  selecionado={valor === s.id}
                  aoEscolher={() => {
                    setBusca('')
                    setAberto(false)
                    aoMudar(s.id)
                  }}
                >
                  <span className="font-semibold text-slate-900">{s.nome}</span>
                  {nomesCategorias[s.categoria_id] && (
                    <span className="text-[10px] text-slate-400 font-normal">
                      ({nomesCategorias[s.categoria_id]})
                    </span>
                  )}
                </ItemLista>
              ))
            )}
          </div>,
          document.body,
        )}
    </div>
  )
}
