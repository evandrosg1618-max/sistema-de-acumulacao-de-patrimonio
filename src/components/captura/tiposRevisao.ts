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
}

/** Patch da edição em lote: SOMENTE os campos marcados no modal chegam aqui. */
export interface PatchLoteCaptura {
  data?: string
  meioPagamentoId?: string
  modalidade?: string
  afetaResultado?: boolean
  afetaOrcamento?: boolean
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
  }
}

/**
 * R4 — Obrigações do lançamento que o "Pronto" exige (candidato completo):
 * descrição, valor > 0, data, Pago com e subcategoria (quando a modalidade
 * a exige — dispensada em compra_terceiros/emprestimo_terceiros).
 */
export function candidatoEstaCompleto(i: CapturaItemRevisao): boolean {
  if (!i.descricao.trim() || !(i.valor > 0) || !i.data || !i.meio_pagamento_id) return false
  const dispensaSubcategoria =
    i.modalidade_saida === 'compra_terceiros' || i.modalidade_saida === 'emprestimo_terceiros'
  return dispensaSubcategoria || Boolean(i.subcategoria_id)
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
          ...(patch.modalidade !== undefined ? { modalidade_saida: patch.modalidade } : {}),
          ...(patch.afetaResultado !== undefined ? { afeta_resultado: patch.afetaResultado } : {}),
          ...(patch.afetaOrcamento !== undefined ? { afeta_orcamento: patch.afetaOrcamento } : {}),
          atualizado: true,
        }
      : i,
  )
}
