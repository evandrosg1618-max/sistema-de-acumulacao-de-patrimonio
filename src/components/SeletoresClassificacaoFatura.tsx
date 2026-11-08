import React, { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Categoria, Subcategoria } from '@/types/sap'
import { cn } from '@/lib/utils'

/**
 * Seletores de Categoria e Subcategoria da IMPORTAÇÃO DE FATURAS.
 * Padrão do Novo Lançamento (ModalLancamento): select próprio com campo de
 * filtro DIGITÁVEL VISÍVEL no topo da lista (case-insensitive, substring,
 * mostra "Subcategoria (Categoria)"), botão X para LIMPAR a seleção
 * (inclusive quando pré-preenchida pela IA) e item "— Nenhuma —".
 */

const PLACEHOLDER_FILTRO = 'Filtrar categoria ou subcategoria...'

export const normalizarTextoFiltro = (v: string) => v.toLowerCase().trim()

const CabecalhoFiltro: React.FC<{
  valor: string
  aoMudar: (v: string) => void
  placeholder?: string
}> = ({ valor, aoMudar, placeholder }) => (
  <div className="p-2 border-b border-slate-100 sticky top-0 bg-white z-10">
    <div className="relative">
      <Input
        type="text"
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        placeholder={placeholder || PLACEHOLDER_FILTRO}
        title="Digite para filtrar a lista"
        className="h-8 text-xs bg-slate-50 text-slate-900 border-slate-200 ring-1 ring-emerald-500"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      />
    </div>
  </div>
)

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
  const [busca, setBusca] = useState('')
  const [aberto, setAberto] = useState(false)

  const listaFiltrada = useMemo(() => {
    const termo = normalizarTextoFiltro(busca)
    if (!termo) return categorias
    return categorias.filter((c) => normalizarTextoFiltro(c.nome).includes(termo))
  }, [categorias, busca])

  const limpar = () => {
    setBusca('')
    aoMudar(null)
  }

  return (
    <div className="relative flex-1 min-w-0">
      <Select
        open={aberto}
        onOpenChange={(o) => {
          setAberto(o)
          if (!o) setBusca('')
        }}
        value={valor || undefined}
        onValueChange={(val) => {
          setBusca('')
          aoMudar(val)
        }}
      >
        <SelectTrigger
          className="bg-white border-slate-200 text-slate-900 h-7 text-[11px] w-full"
          disabled={desabilitado}
        >
          <SelectValue placeholder="Categoria..." />
        </SelectTrigger>
        <SelectContent className="bg-white border-slate-200 text-slate-900">
          <CabecalhoFiltro valor={busca} aoMudar={setBusca} placeholder="Filtrar categoria..." />
          <ItemNenhum aoEscolher={limpar} />
          {listaFiltrada.length === 0 ? (
            <div className="p-3 text-center text-xs text-slate-400">
              Nenhuma categoria encontrada
            </div>
          ) : (
            listaFiltrada.map((c) => (
              <SelectItem key={c.id} value={c.id} className="text-[11px]">
                {c.nome}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
      {valor && !desabilitado && (
        <button
          type="button"
          title="Limpar categoria"
          aria-label="Limpar categoria"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation()
            limpar()
          }}
          className="absolute right-6 top-1/2 -translate-y-1/2 z-20 rounded-full p-0.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
        >
          <X className="w-3 h-3" />
        </button>
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
  const [busca, setBusca] = useState('')
  const [aberto, setAberto] = useState(false)

  const listaFiltrada = useMemo(() => {
    const termo = normalizarTextoFiltro(busca)
    if (!termo) return subcategorias
    return subcategorias.filter(
      (s) =>
        normalizarTextoFiltro(s.nome).includes(termo) ||
        normalizarTextoFiltro(nomesCategorias[s.categoria_id] || '').includes(termo),
    )
  }, [subcategorias, nomesCategorias, busca])

  const limpar = () => {
    setBusca('')
    aoMudar(null)
  }

  return (
    <div className="relative flex-1 min-w-0">
      <Select
        open={aberto}
        onOpenChange={(o) => {
          setAberto(o)
          if (!o) setBusca('')
        }}
        value={valor || undefined}
        onValueChange={(val) => {
          setBusca('')
          aoMudar(val)
        }}
      >
        <SelectTrigger
          className="bg-white border-slate-200 text-slate-900 h-7 text-[11px] w-full"
          disabled={desabilitado}
        >
          <SelectValue placeholder="Subcat..." />
        </SelectTrigger>
        <SelectContent className="bg-white border-slate-200 text-slate-900">
          <CabecalhoFiltro valor={busca} aoMudar={setBusca} placeholder={placeholderFiltro} />
          <ItemNenhum aoEscolher={limpar} />
          {listaFiltrada.length === 0 ? (
            <div className="p-3 text-center text-xs text-slate-400">
              Nenhuma subcategoria encontrada
            </div>
          ) : (
            listaFiltrada.map((s) => (
              <SelectItem key={s.id} value={s.id} className="text-[11px]">
                <div className="flex items-center justify-between w-full gap-2">
                  <span className="font-semibold text-slate-900">{s.nome}</span>
                  {nomesCategorias[s.categoria_id] && (
                    <span className="text-[10px] text-slate-400 font-normal">
                      ({nomesCategorias[s.categoria_id]})
                    </span>
                  )}
                </div>
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
      {valor && !desabilitado && (
        <button
          type="button"
          title="Limpar subcategoria"
          aria-label="Limpar subcategoria"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation()
            limpar()
          }}
          className="absolute right-6 top-1/2 -translate-y-1/2 z-20 rounded-full p-0.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  )
}
