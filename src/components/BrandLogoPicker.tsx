import React, { useState, useMemo } from 'react'
import {
  InstituicaoFinanceira,
  INSTITUICOES_FINANCEIRAS,
  obterInstituicaoPorId,
  filtrarInstituicoes,
} from './InstituicoesFinanceiras'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Search, Building2, CreditCard, Check, X, Undo2 } from 'lucide-react'

export interface BrandLogoDisplayProps {
  id?: string | null
  tipo: 'conta' | 'cartao'
  className?: string
  altFallback?: string
}

/**
 * Renderizador isolado de Logo/Miniatura com máscara:
 * - Conta: máscara circular (rounded-full)
 * - Cartão: máscara retangular proporcional (aspect-[1.58/1] ou rounded-md)
 * Utiliza object-fit: contain para JAMAIS deformar o arquivo original.
 * Fallback seguro: se sem logo ou asset inválido, exibe ícone padrão de Conta ou Cartão.
 */
export function BrandLogoDisplay({ id, tipo, className = '', altFallback }: BrandLogoDisplayProps) {
  const inst = obterInstituicaoPorId(id)

  if (tipo === 'conta') {
    const baseClass = `rounded-full overflow-hidden flex items-center justify-center shrink-0 border border-slate-200/80 bg-white shadow-xs ${className || 'w-8 h-8'}`
    if (inst) {
      return (
        <div className={baseClass} title={inst.nome}>
          <img
            src={inst.logoAsset}
            alt={inst.nome}
            className="w-full h-full object-contain p-0.5"
            loading="lazy"
          />
        </div>
      )
    }
    return (
      <div className={baseClass} title={altFallback || 'Conta Bancária'}>
        <Building2 className="w-1/2 h-1/2 text-slate-500" />
      </div>
    )
  }

  // Cartão: retangular (proporção semelhante a cartão de crédito real)
  const baseClass = `rounded-md overflow-hidden flex items-center justify-center shrink-0 border border-slate-200/80 bg-slate-900 shadow-xs ${className || 'w-11 h-7'}`
  if (inst) {
    return (
      <div className={baseClass} title={inst.nome}>
        <img
          src={inst.logoAsset}
          alt={inst.nome}
          className="w-full h-full object-contain p-0.5"
          loading="lazy"
        />
      </div>
    )
  }
  return (
    <div className={baseClass} title={altFallback || 'Cartão de Crédito'}>
      <CreditCard className="w-1/2 h-1/2 text-white" />
    </div>
  )
}

export interface BrandLogoPickerProps {
  value?: string | null
  onChange: (id: string | null, inst?: InstituicaoFinanceira | null) => void
  tipo: 'conta' | 'cartao'
  label?: string
  descricao?: string
  disabled?: boolean
}

/**
 * Componente Reutilizável Brand/Logo Picker
 *
 * Substitui a grade permanente de logos no formulário por:
 * 1. Campo único "Ícone / Instituição" com miniatura e botão "Escolher ícone"
 * 2. Modal de seleção "Selecione o ícone"
 *    - Subtítulo: "Escolha a instituição financeira ou um ícone personalizado."
 *    - Campo Pesquisar com filtro imediato ("Bra" -> Bradesco, BB)
 *    - Grid compacto e responsivo, destaque da opção selecionada
 *    - Rolagem interna e botões Cancelar / Selecionar ícone
 *    - Anti duplo clique
 *    - Reutilizado nos 4 formulários: Nova Conta, Edita Conta, Novo Cartão, Edita Cartão
 */
export function BrandLogoPicker({
  value,
  onChange,
  tipo,
  label = 'Ícone / Instituição',
  descricao = 'Selecione a instituição financeira oficial para exibir a logomarca.',
  disabled = false,
}: BrandLogoPickerProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const [termoBusca, setTermoBusca] = useState('')
  const [selecaoTemporaria, setSelecaoTemporaria] = useState<string | null>(value || null)
  const [confirmando, setConfirmando] = useState(false)

  const instituicaoAtual = useMemo(() => obterInstituicaoPorId(value), [value])

  const listaFiltrada = useMemo(() => {
    return filtrarInstituicoes(termoBusca)
  }, [termoBusca])

  const abrirModal = () => {
    if (disabled) return
    setSelecaoTemporaria(value || null)
    setTermoBusca('')
    setModalOpen(true)
  }

  const fecharModal = () => {
    setModalOpen(false)
    setTermoBusca('')
    setConfirmando(false)
  }

  const handleConfirmar = () => {
    if (confirmando) return
    setConfirmando(true)
    const inst = obterInstituicaoPorId(selecaoTemporaria)
    onChange(selecaoTemporaria || null, inst)
    fecharModal()
  }

  const handleLimpar = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange(null, null)
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold text-slate-700">{label}</Label>
        {instituicaoAtual && !disabled && (
          <button
            type="button"
            onClick={handleLimpar}
            className="text-[11px] text-slate-500 hover:text-rose-600 flex items-center gap-1 transition"
          >
            <X className="w-3 h-3" />
            Remover ícone
          </button>
        )}
      </div>

      {descricao && <p className="text-[11px] text-slate-500">{descricao}</p>}

      {/* Caixa de disparo do picker: mostra a logo atual e o botão de ação */}
      <div
        onClick={abrirModal}
        className={`flex items-center justify-between p-2.5 rounded-xl border transition cursor-pointer select-none bg-white ${
          disabled
            ? 'opacity-60 cursor-not-allowed border-slate-200'
            : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/70 shadow-2xs'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <BrandLogoDisplay
            id={value}
            tipo={tipo}
            className={tipo === 'conta' ? 'w-10 h-10' : 'w-12 h-8'}
          />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-800 truncate">
              {instituicaoAtual ? instituicaoAtual.nome : 'Ícone Padrão do Sistema'}
            </p>
            <p className="text-[10px] text-slate-500 truncate">
              {instituicaoAtual
                ? 'Instituição financeira oficial vinculada'
                : tipo === 'conta'
                  ? 'Nenhum banco selecionado (usando ícone genérico)'
                  : 'Nenhuma instituição selecionada (usando cartão genérico)'}
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation()
            abrirModal()
          }}
          className="text-xs h-8 px-3 shrink-0 ml-2"
        >
          {instituicaoAtual ? 'Alterar' : 'Escolher ícone'}
        </Button>
      </div>

      {/* Modal de Seleção Brand/Logo Picker */}
      <Dialog open={modalOpen} onOpenChange={(open) => !open && fecharModal()}>
        <DialogContent className="max-w-md sm:max-w-lg bg-white border-slate-200 p-0 overflow-hidden text-slate-900">
          <DialogHeader className="p-4 sm:p-5 pb-3 border-b border-slate-100">
            <DialogTitle className="text-base sm:text-lg font-bold text-slate-900">
              Selecione o ícone
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 mt-1">
              Escolha a instituição financeira ou um ícone personalizado.
            </DialogDescription>

            {/* Campo Pesquisar */}
            <div className="relative mt-3">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                type="text"
                placeholder="Pesquisar instituição (ex: Bra, Itaú, BB...)"
                value={termoBusca}
                onChange={(e) => setTermoBusca(e.target.value)}
                className="pl-9 text-xs sm:text-sm h-9 bg-slate-50/70 border-slate-200 focus-visible:bg-white"
                autoFocus
              />
              {termoBusca && (
                <button
                  type="button"
                  onClick={() => setTermoBusca('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  title="Limpar pesquisa"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </DialogHeader>

          {/* Grid compacto e responsivo com rolagem interna */}
          <div className="p-4 sm:p-5 max-h-[360px] sm:max-h-[420px] overflow-y-auto">
            {/* Opção Ícone Genérico Padrão */}
            <div className="mb-3 pb-3 border-b border-slate-100">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Padrão
              </p>
              <button
                type="button"
                onClick={() => setSelecaoTemporaria(null)}
                className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-left transition ${
                  selecaoTemporaria === null
                    ? 'border-indigo-600 bg-indigo-50/80 ring-2 ring-indigo-500/20 shadow-2xs'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={
                      tipo === 'conta'
                        ? 'w-9 h-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center'
                        : 'w-11 h-7 rounded-md bg-slate-800 border border-slate-700 flex items-center justify-center'
                    }
                  >
                    {tipo === 'conta' ? (
                      <Building2 className="w-5 h-5 text-slate-600" />
                    ) : (
                      <CreditCard className="w-5 h-5 text-white" />
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-800">
                      Ícone Genérico ({tipo === 'conta' ? 'Conta' : 'Cartão'})
                    </p>
                    <p className="text-[10px] text-slate-500">Sem vínculo de instituição</p>
                  </div>
                </div>
                {selecaoTemporaria === null && (
                  <div className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0">
                    <Check className="w-3 h-3 stroke-[3]" />
                  </div>
                )}
              </button>
            </div>

            {/* Grid com as Instituições Financeiras */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Instituições Disponíveis ({listaFiltrada.length})
                </p>
                {termoBusca && (
                  <span className="text-[10px] text-slate-400">
                    Filtrando por &quot;{termoBusca}&quot;
                  </span>
                )}
              </div>

              {listaFiltrada.length === 0 ? (
                <div className="p-8 text-center space-y-2 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                  <p className="text-xs font-semibold text-slate-700">
                    Nenhuma instituição encontrada
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Tente buscar por outro termo ou selecione o ícone genérico acima.
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setTermoBusca('')}
                    className="text-xs h-7 text-indigo-600 hover:text-indigo-700"
                  >
                    Limpar pesquisa
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {listaFiltrada.map((inst) => {
                    const isSelected = selecaoTemporaria === inst.id
                    return (
                      <button
                        key={inst.id}
                        type="button"
                        onClick={() => setSelecaoTemporaria(inst.id)}
                        className={`group relative flex flex-col items-center justify-between p-3 rounded-xl border text-center transition min-h-[105px] ${
                          isSelected
                            ? 'border-indigo-600 bg-indigo-50/80 ring-2 ring-indigo-500/20 shadow-xs'
                            : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 bg-white'
                        }`}
                        title={inst.nome}
                      >
                        {/* Indicador de Seleção no Canto */}
                        {isSelected && (
                          <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                            <Check className="w-2.5 h-2.5 stroke-[3]" />
                          </div>
                        )}

                        {/* Miniatura renderizada com a máscara do contexto (círculo / retângulo) sem deformar */}
                        <div className="flex-1 flex items-center justify-center py-1">
                          <BrandLogoDisplay
                            id={inst.id}
                            tipo={tipo}
                            className={tipo === 'conta' ? 'w-11 h-11' : 'w-14 h-9'}
                          />
                        </div>

                        {/* Nome da Instituição abaixo da miniatura */}
                        <span
                          className={`text-xs font-medium truncate w-full mt-1.5 leading-tight ${
                            isSelected ? 'text-indigo-900 font-semibold' : 'text-slate-800'
                          }`}
                        >
                          {inst.nome}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="p-3 sm:p-4 bg-slate-50/80 border-t border-slate-100 flex flex-row items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={fecharModal}
              disabled={confirmando}
              className="text-xs h-9 px-3"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleConfirmar}
              disabled={confirmando}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-9 px-4 font-semibold shadow-xs"
            >
              {confirmando ? 'Aplicando...' : 'Selecionar ícone'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
