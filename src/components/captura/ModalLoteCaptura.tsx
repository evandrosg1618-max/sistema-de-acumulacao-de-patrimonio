/**
 * A1 (TESTE CAPTURA 6) — Lote = Detalhes: o Lote abre a MESMA tela do
 * Detalhes (ModalLancamento em modoCaptura), com descrição, data, valor,
 * categoria e subcategoria DESABILITADOS (são do conteúdo de cada item) e
 * editáveis apenas os campos comuns do lote:
 *  - "Pago com" (T1): lista de meios com ids REAIS de contas/cartoes
 *    (meiosReais da página) — id de meios_pagamento nunca sai daqui;
 *  - toggle "Pago" (conta/dinheiro) e botão "Repetir" (cartão);
 *  - "Observações".
 * O patch segue parcial: só o que o usuário marcar/preencher é aplicado
 * (aplicarLote da página já faz patch campo a campo via aplicarPatchLote).
 */
import { useEffect, useState } from 'react'
import { ModalLancamento } from '@/components/ModalLancamento'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { PatchLoteCaptura } from '@/components/captura/tiposRevisao'
import { formatMoneyBRL, getTodayDateString } from '@/lib/formatters'
import { valorDeTextoMonetarioBR } from '@/lib/monetario'

/** Meio do lote: id REAL de contas/cartoes (ou linha dinheiro), já validado. */
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
  onAplicar: (patch: PatchLoteCaptura) => void
  meiosPagamento: MeioLoteCaptura[]
  /** Tipos de meio dos itens SELECIONADOS (distintos, em maiúsculas). */
  tiposMeioSelecionados?: string[]
  quantidadeItens: number
  resumo: ResumoLoteCaptura | null
  /** Lista de categorias/subcategorias para o seletor DESABILITADO do lote. */
  categorias?: any[]
  subcategorias?: any[]
}

export function ModalLoteCaptura({
  aberto,
  onFechar,
  onAplicar,
  meiosPagamento,
  tiposMeioSelecionados,
  quantidadeItens,
  resumo,
  categorias = [],
  subcategorias = [],
}: Props) {
  // Marcações do lote (o que o usuário de fato marcar é o que aplica).
  const [pago, setPago] = useState<boolean | undefined>(undefined)
  const [repetir, setRepetir] = useState<boolean | undefined>(undefined)
  const [observacao, setObservacao] = useState('')
  const [meioId, setMeioId] = useState('')

  // P1 (A.2) — quando o painel de opções de repetição (fixo/parcelado) do
  // ModalLancamento está aberto, o painel fixo do Lote SE ESCONDE: ele é
  // position:fixed bottom-0 e sobrepõe o painel dentro do Dialog em telas
  // mobile (o toque em "Repetir" parecia não fazer nada). Ao fechar as opções,
  // o painel do Lote volta.
  const [opcoesRepeticaoAbertas, setOpcoesRepeticaoAbertas] = useState(false)

  // Reset ao abrir: nada marcado (patch parcial — só o marcado é aplicado).
  useEffect(() => {
    if (aberto) {
      setPago(undefined)
      setRepetir(undefined)
      setObservacao('')
      setMeioId('')
    }
  }, [aberto])

  // Tipo do meio escolhido define qual controle extra aparece:
  // conta/dinheiro → "Pago"; cartão (e similares) → "Repetir".
  // Sem meio escolhido, vale o tipo COMUM dos itens selecionados
  // (tipos divergentes → nenhum dos dois controles aparece).
  const meioSelecionado = meiosPagamento.find((m) => m.id === meioId)
  const tipoMeioEscolhido = String(meioSelecionado?.tipo || '').toUpperCase()
  const tiposItens = Array.from(
    new Set((tiposMeioSelecionados || []).map((t) => String(t || '').toUpperCase())),
  )
  const tipoComumItens = tiposItens.length === 1 ? tiposItens[0] : null
  const tipoEfetivo = tipoMeioEscolhido || tipoComumItens || ''
  const meioEhCartao = tipoEfetivo.includes('CARTAO') || tipoEfetivo.includes('CARTÃO')
  const meioEhContaDinheiro = tipoEfetivo === 'CONTA' || tipoEfetivo === 'DINHEIRO'

  const aplicar = () => {
    const patch: PatchLoteCaptura = {}
    if (meioSelecionado) {
      // T1 — o id do meio vai VALIDADO (lista meiosReais da página: ids reais
      // de contas/cartoes). Tipo/nome acompanham: a importação roteia por tipo.
      patch.meioPagamentoId = meioSelecionado.id
      patch.meioPagamentoTipo = meioSelecionado.tipo
      patch.meioPagamentoNome = meioSelecionado.nome
    }
    if (pago !== undefined) patch.pago = pago
    if (repetir !== undefined) patch.repetir = repetir
    if (observacao.trim()) patch.observacao = observacao.trim()
    if (Object.keys(patch).length === 0) {
      onFechar()
      return
    }
    onAplicar(patch)
    onFechar()
  }

  const temTipoComum = meioEhCartao || meioEhContaDinheiro

  return (
    <>
      {/* Corpo do lote = MESMA tela do Detalhes (ModalLancamento modoCaptura)
          com campos de CONTEÚDO desabilitados. onSalvarCaptura é ignorado:
          o salvamento do lote é o botão "Salvar no lote" (patch parcial). */}
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
            meio_pagamento_tipo: (tipoComumItens || 'DINHEIRO') as any,
            observacao: null,
          } as any
        }
        tipoPadrao="despesa"
        contas={[]}
        cartoes={[]}
        categorias={categorias}
        workspaceId="lote"
        dataPadrao={resumo?.data || undefined}
        modoCaptura
        onSalvarCaptura={async () => undefined}
        camposTravadosCaptura
        onOpcoesRepeticaoChange={setOpcoesRepeticaoAbertas}
      />

      {/* Painel de marcações do LOTE — sobreposto ao modal (o corpo é a tela
          do Detalhes com os campos de conteúdo travados; aqui só o que é
          comum ao lote é editável). */}
      {opcoesRepeticaoAbertas && (
        <div className="fixed inset-x-0 bottom-0 z-[70] flex justify-center p-3 pointer-events-none">
          <span className="pointer-events-auto rounded-full bg-slate-900/80 px-3 py-1 text-[11px] font-semibold text-white shadow-lg">
            Escolha Fixo ou Parcelado — feche para voltar ao Lote
          </span>
        </div>
      )}
      {!opcoesRepeticaoAbertas && (
        <div className="fixed inset-x-0 bottom-0 z-[70] border-t border-slate-200 bg-white p-3 shadow-2xl">
          <div className="max-w-md mx-auto space-y-2">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
              Lote — {quantidadeItens} item(ns) • {formatMoneyBRL(resumo?.valor ?? 0)}
            </p>

            {/* "Pago com" — ids REAIS de contas/cartoes (T1) */}
            <div className="space-y-1">
              <Label className="text-xs text-slate-600">Pago com (aplicado a todos)</Label>
              <select
                value={meioId}
                onChange={(e) => setMeioId(e.target.value)}
                className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-900"
              >
                <option value="">Selecione...</option>
                {meiosPagamento
                  .filter((m) => m.ativo)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome}
                    </option>
                  ))}
              </select>
            </div>

            {/* "Pago": visível quando o meio (escolhido OU o comum dos itens) é
              conta ou dinheiro. Indeterminado = não marcado (não aplica). */}
            {meioEhContaDinheiro && (
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs text-slate-600">Pago (lançamento já quitado)</Label>
                <Switch checked={pago === true} onCheckedChange={(v) => setPago(v)} />
              </div>
            )}
            {/* "Repetir": visível quando o meio é cartão. */}
            {meioEhCartao && (
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs text-slate-600">Repetir</Label>
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 text-[11px]"
                  onClick={() => setRepetir((v) => !(v === true))}
                >
                  {repetir === true ? 'Repetir: Sim' : 'Repetir: Não'}
                </Button>
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-xs text-slate-600">Observações</Label>
              <Input
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Observação para os itens selecionados (opcional)"
                className="h-9"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="h-9 flex-1" onClick={onFechar}>
                Cancelar
              </Button>
              <Button
                className="h-9 flex-1 bg-indigo-600 hover:bg-indigo-700"
                onClick={aplicar}
                disabled={!temTipoComum && !observacao.trim() && !meioSelecionado}
              >
                Salvar no lote
              </Button>
            </div>
            {!temTipoComum && (
              <p className="text-[10px] text-amber-700">
                Itens selecionados têm meios de tipos diferentes — escolha o "Pago com" para aplicar
                Pago/Repetir.
              </p>
            )}
          </div>
        </div>
      )}
    </>
  )
}
