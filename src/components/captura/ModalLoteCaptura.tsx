/**
 * Modal da edição em lote da revisão de NFC-e: o usuário marca QUAIS campos
 * alterar e aplica SOMENTE os marcados nos itens selecionados (BLOCO 14).
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
import { Label } from '@/components/ui/label'
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
  const [afetaResultado, setAfetaResultado] = useState('true')
  const [afetaOrcamento, setAfetaOrcamento] = useState('true')

  const marcar = (campo: string, v: boolean) => setCampos((p) => ({ ...p, [campo]: v }))

  const aplicar = () => {
    const patch: PatchLoteCaptura = {}
    if (campos.data && data) patch.data = data
    if (campos.meio_pagamento && meioId) patch.meioPagamentoId = meioId
    if (campos.modalidade) patch.modalidade = modalidade
    if (campos.afeta_resultado) patch.afetaResultado = afetaResultado === 'true'
    if (campos.afeta_orcamento) patch.afetaOrcamento = afetaOrcamento === 'true'
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
            <OpcaoCampo id="afeta_resultado" rotulo="Afeta Resultado" />
            {campos.afeta_resultado && (
              <Select value={afetaResultado} onValueChange={setAfetaResultado}>
                <SelectTrigger className="h-9 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white">
                  <SelectItem value="true">Sim</SelectItem>
                  <SelectItem value="false">Não</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
          <div>
            <OpcaoCampo id="afeta_orcamento" rotulo="Afeta Orçamento" />
            {campos.afeta_orcamento && (
              <Select value={afetaOrcamento} onValueChange={setAfetaOrcamento}>
                <SelectTrigger className="h-9 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white">
                  <SelectItem value="true">Sim</SelectItem>
                  <SelectItem value="false">Não</SelectItem>
                </SelectContent>
              </Select>
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
