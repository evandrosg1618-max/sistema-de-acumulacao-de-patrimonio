import React, { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { categoriaService } from '@/services/sap'
import { Categoria, Subcategoria, CategoriaTipo } from '@/types/sap'
import {
  Plus,
  Edit2,
  Trash2,
  FolderTree,
  ArrowDownLeft,
  ArrowUpRight,
  Archive,
  ArchiveRestore,
  AlertTriangle,
  HelpCircle,
  ArrowUp,
  ArrowDown,
  Tag,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import { ModalCategoriaSubcategoria } from '@/components/ModalCategoriaSubcategoria'
import { ModalAjudaConceitos } from '@/components/ModalAjudaConceitos'
import { renderIconePorId } from '@/components/SeletorVisualIconeCor'

export default function CategoriasPage() {
  const { currentWorkspace, user } = useAuth()
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroTipo, setFiltroTipo] = useState<'todas' | 'despesa' | 'receita' | 'arquivadas'>(
    'todas',
  )

  // Modais de Criação / Edição
  const [modalFormOpen, setModalFormOpen] = useState(false)
  const [editingCat, setEditingCat] = useState<Categoria | null>(null)
  const [editingSub, setEditingSub] = useState<Subcategoria | null>(null)
  const [parentCatFixa, setParentCatFixa] = useState<Categoria | null>(null)
  const [tipoInicialModal, setTipoInicialModal] = useState<CategoriaTipo>('despesa')

  // Modal Explicativo de Conceitos
  const [modalAjudaOpen, setModalAjudaOpen] = useState(false)

  // Diálogo de Exclusão / Bloqueio Referencial com oferta de Arquivar
  const [dialogBloqueioOpen, setDialogBloqueioOpen] = useState(false)
  const [subParaExcluir, setSubParaExcluir] = useState<Subcategoria | null>(null)
  const [catParaExcluir, setCatParaExcluir] = useState<Categoria | null>(null)
  const [mensagemBloqueio, setMensagemBloqueio] = useState<string>('')
  const [isBloqueadoComLancamentos, setIsBloqueadoComLancamentos] = useState<boolean>(false)
  const [subParaArquivar, setSubParaArquivar] = useState<Subcategoria | null>(null)
  const [dialogConfirmarArquivamentoOpen, setDialogConfirmarArquivamentoOpen] = useState(false)
  const [catParaArquivar, setCatParaArquivar] = useState<Categoria | null>(null)
  const [dialogConfirmarArquivamentoCatOpen, setDialogConfirmarArquivamentoCatOpen] =
    useState(false)
  const [isArquivando, setIsArquivando] = useState(false)

  const wsId =
    currentWorkspace?.workspace_id || localStorage.getItem('sap_active_workspace_id') || undefined

  const carregarCategorias = async () => {
    if (!wsId) return
    setLoading(true)
    try {
      // Carrega com subcategorias, incluindo arquivadas para alimentar a aba Arquivadas
      const data = await categoriaService.listComSubcategorias(wsId, true)
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

  // Aberturas de Diálogo de Cadastro / Edição
  const abrirNovaCategoria = () => {
    setEditingCat(null)
    setEditingSub(null)
    setParentCatFixa(null)
    setTipoInicialModal('despesa')
    setModalFormOpen(true)
  }

  const abrirNovaSubcategoria = (cat: Categoria) => {
    setEditingCat(null)
    setEditingSub(null)
    setParentCatFixa(cat)
    setTipoInicialModal(cat.tipo)
    setModalFormOpen(true)
  }

  const abrirEdicaoCategoria = (cat: Categoria) => {
    setEditingCat(cat)
    setEditingSub(null)
    setParentCatFixa(null)
    setTipoInicialModal(cat.tipo)
    setModalFormOpen(true)
  }

  const abrirEdicaoSubcategoria = (sub: Subcategoria, catPai: Categoria) => {
    setEditingCat(null)
    setEditingSub(sub)
    setParentCatFixa(catPai)
    setTipoInicialModal(catPai.tipo)
    setModalFormOpen(true)
  }

  // Handler de Salvar Categoria / Subcategoria
  const handleSalvar = async (dados: any) => {
    if (!wsId) return
    await categoriaService.salvarCategoriaESubcategoria({
      workspace_id: wsId,
      categoria_id: dados.categoria_id,
      subcategoria_id: dados.subcategoria_id,
      nome_categoria: dados.nome_categoria,
      nome_subcategoria: dados.nome_subcategoria,
      tipo: dados.tipo,
      classificacao: dados.classificacao,
      natureza: dados.natureza,
      regularidade: dados.regularidade,
      origem_economica: dados.origem_economica,
      cor: dados.cor,
      icone: dados.icone,
      observacao: dados.observacao,
      created_by: user?.id,
    })

    toast.success('Registro gravado com sucesso!')
    await carregarCategorias()
  }

  // AÇÕES EM SUBCATEGORIAS
  const handleTentarExcluirSubcategoria = async (sub: Subcategoria) => {
    if (!wsId) return
    try {
      const verif = await categoriaService.verificarPodeExcluirSubcategoria(wsId, sub.id)
      setSubParaExcluir(sub)
      setCatParaExcluir(null)

      if (!verif.pode_excluir) {
        setIsBloqueadoComLancamentos(true)
        setMensagemBloqueio(
          verif.mensagem ||
            'Existem lançamentos registrados nesta subcategoria. Não é permitida a exclusão.',
        )
      } else {
        setIsBloqueadoComLancamentos(false)
        setMensagemBloqueio(
          `A subcategoria "${sub.nome}" não possui lançamentos históricos. Confirma a exclusão definitiva?`,
        )
      }
      setDialogBloqueioOpen(true)
    } catch (err: any) {
      toast.error('Erro ao verificar histórico: ' + (err.message || 'tente novamente'))
    }
  }

  const handleConfirmarExclusaoDefinitivaSub = async () => {
    if (!wsId || !subParaExcluir) return
    try {
      const res = await categoriaService.excluirSubcategoria(wsId, subParaExcluir.id, user?.id)
      if (res.bloqueado) {
        toast.error(res.mensagem)
      } else {
        toast.success(`Subcategoria "${subParaExcluir.nome}" excluída definitivamente!`)
        await carregarCategorias()
      }
    } catch (err: any) {
      toast.error('Erro ao excluir subcategoria: ' + (err.message || 'tente novamente'))
    } finally {
      setDialogBloqueioOpen(false)
      setSubParaExcluir(null)
    }
  }

  const solicitarArquivamentoSub = (sub: Subcategoria) => {
    setSubParaArquivar(sub)
    setDialogConfirmarArquivamentoOpen(true)
  }

  const handleArquivarSub = async (sub: Subcategoria, arquivar: boolean) => {
    if (!wsId) return
    try {
      await categoriaService.arquivarSubcategoria(wsId, sub.id, arquivar, user?.id)
      toast.success(
        arquivar
          ? `Subcategoria "${sub.nome}" arquivada com sucesso!`
          : `Subcategoria "${sub.nome}" reativada com sucesso!`,
      )
      setDialogBloqueioOpen(false)
      setSubParaExcluir(null)
      setDialogConfirmarArquivamentoOpen(false)
      setSubParaArquivar(null)
      await carregarCategorias()
    } catch (err: any) {
      toast.error('Erro ao arquivar/reativar: ' + (err.message || 'tente novamente'))
    }
  }
  // AÇÕES EM CATEGORIAS PRINCIPAIS
  const handleTentarExcluirCategoria = async (cat: Categoria) => {
    if (!wsId) return
    try {
      const verif = await categoriaService.verificarPodeExcluirCategoria(wsId, cat.id)
      setCatParaExcluir(cat)
      setSubParaExcluir(null)

      if (!verif.pode_excluir) {
        setIsBloqueadoComLancamentos(true)
        setMensagemBloqueio(
          verif.mensagem ||
            'Não é permitida a exclusão de categoria com subcategorias ou lançamentos vinculados.',
        )
      } else {
        setIsBloqueadoComLancamentos(false)
        setMensagemBloqueio(
          `A categoria "${cat.nome}" não possui subcategorias nem lançamentos. Confirma a exclusão definitiva?`,
        )
      }
      setDialogBloqueioOpen(true)
    } catch (err: any) {
      toast.error('Erro ao verificar histórico: ' + (err.message || 'tente novamente'))
    }
  }

  const handleConfirmarExclusaoDefinitivaCat = async () => {
    if (!wsId || !catParaExcluir) return
    try {
      // Soft/hard delete via categoriaService
      await categoriaService.updateCategoria(catParaExcluir.id, wsId, { ativo: false }, user?.id)
      toast.success(`Categoria "${catParaExcluir.nome}" excluída!`)
      await carregarCategorias()
    } catch (err: any) {
      toast.error('Erro ao excluir categoria: ' + (err.message || 'tente novamente'))
    } finally {
      setDialogBloqueioOpen(false)
      setCatParaExcluir(null)
    }
  }

  const solicitarArquivamentoCat = (cat: Categoria) => {
    setCatParaArquivar(cat)
    setDialogConfirmarArquivamentoCatOpen(true)
  }

  const handleArquivarCategoria = async (cat: Categoria, arquivar: boolean) => {
    if (!wsId || isArquivando) return
    setIsArquivando(true)
    try {
      await categoriaService.arquivarCategoria(wsId, cat.id, arquivar, true, user?.id)
      toast.success(
        arquivar
          ? `Categoria "${cat.nome}" e suas subcategorias foram arquivadas.`
          : `Categoria "${cat.nome}" reativada com sucesso!`,
      )
      setDialogBloqueioOpen(false)
      setCatParaExcluir(null)
      setDialogConfirmarArquivamentoCatOpen(false)
      setCatParaArquivar(null)
      await carregarCategorias()
    } catch (err: any) {
      toast.error('Erro ao arquivar/reativar: ' + (err.message || 'tente novamente'))
    } finally {
      setIsArquivando(false)
    }
  }

  // CÁLCULO DE LISTAS CONFORME FILTRO (TODAS, DESPESAS, RECEITAS, ARQUIVADAS)
  const totalArquivadasCount = categorias.reduce((acc, cat) => {
    const subsArq = (cat.subcategorias || []).filter((s) => s.arquivado).length
    return acc + subsArq + (cat.arquivado ? 1 : 0)
  }, 0)

  // Filtragem das categorias exibidas
  const categoriasFiltradas = categorias
    .filter((cat) => {
      if (filtroTipo === 'arquivadas') {
        // Exibe categorias arquivadas OU que possuem subcategorias arquivadas
        return cat.arquivado || (cat.subcategorias || []).some((s) => s.arquivado)
      }
      if (filtroTipo === 'todas') {
        return !cat.arquivado
      }
      if (filtroTipo === 'despesa') {
        return !cat.arquivado && cat.tipo === 'despesa'
      }
      if (filtroTipo === 'receita') {
        return !cat.arquivado && cat.tipo === 'receita'
      }
      return true
    })
    .map((cat) => {
      if (filtroTipo === 'arquivadas') {
        return {
          ...cat,
          // Se a categoria está arquivada, mostra todas ou as arquivadas
          subcategorias: (cat.subcategorias || []).filter((s) => s.arquivado || cat.arquivado),
        }
      }
      return {
        ...cat,
        // No fluxo normal ativo, mostra apenas subcategorias NÃO arquivadas
        subcategorias: (cat.subcategorias || []).filter((s) => !s.arquivado),
      }
    })

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900">
            Categorias & Subcategorias
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => setModalAjudaOpen(true)}
            variant="outline"
            className="text-xs border-slate-300 text-slate-700 bg-white hover:bg-slate-50 flex items-center gap-1.5"
          >
            <HelpCircle className="w-3.5 h-3.5 text-emerald-600" />
            <span>ⓘ Entenda as classificações</span>
          </Button>

          <Button
            onClick={abrirNovaCategoria}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs sm:text-sm flex items-center gap-2 shadow-sm"
          >
            <Plus className="w-4 h-4" /> Nova Categoria
          </Button>
        </div>
      </div>

      {/* Cards/Filtros Rápidos: Todas, Despesas, Receitas, Arquivadas */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2">
        <Button
          variant={filtroTipo === 'todas' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setFiltroTipo('todas')}
          className={
            filtroTipo === 'todas'
              ? 'bg-slate-900 text-white text-xs'
              : 'text-xs text-slate-600 hover:text-slate-900'
          }
        >
          Todas ({categorias.filter((c) => !c.arquivado).length})
        </Button>
        <Button
          variant={filtroTipo === 'despesa' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setFiltroTipo('despesa')}
          className={
            filtroTipo === 'despesa'
              ? 'bg-rose-600 text-white text-xs'
              : 'text-xs text-slate-600 hover:text-rose-600'
          }
        >
          <ArrowDown className="w-3 h-3 mr-1" />
          Despesas ({categorias.filter((c) => !c.arquivado && c.tipo === 'despesa').length})
        </Button>
        <Button
          variant={filtroTipo === 'receita' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setFiltroTipo('receita')}
          className={
            filtroTipo === 'receita'
              ? 'bg-emerald-600 text-white text-xs'
              : 'text-xs text-slate-600 hover:text-emerald-600'
          }
        >
          <ArrowUp className="w-3 h-3 mr-1" />
          Receitas ({categorias.filter((c) => !c.arquivado && c.tipo === 'receita').length})
        </Button>
        <Button
          variant={filtroTipo === 'arquivadas' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setFiltroTipo('arquivadas')}
          className={
            filtroTipo === 'arquivadas'
              ? 'bg-amber-600 text-white text-xs'
              : 'text-xs text-slate-600 hover:text-amber-700'
          }
        >
          <Archive className="w-3 h-3 mr-1" />
          Arquivadas ({totalArquivadasCount})
        </Button>
      </div>

      {/* Lista de Categorias e Subcategorias com Badges Discretos */}
      <div className="space-y-4">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm">
            Carregando taxonomia analítica...
          </div>
        ) : categoriasFiltradas.length === 0 ? (
          <Card className="border-slate-200 p-12 text-center bg-white space-y-3">
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
              <FolderTree className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-slate-800">
              {filtroTipo === 'arquivadas'
                ? 'Nenhum registro arquivado'
                : 'Nenhuma categoria encontrada'}
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              {filtroTipo === 'arquivadas'
                ? 'Subcategorias e categorias arquivadas aparecem aqui com a opção de desarquivamento.'
                : 'Crie suas categorias e subcategorias pelo botão acima para estruturar suas finanças.'}
            </p>
          </Card>
        ) : (
          categoriasFiltradas.map((cat) => (
            <Card key={cat.id} className="border-slate-200 shadow-sm bg-white overflow-hidden">
              {/* Cabeçalho da Categoria */}
              <div className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/70 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  {/* Círculo do Ícone no padrão visual do SAP */}
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white shrink-0 shadow-xs"
                    style={{ backgroundColor: cat.cor || '#10B981' }}
                  >
                    {renderIconePorId(cat.icone, 'w-4 h-4 stroke-[2]')}
                  </div>

                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* 2ª Coluna: Nome da Categoria */}
                      <span className="font-bold text-slate-900 text-sm md:text-base">
                        {cat.nome}
                      </span>

                      {/* 3ª Coluna: Tipo de Fluxo (Despesa/Receita) depois do nome */}
                      <Badge
                        variant="secondary"
                        className={
                          cat.tipo === 'despesa'
                            ? 'bg-rose-100 text-rose-700 hover:bg-rose-100 text-[11px] font-bold border-rose-200'
                            : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-[11px] font-bold border-emerald-200'
                        }
                      >
                        {cat.tipo === 'despesa' ? 'Despesa' : 'Receita'}
                      </Badge>

                      {cat.arquivado && (
                        <Badge
                          variant="outline"
                          className="bg-amber-50 text-amber-800 border-amber-300 text-[10px]"
                        >
                          Categoria Arquivada
                        </Badge>
                      )}
                    </div>

                    <div className="text-xs text-slate-500 mt-0.5">
                      {cat.subcategorias?.length || 0}{' '}
                      {cat.subcategorias?.length === 1 ? 'subcategoria' : 'subcategorias'}
                      {cat.observacao && <span> • {cat.observacao}</span>}
                    </div>
                  </div>
                </div>

                {/* Ações da Categoria */}
                <div className="flex items-center gap-1 self-end sm:self-center">
                  {!cat.arquivado && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => abrirNovaSubcategoria(cat)}
                      className="text-xs text-emerald-700 border-emerald-200 bg-white hover:bg-emerald-50 flex items-center gap-1 h-7 font-medium"
                    >
                      <Plus className="w-3 h-3" />
                      Subcategoria
                    </Button>
                  )}

                  {cat.arquivado ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleArquivarCategoria(cat, false)}
                      className="text-xs text-amber-700 border-amber-300 bg-amber-50 hover:bg-amber-100 flex items-center gap-1 h-7"
                    >
                      <ArchiveRestore className="w-3 h-3" />
                      Desarquivar Categoria
                    </Button>
                  ) : (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Editar Categoria"
                        onClick={() => abrirEdicaoCategoria(cat)}
                        className="h-7 w-7 text-slate-500 hover:text-slate-900"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Arquivar Categoria"
                        onClick={() => solicitarArquivamentoCat(cat)}
                        className="h-7 w-7 text-slate-400 hover:text-amber-700"
                      >
                        <Archive className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Excluir Categoria"
                        onClick={() => handleTentarExcluirCategoria(cat)}
                        className="h-7 w-7 text-slate-400 hover:text-rose-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* Subcategorias aninhadas */}
              <div className="divide-y divide-slate-100">
                {cat.subcategorias && cat.subcategorias.length > 0 ? (
                  cat.subcategorias.map((sub) => (
                    <div
                      key={sub.id}
                      className="py-2.5 px-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-50/70 transition"
                    >
                      <div className="flex items-center gap-2.5 flex-wrap">
                        {/* Ícone da subcategoria */}
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center text-white shrink-0 text-xs shadow-xs"
                          style={{ backgroundColor: sub.cor || cat.cor || '#10B981' }}
                        >
                          {renderIconePorId(sub.icone || cat.icone, 'w-3 h-3 stroke-[2]')}
                        </div>

                        <span className="text-xs md:text-sm font-semibold text-slate-800">
                          {sub.nome}
                        </span>

                        {/* BADGES DISCRETOS:
                            Despesa: Classificação · Natureza
                            Receita: Regularidade · Origem Econômica */}
                        {cat.tipo === 'despesa' ? (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[11px] font-medium text-slate-600 bg-slate-100 border border-slate-200/80 px-2 py-0.5 rounded-md flex items-center gap-1">
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  sub.classificacao === 'Essencial'
                                    ? 'bg-emerald-500'
                                    : sub.classificacao === 'Ajustável'
                                      ? 'bg-blue-500'
                                      : sub.classificacao === 'Discricionária'
                                        ? 'bg-amber-500'
                                        : 'bg-rose-500'
                                }`}
                              />
                              <strong>{sub.classificacao || 'Essencial'}</strong>
                              <span className="text-slate-400">·</span>
                              <span>{sub.natureza || 'Consumo'}</span>
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[11px] font-medium text-slate-600 bg-emerald-50/80 border border-emerald-200/60 px-2 py-0.5 rounded-md flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                              <strong>{sub.regularidade || 'Recorrente mensal'}</strong>
                              <span className="text-slate-400">·</span>
                              <span>{sub.origem_economica || 'Trabalho'}</span>
                            </span>
                          </div>
                        )}

                        {sub.observacao && (
                          <span className="text-[11px] text-slate-400 italic">
                            ({sub.observacao})
                          </span>
                        )}

                        {sub.arquivado && (
                          <Badge
                            variant="outline"
                            className="text-[10px] bg-amber-50 text-amber-800 border-amber-300"
                          >
                            Arquivada
                          </Badge>
                        )}
                      </div>

                      {/* Ações da Subcategoria */}
                      <div className="flex items-center gap-1 self-end sm:self-center">
                        {sub.arquivado ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleArquivarSub(sub, false)}
                            className="text-xs text-amber-700 border-amber-300 bg-amber-50 hover:bg-amber-100 flex items-center gap-1 h-6 px-2"
                          >
                            <ArchiveRestore className="w-3 h-3" />
                            <span>Desarquivar</span>
                          </Button>
                        ) : (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Editar Subcategoria"
                              onClick={() => abrirEdicaoSubcategoria(sub, cat)}
                              className="h-6 w-6 text-slate-400 hover:text-slate-900"
                            >
                              <Edit2 className="w-3 h-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Arquivar Subcategoria"
                              onClick={() => solicitarArquivamentoSub(sub)}
                              className="h-6 w-6 text-slate-400 hover:text-amber-700"
                            >
                              <Archive className="w-3 h-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Excluir Subcategoria"
                              onClick={() => handleTentarExcluirSubcategoria(sub)}
                              className="h-6 w-6 text-slate-300 hover:text-rose-600"
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </>
                        )}
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

      {/* Caixa de diálogo de Categoria / Subcategoria */}
      <ModalCategoriaSubcategoria
        open={modalFormOpen}
        onOpenChange={setModalFormOpen}
        workspaceId={wsId || ''}
        userId={user?.id}
        categoriaParaEdicao={editingCat}
        subcategoriaParaEdicao={editingSub}
        categoriaPaiFixa={parentCatFixa}
        tipoInicial={tipoInicialModal}
        categoriasExistentes={categorias}
        onSalvar={handleSalvar}
      />

      {/* Caixa de diálogo de confirmação de arquivamento de subcategoria */}
      <AlertDialog
        open={dialogConfirmarArquivamentoOpen}
        onOpenChange={setDialogConfirmarArquivamentoOpen}
      >
        <AlertDialogContent className="bg-white text-slate-900 border-slate-200">
          <AlertDialogHeader>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <Archive className="w-5 h-5" />
              </div>
              <AlertDialogTitle className="text-base font-bold text-slate-900">
                Confirmar Arquivamento
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-xs text-slate-600 pt-2 leading-relaxed">
              A subcategoria &ldquo;{subParaArquivar?.nome}&rdquo; não aparecerá mais na sua lista,
              mas você poderá desarquivá-la. Confirma o arquivamento?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="pt-3 gap-2">
            <AlertDialogCancel
              disabled={isArquivando}
              onClick={() => {
                setDialogConfirmarArquivamentoOpen(false)
                setSubParaArquivar(null)
              }}
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isArquivando}
              onClick={() => {
                if (subParaArquivar) {
                  handleArquivarSub(subParaArquivar, true)
                }
              }}
              className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold"
            >
              {isArquivando ? 'Arquivando...' : 'Confirmar Arquivamento'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Caixa de diálogo de confirmação de arquivamento de categoria inteira (Bloco A) */}
      <AlertDialog
        open={dialogConfirmarArquivamentoCatOpen}
        onOpenChange={setDialogConfirmarArquivamentoCatOpen}
      >
        <AlertDialogContent className="bg-white text-slate-900 border-slate-200">
          <AlertDialogHeader>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <Archive className="w-5 h-5" />
              </div>
              <AlertDialogTitle className="text-base font-bold text-slate-900">
                Confirmar Arquivamento
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-xs text-slate-600 pt-2 leading-relaxed">
              A categoria &ldquo;{catParaArquivar?.nome}&rdquo; e suas subcategorias não aparecerá
              mais na sua lista, mas você poderá desarquivá-la. Confirma o arquivamento?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="pt-3 gap-2">
            <AlertDialogCancel
              disabled={isArquivando}
              onClick={() => {
                setDialogConfirmarArquivamentoCatOpen(false)
                setCatParaArquivar(null)
              }}
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isArquivando}
              onClick={() => {
                if (catParaArquivar) {
                  handleArquivarCategoria(catParaArquivar, true)
                }
              }}
              className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold"
            >
              {isArquivando ? 'Arquivando...' : 'Confirmar Arquivamento'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal explicativo centralizado de conceitos */}
      <ModalAjudaConceitos open={modalAjudaOpen} onOpenChange={setModalAjudaOpen} />

      {/* Diálogo de Exclusão / Bloqueio Referencial com Oferta de Arquivamento */}
      <AlertDialog open={dialogBloqueioOpen} onOpenChange={setDialogBloqueioOpen}>
        <AlertDialogContent className="bg-white text-slate-900 border-slate-200">
          <AlertDialogHeader>
            <div className="flex items-center gap-2">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                  isBloqueadoComLancamentos
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-rose-100 text-rose-700'
                }`}
              >
                <AlertTriangle className="w-5 h-5" />
              </div>
              <AlertDialogTitle className="text-base font-bold text-slate-900">
                {isBloqueadoComLancamentos ? 'Exclusão Bloqueada' : 'Confirmar Exclusão Definitiva'}
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-xs text-slate-600 pt-2 leading-relaxed">
              {mensagemBloqueio}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter className="pt-3 gap-2">
            <AlertDialogCancel onClick={() => setDialogBloqueioOpen(false)}>
              Fechar
            </AlertDialogCancel>

            {isBloqueadoComLancamentos ? (
              // Se bloqueado por lançamentos, oferece a alternativa explícita: "Arquivar subcategoria"
              subParaExcluir && (
                <Button
                  type="button"
                  onClick={() => {
                    const s = subParaExcluir
                    setDialogBloqueioOpen(false)
                    setSubParaExcluir(null)
                    solicitarArquivamentoSub(s)
                  }}
                  className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold flex items-center gap-1.5"
                >
                  <Archive className="w-3.5 h-3.5" />
                  Arquivar subcategoria
                </Button>
              )
            ) : (
              // Sem lançamentos: confirmação definitiva
              <AlertDialogAction
                onClick={() => {
                  if (subParaExcluir) {
                    handleConfirmarExclusaoDefinitivaSub()
                  } else if (catParaExcluir) {
                    handleConfirmarExclusaoDefinitivaCat()
                  }
                }}
                className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold"
              >
                Excluir Definitivamente
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
