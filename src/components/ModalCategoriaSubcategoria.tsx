import React, { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { HelpCircle, Lock, Tag } from 'lucide-react'
import { toast } from 'sonner'
import { ModalAjudaConceitos } from './ModalAjudaConceitos'
import { SeletorVisualIconeCor } from './SeletorVisualIconeCor'
import {
  Categoria,
  Subcategoria,
  CategoriaTipo,
  ClassificacaoDespesa,
  NaturezaDespesa,
  RegularidadeReceita,
  OrigemEconomicaReceita,
} from '@/types/sap'

interface ModalCategoriaSubcategoriaProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  userId?: string
  categoriaParaEdicao?: Categoria | null
  subcategoriaParaEdicao?: Subcategoria | null
  categoriaPaiFixa?: Categoria | null
  tipoInicial?: CategoriaTipo
  categoriasExistentes?: Categoria[]
  onSalvar: (dados: {
    nome_categoria: string
    nome_subcategoria: string
    tipo: CategoriaTipo
    classificacao?: ClassificacaoDespesa | null
    natureza?: NaturezaDespesa | null
    regularidade?: RegularidadeReceita | null
    origem_economica?: OrigemEconomicaReceita | null
    cor?: string
    icone?: string
    observacao?: string | null
    categoria_id?: string | null
    subcategoria_id?: string | null
  }) => Promise<void>
}

export function ModalCategoriaSubcategoria({
  open,
  onOpenChange,
  workspaceId,
  userId,
  categoriaParaEdicao,
  subcategoriaParaEdicao,
  categoriaPaiFixa,
  tipoInicial = 'despesa',
  categoriasExistentes = [],
  onSalvar,
}: ModalCategoriaSubcategoriaProps) {
  const isEditing = Boolean(subcategoriaParaEdicao || categoriaParaEdicao)
  const isEditingSub = Boolean(subcategoriaParaEdicao)
  const isEditingOnlyCat = Boolean(categoriaParaEdicao && !subcategoriaParaEdicao)

  // Estado dos campos
  const [nomeCategoria, setNomeCategoria] = useState('')
  const [nomeSubcategoria, setNomeSubcategoria] = useState('')
  const [tipoFluxo, setTipoFluxo] = useState<CategoriaTipo>(tipoInicial)

  // Campos analíticos de Despesa
  const [classificacao, setClassificacao] = useState<ClassificacaoDespesa>('Essencial')
  const [natureza, setNatureza] = useState<NaturezaDespesa>('Consumo')

  // Campos analíticos de Receita
  const [regularidade, setRegularidade] = useState<RegularidadeReceita>('Recorrente mensal')
  const [origemEconomica, setOrigemEconomica] = useState<OrigemEconomicaReceita>('Trabalho')
  const [afetaResultadoReceita, setAfetaResultadoReceita] = useState<boolean>(true)

  // Cor e Ícone
  const [cor, setCor] = useState('#10B981')
  const [icone, setIcone] = useState('tag')
  const [observacao, setObservacao] = useState('')

  // Submissão & Ajuda
  const [salvando, setSalvando] = useState(false)
  const [modalAjudaOpen, setModalAjudaOpen] = useState(false)

  // Inicialização e preenchimento
  useEffect(() => {
    if (!open) return

    if (subcategoriaParaEdicao) {
      // Edição de Subcategoria
      setNomeSubcategoria(subcategoriaParaEdicao.nome)
      const catPai =
        categoriaPaiFixa ||
        categoriasExistentes.find((c) => c.id === subcategoriaParaEdicao.categoria_id)
      setNomeCategoria(catPai?.nome || '')
      setTipoFluxo(catPai?.tipo || 'despesa')

      setClassificacao(subcategoriaParaEdicao.classificacao || 'Essencial')
      setNatureza(subcategoriaParaEdicao.natureza || 'Consumo')
      setRegularidade(subcategoriaParaEdicao.regularidade || 'Recorrente mensal')
      setOrigemEconomica(subcategoriaParaEdicao.origem_economica || 'Trabalho')
      setAfetaResultadoReceita(
        subcategoriaParaEdicao.afeta_resultado !== undefined
          ? Boolean(subcategoriaParaEdicao.afeta_resultado)
          : true,
      )

      setCor(subcategoriaParaEdicao.cor || catPai?.cor || '#10B981')
      setIcone(subcategoriaParaEdicao.icone || catPai?.icone || 'tag')
      setObservacao(subcategoriaParaEdicao.observacao || '')
    } else if (categoriaParaEdicao) {
      // Edição de Categoria Principal
      setNomeCategoria(categoriaParaEdicao.nome)
      setNomeSubcategoria('')
      setTipoFluxo(categoriaParaEdicao.tipo)
      setCor(categoriaParaEdicao.cor || '#10B981')
      setIcone(categoriaParaEdicao.icone || 'tag')
      setObservacao(categoriaParaEdicao.observacao || '')
      setClassificacao('Essencial')
      setNatureza('Consumo')
      setRegularidade('Recorrente mensal')
      setOrigemEconomica('Trabalho')
      setAfetaResultadoReceita(true)
    } else if (categoriaPaiFixa) {
      // Adicionar nova subcategoria dentro de categoria existente
      setNomeCategoria(categoriaPaiFixa.nome)
      setNomeSubcategoria('')
      setTipoFluxo(categoriaPaiFixa.tipo)
      setCor(categoriaPaiFixa.cor || '#10B981')
      setIcone(categoriaPaiFixa.icone || 'tag')
      setObservacao('')
      setClassificacao('Essencial')
      setNatureza('Consumo')
      setRegularidade('Recorrente mensal')
      setOrigemEconomica('Trabalho')
      setAfetaResultadoReceita(true)
    } else {
      // Novo registro
      setNomeCategoria('')
      setNomeSubcategoria('')
      setTipoFluxo(tipoInicial)
      setCor(tipoInicial === 'receita' ? '#22C55E' : '#10B981')
      setIcone(tipoInicial === 'receita' ? 'trending-up' : 'tag')
      setObservacao('')
      setClassificacao('Essencial')
      setNatureza('Consumo')
      setRegularidade('Recorrente mensal')
      setOrigemEconomica('Trabalho')
      setAfetaResultadoReceita(true)
    }
  }, [
    open,
    subcategoriaParaEdicao,
    categoriaParaEdicao,
    categoriaPaiFixa,
    tipoInicial,
    categoriasExistentes,
  ])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const catTrim = nomeCategoria.trim()
    const subTrim = nomeSubcategoria.trim()

    if (!catTrim) {
      toast.error('Informe o nome da categoria.')
      return
    }

    // Se for cadastro geral ou edição de subcategoria, exige nome da subcategoria
    if (!isEditingOnlyCat && !subTrim) {
      toast.error('Informe o nome da subcategoria.')
      return
    }

    setSalvando(true)
    try {
      await onSalvar({
        categoria_id: categoriaParaEdicao?.id || categoriaPaiFixa?.id || null,
        subcategoria_id: subcategoriaParaEdicao?.id || null,
        nome_categoria: catTrim,
        nome_subcategoria: subTrim || catTrim,
        tipo: tipoFluxo,
        classificacao: tipoFluxo === 'despesa' ? classificacao : null,
        natureza: tipoFluxo === 'despesa' ? natureza : null,
        regularidade: tipoFluxo === 'receita' ? regularidade : null,
        origem_economica: tipoFluxo === 'receita' ? origemEconomica : null,
        afeta_resultado: tipoFluxo === 'receita' ? afetaResultadoReceita : true,
        cor,
        icone,
        observacao: observacao.trim() || null,
      })

      onOpenChange(false)
    } catch (err: any) {
      toast.error('Erro ao salvar: ' + (err.message || 'verifique os campos'))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto bg-white text-slate-900 border-slate-200 shadow-xl">
          <form onSubmit={handleSubmit}>
            <DialogHeader className="pb-3 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <DialogTitle className="text-base md:text-lg font-bold text-slate-900">
                  {isEditing
                    ? isEditingOnlyCat
                      ? 'Editar Categoria'
                      : 'Editar Categoria & Subcategoria'
                    : categoriaPaiFixa
                      ? `Nova Subcategoria em "${categoriaPaiFixa.nome}"`
                      : '+ Nova Categoria & Subcategoria'}
                </DialogTitle>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setModalAjudaOpen(true)}
                  className="text-xs text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 flex items-center gap-1.5 h-7"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>ⓘ Entenda as classificações</span>
                </Button>
              </div>
              <DialogDescription className="text-xs text-slate-500">
                Estrutura analítica para acompanhamento financeiro, padrões de vida e formação
                patrimonial.
              </DialogDescription>
            </DialogHeader>

            <div className="py-4 space-y-4">
              {/* BLOCO 1: CAMPOS GERAIS */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Nome Categoria */}
                <div>
                  <Label htmlFor="dlg-nome-cat" className="text-xs font-semibold text-slate-700">
                    Nome da Categoria *
                  </Label>
                  <Input
                    id="dlg-nome-cat"
                    placeholder="Ex: Alimentação, Moradia, Transporte"
                    value={nomeCategoria}
                    onChange={(e) => setNomeCategoria(e.target.value)}
                    disabled={Boolean(categoriaPaiFixa) && !categoriaParaEdicao}
                    className="mt-1 text-xs"
                    required
                  />
                </div>

                {/* Nome Subcategoria (quando aplicável) */}
                {!isEditingOnlyCat && (
                  <div>
                    <Label htmlFor="dlg-nome-sub" className="text-xs font-semibold text-slate-700">
                      Nome da Subcategoria *
                    </Label>
                    <Input
                      id="dlg-nome-sub"
                      placeholder="Ex: Supermercado, Plano de Saúde, Salário"
                      value={nomeSubcategoria}
                      onChange={(e) => setNomeSubcategoria(e.target.value)}
                      className="mt-1 text-xs"
                      required
                    />
                  </div>
                )}
              </div>

              {/* Tipo de Fluxo (BLOQUEADO NA EDIÇÃO) */}
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="dlg-tipo-fluxo" className="text-xs font-semibold text-slate-700">
                    Tipo de Fluxo *
                  </Label>
                  {isEditing && (
                    <span className="text-[11px] text-amber-700 font-medium flex items-center gap-1">
                      <Lock className="w-3 h-3 text-amber-600" />
                      Bloqueado na edição (preserva histórico)
                    </span>
                  )}
                </div>

                <Select
                  value={tipoFluxo}
                  onValueChange={(val: CategoriaTipo) => setTipoFluxo(val)}
                  disabled={isEditing || Boolean(categoriaPaiFixa)}
                >
                  <SelectTrigger
                    id="dlg-tipo-fluxo"
                    className={`mt-1 text-xs ${
                      isEditing ? 'bg-slate-100 text-slate-600 cursor-not-allowed' : 'bg-white'
                    }`}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="despesa">
                      <span className="text-rose-700 font-semibold">● Despesa</span>
                    </SelectItem>
                    <SelectItem value="receita">
                      <span className="text-emerald-700 font-semibold">● Receita</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* BLOCO 2: CAMPOS CONDICIONAIS POR TIPO DE FLUXO */}
              {tipoFluxo === 'despesa' ? (
                <div className="p-3 bg-rose-50/40 border border-rose-200/70 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-rose-800 uppercase tracking-wide">
                      Classificação & Natureza da Despesa
                    </span>
                    <button
                      type="button"
                      onClick={() => setModalAjudaOpen(true)}
                      className="text-[11px] text-rose-700 hover:underline flex items-center gap-1"
                    >
                      <HelpCircle className="w-3 h-3" />
                      Significados
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Classificação */}
                    <div>
                      <Label
                        htmlFor="dlg-classificacao"
                        className="text-xs font-semibold text-slate-700"
                      >
                        Classificação *
                      </Label>
                      <Select
                        value={classificacao}
                        onValueChange={(val: ClassificacaoDespesa) => setClassificacao(val)}
                      >
                        <SelectTrigger id="dlg-classificacao" className="mt-1 text-xs bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Essencial">
                            <div>
                              <span className="font-semibold text-emerald-800">Essencial</span>
                              <span className="text-[10px] text-slate-500 block">
                                Sustenta o padrão mínimo
                              </span>
                            </div>
                          </SelectItem>
                          <SelectItem value="Ajustável">
                            <div>
                              <span className="font-semibold text-blue-800">Ajustável</span>
                              <span className="text-[10px] text-slate-500 block">
                                Margem de otimização de custo/freq.
                              </span>
                            </div>
                          </SelectItem>
                          <SelectItem value="Discricionária">
                            <div>
                              <span className="font-semibold text-amber-800">Discricionária</span>
                              <span className="text-[10px] text-slate-500 block">
                                Conforto, lazer e conveniência
                              </span>
                            </div>
                          </SelectItem>
                          <SelectItem value="Supérflua">
                            <div>
                              <span className="font-semibold text-rose-800">Supérflua</span>
                              <span className="text-[10px] text-slate-500 block">
                                Baixo benefício / desperdício
                              </span>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Natureza */}
                    <div>
                      <Label
                        htmlFor="dlg-natureza"
                        className="text-xs font-semibold text-slate-700"
                      >
                        Natureza Econômica *
                      </Label>
                      <Select
                        value={natureza}
                        onValueChange={(val: NaturezaDespesa) => setNatureza(val)}
                      >
                        <SelectTrigger id="dlg-natureza" className="mt-1 text-xs bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Consumo">
                            <div>
                              <span className="font-semibold text-slate-800">Consumo</span>
                              <span className="text-[10px] text-slate-500 block">
                                Serviços, consumo, manutenção
                              </span>
                            </div>
                          </SelectItem>
                          <SelectItem value="Patrimonial">
                            <div>
                              <span className="font-semibold text-indigo-800">Patrimonial</span>
                              <span className="text-[10px] text-slate-500 block">
                                Aquisição / melhoria de bem durável
                              </span>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-emerald-50/40 border border-emerald-200/70 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-800 uppercase tracking-wide">
                      Regularidade & Origem Econômica da Receita
                    </span>
                    <button
                      type="button"
                      onClick={() => setModalAjudaOpen(true)}
                      className="text-[11px] text-emerald-700 hover:underline flex items-center gap-1"
                    >
                      <HelpCircle className="w-3 h-3" />
                      Significados
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Regularidade */}
                    <div>
                      <Label
                        htmlFor="dlg-regularidade"
                        className="text-xs font-semibold text-slate-700"
                      >
                        Regularidade *
                      </Label>
                      <Select
                        value={regularidade}
                        onValueChange={(val: RegularidadeReceita) => setRegularidade(val)}
                      >
                        <SelectTrigger id="dlg-regularidade" className="mt-1 text-xs bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Recorrente mensal">Recorrente mensal</SelectItem>
                          <SelectItem value="Recorrente anual">Recorrente anual</SelectItem>
                          <SelectItem value="Recorrente variável">Recorrente variável</SelectItem>
                          <SelectItem value="Eventual">Eventual</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Origem Econômica */}
                    <div>
                      <Label htmlFor="dlg-origem" className="text-xs font-semibold text-slate-700">
                        Origem Econômica *
                      </Label>
                      <Select
                        value={origemEconomica}
                        onValueChange={(val: OrigemEconomicaReceita) => setOrigemEconomica(val)}
                      >
                        <SelectTrigger id="dlg-origem" className="mt-1 text-xs bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Trabalho">Trabalho</SelectItem>
                          <SelectItem value="Capital">Capital</SelectItem>
                          <SelectItem value="Outras">Outras</SelectItem>
                          <SelectItem value="Reembolso">Reembolso</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Campo Afeta Resultado (Sim/Não) conforme PDF Seção 12 e 14 */}
                  <div className="pt-2 border-t border-emerald-200/60">
                    <Label
                      htmlFor="dlg-afeta-resultado"
                      className="text-xs font-semibold text-slate-700 flex items-center justify-between"
                    >
                      <span>Afeta Resultado *</span>
                      <span className="text-[10px] text-slate-500 font-normal">
                        {afetaResultadoReceita
                          ? 'Soma nas Receitas do Resultado'
                          : 'Aumenta saldo da conta sem afetar Resultado'}
                      </span>
                    </Label>
                    <Select
                      value={afetaResultadoReceita ? 'sim' : 'nao'}
                      onValueChange={(val) => setAfetaResultadoReceita(val === 'sim')}
                    >
                      <SelectTrigger id="dlg-afeta-resultado" className="mt-1 text-xs bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sim">Sim (Soma ao Resultado do Período)</SelectItem>
                        <SelectItem value="nao">Não (Reembolso / Neutro no Resultado)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {/* BLOCO 3: SELETOR VISUAL DE ÍCONES E CORES (ESTILO ORGANIZZE) */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <SeletorVisualIconeCor
                  iconeSelecionado={icone}
                  corSelecionada={cor}
                  onSelectIcone={(ic) => setIcone(ic)}
                  onSelectCor={(c) => setCor(c)}
                />
              </div>

              {/* BLOCO 4: OBSERVAÇÃO (OPCIONAL) */}
              <div>
                <Label htmlFor="dlg-obs" className="text-xs font-semibold text-slate-700">
                  Observação (opcional)
                </Label>
                <Input
                  id="dlg-obs"
                  placeholder="Critérios específicos ou anotações particulares desta classificação"
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  className="mt-1 text-xs"
                />
              </div>
            </div>

            <DialogFooter className="pt-2 border-t border-slate-100">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={salvando}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
              >
                {salvando ? 'Salvando...' : isEditing ? 'Salvar Alterações' : 'Salvar Registro'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal explicativo centralizado com as definições da Seção 25 do PDF */}
      <ModalAjudaConceitos
        open={modalAjudaOpen}
        onOpenChange={setModalAjudaOpen}
        abaInicial={tipoFluxo}
      />
    </>
  )
}
