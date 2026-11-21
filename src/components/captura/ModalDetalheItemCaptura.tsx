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
import { toast } from '@/hooks/use-toast'
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
  /** Meios já VALIDADOS pela página (ids reais de contas/cartoes) — T6/A2. */
  meiosValidados?: any[]
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
  meiosValidados,
  userId,
  onGravado,
}: ModalDetalheItemCapturaProps) {
  // Pré-preenchimento: candidato → formato Lancamento esperado pelo modal.
  const initialData = useMemo(() => {
    if (!item) return null
    // A2 — o meio gravado no Lote é a REFERÊNCIA: se o item não tem meio
    // (ou tem id órfão), herda o meio validado da SESSÃO — o campo "Pago com"
    // do Detalhes NUNCA abre em branco.
    const tipoHerda = String(item.meio_pagamento_tipo || '').toUpperCase()
    // A.3 — o candidato grava o id da LINHA de meios_pagamento; para apenas
    // PRÉ-SELECIONAR o "Pago com" do modal, a linha é traduzida ao id real
    // (cartao_id/conta_id) — o que volta no payload é mapeado de volta para a
    // linha em gravarNoCandidato.
    const linhaMeio = (meiosValidados || []).find((m) => m?.id === item.meio_pagamento_id)
    const idValido = Boolean(item.meio_pagamento_id && linhaMeio)
    const meioRef: { tipo: string | null; id: string | null } = idValido
      ? {
          tipo: item.meio_pagamento_tipo,
          id: linhaMeio!.cartao_id || linhaMeio!.conta_id || null,
        }
      : { tipo: null, id: null }
    const meioPagamento = meioRef.tipo || item.meio_pagamento_tipo
    const resolveMeio = (): { tipo: string; id: string | null } => {
      if (meioPagamento === 'CARTAO') return { tipo: 'cartao', id: meioRef.id }
      if (meioPagamento === 'CONTA') return { tipo: 'conta', id: meioRef.id }
      if (meioRef.id && tipoHerda === 'DINHEIRO') return { tipo: 'dinheiro', id: meioRef.id }
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
  }, [item, categorias, subcategorias, meiosValidados, contas, cartoes])

  const gravarNoCandidato = async (payload: any) => {
    if (!item) return
    // A.3 — o candidato grava o id da LINHA de meios_pagamento (FK da sessão).
    // O payload do modal traz o id REAL (cartao_id/conta_origem_id): mapear
    // DE VOLTA para a linha correspondente em meiosValidados. Gravar os
    // Detalhes SEM tocar no "Pago com" devolve o mesmo id de linha já gravado
    // (item.meio_pagamento_id) — o meio do Lote nunca se perde.
    const tipoMeioPayload = String(payload.meio_pagamento_tipo || '').toUpperCase()
    // A.5/T2 — último-alteração-vence: o "Pago com" do payload SEMPRE manda
    // sobre o que já estava no candidato (Detalhes→Lote ou Lote→Detalhes,
    // qualquer ordem). DINHEIRO resolve a LINHA DINHEIRO do cadastro (mesmo
    // critério do caminho do Lote na página) — o item sai de "A Revisar".
    const linhaDeVolta =
      tipoMeioPayload === 'CARTAO' && payload.cartao_id
        ? (meiosValidados || []).find((m) => m?.cartao_id === payload.cartao_id)
        : tipoMeioPayload === 'CONTA' && payload.conta_origem_id
          ? (meiosValidados || []).find((m) => m?.conta_id === payload.conta_origem_id)
          : tipoMeioPayload === 'DINHEIRO'
            ? (meiosValidados || []).find((m) => String(m?.tipo || '').toUpperCase() === 'DINHEIRO')
            : null
    const patch: Partial<CapturaItemRevisao> = {
      descricao: payload.descricao || item.descricao,
      valor: Number(payload.valor) || 0,
      data: payload.data || item.data,
      meio_pagamento_tipo: payload.meio_pagamento_tipo || item.meio_pagamento_tipo || 'DINHEIRO',
      meio_pagamento_id: linhaDeVolta?.id || null,
      meio_pagamento_nome: linhaDeVolta?.nome || null,
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
    // manuais/agrupados existem só no estado da página. Em erro de PERSISTÊNCIA,
    // a edição continua válida em memória: a tela volta à revisão e o item
    // vira "Pronto" normalmente (do 2º item em diante também).
    if (!item.id.startsWith('manual_') && !item.id.startsWith('grupo_')) {
      try {
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
      } catch (e: any) {
        // A.5/T4 — erro orientado ao usuário, MAS o patch segue em memória
        // (onGravado sempre chamado) para a revisão não travar. A gravação
        // dos Detalhes NUNCA derruba a página no error boundary.
        console.error('Falha ao gravar item nos Detalhes:', item.id, e)
        toast({
          title: 'Aviso: edição aplicada apenas nesta tela',
          description:
            'Não foi possível salvar no banco agora, mas o item foi atualizado na revisão. Verifique sua conexão.',
          variant: 'destructive',
        })
      }
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
