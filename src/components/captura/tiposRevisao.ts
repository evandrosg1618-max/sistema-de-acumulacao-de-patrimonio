/**
 * Modelo do CANDIDATO de revisão do fluxo NFC-e (SAP v0.0.98).
 * Candidatos NUNCA criam lançamento por si — só a confirmação do usuário
 * na importação (lancamentoService.create).
 */

import type { ItemCandidatoOcr } from '@/services/captura/nfceParser'
import type { CapturaSessaoItem } from '@/services/captura/capturaService'

export type StatusCandidato = 'pronto' | 'revisar' | 'repetido'

export interface CandidatoRevisao {
  id: string
  selecionado: boolean
  /** Candidato resultante de AGRUPAMENTO (exclusivo com os individuais). */
  ehGrupo: boolean
  /** Itens originais preservados para desfazer o agrupamento. */
  originais: CandidatoRevisao[]
  descricao: string
  valor: number
  data: string | null
  /** null = herda o "Pago com" padrão da sessão. */
  meioPagamentoId: string | null
  categoriaId: string | null
  subcategoriaId: string | null
  modalidade: string
  valorProprio: number | null
  valorTerceiros: number | null
  afetaResultado: boolean
  afetaOrcamento: boolean
  observacao: string
  status: StatusCandidato
  confianca: 'alta' | 'baixa'
}

let seq = 0
function novoId(): string {
  seq += 1
  return `cand_${Date.now().toString(36)}_${seq}`
}

const base = (): Omit<CandidatoRevisao, 'id' | 'descricao' | 'valor' | 'status' | 'confianca'> => ({
  selecionado: true,
  ehGrupo: false,
  originais: [],
  data: null,
  meioPagamentoId: null,
  categoriaId: null,
  subcategoriaId: null,
  modalidade: 'compra_propria',
  valorProprio: null,
  valorTerceiros: null,
  afetaResultado: true,
  afetaOrcamento: true,
  observacao: '',
})

export function candidatoDeItem(
  item: ItemCandidatoOcr,
  dataSugerida: string | null,
): CandidatoRevisao {
  return {
    id: novoId(),
    ...base(),
    // Item marcado como repetido entre capturas nasce DESELECIONADO:
    // cabe ao usuário confirmar se é mesmo um item duplicado.
    selecionado: item.status !== 'repetido',
    descricao: item.descricao,
    valor: item.valor,
    status: item.status,
    confianca: item.confianca,
    data: dataSugerida,
  }
}

export function candidatoDeItemDb(i: CapturaSessaoItem): CandidatoRevisao {
  const status: StatusCandidato =
    i.status === 'repetido' ? 'repetido' : i.status === 'revisar' ? 'revisar' : 'pronto'
  return {
    id: i.id,
    ...base(),
    selecionado: Boolean(i.selecionado),
    descricao: i.descricao,
    valor: Number(i.valor || 0),
    status,
    confianca: i.confianca === 'baixa' ? 'baixa' : 'alta',
    data: i.data,
    meioPagamentoId: i.meio_pagamento_id,
    categoriaId: i.categoria_id,
    subcategoriaId: i.subcategoria_id,
    modalidade: i.modalidade_saida || 'compra_propria',
    valorProprio: i.valor_proprio,
    valorTerceiros: i.valor_terceiros,
    afetaResultado: i.afeta_resultado !== false,
    afetaOrcamento: i.afeta_orcamento !== false,
    observacao: i.observacao || '',
  }
}

/** Candidato → linha para persistir via capturaService.substituirItens. */
export function candidatoParaItemDb(c: CandidatoRevisao) {
  return {
    descricao: c.descricao.trim() || '(sem descrição)',
    valor: Number(c.valor.toFixed(2)),
    status: c.status,
    confianca: c.confianca,
    data: c.data,
    meio_pagamento_id: c.meioPagamentoId,
    meio_pagamento_tipo: null,
    meio_pagamento_nome: null,
    categoria_id: c.categoriaId,
    subcategoria_id: c.subcategoriaId,
    modalidade_saida: c.modalidade,
    valor_proprio: c.valorProprio,
    valor_terceiros: c.valorTerceiros,
    afeta_resultado: c.afetaResultado,
    afeta_orcamento: c.afetaOrcamento,
    observacao: c.observacao || null,
  }
}
