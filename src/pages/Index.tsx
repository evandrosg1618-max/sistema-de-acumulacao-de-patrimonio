import React, { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { supabase } from '@/lib/supabase/client'
import {
  Wallet,
  CreditCard,
  Target,
  ArrowUpRight,
  ArrowDownLeft,
  ShieldCheck,
  TrendingUp,
  Layers,
  Sparkles,
  Building2,
  Calendar,
  AlertCircle,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Link } from 'react-router-dom'

export default function Index() {
  const { currentWorkspace, profile } = useAuth()
  const [stats, setStats] = useState({
    totalContas: 0,
    totalCartoes: 0,
    totalCategorias: 0,
    totalLancamentos: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadStats() {
      if (!currentWorkspace?.workspace_id) {
        setLoading(false)
        return
      }
      setLoading(true)
      try {
        const wsId = currentWorkspace.workspace_id
        const db = supabase as any
        const [
          { count: contasCount },
          { count: cartoesCount },
          { count: categoriasCount },
          { count: lancamentosCount },
        ] = await Promise.all([
          db.from('contas').select('*', { count: 'exact', head: true }).eq('workspace_id', wsId),
          db.from('cartoes').select('*', { count: 'exact', head: true }).eq('workspace_id', wsId),
          db
            .from('categorias')
            .select('*', { count: 'exact', head: true })
            .eq('workspace_id', wsId),
          db
            .from('lancamentos')
            .select('*', { count: 'exact', head: true })
            .eq('workspace_id', wsId),
        ])

        setStats({
          totalContas: contasCount || 0,
          totalCartoes: cartoesCount || 0,
          totalCategorias: categoriasCount || 0,
          totalLancamentos: lancamentosCount || 0,
        })
      } catch (err) {
        console.error('Erro ao buscar estatísticas do workspace:', err)
      } finally {
        setLoading(false)
      }
    }

    loadStats()
  }, [currentWorkspace?.workspace_id])

  const dataAtualFormatada = new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
  }).format(new Date())

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* HEADER VIS-01 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900">
              Visão Geral do Patrimônio Familiar
            </h1>
            <Badge variant="outline" className="text-teal-700 bg-teal-50 border-teal-200 text-xs">
              Build 0 — Fundação
            </Badge>
          </div>
          <p className="text-xs md:text-sm text-slate-500 mt-1 flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-slate-400" />
            <span>
              Workspace:{' '}
              <strong className="text-slate-700">{currentWorkspace?.workspace_nome}</strong>
            </span>
            <span>•</span>
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span className="capitalize">{dataAtualFormatada}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link to="/configuracoes">
            <Button variant="outline" size="sm" className="text-xs">
              Preferências
            </Button>
          </Link>
          <Link to="/auditoria">
            <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white text-xs">
              Trilha de Auditoria
            </Button>
          </Link>
        </div>
      </div>

      {/* BANNER INFORMATIVO DO SAP & BUILD 0 */}
      <div className="bg-gradient-to-r from-teal-900 via-slate-900 to-indigo-950 text-white p-5 md:p-6 rounded-xl shadow-sm border border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex items-center gap-2 text-teal-400 text-xs font-semibold uppercase tracking-wider">
              <ShieldCheck className="w-4 h-4" />
              <span>Fundação Técnica e Segurança Conectadas ao Supabase</span>
            </div>
            <h2 className="text-lg md:text-xl font-bold text-white">
              Sistema de Acumulação de Capital (SAP)
            </h2>
            <p className="text-xs md:text-sm text-slate-300 leading-relaxed">
              Sistema de controle financeiro e patrimonial familiar. A Build 0 estabelece a base com
              isolamento por workspaces, autenticação real, Row-Level Security em 24 tabelas
              financeiras, auditoria e shell responsivo.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row md:flex-col gap-2 shrink-0">
            <div className="bg-white/10 backdrop-blur px-3 py-2 rounded-lg border border-white/10 text-xs">
              <div className="text-[10px] text-teal-300 uppercase font-semibold">Perfil Atual</div>
              <div className="font-bold text-white text-sm">
                {currentWorkspace?.perfil || 'Administrador'}
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur px-3 py-2 rounded-lg border border-white/10 text-xs">
              <div className="text-[10px] text-teal-300 uppercase font-semibold">Segurança RLS</div>
              <div className="font-bold text-emerald-400 text-xs flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Ativa e Verificada
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CARDS VIS-01: SALDO, RECEITAS, DESPESAS E ORÇAMENTO (SHELL VISUAL) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card Saldo Geral */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-slate-500">
              Saldo Geral Consolidado
            </CardTitle>
            <div className="w-7 h-7 rounded-md bg-teal-50 text-teal-600 flex items-center justify-center">
              <Wallet className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-xl md:text-2xl font-bold text-slate-900">R$ 0,00</div>
            <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
              <span>{stats.totalContas} contas ativas</span>
              <span className="text-slate-300">•</span>
              <span className="text-teal-600">Disponível</span>
            </p>
          </CardContent>
        </Card>

        {/* Card Receitas Previstas/Realizadas */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-slate-500">Receitas do Mês</CardTitle>
            <div className="w-7 h-7 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ArrowDownLeft className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-xl md:text-2xl font-bold text-emerald-600">R$ 0,00</div>
            <p className="text-[11px] text-slate-500 mt-1">Realizado / Previsto</p>
          </CardContent>
        </Card>

        {/* Card Despesas Previstas/Realizadas */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-slate-500">Despesas do Mês</CardTitle>
            <div className="w-7 h-7 rounded-md bg-rose-50 text-rose-600 flex items-center justify-center">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-xl md:text-2xl font-bold text-rose-600">R$ 0,00</div>
            <p className="text-[11px] text-slate-500 mt-1">Consumo do orçamento</p>
          </CardContent>
        </Card>

        {/* Card Meta de Acumulação */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-slate-500">
              Acumulação de Capital
            </CardTitle>
            <div className="w-7 h-7 rounded-md bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Target className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-xl md:text-2xl font-bold text-indigo-600">0,0%</div>
            <p className="text-[11px] text-slate-500 mt-1">Meta de independência</p>
          </CardContent>
        </Card>
      </div>

      {/* ROADMAP DAS 8 BUILDS CONFORME O PRD */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <Layers className="w-4 h-4 text-teal-600" />
            Plano Estruturado das 8 Builds do PRD SAP
          </CardTitle>
          <CardDescription className="text-xs">
            Cada build implementa incrementalmente a cadeia financeira familiar sem violar os
            critérios de aceite.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg border border-teal-300 bg-teal-50/60 relative">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-bold text-teal-900 uppercase">
                  Build 0 — Fundação
                </span>
                <Badge className="bg-teal-700 text-white text-[10px] px-1.5 py-0">Atual</Badge>
              </div>
              <p className="text-xs text-teal-800 font-medium">
                Supabase, Auth real, Workspaces, RLS e Shell Responsivo.
              </p>
              <div className="text-[10px] text-teal-700 mt-2 font-mono">Concluído e auditado</div>
            </div>

            <div className="p-3 rounded-lg border border-slate-200 bg-white">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-bold text-slate-700 uppercase">
                  Build 1 — Cadastros
                </span>
                <Badge variant="outline" className="text-slate-400 text-[10px] px-1.5 py-0">
                  Próximo
                </Badge>
              </div>
              <p className="text-xs text-slate-600">
                Contas, cartões, categorias, subcategorias e admin de usuários.
              </p>
              <div className="text-[10px] text-slate-400 mt-2">Especificação pronta</div>
            </div>

            <div className="p-3 rounded-lg border border-slate-200 bg-white">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-bold text-slate-700 uppercase">
                  Build 2 — Lançamentos
                </span>
                <Badge variant="outline" className="text-slate-400 text-[10px] px-1.5 py-0">
                  Pendente
                </Badge>
              </div>
              <p className="text-xs text-slate-600">
                Lançamentos únicos, transferências, movimentações e calculadora.
              </p>
              <div className="text-[10px] text-slate-400 mt-2">Visão VIS-02 a VIS-12</div>
            </div>

            <div className="p-3 rounded-lg border border-slate-200 bg-white">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-bold text-slate-700 uppercase">
                  Build 3 — Cartões
                </span>
                <Badge variant="outline" className="text-slate-400 text-[10px] px-1.5 py-0">
                  Pendente
                </Badge>
              </div>
              <p className="text-xs text-slate-600">
                Competência por corte, parcelas 1/N e faturas abertas.
              </p>
              <div className="text-[10px] text-slate-400 mt-2">Visão VIS-03 e VIS-04</div>
            </div>

            <div className="p-3 rounded-lg border border-slate-200 bg-white">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-bold text-slate-700 uppercase">
                  Build 4 — Pagamentos
                </span>
                <Badge variant="outline" className="text-slate-400 text-[10px] px-1.5 py-0">
                  Pendente
                </Badge>
              </div>
              <p className="text-xs text-slate-600">
                Pagar/estornar fatura e despesas não cartão, idempotência.
              </p>
              <div className="text-[10px] text-slate-400 mt-2">RPCs transacionais</div>
            </div>

            <div className="p-3 rounded-lg border border-slate-200 bg-white">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-bold text-slate-700 uppercase">
                  Build 5 — Fixos
                </span>
                <Badge variant="outline" className="text-slate-400 text-[10px] px-1.5 py-0">
                  Pendente
                </Badge>
              </div>
              <p className="text-xs text-slate-600">
                Séries recorrentes, materialização mensal e escopos de alteração.
              </p>
              <div className="text-[10px] text-slate-400 mt-2">Sem antecipar cartão</div>
            </div>

            <div className="p-3 rounded-lg border border-slate-200 bg-white">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-bold text-slate-700 uppercase">
                  Build 6 — Orçamento
                </span>
                <Badge variant="outline" className="text-slate-400 text-[10px] px-1.5 py-0">
                  Pendente
                </Badge>
              </div>
              <p className="text-xs text-slate-600">
                Limite mensal, consumo integral na compra e barras 60/80%.
              </p>
              <div className="text-[10px] text-slate-400 mt-2">Visão VIS-14</div>
            </div>

            <div className="p-3 rounded-lg border border-slate-200 bg-white">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-bold text-slate-700 uppercase">
                  Build 7 — Metas
                </span>
                <Badge variant="outline" className="text-slate-400 text-[10px] px-1.5 py-0">
                  Pendente
                </Badge>
              </div>
              <p className="text-xs text-slate-600">
                Comprometimento geral, acumulação, liberdade e relatórios.
              </p>
              <div className="text-[10px] text-slate-400 mt-2">Visão VIS-13</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
