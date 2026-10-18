import React, { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { categoriaService } from '@/services/sap'
import {
  Categoria,
  Subcategoria,
  CategoriaTipo,
  NaturezaCategoria,
  ClassificacaoGerencial,
} from '@/types/sap'
import {
  Tag,
  Plus,
  Edit2,
  Trash2,
  ChevronDown,
  ChevronRight,
  FolderTree,
  Sparkles,
  Layers,
  ArrowDownLeft,
  ArrowUpRight,
  Check,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'

const CLASSIFICACOES_GERENCIAIS: ClassificacaoGerencial[] = [
  'Receitas Fixas',
  'Receitas Variáveis',
  'Custo de Vida',
  'Despesas Variáveis',
  'Dívidas',
  'Liberdade',
  'Acumulação de Capital',
]

const PALETA_CORES = [
  '#10B981', // Verde
  '#3B82F6', // Azul
  '#8B5CF6', // Roxo
  '#EC4899', // Rosa
  '#F59E0B', // Âmbar
  '#06B6D4', // Ciano
  '#E11D48', // Vermelho
  '#64748B', // Slate
]

export default function CategoriasPage() {
  const { currentWorkspace, user } = useAuth()
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [loading, setLoading] = useState(true)
  const [semeando, setSemeando] = useState(false)
  const [filtroTipo, setFiltroTipo] = useState<'todas' | 'despesa' | 'receita'>('todas')

  // Modais
  const [modalCatOpen, setModalCatOpen] = useState(false)
  const [editingCat, setEditingCat] = useState<Categoria | null>(null)
  const [modalSubOpen, setModalSubOpen] = useState(false)
  const [editingSub, setEditingSub] = useState<Subcategoria | null>(null)
  const [parentCatId, setParentCatId] = useState<string>('')
  const [saving, setSaving] = useState(false)

  // Form Categoria
  const [nomeCat, setNomeCat] = useState('')
  const [tipoCat, setTipoCat] = useState<CategoriaTipo>('despesa')
  const [naturezaCat, setNaturezaCat] = useState<NaturezaCategoria>('variavel')
  const [classificacaoCat, setClassificacaoCat] = useState<ClassificacaoGerencial>('Custo de Vida')
  const [corCat, setCorCat] = useState('#10B981')

  // Form Subcategoria
  const [nomeSub, setNomeSub] = useState('')
  const [obsSub, setObsSub] = useState('')

  const wsId = currentWorkspace?.workspace_id

  const carregarCategorias = async () => {
    if (!wsId) return
    setLoading(true)
    try {
      const data = await categoriaService.listComSubcategorias(wsId)
      setCategorias(data)
    } catch (err: any) {
      toast.error('Erro ao carregar categorias: ' + (err.message || 'tente novamente'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregarCategorias()
  }, [wsId])

  const semearPadrao = async () => {
    if (!wsId || !user) return
    setSemeando(true)
    try {
      const total = await categoriaService.semearCategoriasPadrao(wsId, user.id)
      toast.success(`${total} categorias recomendadas do PRD SAP criadas com sucesso!`)
      await carregarCategorias()
    } catch (err: any) {
      toast.error('Erro ao semear categorias: ' + (err.message || 'tente novamente'))
    } finally {
      setSemeando(false)
    }
  }

  // Abertura de Modais
  const abrirNovaCategoria = () => {
    setEditingCat(null)
    setNomeCat('')
    setTipoCat('despesa')
    setNaturezaCat('variavel')
    setClassificacaoCat('Custo de Vida')
    setCorCat('#10B981')
    setModalCatOpen(true)
  }

  const abrirEdicaoCategoria = (c: Categoria) => {
    setEditingCat(c)
    setNomeCat(c.nome)
    setTipoCat(c.tipo)
    setNaturezaCat(c.natureza)
    setClassificacaoCat(c.classificacao_gerencial)
    setCorCat(c.cor || '#10B981')
    setModalCatOpen(true)
  }

  const abrirNovaSubcategoria = (catId: string) => {
    setEditingSub(null)
    setParentCatId(catId)
    setNomeSub('')
    setObsSub('')
    setModalSubOpen(true)
  }

  const abrirEdicaoSubcategoria = (sub: Subcategoria) => {
    setEditingSub(sub)
    setParentCatId(sub.categoria_id)
    setNomeSub(sub.nome)
    setObsSub(sub.observacao || '')
    setModalSubOpen(true)
  }

  // Handlers de Salvar
  const handleSalvarCategoria = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!wsId || !nomeCat.trim()) {
      toast.error('Informe o nome da categoria')
      return
    }

    setSaving(true)
    try {
      if (editingCat) {
        await categoriaService.updateCategoria(
          editingCat.id,
          wsId,
          {
            nome: nomeCat.trim(),
            tipo: tipoCat,
            natureza: naturezaCat,
            classificacao_gerencial: classificacaoCat,
            cor: corCat,
          },
          user?.id,
        )
        toast.success(`Categoria "${nomeCat.trim()}" atualizada!`)
      } else {
        await categoriaService.createCategoria({
          workspace_id: wsId,
          nome: nomeCat.trim(),
          tipo: tipoCat,
          natureza: naturezaCat,
          classificacao_gerencial: classificacaoCat,
          cor: corCat,
          created_by: user?.id,
        })
        toast.success(`Categoria "${nomeCat.trim()}" criada!`)
      }

      setModalCatOpen(false)
      await carregarCategorias()
    } catch (err: any) {
      toast.error('Erro ao salvar: ' + (err.message || 'verifique os dados'))
    } finally {
      setSaving(false)
    }
  }

  const handleSalvarSubcategoria = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!wsId || !nomeSub.trim() || !parentCatId) {
      toast.error('Informe o nome da subcategoria')
      return
    }

    setSaving(true)
    try {
      if (editingSub) {
        await categoriaService.updateSubcategoria(
          editingSub.id,
          wsId,
          {
            nome: nomeSub.trim(),
            observacao: obsSub.trim() || undefined,
          },
          user?.id,
        )
        toast.success(`Subcategoria "${nomeSub.trim()}" atualizada!`)
      } else {
        await categoriaService.createSubcategoria({
          workspace_id: wsId,
          categoria_id: parentCatId,
          nome: nomeSub.trim(),
          observacao: obsSub.trim() || undefined,
          created_by: user?.id,
        })
        toast.success(`Subcategoria "${nomeSub.trim()}" criada!`)
      }

      setModalSubOpen(false)
      await carregarCategorias()
    } catch (err: any) {
      toast.error('Erro ao salvar: ' + (err.message || 'verifique os dados'))
    } finally {
      setSaving(false)
    }
  }

  const handleExcluirCategoria = async (c: Categoria) => {
    if (!wsId) return
    const ok = window.confirm(
      `Deseja realmente desativar a categoria "${c.nome}" e todas as suas subcategorias?`,
    )
    if (!ok) return

    try {
      await categoriaService.softDeleteCategoria(c.id, wsId, user?.id)
      toast.success(`Categoria "${c.nome}" desativada.`)
      await carregarCategorias()
    } catch (err: any) {
      toast.error('Erro ao desativar: ' + (err.message || 'tente novamente'))
    }
  }

  const handleExcluirSubcategoria = async (s: Subcategoria) => {
    if (!wsId) return
    const ok = window.confirm(`Deseja desativar a subcategoria "${s.nome}"?`)
    if (!ok) return

    try {
      await categoriaService.softDeleteSubcategoria(s.id, wsId, user?.id)
      toast.success(`Subcategoria "${s.nome}" desativada.`)
      await carregarCategorias()
    } catch (err: any) {
      toast.error('Erro ao desativar: ' + (err.message || 'tente novamente'))
    }
  }

  const categoriasFiltradas = categorias.filter((c) => {
    if (filtroTipo === 'todas') return true
    return c.tipo === filtroTipo
  })

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900">
              Categorias & Subcategorias
            </h1>
            <Badge
              variant="outline"
              className="text-emerald-700 bg-emerald-50 border-emerald-200 text-xs"
            >
              Build 1
            </Badge>
          </div>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            Estruture suas despesas e receitas por natureza (fixa/variável) e classificação
            gerencial do PRD.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {categorias.length === 0 && (
            <Button
              onClick={semearPadrao}
              disabled={semeando}
              variant="outline"
              className="text-xs border-emerald-300 text-emerald-800 bg-emerald-50 hover:bg-emerald-100 flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              {semeando ? 'Gerando...' : 'Carregar Categorias do PRD'}
            </Button>
          )}

          <Button
            onClick={abrirNovaCategoria}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs sm:text-sm flex items-center gap-2 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Nova Categoria
          </Button>
        </div>
      </div>

      {/* Filtros rápidos */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <Button
          variant={filtroTipo === 'todas' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setFiltroTipo('todas')}
          className={
            filtroTipo === 'todas' ? 'bg-slate-900 text-white text-xs' : 'text-xs text-slate-600'
          }
        >
          Todas ({categorias.length})
        </Button>
        <Button
          variant={filtroTipo === 'despesa' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setFiltroTipo('despesa')}
          className={
            filtroTipo === 'despesa' ? 'bg-rose-600 text-white text-xs' : 'text-xs text-slate-600'
          }
        >
          <ArrowUpRight className="w-3 h-3 mr-1" />
          Despesas ({categorias.filter((c) => c.tipo === 'despesa').length})
        </Button>
        <Button
          variant={filtroTipo === 'receita' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setFiltroTipo('receita')}
          className={
            filtroTipo === 'receita'
              ? 'bg-emerald-600 text-white text-xs'
              : 'text-xs text-slate-600'
          }
        >
          <ArrowDownLeft className="w-3 h-3 mr-1" />
          Receitas ({categorias.filter((c) => c.tipo === 'receita').length})
        </Button>
      </div>

      {/* Lista de Categorias com Subcategorias Aninhadas */}
      <div className="space-y-4">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm">Carregando categorias...</div>
        ) : categoriasFiltradas.length === 0 ? (
          <Card className="border-slate-200 p-12 text-center bg-white space-y-3">
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
              <FolderTree className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-slate-800">Nenhuma categoria encontrada</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Você pode iniciar rapidamente carregando as categorias financeiras recomendadas pelo
              PRD SAP (Alimentação, Moradia, Transporte, etc.) ou criar as suas manualmente.
            </p>
            <Button
              onClick={semearPadrao}
              disabled={semeando}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
            >
              <Sparkles className="w-3.5 h-3.5 mr-1" />
              Carregar Categorias Padrão do PRD
            </Button>
          </Card>
        ) : (
          categoriasFiltradas.map((cat) => (
            <Card key={cat.id} className="border-slate-200 shadow-sm bg-white overflow-hidden">
              <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white shrink-0 shadow-xs font-bold text-xs"
                    style={{ backgroundColor: cat.cor || '#10B981' }}
                  >
                    <Tag className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900 text-sm md:text-base">
                        {cat.nome}
                      </span>
                      <Badge
                        variant="secondary"
                        className={
                          cat.tipo === 'despesa'
                            ? 'bg-rose-50 text-rose-700 text-[10px]'
                            : 'bg-emerald-50 text-emerald-700 text-[10px]'
                        }
                      >
                        {cat.tipo === 'despesa' ? 'Despesa' : 'Receita'}
                      </Badge>
                      <span className="text-[10px] text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded font-medium">
                        {cat.natureza === 'fixa' ? 'Fixa' : 'Variável'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Classificação PRD: <strong>{cat.classificacao_gerencial}</strong> •{' '}
                      {cat.subcategorias?.length || 0} subcategorias
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 self-end sm:self-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => abrirNovaSubcategoria(cat.id)}
                    className="text-xs text-emerald-700 border-emerald-200 bg-white hover:bg-emerald-50 flex items-center gap-1 h-7"
                  >
                    <Plus className="w-3 h-3" />
                    Subcategoria
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => abrirEdicaoCategoria(cat)}
                    className="h-7 w-7 text-slate-500 hover:text-slate-900"
                  >
                    <Edit2 className="w-3 h-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleExcluirCategoria(cat)}
                    className="h-7 w-7 text-slate-400 hover:text-rose-600"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>

              {/* Subcategorias */}
              <div className="divide-y divide-slate-100">
                {cat.subcategorias && cat.subcategorias.length > 0 ? (
                  cat.subcategorias.map((sub) => (
                    <div
                      key={sub.id}
                      className="py-2.5 px-6 flex items-center justify-between hover:bg-slate-50/70 transition"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                        <span className="text-xs md:text-sm font-medium text-slate-700">
                          {sub.nome}
                        </span>
                        {sub.observacao && (
                          <span className="text-[11px] text-slate-400 italic">
                            ({sub.observacao})
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => abrirEdicaoSubcategoria(sub)}
                          className="h-6 w-6 text-slate-400 hover:text-slate-800"
                        >
                          <Edit2 className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleExcluirSubcategoria(sub)}
                          className="h-6 w-6 text-slate-300 hover:text-rose-600"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-3 px-6 text-[11px] text-slate-400 italic">
                    Nenhuma subcategoria vinculada ainda.
                  </div>
                )}
              </div>
            </Card>
          ))
        )}
      </div>

      {/* Modal Categoria */}
      <Dialog open={modalCatOpen} onOpenChange={setModalCatOpen}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={handleSalvarCategoria}>
            <DialogHeader>
              <DialogTitle>{editingCat ? 'Editar Categoria' : 'Nova Categoria'}</DialogTitle>
              <DialogDescription>
                Categorias agrupam seus lançamentos por finalidade financeira e gerencial.
              </DialogDescription>
            </DialogHeader>

            <div className="py-4 space-y-4">
              <div>
                <Label htmlFor="nome-cat" className="text-xs font-semibold text-slate-700">
                  Nome da Categoria *
                </Label>
                <Input
                  id="nome-cat"
                  placeholder="Ex: Alimentação, Moradia, Transporte, Lazer"
                  value={nomeCat}
                  onChange={(e) => setNomeCat(e.target.value)}
                  className="mt-1"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="tipo-cat" className="text-xs font-semibold text-slate-700">
                    Tipo de Fluxo *
                  </Label>
                  <Select value={tipoCat} onValueChange={(val: any) => setTipoCat(val)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="despesa">Despesa</SelectItem>
                      <SelectItem value="receita">Receita</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="natureza-cat" className="text-xs font-semibold text-slate-700">
                    Natureza *
                  </Label>
                  <Select value={naturezaCat} onValueChange={(val: any) => setNaturezaCat(val)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixa">Fixa</SelectItem>
                      <SelectItem value="variavel">Variável</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="classificacao-cat" className="text-xs font-semibold text-slate-700">
                  Classificação Gerencial (Metas e Acumulação do PRD) *
                </Label>
                <Select
                  value={classificacaoCat}
                  onValueChange={(val: any) => setClassificacaoCat(val)}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CLASSIFICACOES_GERENCIAIS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-700">Cor</Label>
                <div className="flex items-center gap-2 mt-2">
                  {PALETA_CORES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCorCat(c)}
                      className="w-7 h-7 rounded-full border-2 transition flex items-center justify-center text-white"
                      style={{
                        backgroundColor: c,
                        borderColor: corCat === c ? '#0f172a' : 'transparent',
                      }}
                    >
                      {corCat === c && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalCatOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {saving ? 'Salvando...' : editingCat ? 'Salvar' : 'Criar Categoria'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Subcategoria */}
      <Dialog open={modalSubOpen} onOpenChange={setModalSubOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSalvarSubcategoria}>
            <DialogHeader>
              <DialogTitle>{editingSub ? 'Editar Subcategoria' : 'Nova Subcategoria'}</DialogTitle>
              <DialogDescription>
                Subdivisão específica dentro da categoria selecionada.
              </DialogDescription>
            </DialogHeader>

            <div className="py-4 space-y-3">
              <div>
                <Label htmlFor="nome-sub" className="text-xs font-semibold text-slate-700">
                  Nome da Subcategoria *
                </Label>
                <Input
                  id="nome-sub"
                  placeholder="Ex: Supermercado, Farmácia, Combustível"
                  value={nomeSub}
                  onChange={(e) => setNomeSub(e.target.value)}
                  className="mt-1"
                  required
                />
              </div>

              <div>
                <Label htmlFor="obs-sub" className="text-xs font-semibold text-slate-700">
                  Observação (opcional)
                </Label>
                <Input
                  id="obs-sub"
                  placeholder="Ex: Itens de higiene e limpeza"
                  value={obsSub}
                  onChange={(e) => setObsSub(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalSubOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {saving ? 'Salvando...' : editingSub ? 'Salvar' : 'Criar Subcategoria'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
