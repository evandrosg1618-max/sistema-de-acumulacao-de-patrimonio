/**
 * A.4 (TESTE CAPTURA 6) — Lote = UMA tela só: o ModalLancamento em modoCaptura
 * com os campos de CONTEÚDO travados (descrição, valor, categoria,
 * subcategoria — camposTravadosCaptura; a DATA passou a ser EDITÁVEL na C.7)
 * e editáveis apenas o que é comum ao lote: data, "Pago com" (ids reais de
 * contas/cartoes), toggle "Lançamento pago", painel Repetir
 * (Fixo/Indeterminado/Parcelado) e "Observações".
 *
 * O botão "Salvar no lote" devolve o ESTADO do formulário e AQUI o estado é
 * traduzido para PatchLoteCaptura (parcial: só o que o usuário marcou é
 * aplicado). O "Pago com" do modal devolve id REAL (contas/cartoes) — o
 * mapeamento de volta para o id da LINHA de meios_pagamento (FK da sessão) é
 * feito pela página, no mesmo caminho do Detalhes (gravarNoCandidato).
 */
import { ModalLancamento } from '@/components/ModalLancamento'
import { PatchLoteCaptura } from '@/components/captura/tiposRevisao'
import { getTodayDateString } from '@/lib/formatters'

/** Meio do lote: linha REAL de meios_pagamento (id = FK da sessão). */
export interface MeioLoteCaptura {
  id: string
  nome: string
  tipo: string
  ativo: boolean
}

/** Resumo comum dos itens selecionados (campos desabilitados). */
export interface ResumoLoteCaptura {
  descricao: string | null
  data: string | null
  valor: number
  categoria: string | null
  subcategoria: string | null
}

interface Props {
  aberto: boolean
  onFechar: () => void
  /** A.5/T3 — o lote AGUARDA a Promise: "Salvar no lote" fica desabilitado
      ("Salvando...") até TODAS as gravações do loop da página terminarem. */
  onAplicar: (patch: PatchLoteCaptura) => void | Promise<void>
  meiosPagamento: MeioLoteCaptura[]
  /** Tipos de meio dos itens SELECIONADOS (distintos, em maiúsculas). */
  tiposMeioSelecionados?: string[]
  quantidadeItens: number
  resumo: ResumoLoteCaptura | null
  /** Lista de categorias repassada ao ModalLancamento. */
  categorias?: any[]
  /** Listas reais repassadas ao ModalLancamento (corpo do Lote). */
  contas?: any[]
  cartoes?: any[]
  workspaceId?: string
}

export function ModalLoteCaptura({
  aberto,
  onFechar,
  onAplicar,
  tiposMeioSelecionados,
  quantidadeItens,
  resumo,
  categorias = [],
  contas = [],
  cartoes = [],
  workspaceId,
}: Props) {
  // A.6/T2 — tipo do meio comum dos itens SELECIONADOS. Quando os itens NÃO
  // têm meio gravado (regra do usuário: nasce vazio), o "Pago com" do Lote
  // abre VAZIO (placeholder "Selecione…") — NUNCA 'DINHEIRO' pré-marcado.
  // Tipo comum só existe se TODOS os selecionados têm o MESMO tipo gravado
  // (última alteração vence); tipos divergentes também abrem vazio.
  const tiposItens = Array.from(
    new Set((tiposMeioSelecionados || []).map((t) => String(t || '').toUpperCase())),
  )
  const temItemSemMeio = (tiposMeioSelecionados || []).length === 0
  const tipoComumItens: string | null =
    temItemSemMeio || tiposItens.length !== 1 ? null : tiposItens[0]

  // A.4 — o ESTADO do formulário do ModalLancamento (payload validado) é
  // traduzido AQUI para PatchLoteCaptura. Patch PARCIAL: só o que o usuário
  // de fato marcou/preencheu é aplicado; o resto fica intacto nos itens.
  const salvarNoLote = async (payload: any) => {
    const patch: PatchLoteCaptura = {}
    // C.7/T2 — a DATA definida no Lote (editável desde a 0.0.143) vai para o
    // patch e a página aplica aos selecionados: última configuração vence.
    if (payload?.data) patch.data = payload.data
    // A.6/T2 — sem "Pago com" escolhido o lote NÃO aplica nada de meio: o
    // ModalLancamento (A.6/T1) já orienta com toast em modoCaptura. A DATA
    // (patch.data) já foi levada acima e ainda assim é aplicada.
    if (!payload?.meio_pagamento_tipo) {
      await onAplicar(patch)
      return
    }
    if (payload?.meio_pagamento_tipo === 'CARTAO' && payload?.cartao_id) {
      patch.meioPagamentoId = payload.cartao_id // id REAL — página mapeia para a linha
      patch.meioPagamentoTipo = 'CARTAO'
      patch.meioPagamentoNome = cartoes.find((c: any) => c.id === payload.cartao_id)?.nome || null
    } else if (payload?.meio_pagamento_tipo === 'CONTA' && payload?.conta_origem_id) {
      patch.meioPagamentoId = payload.conta_origem_id // id REAL — idem
      patch.meioPagamentoTipo = 'CONTA'
      patch.meioPagamentoNome =
        contas.find((c: any) => c.id === payload.conta_origem_id)?.nome || null
    } else if (payload?.meio_pagamento_tipo === 'DINHEIRO') {
      patch.meioPagamentoId = undefined
      patch.meioPagamentoTipo = 'DINHEIRO'
      patch.meioPagamentoNome = 'Dinheiro'
    }
    // Toggle "Lançamento pago": o modal SÓ exibe o toggle quando o meio NÃO é
    // cartão; para cartão, gravamos o usuário pediu "pago/pendente" via
    // status_pagamento (não aplicável: fatura quita). Mantemos o sinal apenas
    // quando o toggle estava visível (meio !== cartão).
    if (payload?.meio_pagamento_tipo !== 'CARTAO') {
      patch.pago = Boolean(payload?.status_pagamento === 'pago')
    }
    // Painel Repetir: marcações do formulário (fixo/parcelado/parâmetros).
    // PatchLoteCaptura persiste repetir como flag (marcado_repetir): os
    // parâmetros de fixo/parcelado do modal NÃO têm coluna no item de captura —
    // a marcação de repetição é o que sobrevive na sessão.
    if (payload?.regime === 'fixo' || payload?.regime === 'parcelado') {
      patch.repetir = true
    }
    if (payload?.observacao) patch.observacao = payload.observacao
    if (Object.keys(patch).length === 0) {
      onFechar()
      return
    }
    await onAplicar(patch)
  }

  const tituloLote = `Lote — ${quantidadeItens} item(ns) • ${(resumo?.valor ?? 0).toLocaleString(
    'pt-BR',
    {
      style: 'currency',
      currency: 'BRL',
    },
  )}`

  return (
    <ModalLancamento
      open={aberto}
      onOpenChange={(o) => {
        if (!o) onFechar()
      }}
      onSave={async () => undefined}
      initialData={
        {
          id: 'lote',
          descricao: resumo?.descricao ?? '(diverge entre itens)',
          valor: resumo?.valor ?? 0,
          data: resumo?.data || getTodayDateString(),
          tipo: 'despesa',
          regime: 'unico',
          categoria_id: null,
          subcategoria_id: null,
          modalidade_saida: 'compra_propria',
          meio_pagamento_tipo: (tipoComumItens || null) as any,
          observacao: null,
        } as any
      }
      tipoPadrao="despesa"
      contas={contas}
      cartoes={cartoes}
      categorias={categorias}
      workspaceId={workspaceId || 'lote'}
      dataPadrao={resumo?.data || undefined}
      modoCaptura
      onSalvarCaptura={salvarNoLote}
      camposTravadosCaptura
      tituloCaptura={tituloLote}
      rotuloBotaoCaptura="Salvar no lote"
      modoCapturaTemMeioGravado={false}
    />
  )
}
