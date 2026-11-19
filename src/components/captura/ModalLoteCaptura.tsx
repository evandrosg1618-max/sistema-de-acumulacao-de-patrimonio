/**
 * Modal da edição em lote da revisão de NFC-e: o usuário marca QUAIS campos
 * alterar e aplica SOMENTE os marcados nos itens selecionados (BLOCO 14).
 *
 * TESTE CAPTURA 5 / T4 — "Afeta Resultado" e "Afeta Orçamento" SAÍRAM do lote:
 * essas flags são DERIVADAS das subcategorias (e do modalidade_saida) e não
 * devem ser editáveis em lote. Entram no lugar:
 * - toggle "Pago" — visível/aplicável só quando o "Pago com" escolhido é
 *   conta bancária ou dinheiro;
 * - botão "Repetir" — visível/aplicável só quando o meio é cartão (e similares);
 * - campo de texto "Observações".
 * Data/valor e demais campos NÃO marcados permanecem intactos nos itens.
 */
import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { MeioPagamento } from '@/types/sap'
import { PatchLoteCaptura } from '@/components/captura/tiposRevisao'

interface Props {
  aberto: boolean
  onFechar: () => void
  onAplicar: (patch: PatchLoteCaptura) => void
  meiosPagamento: MeioPagamento[]
}

export function ModalLoteCaptura({ aberto, onFechar, onAplicar, meiosPagamento }: Props) {
  const [campos, setCampos] = useState<Record<string, boolean>>({})
  const [data, setData] = useState('')
  const [meioId, setMeioId] = useState('')
  const [modalidade, setModalidade] = useState('compra_propria')
  const [pago, setPago] = useState(true)
  const [repetir, setRepetir] = useState(true)
  const [observacao, setObservacao] = useState('')

  const marcar = (campo: string, v: boolean) => setCampos((p) => ({ ...p, [campo]: v }))

  // T4 — tipo do meio escolhido define qual controle extra aparece:
  // conta/dinheiro → "Pago"; cartão (e similares) → "Repetir".
  const meioSelecionado = meiosPagamento.find((m) => m.id === meioId) as any
  const tipoMeio = String(meioSelecionado?.tipo || '').toUpperCase()
  const meioEhCartao = tipoMeio.includes('CARTAO') || tipoMeio.includes('CARTÃO')
  const meioEhContaDinheiro = tipoMeio === 'CONTA' || tipoMeio === 'DINHEIRO'

  const aplicar = () => {
    const patch: PatchLoteCaptura = {}
    if (campos.data && data) patch.data = data
    if (campos.meio_pagamento && meioId) {
      patch.meioPagamentoId = meioId
      // Tipo/nome acompanham o meio escolhido: a importação roteia por
      // meio_pagamento_tipo (CONTA → conta_origem, CARTAO → cartão).
      patch.meioPagamentoTipo = meioSelecionado?.tipo ?? null
      patch.meioPagamentoNome = meioSelecionado?.nome ?? null
      if (meioEhContaDinheiro && campos.pago) patch.pago = pago
      if (meioEhCartao && campos.repetir) patch.repetir = repetir
    }
    if (campos.modalidade) patch.modalidade = modalidade
    if (campos.observacao) patch.observacao = observacao.trim()
    if (Object.keys(patch).length === 0) {
      onFechar()
      return
    }
    onAplicar(patch)
    setCampos({})
  }

  const OpcaoCampo = ({ id, rotulo }: { id: string; rotulo: string }) => (
    <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer py-0.5">
      <Checkbox checked={!!campos[id]} onCheckedChange={(v) => marcar(id, v === true)} />
      {rotulo}
    </label>
  )

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-w-md bg-white">
        <DialogHeader>
          <DialogTitle className="text-slate-900">Alterar em lote</DialogTitle>
          <DialogDescription>
            Marque os campos a alterar. SOMENTE os marcados serão aplicados aos itens selecionados.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <OpcaoCampo id="data" rotulo="Data" />
            {campos.data && (
              <Input
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                className="h-9"
              />
            )}
          </div>
          <div>
            <OpcaoCampo id="meio_pagamento" rotulo="Pago com" />
            {campos.meio_pagamento && (
              <Select value={meioId} onValueChange={setMeioId}>
                <SelectTrigger className="h-9 bg-white">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent className="bg-white">
                  {meiosPagamento
                    .filter((m) => m.ativo)
                    .map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.nome}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            )}
          </div>
          {/* T4 — "Pago": apenas quando o meio escolhido é conta ou dinheiro. */}
          {campos.meio_pagamento && meioEhContaDinheiro && (
            <div>
              <OpcaoCampo id="pago" rotulo="Pago" />
              {campos.pago && (
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer py-0.5">
                  <Checkbox checked={pago} onCheckedChange={(v) => setPago(v === true)} />
                  Lançamento já pago
                </label>
              )}
            </div>
          )}
          {/* T4 — "Repetir": apenas quando o meio escolhido é cartão. */}
          {campos.meio_pagamento && meioEhCartao && (
            <div>
              <OpcaoCampo id="repetir" rotulo="Repetir" />
              {campos.repetir && (
                <Button
                  type="button"
                  variant={repetir ? 'default' : 'outline'}
                  onClick={() => setRepetir((v) => !v)}
                  className={`h-9 ${repetir ? 'bg-indigo-600 hover:bg-indigo-700' : ''}`}
                >
                  {repetir ? 'Repetir: Sim' : 'Repetir: Não'}
                </Button>
              )}
            </div>
          )}
          <div>
            <OpcaoCampo id="modalidade" rotulo="Modalidade de saída" />
            {campos.modalidade && (
              <Select value={modalidade} onValueChange={setModalidade}>
                <SelectTrigger className="h-9 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white">
                  <SelectItem value="compra_propria">Compra própria</SelectItem>
                  <SelectItem value="compra_compartilhada">Compra compartilhada</SelectItem>
                  <SelectItem value="compra_terceiros">Compra a terceiros</SelectItem>
                  <SelectItem value="emprestimo_terceiros">Empréstimo a terceiros</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
          <div>
            <OpcaoCampo id="observacao" rotulo="Observações" />
            {campos.observacao && (
              <Input
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Observação para os itens selecionados"
                className="h-9"
              />
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onFechar} className="h-9">
            Cancelar
          </Button>
          <Button onClick={aplicar} className="h-9 bg-indigo-600 hover:bg-indigo-700">
            Aplicar aos selecionados
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
