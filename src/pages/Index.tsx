import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import {
  contaService,
  meioPagamentoService,
  cartaoService,
  orcamentoService,
  categoriaService,
  lancamentoService,
  lancamentoRapidoService,
} from '@/services/sap'
import { Conta, Cartao, Orcamento, Categoria, MeioPagamento } from '@/types/sap'
import { formatMoneyBRL, getCurrentAnoMes } from '@/lib/formatters'
import {
  Eye,
  EyeOff,
  BarChart2,
  TrendingDown,
  TrendingUp,
  ArrowRightLeft,
  FileSpreadsheet,
  Plus,
  Target,
  CreditCard,
  Wallet,
  Banknote,
  Landmark,
  ChevronRight,
  ShieldCheck,
  Sparkles,
  Edit2,
  PieChart as PieIcon,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ModalLancamento } from '@/components/ModalLancamento'
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

export default function Index() {
  const { currentWorkspace, profile, user } = useAuth()
  const [ocultarSaldos, setOcultarSaldos] = useState(false)
  const [contas, setContas] = useState<Conta[]>([])
  const [carteirasDinheiro, setCarteirasDinheiro] = useState<MeioPagamento[]>([])
  const [cartoes, setCartoes] = useState<Cartao[]>([])
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [resumoMes, setResumoMes] = useState<{
    receitaMensal: number
    despesaMensal: number
    maioresGastos: { nome: string; cor: string; total: number; percentual: number }[]
    totalLancamentos: number
  }>({
    receitaMensal: 0,
    despesaMensal: 0,
    maioresGastos: [],
    totalLancamentos: 0,
  })
  const [loading, setLoading] = useState(true)

  // Modal para Criar/Editar Carteira em Espécie
  const [modalDinheiroOpen, setModalDinheiroOpen] = useState(false)
  const [carteiraEmEdicao, setCarteiraEmEdicao] = useState<MeioPagamento | null>(null)
  const [nomeCarteira, setNomeCarteira] = useState('Dinheiro em Espécie / Carteira')
  const [salvandoCarteira, setSalvandoCarteira] = useState(false)

  // Modal de Lançamentos Completo da Build 2 acionado pela Visão Geral
  const [modalLancamentoOpen, setModalLancamentoOpen] = useState(false)
  const [tipoLancamentoSelecionado, setTipoLancamentoSelecionado] = useState<
    'despesa' | 'receita' | 'transferencia'
  >('despesa')

  const anoMes = getCurrentAnoMes()
  const wsId =
    currentWorkspace?.workspace_id || localStorage.getItem('sap_active_workspace_id') || undefined

  const carregarDashboard = async () => {
    if (!wsId) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [contasList, dinheiroList, cartoesList, orcamentosList, resumo, catsList] =
        await Promise.all([
          contaService.list(wsId, false),
          meioPagamentoService.listDinheiroComSaldo(wsId, true),
          cartaoService.list(wsId, false),
          orcamentoService.listByMes(wsId, anoMes),
          lancamentoRapidoService.getResumoMes(wsId, anoMes),
          categoriaService.listComSubcategorias(wsId),
        ])

      setContas(contasList)
      setCarteirasDinheiro(dinheiroList)
      setCartoes(cartoesList)
      setOrcamentos(orcamentosList)
      setResumoMes(resumo)
      setCategorias(catsList)
    } catch (err) {
      console.error('Erro ao carregar dashboard:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregarDashboard()
  }, [wsId])

  // Saudação de acordo com o horário
  const hora = new Date().getHours()
  let saudacao = 'Bom dia'
  if (hora >= 12 && hora < 18) saudacao = 'Boa tarde'
  else if (hora >= 18 || hora < 5) saudacao = 'Boa noite'

  const primeiroNome = profile?.nome?.split(' ')[0] || user?.email?.split('@')[0] || 'Evandro'

  // Saldo Geral consolidado (soma contas + saldo de carteiras em dinheiro físico)
  const saldoContas = contas.reduce((acc, c) => acc + (c.saldo_atual || 0), 0)
  const saldoDinheiroTotal = carteirasDinheiro.reduce((acc, d) => acc + (d.saldo_atual || 0), 0)
  const saldoGeral = saldoContas + saldoDinheiroTotal

  // Abrir Modal de Carteira em Espécie
  const abrirNovaCarteira = () => {
    setCarteiraEmEdicao(null)
    setNomeCarteira('Dinheiro em Espécie / Carteira')
    setModalDinheiroOpen(true)
  }

  const abrirEdicaoCarteira = (m: MeioPagamento) => {
    setCarteiraEmEdicao(m)
    setNomeCarteira(m.nome)
    setModalDinheiroOpen(true)
  }

  const handleSalvarCarteira = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    const formElement = e.currentTarget
    const formData = new FormData(formElement)
    const formNome = (formData.get('nome') as string)?.trim() || nomeCarteira.trim()

    if (!formNome) {
      toast.error('Informe o nome da carteira')
      return
    }

    if (!wsId) {
      toast.error('Selecione um espaço familiar para continuar. Atualize a página.')
      return
    }

    setSalvandoCarteira(true)
    try {
      if (carteiraEmEdicao) {
        await meioPagamentoService.update(carteiraEmEdicao.id, wsId, { nome: formNome }, user?.id)
        toast.success(`Carteira "${formNome}" atualizada com sucesso!`)
      } else {
        await meioPagamentoService.createDinheiro(wsId, formNome, user?.id)
        toast.success(`Carteira "${formNome}" cadastrada com sucesso!`)
      }

      setModalDinheiroOpen(false)
      await carregarDashboard()
    } catch (err: any) {
      toast.error('Erro ao salvar carteira: ' + (err.message || 'tente novamente'))
    } finally {
      setSalvandoCarteira(false)
    }
  }

  // Abrir Modal Completo da Build 2
  const abrirAcaoRapida = (tipo: 'despesa' | 'receita' | 'transferencia') => {
    setTipoLancamentoSelecionado(tipo)
    setModalLancamentoOpen(true)
  }

  const handleSalvarLancamentoVisaoGeral = async (dados: any, criarOutro = false) => {
    if (!wsId) return
    try {
      await lancamentoService.create({
        ...dados,
        workspace_id: wsId,
        created_by: user?.id,
      })
      toast.success(
        `${
          dados.tipo === 'despesa'
            ? 'Despesa registrada'
            : dados.tipo === 'receita'
              ? 'Receita registrada'
              : 'Transferência registrada'
        } com sucesso!`,
      )
      await carregarDashboard()
    } catch (err: any) {
      toast.error('Erro ao lançar: ' + (err.message || 'verifique os dados'))
      throw err
    }
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* 1. CABEÇALHO DE BOAS-VINDAS ESTILO ORGANIZZE */}
      <div className="bg-white rounded-2xl p-5 md:p-6 border border-slate-200/80 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        {/* Esquerda: Saudação + Receita e Despesa Mensais */}
        <div className="space-y-4">
          <div>
            <div className="text-xs md:text-sm text-slate-500 font-normal">{saudacao},</div>
            <div className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">
              {primeiroNome}!
            </div>
          </div>

          <div className="flex items-center gap-6 sm:gap-8">
            <div>
              <div className="text-xs text-slate-500 font-medium">Receita mensal</div>
              <div className="text-base sm:text-lg font-bold text-emerald-600">
                {ocultarSaldos ? '••••••' : formatMoneyBRL(resumoMes.receitaMensal)}
              </div>
            </div>

            <div className="h-8 w-px bg-slate-200" />

            <div>
              <div className="text-xs text-slate-500 font-medium">Despesa mensal</div>
              <div className="text-base sm:text-lg font-bold text-rose-600">
                {ocultarSaldos ? '••••••' : formatMoneyBRL(resumoMes.despesaMensal)}
              </div>
            </div>

            <button
              onClick={() => setOcultarSaldos(!ocultarSaldos)}
              className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition"
              title={ocultarSaldos ? 'Mostrar saldos' : 'Ocultar saldos'}
            >
              <BarChart2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Direita: Botões de Ação Rápida no modelo Organizze */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Despesa */}
          <button
            onClick={() => abrirAcaoRapida('despesa')}
            className="flex items-center gap-2 px-4 py-2 rounded-full border border-slate-200 hover:border-rose-300 hover:bg-rose-50/50 text-slate-700 hover:text-rose-700 text-xs sm:text-sm font-semibold transition shadow-2xs"
          >
            <div className="w-5 h-5 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center">
              <TrendingDown className="w-3 h-3 stroke-[2.5]" />
            </div>
            <span>Despesa</span>
          </button>

          {/* Entrada */}
          <button
            onClick={() => abrirAcaoRapida('receita')}
            className="flex items-center gap-2 px-4 py-2 rounded-full border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/50 text-slate-700 hover:text-emerald-700 text-xs sm:text-sm font-semibold transition shadow-2xs"
          >
            <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
              <TrendingUp className="w-3 h-3 stroke-[2.5]" />
            </div>
            <span>Entrada</span>
          </button>

          {/* Transferência */}
          <button
            onClick={() => abrirAcaoRapida('transferencia')}
            className="flex items-center gap-2 px-4 py-2 rounded-full border border-slate-200 hover:border-slate-300 hover:bg-slate-100 text-slate-700 text-xs sm:text-sm font-semibold transition shadow-2xs"
          >
            <div className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center">
              <ArrowRightLeft className="w-3 h-3 stroke-[2.5]" />
            </div>
            <span>Transferência</span>
          </button>

          {/* Importar (placeholder da Build futura, desabilitado/informativo) */}
          <button
            onClick={() =>
              toast.info(
                'Importação bancária (OFX/Open Finance) estará disponível nas próximas builds do PRD.',
              )
            }
            className="flex items-center gap-2 px-4 py-2 rounded-full border border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 text-slate-700 hover:text-blue-700 text-xs sm:text-sm font-semibold transition shadow-2xs"
          >
            <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
              <FileSpreadsheet className="w-3 h-3 stroke-[2.5]" />
            </div>
            <span>Importar</span>
          </button>
        </div>
      </div>

      {/* 2. LAYOUT EM DUAS COLUNAS CONFORME O PRINT DO ORGANIZZE */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* COLUNA ESQUERDA: Saldo Geral + Minhas Contas + Meus Cartões */}
        <div className="space-y-6">
          {/* Card Saldo Geral com barra verde vertical à esquerda */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-1.5 h-10 rounded-full bg-emerald-500 shrink-0" />
              <div>
                <div className="text-xs text-slate-500 font-medium">Saldo geral</div>
                <div className="text-2xl font-bold text-slate-900 tracking-tight">
                  {ocultarSaldos ? '••••••••' : formatMoneyBRL(saldoGeral)}
                </div>
              </div>
            </div>

            <button
              onClick={() => setOcultarSaldos(!ocultarSaldos)}
              className="text-slate-400 hover:text-slate-600 p-1"
              title={ocultarSaldos ? 'Exibir saldo' : 'Ocultar saldo'}
            >
              {ocultarSaldos ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>

          {/* Minhas Contas */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="p-4 px-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wallet className="w-4 h-4 text-emerald-600" />
                <h2 className="text-sm font-bold text-slate-800">Minhas contas</h2>
              </div>
              <Link
                to="/contas"
                className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
              >
                <span>Gerenciar</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="divide-y divide-slate-100">
              {contas.length === 0 ? (
                <div className="p-8 text-center space-y-2">
                  <p className="text-xs text-slate-400">Nenhuma conta cadastrada ainda.</p>
                  <Link to="/contas">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs text-emerald-700 border-emerald-200"
                    >
                      Cadastrar Conta
                    </Button>
                  </Link>
                </div>
              ) : (
                contas.map((conta) => {
                  const isNegativo = (conta.saldo_atual || 0) < 0
                  return (
                    <div
                      key={conta.id}
                      className="p-3.5 px-5 flex items-center justify-between hover:bg-slate-50/70 transition"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-2xs"
                          style={{ backgroundColor: conta.cor || '#10B981' }}
                        >
                          <Landmark className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-xs md:text-sm font-semibold text-slate-800">
                            {conta.nome}
                          </div>
                          <div className="text-[11px] text-slate-400">Conta manual</div>
                        </div>
                      </div>

                      <div
                        className={`text-xs md:text-sm font-bold ${
                          isNegativo ? 'text-rose-600' : 'text-blue-600'
                        }`}
                      >
                        {ocultarSaldos ? '••••••' : formatMoneyBRL(conta.saldo_atual)}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* Carteira / Dinheiro em Espécie (EXIBIDO ABAIXO DE MINHAS CONTAS CONFORME PEDIDO) */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="p-4 px-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Banknote className="w-4 h-4 text-emerald-600" />
                <h2 className="text-sm font-bold text-slate-800">Carteira & Dinheiro em Espécie</h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={abrirNovaCarteira}
                  className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
                  title="Adicionar Carteira / Dinheiro em Espécie"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Adicionar</span>
                </button>
                <span className="text-slate-300">•</span>
                <Link
                  to="/meios-pagamento"
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1"
                >
                  <span>Gerenciar</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {carteirasDinheiro.length === 0 ? (
                <div className="p-6 text-center space-y-2">
                  <p className="text-xs text-slate-400">
                    Nenhuma carteira física ou dinheiro em espécie cadastrado.
                  </p>
                  <Button
                    onClick={abrirNovaCarteira}
                    variant="outline"
                    size="sm"
                    className="text-xs text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Adicionar Carteira
                  </Button>
                </div>
              ) : (
                carteirasDinheiro.map((carteira) => {
                  const saldo = carteira.saldo_atual || 0
                  const isNegativo = saldo < 0
                  return (
                    <div
                      key={carteira.id}
                      className="p-3.5 px-5 flex items-center justify-between hover:bg-slate-50/70 transition group"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-2xs"
                          style={{ backgroundColor: carteira.cor || '#10B981' }}
                        >
                          <Banknote className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs md:text-sm font-semibold text-slate-800">
                              {carteira.nome}
                            </span>
                            <button
                              onClick={() => abrirEdicaoCarteira(carteira)}
                              className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-700 transition"
                              title="Editar nome da carteira"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                          </div>
                          <div className="text-[11px] text-slate-400">Dinheiro em espécie</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div
                          className={`text-xs md:text-sm font-bold ${
                            isNegativo
                              ? 'text-rose-600'
                              : saldo > 0
                                ? 'text-emerald-600'
                                : 'text-slate-600'
                          }`}
                        >
                          {ocultarSaldos ? '••••••' : formatMoneyBRL(saldo)}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* Meus Cartões (LAYOUT PEDIDO PELO USUÁRIO: ABAIXO DE MINHAS CONTAS E CARTEIRAS) */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="p-4 px-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-indigo-600" />
                <h2 className="text-sm font-bold text-slate-800">Meus cartões</h2>
              </div>
              <Link
                to="/cartoes"
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
              >
                <span>Gerenciar</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="divide-y divide-slate-100">
              {cartoes.length === 0 ? (
                <div className="p-8 text-center space-y-2">
                  <p className="text-xs text-slate-400">Nenhum cartão cadastrado ainda.</p>
                  <Link to="/cartoes">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs text-indigo-700 border-indigo-200"
                    >
                      Cadastrar Cartão
                    </Button>
                  </Link>
                </div>
              ) : (
                cartoes.map((cartao) => {
                  const fatura = cartao.fatura_atual || 0
                  return (
                    <div
                      key={cartao.id}
                      className="p-3.5 px-5 flex items-center justify-between hover:bg-slate-50/70 transition"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-2xs"
                          style={{ backgroundColor: cartao.cor || '#4F46E5' }}
                        >
                          <CreditCard className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-xs md:text-sm font-semibold text-slate-800">
                            {cartao.nome}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            Fecha dia {cartao.dia_fechamento} • Vence dia {cartao.dia_vencimento}
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <div
                          className={`text-xs md:text-sm font-bold ${
                            fatura > 0 ? 'text-rose-600' : 'text-slate-600'
                          }`}
                        >
                          {ocultarSaldos ? '••••••' : formatMoneyBRL(fatura)}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          Limite: {ocultarSaldos ? '•••' : formatMoneyBRL(cartao.limite)}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>

        {/* COLUNA DIREITA: Maiores gastos do mês atual + Orçamento */}
        <div className="space-y-6">
          {/* Card: Maiores gastos do mês atual (modelo Organizze) */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-4">
            <h2 className="text-sm font-bold text-slate-800">Maiores gastos do mês atual</h2>

            {resumoMes.maioresGastos.length === 0 ? (
              <div className="p-8 text-center space-y-3">
                <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                  <PieIcon className="w-8 h-8" />
                </div>
                <div className="text-xs font-semibold text-slate-700">
                  Nenhum gasto registrado neste mês
                </div>
                <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                  Use os botões de ação rápida no topo para registrar despesas e acompanhar o
                  gráfico de distribuição de categorias.
                </p>
                <Button
                  onClick={() => abrirAcaoRapida('despesa')}
                  variant="outline"
                  size="sm"
                  className="text-xs text-rose-700 border-rose-200 hover:bg-rose-50"
                >
                  <TrendingDown className="w-3.5 h-3.5 mr-1" />
                  Lançar Despesa
                </Button>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
                {/* Lista com ícones e percentuais */}
                <div className="w-full space-y-3 flex-1">
                  {resumoMes.maioresGastos.slice(0, 5).map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center text-white shrink-0"
                          style={{ backgroundColor: item.cor || '#64748B' }}
                        >
                          <div className="w-2 h-2 rounded-full bg-white" />
                        </div>
                        <span className="font-medium text-slate-700 truncate max-w-[150px]">
                          {item.nome}
                        </span>
                      </div>
                      <span className="font-bold text-slate-900">
                        {item.percentual.toFixed(2).replace('.', ',')}%
                      </span>
                    </div>
                  ))}
                </div>

                {/* Gráfico de Rosca Visual Representativo dos Maiores Gastos */}
                <div className="flex flex-col items-center justify-center shrink-0">
                  <div className="relative w-32 h-32 flex items-center justify-center">
                    <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                      {resumoMes.maioresGastos.slice(0, 5).map((item, i, arr) => {
                        let offset = 0
                        for (let j = 0; j < i; j++) offset += arr[j].percentual
                        return (
                          <circle
                            key={i}
                            cx="18"
                            cy="18"
                            r="14"
                            fill="transparent"
                            stroke={item.cor || '#10B981'}
                            strokeWidth="4"
                            strokeDasharray={`${item.percentual} ${100 - item.percentual}`}
                            strokeDashoffset={-offset}
                          />
                        )
                      })}
                    </svg>
                    <div className="absolute flex flex-col items-center justify-center">
                      <span className="text-[10px] text-slate-400 uppercase font-semibold">
                        Total
                      </span>
                      <span className="text-xs font-bold text-slate-800">
                        {formatMoneyBRL(resumoMes.despesaMensal)}
                      </span>
                    </div>
                  </div>

                  <Link to="/orcamento" className="mt-3">
                    <Button variant="outline" size="sm" className="text-[11px] h-7 text-slate-600">
                      Ver detalhes
                    </Button>
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* Card: Orçamento (TRANSFORMADO CONFORME PEDIDO DO USUÁRIO: TÍTULO CENTRALIZADO COM ÍCONE CIRCULAR) */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-slate-900 text-emerald-400 flex items-center justify-center mx-auto shadow-xs">
              <Target className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h2 className="text-base font-bold text-slate-900">Orçamento</h2>
              <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                Aqui você poderá ver todos os seus limites disponíveis por categoria e valores.
              </p>
            </div>

            {orcamentos.length === 0 ? (
              <div className="pt-2">
                <Link to="/orcamento">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100 font-medium"
                  >
                    Definir Orçamento Mensal
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="pt-3 space-y-2.5 text-left border-t border-slate-100">
                {orcamentos.slice(0, 4).map((orc) => {
                  const consumo = orc.consumo_atual || 0
                  const limite = orc.limite || 1
                  const pct = Math.min(100, Math.round((consumo / limite) * 100))
                  return (
                    <div key={orc.id} className="space-y-1">
                      <div className="flex justify-between text-xs font-medium text-slate-700">
                        <span>{orc.categoria?.nome}</span>
                        <span>
                          {formatMoneyBRL(consumo)} / {formatMoneyBRL(orc.limite)}
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${
                            pct >= 80
                              ? 'bg-rose-500'
                              : pct >= 60
                                ? 'bg-amber-500'
                                : 'bg-emerald-500'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}

                <div className="pt-2 text-center">
                  <Link to="/orcamento">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-emerald-600 hover:text-emerald-700"
                    >
                      Ver todos os limites
                    </Button>
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MODAL CADASTRO / EDIÇÃO DE CARTEIRA EM ESPÉCIE */}
      <Dialog open={modalDinheiroOpen} onOpenChange={setModalDinheiroOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSalvarCarteira}>
            <DialogHeader>
              <DialogTitle>
                {carteiraEmEdicao ? 'Editar Carteira em Espécie' : 'Adicionar Carteira em Espécie'}
              </DialogTitle>
              <DialogDescription>
                Ideal para compras à vista em notas, feiras, pequenos trocos e pagamentos sem banco.
              </DialogDescription>
            </DialogHeader>

            <div className="py-4 space-y-3">
              <div>
                <Label htmlFor="carteira-nome" className="text-xs font-semibold text-slate-700">
                  Nome da Carteira / Espécie *
                </Label>
                <Input
                  id="carteira-nome"
                  name="nome"
                  value={nomeCarteira}
                  onChange={(e) => setNomeCarteira(e.target.value)}
                  placeholder="Ex: Dinheiro em Espécie, Carteira do Dia a Dia, Troco"
                  className="mt-1"
                  autoFocus
                  required
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalDinheiroOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={salvandoCarteira}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {salvandoCarteira
                  ? 'Salvando...'
                  : carteiraEmEdicao
                    ? 'Salvar Alterações'
                    : 'Cadastrar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL COMPLETO DE LANÇAMENTOS (BUILD 2) */}
      <ModalLancamento
        open={modalLancamentoOpen}
        onOpenChange={setModalLancamentoOpen}
        onSave={handleSalvarLancamentoVisaoGeral}
        tipoPadrao={tipoLancamentoSelecionado}
        contas={contas}
        cartoes={cartoes}
        categorias={categorias}
        workspaceId={wsId || ''}
        userId={user?.id}
      />
    </div>
  )
}
