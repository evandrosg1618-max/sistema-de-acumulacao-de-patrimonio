/**
 * R6 — Wrapper do ModalLancamento em MODO CAPTURA para o Detalhe do item
 * da revisão NFC-e. A extensão aditiva do modal (0.0.105) devolve o payload
 * validado por onSalvarCaptura e NUNCA cria lançamento; aqui o payload é
 * gravado de volta SOMENTE nos campos do candidato (capturaService.atualizarItem).
 *
 * O modal espera um objeto Lancamento para pré-preencher: convertemos o
 * candidato (CamelCase do modal ← snake_case do candidato) com os meios de
 * pagamento existentes (contas/cartões reais; "Lançamento pago" quando meio
 * for conta/dinheiro — nunca cartão).
 */
import { useMemo } from 'react'
import { ModalLancamento } from '@/components/ModalLancamento'
import { capturaService } from '@/services/captura/capturaService'
import type { CapturaItemRevisao } from '@/components/captura/tiposRevisao'
import type { MeioPagamentoTipo, StatusPagamento } from '@/types/sap'
import type { Categoria, Subcategoria } from '@/types/sap'

interface ModalDetalheItemCapturaProps {
  item: CapturaItemRevisao | null
  open: boolean
  onOpenChange: (open: boolean) => void
  sessaoId: string
  workspaceId: string
  contas: any[]
  cartoes: any[]
  categorias: Categoria[]
  subcategorias: Subcategoria[]
  userId?: string
  /** Callback após gravar o candidato (para a página recarregar estado). */
  onGravado?: (id: string, patch: Partial<CapturaItemRevisao>) => void
}

export function ModalDetalheItemCaptura({
  item,
  open,
  onOpenChange,
  sessaoId,
  workspaceId,
  contas,
  cartoes,
  categorias,
  subcategorias,
  userId,
  onGravado,
}: ModalDetalheItemCapturaProps) {
  // Pré-preenchimento: candidato → formato Lancamento esperado pelo modal.
  const initialData = useMemo(() => {
    if (!item) return null
    const meioPagamento = item.meio_pagamento_tipo
    const resolveMeio = (): { tipo: string; id: string | null } => {
      if (meioPagamento === 'CARTAO') return { tipo: 'cartao', id: item.meio_pagamento_id }
      if (meioPagamento === 'CONTA') return { tipo: 'conta', id: item.meio_pagamento_id }
      return { tipo: 'dinheiro', id: null }
    }
    const meio = resolveMeio()
    const cat = categorias.find((c) => c.id === item.categoria_id)
    // Subcategoria pelo id do candidato; se ausente, herda a primeira da categoria.
    const sub = item.subcategoria_id
      ? subcategorias.find((s) => s.id === item.subcategoria_id)
      : (cat?.subcategorias || [])[0] || null

    return {
      id: item.id,
      workspace_id: workspaceId,
      competencia: (item.data || '').substring(0, 7),
      created_at: '',
      updated_at: '',
      tipo: 'despesa' as const,
      descricao: item.descricao,
      valor: item.valor,
      data: item.data,
      regime: 'unico' as const,
      meio_pagamento_tipo: (meioPagamento || 'DINHEIRO') as MeioPagamentoTipo,
      cartao_id: meio.tipo === 'cartao' ? meio.id : null,
      conta_origem_id: meio.tipo === 'conta' ? meio.id : null,
      categoria_id: item.categoria_id || cat?.id || null,
      subcategoria_id: sub?.id || null,
      modalidade_saida: item.modalidade_saida || 'compra_propria',
      valor_proprio: item.valor_proprio,
      valor_terceiros: item.valor_terceiros,
      afeta_resultado: item.afeta_resultado,
      afeta_orcamento: item.afeta_orcamento,
      observacao: item.observacao,
      status_pagamento: (meioPagamento === 'CARTAO' ? 'pendente' : 'pago') as StatusPagamento,
    }
  }, [item, categorias, subcategorias])

  const gravarNoCandidato = async (payload: any) => {
    if (!item) return
    const meioEncontrado = [...contas, ...cartoes].find(
      (m) => m.id === payload.conta_origem_id || m.id === payload.cartao_id,
    )
    const patch: Partial<CapturaItemRevisao> = {
      descricao: payload.descricao || item.descricao,
      valor: Number(payload.valor) || 0,
      data: payload.data || item.data,
      meio_pagamento_tipo: payload.meio_pagamento_tipo || item.meio_pagamento_tipo,
      meio_pagamento_id:
        payload.meio_pagamento_tipo === 'CARTAO'
          ? payload.cartao_id || null
          : payload.meio_pagamento_tipo === 'CONTA'
            ? payload.conta_origem_id || null
            : item.meio_pagamento_id,
      meio_pagamento_nome: meioEncontrado?.nome || item.meio_pagamento_nome,
      categoria_id: payload.categoria_id || null,
      subcategoria_id: payload.subcategoria_id || null,
      modalidade_saida: payload.modalidade_saida || 'compra_propria',
      valor_proprio:
        payload.modalidade_saida === 'compra_compartilhada'
          ? (payload.valor_proprio ?? null)
          : null,
      valor_terceiros:
        payload.modalidade_saida === 'compra_compartilhada' ||
        payload.modalidade_saida === 'compra_terceiros' ||
        payload.modalidade_saida === 'emprestimo_terceiros'
          ? (payload.valor_terceiros ?? null)
          : null,
      afeta_resultado: payload.afeta_resultado !== false,
      afeta_orcamento: payload.afeta_orcamento !== false,
      observacao: payload.observacao || null,
      atualizado: true,
    }

    // Somente itens persistidos (id real do banco) são gravados; candidatos
    // manuais/agrupados existem só no estado da página.
    if (!item.id.startsWith('manual_') && !item.id.startsWith('grupo_')) {
      await capturaService.atualizarItem(item.id, sessaoId, workspaceId, {
        descricao: patch.descricao,
        valor: patch.valor,
        data: patch.data,
        meio_pagamento_id: patch.meio_pagamento_id,
        meio_pagamento_tipo: patch.meio_pagamento_tipo,
        meio_pagamento_nome: patch.meio_pagamento_nome,
        categoria_id: patch.categoria_id,
        subcategoria_id: patch.subcategoria_id,
        modalidade_saida: patch.modalidade_saida,
        valor_proprio: patch.valor_proprio,
        valor_terceiros: patch.valor_terceiros,
        afeta_resultado: patch.afeta_resultado,
        afeta_orcamento: patch.afeta_orcamento,
        observacao: patch.observacao,
      })
    }

    onGravado?.(item.id, patch)
  }

  return (
    <ModalLancamento
      open={open}
      onOpenChange={onOpenChange}
      onSave={async () => undefined}
      initialData={initialData}
      tipoPadrao="despesa"
      contas={contas}
      cartoes={cartoes}
      categorias={categorias}
      workspaceId={workspaceId}
      userId={userId}
      dataPadrao={item?.data || undefined}
      modoCaptura
      onSalvarCaptura={gravarNoCandidato}
    />
  )
}
