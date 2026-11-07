import React, { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Categoria, Subcategoria, Cartao } from '@/types/sap'

export interface PatchEdicaoEmMassa {
  aplicarDescricao?: boolean
  descricao?: string

  aplicarData?: boolean
  data?: string

  aplicarPagoCom?: boolean
  cartaoId?: string

  aplicarCategoria?: boolean
  categoriaId?: string

  aplicarSubcategoria?: boolean
  subcategoriaId?: string

  aplicarModalidade?: boolean
  modalidadeSaida?: string

  aplicarValorProprio?: boolean
  valorProprioTipo?: 'integral' | 'personalizado'
  valorProprio?: number

  aplicarAfetaResultado?: boolean
  afetaResultado?: boolean

  aplicarAfetaOrcamento?: boolean
  afetaOrcamento?: boolean

  aplicarObservacao?: boolean
  observacao?: string

  marcarIgnorado?: boolean
}

export interface ModalEdicaoEmMassaFaturaProps {
  aberto: boolean
  aoFechar: () => void
  totalSelecionados: number
  categorias: Categoria[]
  subcategorias: Subcategoria[]
  cartoes?: Cartao[]
  aoAplicar: (patch: PatchEdicaoEmMassa) => Promise<void>
}

export const ModalEdicaoEmMassaFatura: React.FC<ModalEdicaoEmMassaFaturaProps> = ({
  aberto,
  aoFechar,
  totalSelecionados,
  categorias,
  subcategorias,
  cartoes = [],
  aoAplicar,
}) => {
  // Checkboxes de controle seletivo (patch)
  const [chkDescricao, setChkDescricao] = useState(false)
  const [descricao, setDescricao] = useState('')

  const [chkData, setChkData] = useState(false)
  const [data, setData] = useState('')

  const [chkPagoCom, setChkPagoCom] = useState(false)
  const [cartaoId, setCartaoId] = useState('')

  const [chkCategoria, setChkCategoria] = useState(false)
  const [categoriaId, setCategoriaId] = useState<string>('')

  const [chkSubcategoria, setChkSubcategoria] = useState(false)
  const [subcategoriaId, setSubcategoriaId] = useState<string>('')

  const [chkModalidade, setChkModalidade] = useState(false)
  const [modalidade, setModalidade] = useState<string>('compra_propria')

  const [chkValorProprio, setChkValorProprio] = useState(false)
  const [valorProprioTipo, setValorProprioTipo] = useState<'integral' | 'personalizado'>('integral')
  const [valorProprio, setValorProprio] = useState<string>('')

  const [chkAfetaResultado, setChkAfetaResultado] = useState(false)
  const [afetaResultado, setAfetaResultado] = useState<boolean>(true)

  const [chkAfetaOrcamento, setChkAfetaOrcamento] = useState(false)
  const [afetaOrcamento, setAfetaOrcamento] = useState<boolean>(true)

  const [chkObservacao, setChkObservacao] = useState(false)
  const [observacao, setObservacao] = useState('')

  const [acaoEspecial, setAcaoEspecial] = useState<string>('')
  const [salvando, setSalvando] = useState(false)

  const subcategoriasFiltradas = subcategorias.filter(
    (s) => !categoriaId || s.categoria_id === categoriaId,
  )

  const totalCamposMarcados = [
    chkDescricao,
    chkData,
    chkPagoCom,
    chkCategoria,
    chkSubcategoria,
    chkModalidade,
    chkValorProprio,
    chkAfetaResultado,
    chkAfetaOrcamento,
    chkObservacao,
  ].filter(Boolean).length

  const handleSalvar = async () => {
    setSalvando(true)
    try {
      await aoAplicar({
        aplicarDescricao: chkDescricao,
        descricao: chkDescricao ? descricao : undefined,

        aplicarData: chkData,
        data: chkData ? data : undefined,

        aplicarPagoCom: chkPagoCom,
        cartaoId: chkPagoCom ? cartaoId : undefined,

        aplicarCategoria: chkCategoria,
        categoriaId: chkCategoria ? categoriaId : undefined,

        aplicarSubcategoria: chkSubcategoria,
        subcategoriaId: chkSubcategoria ? subcategoriaId : undefined,

        aplicarModalidade: chkModalidade,
        modalidadeSaida: chkModalidade ? modalidade : undefined,

        aplicarValorProprio: chkValorProprio,
        valorProprioTipo,
        valorProprio:
          chkValorProprio && valorProprio ? parseFloat(valorProprio.replace(',', '.')) : undefined,

        aplicarAfetaResultado: chkAfetaResultado,
        afetaResultado: chkAfetaResultado ? afetaResultado : undefined,

        aplicarAfetaOrcamento: chkAfetaOrcamento,
        afetaOrcamento: chkAfetaOrcamento ? afetaOrcamento : undefined,

        aplicarObservacao: chkObservacao,
        observacao: chkObservacao ? observacao : undefined,

        marcarIgnorado: acaoEspecial === 'ignorar',
      })
      aoFechar()
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(open) => !open && aoFechar()}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto bg-white border-slate-200 text-slate-900">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-slate-900 flex items-center justify-between">
            <span>Alterar em lote ({totalSelecionados} lançamentos)</span>
            <span className="text-xs font-normal text-slate-500">
              {totalCamposMarcados > 0
                ? `${totalCamposMarcados} campo(s) marcado(s)`
                : 'Nenhum campo marcado'}
            </span>
          </DialogTitle>
          <p className="text-xs text-slate-500">
            Marque apenas os campos que deseja alterar. Campos desmarcados permanecem intactos em
            cada lançamento individual.
          </p>
        </DialogHeader>

        <div className="space-y-3.5 py-2 text-xs">
          {/* Campo Descrição */}
          <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/50 space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="chk-desc"
                checked={chkDescricao}
                onCheckedChange={(c) => setChkDescricao(!!c)}
              />
              <Label htmlFor="chk-desc" className="font-semibold text-slate-800 cursor-pointer">
                Descrição
              </Label>
              <span className="text-[10px] text-slate-500">
                (Sobrescreve a descrição individual de todos os selecionados)
              </span>
            </div>
            {chkDescricao && (
              <Input
                placeholder="Nova descrição para os itens selecionados..."
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                className="bg-white border-slate-200 text-xs h-8"
              />
            )}
          </div>

          {/* Campo Data */}
          <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/50 space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox id="chk-data" checked={chkData} onCheckedChange={(c) => setChkData(!!c)} />
              <Label htmlFor="chk-data" className="font-semibold text-slate-800 cursor-pointer">
                Data
              </Label>
              <span className="text-[10px] text-slate-500">(Altera a data de compra)</span>
            </div>
            {chkData && (
              <Input
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                className="bg-white border-slate-200 text-xs h-8 max-w-xs"
              />
            )}
          </div>

          {/* Campo Pago Com (Cartão) */}
          {cartoes.length > 0 && (
            <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/50 space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="chk-cartao"
                  checked={chkPagoCom}
                  onCheckedChange={(c) => setChkPagoCom(!!c)}
                />
                <Label htmlFor="chk-cartao" className="font-semibold text-slate-800 cursor-pointer">
                  Pago com
                </Label>
                <span className="text-[10px] text-slate-500">(Cartão de crédito destino)</span>
              </div>
              {chkPagoCom && (
                <Select value={cartaoId} onValueChange={setCartaoId}>
                  <SelectTrigger className="bg-white border-slate-200 text-xs h-8">
                    <SelectValue placeholder="Selecione o cartão..." />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200 text-xs">
                    {cartoes.map((cartao) => (
                      <SelectItem key={cartao.id} value={cartao.id}>
                        {cartao.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* Categorias e Subcategorias com controles próprios */}
          <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/50 space-y-3">
            {/* Categoria */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="chk-cat"
                  checked={chkCategoria}
                  onCheckedChange={(c) => setChkCategoria(!!c)}
                />
                <Label htmlFor="chk-cat" className="font-semibold text-slate-800 cursor-pointer">
                  Categoria
                </Label>
              </div>
              {chkCategoria && (
                <Select
                  value={categoriaId}
                  onValueChange={(val) => {
                    setCategoriaId(val)
                    if (chkSubcategoria) setSubcategoriaId('')
                  }}
                >
                  <SelectTrigger className="bg-white border-slate-200 text-xs h-8">
                    <SelectValue placeholder="Selecione a categoria..." />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200 text-xs">
                    {categorias.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Subcategoria */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="chk-subcat"
                  checked={chkSubcategoria}
                  onCheckedChange={(c) => setChkSubcategoria(!!c)}
                />
                <Label htmlFor="chk-subcat" className="font-semibold text-slate-800 cursor-pointer">
                  Subcategoria
                </Label>
              </div>
              {chkSubcategoria && (
                <Select
                  value={subcategoriaId}
                  onValueChange={(val) => {
                    setSubcategoriaId(val)
                    // Se a categoria correspondente não estiver definida, preenche automaticamente
                    const sub = subcategorias.find((s) => s.id === val)
                    if (sub && !categoriaId) {
                      setCategoriaId(sub.categoria_id)
                    }
                  }}
                >
                  <SelectTrigger className="bg-white border-slate-200 text-xs h-8">
                    <SelectValue placeholder="Selecione a subcategoria..." />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200 text-xs">
                    {subcategoriasFiltradas.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {/* Modalidade de Saída */}
          <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/50 space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="chk-mod"
                checked={chkModalidade}
                onCheckedChange={(c) => setChkModalidade(!!c)}
              />
              <Label htmlFor="chk-mod" className="font-semibold text-slate-800 cursor-pointer">
                Modalidade
              </Label>
            </div>
            {chkModalidade && (
              <Select value={modalidade} onValueChange={setModalidade}>
                <SelectTrigger className="bg-white border-slate-200 text-xs h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white border-slate-200 text-xs">
                  <SelectItem value="compra_propria">Compra Própria (100% próprio)</SelectItem>
                  <SelectItem value="compra_compartilhada">Compra Compartilhada</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Valor Próprio */}
          <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/50 space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="chk-proprio"
                checked={chkValorProprio}
                onCheckedChange={(c) => setChkValorProprio(!!c)}
              />
              <Label htmlFor="chk-proprio" className="font-semibold text-slate-800 cursor-pointer">
                Valor Próprio
              </Label>
            </div>
            {chkValorProprio && (
              <div className="grid grid-cols-2 gap-2">
                <Select
                  value={valorProprioTipo}
                  onValueChange={(v) => setValorProprioTipo(v as 'integral' | 'personalizado')}
                >
                  <SelectTrigger className="bg-white border-slate-200 text-xs h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200 text-xs">
                    <SelectItem value="integral">100% Próprio (Valor total da linha)</SelectItem>
                    <SelectItem value="personalizado">Valor fixo customizado (R$)</SelectItem>
                  </SelectContent>
                </Select>
                {valorProprioTipo === 'personalizado' && (
                  <Input
                    placeholder="R$ 0,00"
                    value={valorProprio}
                    onChange={(e) => setValorProprio(e.target.value)}
                    className="bg-white border-slate-200 text-xs h-8"
                  />
                )}
              </div>
            )}
          </div>

          {/* Afeta Resultado e Afeta Orçamento */}
          <div className="grid grid-cols-2 gap-2">
            <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/50 space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="chk-res"
                  checked={chkAfetaResultado}
                  onCheckedChange={(c) => setChkAfetaResultado(!!c)}
                />
                <Label htmlFor="chk-res" className="font-semibold text-slate-800 cursor-pointer">
                  Afeta Resultado
                </Label>
              </div>
              {chkAfetaResultado && (
                <Select
                  value={afetaResultado ? 'sim' : 'nao'}
                  onValueChange={(v) => setAfetaResultado(v === 'sim')}
                >
                  <SelectTrigger className="bg-white border-slate-200 text-xs h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200 text-xs">
                    <SelectItem value="sim">Sim (afeta)</SelectItem>
                    <SelectItem value="nao">Não (não afeta)</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/50 space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="chk-orc"
                  checked={chkAfetaOrcamento}
                  onCheckedChange={(c) => setChkAfetaOrcamento(!!c)}
                />
                <Label htmlFor="chk-orc" className="font-semibold text-slate-800 cursor-pointer">
                  Afeta Orçamento
                </Label>
              </div>
              {chkAfetaOrcamento && (
                <Select
                  value={afetaOrcamento ? 'sim' : 'nao'}
                  onValueChange={(v) => setAfetaOrcamento(v === 'sim')}
                >
                  <SelectTrigger className="bg-white border-slate-200 text-xs h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200 text-xs">
                    <SelectItem value="sim">Sim (afeta)</SelectItem>
                    <SelectItem value="nao">Não (não afeta)</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {/* Observação */}
          <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/50 space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="chk-obs"
                checked={chkObservacao}
                onCheckedChange={(c) => setChkObservacao(!!c)}
              />
              <Label htmlFor="chk-obs" className="font-semibold text-slate-800 cursor-pointer">
                Observação
              </Label>
            </div>
            {chkObservacao && (
              <Input
                placeholder="Observação para os itens selecionados..."
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                className="bg-white border-slate-200 text-xs h-8"
              />
            )}
          </div>

          {/* Ação Especial */}
          <div className="space-y-1.5 pt-2 border-t border-slate-200">
            <Label className="text-slate-600">Ação Rápida</Label>
            <Select value={acaoEspecial} onValueChange={setAcaoEspecial}>
              <SelectTrigger className="bg-white border-slate-200 text-slate-900 h-8">
                <SelectValue placeholder="Nenhuma ação especial..." />
              </SelectTrigger>
              <SelectContent className="bg-white border-slate-200 text-slate-900 text-xs">
                <SelectItem value="nenhuma">Nenhuma</SelectItem>
                <SelectItem value="ignorar">Marcar itens como Ignorados</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="flex gap-2 sm:justify-end pt-2 border-t border-slate-200">
          <Button
            type="button"
            variant="outline"
            onClick={aoFechar}
            className="border-slate-200 text-slate-700 hover:bg-slate-100 text-xs"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleSalvar}
            disabled={salvando || (totalCamposMarcados === 0 && !acaoEspecial)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
          >
            {salvando ? 'Aplicando...' : `Aplicar aos ${totalSelecionados} selecionados`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
