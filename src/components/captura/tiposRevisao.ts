/**
 * Modelo do CANDIDATO de revisão do fluxo NFC-e (SAP v0.0.100).
 * CONTRATO ÚNICO do candidato de revisão — CapturaItemRevisao — usado pela
 * página, pela LinhaRevisaoCaptura e pelos modais de lote/agrupamento.
 * Campos do banco em snake_case; flags de tela em camelCase; o mapeamento
 * entre o front e o banco vive SÓ aqui.
 * Candidatos NUNCA criam lançamento por si — só a confirmação do usuário
 * na importação (lancamentoService.create).
 */

import type { ItemCandidatoOcr } from '@/services/captura/nfceParser'
import type { CapturaSessaoItem } from '@/services/captura/capturaService'

export type StatusCandidato = 'pronto' | 'revisar' | 'repetido' | 'erro' | 'importado'

export interface CapturaItemRevisao {
  id: string
  selecionado: boolean
  descricao: string
  valor: number
  status: StatusCandidato
  confianca: 'alta' | 'baixa'
  /** Candidato resultante de AGRUPAMENTO (exclusivo com os individuais). */
  agrupado?: boolean
  /** IDs dos itens originais quando agrupado (rastreabilidade em sessão). */
  idsOriginais?: string[]
  /** Flag visual: linha recém-editada/aplicada em lote. */
  atualizado?: boolean
  data: string | null
  meio_pagamento_id: string | null
  meio_pagamento_tipo: string | null
  meio_pagamento_nome: string | null
  categoria_id: string | null
  subcategoria_id: string | null
  modalidade_saida: string | null
  valor_proprio: number | null
  valor_terceiros: number | null
  afeta_resultado: boolean
  afeta_orcamento: boolean
  observacao: string | null
  /** T4 — marcações do lote persistidas (pago/repetir). */
  marcado_pago: boolean
  marcado_repetir: boolean
  /** T2 — ID do lançamento já criado para o item (null = não importado). */
  lancamento_criado_id: string | null
  /** T5 — mensagem de erro de importação do item (null = sem erro). */
  mensagem_erro?: string | null
}

/** Patch da edição em lote: SOMENTE os campos marcados no modal chegam aqui.
 * T4 — campo ausente (undefined) = NÃO marcado: fica intacto no item. */
export interface PatchLoteCaptura {
  data?: string
  meioPagamentoId?: string
  /** Tipo/nome do meio escolhido acompanham o id (importação roteia pelo tipo). */
  meioPagamentoTipo?: string
  meioPagamentoNome?: string
  /** Toggle "Pago" (apenas conta/dinheiro): undefined = não marcado. */
  pago?: boolean
  /** Botão "Repetir" (apenas cartão): undefined = não marcado. */
  repetir?: boolean
  modalidade?: string
  observacao?: string
}

/**
 * T1 (TESTE CAPTURA 5 v2) — Resolve o id REAL (contas/cartoes) de um meio de
 * pagamento. Fonte do bug da FK (lancamentos_cartao_id_fkey): o seletor
 * gravava o id da LINHA de meios_pagamento, que não existe em
 * public.cartoes/public.contas → "Cartão inválido" na importação.
 *
 * Regra:
 * - DINHEIRO não vira FK: devolve o próprio id da linha (nunca nula na FK).
 * - Linha vinculada (cartao_id/conta_id preenchidos): devolve esse id REAL.
 * - Linha SEM vínculo: se `idsContasCartoes` foi informado, o id só é aceito
 *   quando existe em contas/cartoes (id órfão → null = "valor vazio").
 */
export interface MeioReferenciaCaptura {
  id?: string | null
  tipo?: string | null
  conta_id?: string | null
  cartao_id?: string | null
  nome?: string | null
}

export function idRealDeMeio(
  meio: MeioReferenciaCaptura | null | undefined,
  idsContasCartoes?: Set<string> | null,
): string | null {
  if (!meio) return null
  const tipo = String(meio.tipo || '').toUpperCase()
  if (tipo === 'DINHEIRO') return meio.id || null
  const real = meio.cartao_id || meio.conta_id || null
  if (real) return real
  const id = meio.id || null
  if (!id) return null
  if (idsContasCartoes) return idsContasCartoes.has(id) ? id : null
  return id
}

let seq = 0
function novoId(): string {
  seq += 1
  return `cand_${Date.now().toString(36)}_${seq}`
}

/** Candidato OCR → linha editável do front (contrato único). */
export function candidatoDeItem(
  item: ItemCandidatoOcr,
  dataSugerida: string | null,
): CapturaItemRevisao {
  return {
    id: novoId(),
    // Item marcado como repetido entre capturas nasce DESELECIONADO:
    // cabe ao usuário confirmar se é mesmo um item duplicado.
    selecionado: item.status !== 'repetido',
    descricao: item.descricao,
    valor: item.valor,
    status: item.status,
    confianca: item.confianca,
    data: dataSugerida,
    meio_pagamento_id: null,
    meio_pagamento_tipo: null,
    meio_pagamento_nome: null,
    categoria_id: null,
    subcategoria_id: null,
    modalidade_saida: 'compra_propria',
    valor_proprio: null,
    valor_terceiros: null,
    afeta_resultado: true,
    afeta_orcamento: true,
    observacao: null,
    marcado_pago: false,
    marcado_repetir: false,
    lancamento_criado_id: null,
    mensagem_erro: null,
  }
}

/** Item do banco (snake_case) → linha editável do front (contrato único). */
export function itemDbParaRevisao(i: CapturaSessaoItem): CapturaItemRevisao {
  return {
    id: i.id,
    selecionado: Boolean(i.selecionado),
    descricao: i.descricao,
    valor: Number(i.valor || 0),
    status: (i.status as StatusCandidato) || 'pronto',
    confianca: i.confianca === 'baixa' ? 'baixa' : 'alta',
    data: i.data,
    meio_pagamento_id: i.meio_pagamento_id,
    meio_pagamento_tipo: i.meio_pagamento_tipo,
    meio_pagamento_nome: i.meio_pagamento_nome,
    categoria_id: i.categoria_id,
    subcategoria_id: i.subcategoria_id,
    modalidade_saida: i.modalidade_saida,
    valor_proprio: i.valor_proprio,
    valor_terceiros: i.valor_terceiros,
    afeta_resultado: i.afeta_resultado !== false,
    afeta_orcamento: i.afeta_orcamento !== false,
    observacao: i.observacao,
    marcado_pago: Boolean(i.marcado_pago),
    marcado_repetir: Boolean(i.marcado_repetir),
    lancamento_criado_id: i.lancamento_criado_id || null,
    mensagem_erro: i.mensagem_erro || null,
  }
}

/** Linha editável do front → registro para persistir (snake_case do banco). */
export function revisaoParaItemDb(i: CapturaItemRevisao) {
  return {
    descricao: i.descricao.trim() || '(sem descrição)',
    valor: Number(i.valor.toFixed(2)),
    status: i.status,
    confianca: i.confianca,
    data: i.data,
    meio_pagamento_id: i.meio_pagamento_id,
    meio_pagamento_tipo: i.meio_pagamento_tipo,
    meio_pagamento_nome: i.meio_pagamento_nome,
    categoria_id: i.categoria_id,
    subcategoria_id: i.subcategoria_id,
    modalidade_saida: i.modalidade_saida,
    valor_proprio: i.valor_proprio,
    valor_terceiros: i.valor_terceiros,
    afeta_resultado: i.afeta_resultado,
    afeta_orcamento: i.afeta_orcamento,
    observacao: i.observacao,
    marcado_pago: Boolean(i.marcado_pago),
    marcado_repetir: Boolean(i.marcado_repetir),
  }
}

/**
 * R4 — Obrigações do lançamento que o "Pronto" exige (candidato completo):
 * descrição, valor > 0, data, Pago com e subcategoria (quando a modalidade
 * a exige — dispensada em compra_terceiros/emprestimo_terceiros).
 */
export function candidatoEstaCompleto(i: CapturaItemRevisao): boolean {
  if (!i.descricao.trim() || !(i.valor > 0) || !i.data || !i.meio_pagamento_id) return false
  // A.6 — em captura a subcategoria NÃO é obrigatória (já vem pré-configurada
  // em "Detalhes" ou "Agrupamento"): o Pronto não a exige.
  return true
}

/** Aplica a edição em lote SOMENTE nos campos marcados (PatchLoteCaptura). */
export function aplicarPatchLote(
  itens: CapturaItemRevisao[],
  idsSelecionados: string[],
  patch: PatchLoteCaptura,
): CapturaItemRevisao[] {
  return itens.map((i) =>
    idsSelecionados.includes(i.id)
      ? {
          ...i,
          ...(patch.data !== undefined ? { data: patch.data } : {}),
          ...(patch.meioPagamentoId !== undefined
            ? { meio_pagamento_id: patch.meioPagamentoId }
            : {}),
          ...(patch.meioPagamentoTipo !== undefined
            ? { meio_pagamento_tipo: patch.meioPagamentoTipo }
            : {}),
          ...(patch.meioPagamentoNome !== undefined
            ? { meio_pagamento_nome: patch.meioPagamentoNome }
            : {}),
          ...(patch.pago !== undefined ? { marcado_pago: patch.pago } : {}),
          ...(patch.repetir !== undefined ? { marcado_repetir: patch.repetir } : {}),
          ...(patch.modalidade !== undefined ? { modalidade_saida: patch.modalidade } : {}),
          ...(patch.observacao !== undefined ? { observacao: patch.observacao } : {}),
          atualizado: true,
        }
      : i,
  )
}
