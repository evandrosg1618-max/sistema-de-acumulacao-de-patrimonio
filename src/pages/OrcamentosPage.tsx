import React, { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { orcamentoService, categoriaService } from '@/services/sap'
import { Orcamento, Categoria } from '@/types/sap'
import { formatMoneyBRL, getCurrentAnoMes, formatAnoMesPT } from '@/lib/formatters'
import {
  Target,
  Plus,
  Trash2,
  Calendar,
  AlertCircle,
  TrendingDown,
  Sparkles,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
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

export default function OrcamentosPage() {
  const { currentWorkspace, user } = useAuth()
  const [anoMes, setAnoMes] = useState(getCurrentAnoMes())
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [loading, setLoading] = useState(true)

  const [modalOpen, setModalOpen] = useState(false)
  const [categoriaId, setCategoriaId] = useState('')
  const [limite, setLimite] = useState('1.000,00')
  const [saving, setSaving] = useState(false)

  const wsId =
    currentWorkspace?.workspace_id || localStorage.getItem('sap_active_workspace_id') || undefined

  const carregarDados = async () => {
    if (!wsId) return
    setLoading(true)
    try {
      const [orcs, cats] = await Promise.all([
        orcamentoService.listByMes(wsId, anoMes),
        categoriaService.listComSubcategorias(wsId),
      ])
      setOrcamentos(orcs)
      setCategorias(cats.filter((c: any) => c.tipo === 'despesa'))
    } catch (err: any) {
      toast.error('Erro ao carregar dados: ' + (err.message || 'tente novamente'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregarDados()
  }, [wsId, anoMes])

  const mudarMes = (direcao: number) => {
    const [anoStr, mesStr] = anoMes.split('-')
    let ano = parseInt(anoStr, 10)
    let mes = parseInt(mesStr, 10) + direcao
    if (mes > 12) {
      mes = 1
      ano++
    } else if (mes < 1) {
      mes = 12
      ano--
    }
    setAnoMes(`${ano}-${String(mes).padStart(2, '0')}`)
  }

  const abrirModal = () => {
    if (categorias.length === 0) {
      toast.error('Cadastre ao menos uma categoria de despesa antes de definir um orçamento')
      return
    }
    // Seleciona primeira categoria ainda sem orçamento no mês
    const jaTem = new Set(orcamentos.map((o) => o.categoria_id))
    const primeiraDisponivel = categorias.find((c) => !jaTem.has(c.id))
    setCategoriaId(primeiraDisponivel ? primeiraDisponivel.id : categorias[0].id)
    setLimite('1.000,00')
    setModalOpen(true)
  }

  const handleSalvar = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    const formElement = e.currentTarget
    const formData = new FormData(formElement)
    const formLimite = (formData.get('limite') as string) ?? limite
    const formCategoriaId = (formData.get('categoriaId') as string) || categoriaId

    if (!formCategoriaId) {
      toast.error('Selecione a categoria de despesa')
      return
    }

    if (!wsId) {
      toast.error('Selecione um espaço familiar para continuar. Atualize a página.')
      return
    }

    const limiteNum = parseFloat(String(formLimite).replace(/\./g, '').replace(',', '.'))
    if (isNaN(limiteNum) || limiteNum < 0) {
      toast.error('Informe um valor de limite válido')
      return
    }

    setSaving(true)
    try {
      await orcamentoService.upsert({
        workspace_id: wsId,
        categoria_id: formCategoriaId,
        ano_mes: anoMes,
        limite: limiteNum,
        created_by: user?.id,
      })
      toast.success('Limite de orçamento definido com sucesso!')
      setModalOpen(false)
      await carregarDados()
    } catch (err: any) {
      toast.error('Erro ao salvar orçamento: ' + (err.message || 'verifique os dados'))
    } finally {
      setSaving(false)
    }
  }

  const handleExcluir = async (o: Orcamento) => {
    if (!wsId) return
    const confirma = window.confirm('Deseja remover este limite de orçamento para o mês?')
    if (!confirma) return

    try {
      await orcamentoService.delete(o.id, wsId, user?.id)
      toast.success('Limite removido.')
      await carregarDados()
    } catch (err: any) {
      toast.error('Erro ao excluir: ' + (err.message || 'tente novamente'))
    }
  }

  const totalLimite = orcamentos.reduce((acc, o) => acc + (o.limite || 0), 0)
  const totalConsumido = orcamentos.reduce((acc, o) => acc + (o.consumo_atual || 0), 0)
  const disponivelGeral = Math.max(0, totalLimite - totalConsumido)

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900">
              Orçamento Familiar Mensal
            </h1>
            <Badge
              variant="outline"
              className="text-emerald-700 bg-emerald-50 border-emerald-200 text-xs"
            >
              Build 1 & Build 6
            </Badge>
          </div>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            Aqui você poderá ver todos os seus limites disponíveis por categoria e valores.
          </p>
        </div>

        {/* Seletor de Competência */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-white border border-slate-200 rounded-lg p-1 shadow-xs">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => mudarMes(-1)}
              className="h-7 w-7 text-slate-600"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="px-3 text-xs font-semibold text-slate-800 min-w-[130px] text-center">
              {formatAnoMesPT(anoMes)}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => mudarMes(1)}
              className="h-7 w-7 text-slate-600"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          <Button
            onClick={abrirModal}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs sm:text-sm flex items-center gap-2 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Definir Limite
          </Button>
        </div>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-slate-200 shadow-sm bg-white">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Teto Orçado do Mês
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-slate-900">
              {formatMoneyBRL(totalLimite)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-500">
              {orcamentos.length} categorias orçadas em {formatAnoMesPT(anoMes)}
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm bg-white">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Total Realizado / Gasto
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-rose-600">
              {formatMoneyBRL(totalConsumido)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-500">
              {totalLimite > 0
                ? `${((totalConsumido / totalLimite) * 100).toFixed(1)}% do teto consumido`
                : 'Sem teto definido'}
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm bg-white">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Disponível para Gastar
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-emerald-600">
              {formatMoneyBRL(disponivelGeral)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-500">Margem livre para o restante do mês</p>
          </CardContent>
        </Card>
      </div>

      {/* Lista de Orçamentos por Categoria */}
      <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
        <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Target className="w-5 h-5 text-emerald-600" />
              Limites por Categoria ({orcamentos.length})
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Controle de consumo com acompanhamento visual
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-slate-400 text-sm">Carregando orçamentos...</div>
          ) : orcamentos.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
                <Target className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-semibold text-slate-800">
                Nenhum limite orçado para este mês
              </h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Aqui você poderá ver todos os seus limites disponíveis por categoria e valores.
              </p>
              <Button
                onClick={abrirModal}
                variant="outline"
                size="sm"
                className="text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-xs"
              >
                Definir Primeiro Limite
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {orcamentos.map((o) => {
                const consumo = o.consumo_atual || 0
                const limiteNum = o.limite || 1
                const pct = Math.min(100, Math.round((consumo / limiteNum) * 100))
                const disponivel = Math.max(0, limiteNum - consumo)

                let barraCor = 'bg-emerald-500'
                if (pct >= 80) barraCor = 'bg-rose-500'
                else if (pct >= 60) barraCor = 'bg-amber-500'

                return (
                  <div key={o.id} className="p-4 space-y-2 hover:bg-slate-50/70 transition">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: o.categoria?.cor || '#10B981' }}
                        />
                        <span className="font-semibold text-slate-900 text-sm">
                          {o.categoria?.nome || 'Categoria'}
                        </span>
                        <span className="text-[11px] text-slate-400 font-normal">
                          ({pct}% consumido)
                        </span>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <span className="text-xs font-semibold text-slate-800">
                            {formatMoneyBRL(consumo)}
                          </span>
                          <span className="text-xs text-slate-400">
                            {' '}
                            de {formatMoneyBRL(o.limite)}
                          </span>
                          <div className="text-[10px] text-emerald-600 font-medium">
                            Disponível: {formatMoneyBRL(disponivel)}
                          </div>
                        </div>

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleExcluir(o)}
                          className="h-7 w-7 text-slate-400 hover:text-rose-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>

                    {/* Barra de progresso customizada com faixas de cor */}
                    <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${barraCor}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal Definir Limite */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSalvar}>
            <DialogHeader>
              <DialogTitle>Definir Limite de Orçamento</DialogTitle>
              <DialogDescription>
                Competência: <strong>{formatAnoMesPT(anoMes)}</strong>
              </DialogDescription>
            </DialogHeader>

            <div className="py-4 space-y-4">
              <div>
                <Label htmlFor="cat-orc" className="text-xs font-semibold text-slate-700">
                  Categoria de Despesa *
                </Label>
                <input type="hidden" name="categoriaId" value={categoriaId} />
                <Select value={categoriaId} onValueChange={setCategoriaId}>
                  <SelectTrigger className="mt-1" id="cat-orc">
                    <SelectValue placeholder="Selecione a categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {categorias.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome} ({c.classificacao_gerencial})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="limite-orc" className="text-xs font-semibold text-slate-700">
                  Limite Mensal (R$) *
                </Label>
                <Input
                  id="limite-orc"
                  name="limite"
                  placeholder="1.000,00"
                  value={limite}
                  onChange={(e) => setLimite(e.target.value)}
                  className="mt-1"
                  autoFocus
                  required
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Valor teto pretendido para gastos nesta categoria no mês de{' '}
                  {formatAnoMesPT(anoMes)}.
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {saving ? 'Gravando...' : 'Salvar Limite'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
