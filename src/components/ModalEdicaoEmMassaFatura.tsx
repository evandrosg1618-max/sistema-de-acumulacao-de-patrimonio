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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Categoria, Subcategoria } from '@/types/sap'

export interface ModalEdicaoEmMassaFaturaProps {
  aberto: boolean
  aoFechar: () => void
  totalSelecionados: number
  categorias: Categoria[]
  subcategorias: Subcategoria[]
  aoAplicar: (config: {
    categoriaId?: string
    subcategoriaId?: string
    modalidadeSaida?: string
    afetaResultado?: boolean
    afetaOrcamento?: boolean
    marcarIgnorado?: boolean
  }) => Promise<void>
}

export const ModalEdicaoEmMassaFatura: React.FC<ModalEdicaoEmMassaFaturaProps> = ({
  aberto,
  aoFechar,
  totalSelecionados,
  categorias,
  subcategorias,
  aoAplicar,
}) => {
  const [categoriaId, setCategoriaId] = useState<string>('')
  const [subcategoriaId, setSubcategoriaId] = useState<string>('')
  const [modalidade, setModalidade] = useState<string>('')
  const [afetaResultado, setAfetaResultado] = useState<string>('manter')
  const [afetaOrcamento, setAfetaOrcamento] = useState<string>('manter')
  const [acaoEspecial, setAcaoEspecial] = useState<string>('')
  const [salvando, setSalvando] = useState(false)

  const subcategoriasFiltradas = subcategorias.filter(
    (s) => !categoriaId || s.categoria_id === categoriaId,
  )

  const handleSalvar = async () => {
    setSalvando(true)
    try {
      await aoAplicar({
        categoriaId: categoriaId || undefined,
        subcategoriaId: subcategoriaId || undefined,
        modalidadeSaida: modalidade && modalidade !== 'manter' ? modalidade : undefined,
        afetaResultado:
          afetaResultado === 'sim' ? true : afetaResultado === 'nao' ? false : undefined,
        afetaOrcamento:
          afetaOrcamento === 'sim' ? true : afetaOrcamento === 'nao' ? false : undefined,
        marcarIgnorado: acaoEspecial === 'ignorar',
      })
      aoFechar()
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(open) => !open && aoFechar()}>
      <DialogContent className="sm:max-w-lg bg-slate-900 border-slate-700 text-slate-100">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-slate-100">
            Edição em Massa ({totalSelecionados} itens selecionados)
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-slate-300">Categoria</Label>
              <Select
                value={categoriaId}
                onValueChange={(val) => {
                  setCategoriaId(val)
                  setSubcategoriaId('')
                }}
              >
                <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 text-slate-200">
                  {categorias.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-slate-300">Subcategoria</Label>
              <Select
                value={subcategoriaId}
                onValueChange={setSubcategoriaId}
                disabled={!categoriaId}
              >
                <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 text-slate-200">
                  {subcategoriasFiltradas.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-slate-300">Modalidade de Saída</Label>
            <Select value={modalidade} onValueChange={setModalidade}>
              <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                <SelectValue placeholder="Manter atual ou selecionar..." />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700 text-slate-200">
                <SelectItem value="manter">Manter atual</SelectItem>
                <SelectItem value="compra_propria">Compra Própria (100% próprio)</SelectItem>
                <SelectItem value="compra_compartilhada">Compra Compartilhada</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-slate-300">Afeta Resultado?</Label>
              <Select value={afetaResultado} onValueChange={setAfetaResultado}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 text-slate-200">
                  <SelectItem value="manter">Manter atual</SelectItem>
                  <SelectItem value="sim">Sim</SelectItem>
                  <SelectItem value="nao">Não</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-slate-300">Afeta Orçamento?</Label>
              <Select value={afetaOrcamento} onValueChange={setAfetaOrcamento}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 text-slate-200">
                  <SelectItem value="manter">Manter atual</SelectItem>
                  <SelectItem value="sim">Sim</SelectItem>
                  <SelectItem value="nao">Não</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5 pt-2 border-t border-slate-800">
            <Label className="text-slate-300">Ação Rápida</Label>
            <Select value={acaoEspecial} onValueChange={setAcaoEspecial}>
              <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                <SelectValue placeholder="Nenhuma ação especial..." />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700 text-slate-200">
                <SelectItem value="nenhuma">Nenhuma</SelectItem>
                <SelectItem value="ignorar">Marcar itens como Ignorados</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="flex gap-2 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={aoFechar}
            className="border-slate-700 text-slate-300"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleSalvar}
            disabled={salvando}
            className="bg-teal-600 hover:bg-teal-500 text-white"
          >
            {salvando ? 'Aplicando...' : 'Aplicar a Todos'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
