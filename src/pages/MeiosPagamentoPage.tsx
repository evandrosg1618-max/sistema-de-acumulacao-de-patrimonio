import React, { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { meioPagamentoService, contaService, cartaoService } from '@/services/sap'
import { MeioPagamento, Conta, Cartao } from '@/types/sap'
import { formatMoneyBRL } from '@/lib/formatters'
import {
  CreditCard,
  Wallet,
  Banknote,
  Plus,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ShieldCheck,
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
import { toast } from 'sonner'

export default function MeiosPagamentoPage() {
  const { currentWorkspace } = useAuth()
  const [meios, setMeios] = useState<MeioPagamento[]>([])
  const [loading, setLoading] = useState(true)
  const [modalDinheiroOpen, setModalDinheiroOpen] = useState(false)
  const [nomeDinheiro, setNomeDinheiro] = useState('Dinheiro em Espécie / Carteira')
  const [saving, setSaving] = useState(false)

  const wsId = currentWorkspace?.workspace_id

  const carregarMeios = async () => {
    if (!wsId) return
    setLoading(true)
    try {
      const data = await meioPagamentoService.list(wsId)
      setMeios(data)
    } catch (err: any) {
      toast.error('Erro ao carregar meios de pagamento: ' + (err.message || 'tente novamente'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregarMeios()
  }, [wsId])

  const handleToggleAtivo = async (m: MeioPagamento) => {
    if (!wsId) return
    try {
      await meioPagamentoService.toggleAtivo(m.id, wsId, !m.ativo)
      toast.success(`Meio de pagamento "${m.nome}" ${!m.ativo ? 'ativado' : 'desativado'}.`)
      await carregarMeios()
    } catch (err: any) {
      toast.error('Erro ao alternar status: ' + (err.message || 'tente novamente'))
    }
  }

  const handleCriarDinheiro = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!wsId || !nomeDinheiro.trim()) return
    setSaving(true)
    try {
      await meioPagamentoService.createDinheiro(wsId, nomeDinheiro.trim())
      toast.success('Meio em Dinheiro cadastrado com sucesso!')
      setModalDinheiroOpen(false)
      await carregarMeios()
    } catch (err: any) {
      toast.error('Erro ao cadastrar: ' + (err.message || 'tente novamente'))
    } finally {
      setSaving(false)
    }
  }

  const contasMeios = meios.filter((m) => m.tipo === 'CONTA')
  const cartoesMeios = meios.filter((m) => m.tipo === 'CARTAO')
  const dinheiroMeios = meios.filter((m) => m.tipo === 'DINHEIRO')

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900">
              Meios de Pagamento
            </h1>
            <Badge variant="outline" className="text-teal-700 bg-teal-50 border-teal-200 text-xs">
              Build 1
            </Badge>
          </div>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            Vínculo exclusivo e automático: cada Conta e Cartão gera seu próprio Meio de Pagamento
            (chk_meio_exclusivo).
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            onClick={() => setModalDinheiroOpen(true)}
            variant="outline"
            className="text-xs sm:text-sm border-emerald-300 text-emerald-800 bg-emerald-50 hover:bg-emerald-100 flex items-center gap-2"
          >
            <Banknote className="w-4 h-4 text-emerald-600" />
            Adicionar Carteira / Dinheiro
          </Button>
        </div>
      </div>

      {/* Regra de Negócio PRD */}
      <div className="bg-slate-900 text-slate-200 p-4 rounded-xl border border-slate-800 text-xs flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-teal-400 shrink-0 mt-0.5" />
        <div>
          <div className="font-semibold text-white">Regra de Vínculo Exclusivo do PRD SAP:</div>
          <p className="text-slate-300 mt-0.5 leading-relaxed">
            Cada meio pertence a exatamente uma categoria: <strong>CONTA</strong> (vinculado a uma
            conta bancária com liquidação imediata), <strong>CARTÃO</strong> (vinculado a um cartão
            de crédito com faturamento por corte/vencimento) ou <strong>DINHEIRO</strong> (para
            controle em espécie).
          </p>
        </div>
      </div>

      {/* Listas por Tipo */}
      <div className="space-y-6">
        {/* CONTA */}
        <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
          <CardHeader className="pb-3 border-b border-slate-100 bg-slate-50/50">
            <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <Wallet className="w-4 h-4 text-emerald-600" />
              Vinculados a Contas Bancárias ({contasMeios.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 divide-y divide-slate-100">
            {contasMeios.length === 0 ? (
              <div className="p-4 text-xs text-slate-400 text-center">
                Nenhum meio de conta vinculado. Cadastre uma conta em "Minhas Contas".
              </div>
            ) : (
              contasMeios.map((m) => (
                <div
                  key={m.id}
                  className="p-3.5 px-4 flex items-center justify-between hover:bg-slate-50 transition"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                      <Wallet className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{m.nome}</div>
                      <div className="text-xs text-slate-500">
                        Tipo: CONTA • Saldo atual: {formatMoneyBRL(m.conta?.saldo_atual || 0)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge
                      variant={m.ativo ? 'default' : 'secondary'}
                      className={m.ativo ? 'bg-emerald-600 text-white text-[10px]' : 'text-[10px]'}
                    >
                      {m.ativo ? 'Ativo' : 'Inativo'}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleAtivo(m)}
                      className="text-xs text-slate-600 hover:text-slate-900"
                    >
                      {m.ativo ? 'Desativar' : 'Ativar'}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* CARTAO */}
        <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
          <CardHeader className="pb-3 border-b border-slate-100 bg-slate-50/50">
            <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-indigo-600" />
              Vinculados a Cartões de Crédito ({cartoesMeios.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 divide-y divide-slate-100">
            {cartoesMeios.length === 0 ? (
              <div className="p-4 text-xs text-slate-400 text-center">
                Nenhum meio de cartão vinculado. Cadastre um cartão em "Meus Cartões".
              </div>
            ) : (
              cartoesMeios.map((m) => (
                <div
                  key={m.id}
                  className="p-3.5 px-4 flex items-center justify-between hover:bg-slate-50 transition"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
                      <CreditCard className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{m.nome}</div>
                      <div className="text-xs text-slate-500">
                        Tipo: CARTAO • Limite: {formatMoneyBRL(m.cartao?.limite || 0)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge
                      variant={m.ativo ? 'default' : 'secondary'}
                      className={m.ativo ? 'bg-indigo-600 text-white text-[10px]' : 'text-[10px]'}
                    >
                      {m.ativo ? 'Ativo' : 'Inativo'}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleAtivo(m)}
                      className="text-xs text-slate-600 hover:text-slate-900"
                    >
                      {m.ativo ? 'Desativar' : 'Ativar'}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* DINHEIRO */}
        <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
          <CardHeader className="pb-3 border-b border-slate-100 bg-slate-50/50 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <Banknote className="w-4 h-4 text-amber-600" />
              Dinheiro em Espécie & Carteiras Físicas ({dinheiroMeios.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 divide-y divide-slate-100">
            {dinheiroMeios.length === 0 ? (
              <div className="p-4 text-xs text-slate-400 text-center">
                Nenhum meio em espécie cadastrado. Clique no botão superior para criar.
              </div>
            ) : (
              dinheiroMeios.map((m) => (
                <div
                  key={m.id}
                  className="p-3.5 px-4 flex items-center justify-between hover:bg-slate-50 transition"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
                      <Banknote className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{m.nome}</div>
                      <div className="text-xs text-slate-500">
                        Tipo: DINHEIRO (Espécie / Físico)
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge
                      variant={m.ativo ? 'default' : 'secondary'}
                      className={m.ativo ? 'bg-amber-600 text-white text-[10px]' : 'text-[10px]'}
                    >
                      {m.ativo ? 'Ativo' : 'Inativo'}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleAtivo(m)}
                      className="text-xs text-slate-600 hover:text-slate-900"
                    >
                      {m.ativo ? 'Desativar' : 'Ativar'}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Modal Dinheiro */}
      <Dialog open={modalDinheiroOpen} onOpenChange={setModalDinheiroOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleCriarDinheiro}>
            <DialogHeader>
              <DialogTitle>Adicionar Carteira em Espécie</DialogTitle>
              <DialogDescription>
                Ideal para compras à vista em notas, feiras, pequenos trocos e pagamentos sem banco.
              </DialogDescription>
            </DialogHeader>

            <div className="py-4 space-y-3">
              <div>
                <Label htmlFor="nome-dinheiro" className="text-xs font-semibold text-slate-700">
                  Nome da Carteira / Espécie *
                </Label>
                <Input
                  id="nome-dinheiro"
                  value={nomeDinheiro}
                  onChange={(e) => setNomeDinheiro(e.target.value)}
                  className="mt-1"
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
                disabled={saving}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {saving ? 'Cadastrando...' : 'Cadastrar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
