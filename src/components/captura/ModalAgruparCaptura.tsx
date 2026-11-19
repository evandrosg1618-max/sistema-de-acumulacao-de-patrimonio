/**
 * Modal de agrupamento de itens selecionados da revisão de NFC-e (BLOCO 15):
 * vira UM candidato com descrição e soma informadas pelo usuário. Exclusivo:
 * ou o grupo existe, ou os itens individuais — nunca ambos.
 *
 * TESTE CAPTURA 5 / T3 — Categoria e Subcategoria com FILTRO DIGITÁVEL
 * (SeletorCategoriaFatura/SeletorSubcategoriaFatura, os mesmos da aba
 * "Detalhes"/ImportarFatura: botão X e item "— Nenhuma —"). Objetivo: agrupar
 * JÁ com classificação e depois só marcar "Pago com" na aba Lote → item
 * "Pronto para importar" sem abrir Detalhes um a um.
 */
import { useEffect, useMemo, useState } from 'react'
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
import { ValorCalculadoraInput } from '@/components/ValorCalculadoraInput'
import {
  SeletorCategoriaFatura,
  SeletorSubcategoriaFatura,
} from '@/components/SeletoresClassificacaoFatura'
import { formatMoneyBRL } from '@/lib/formatters'
import type { Categoria, Subcategoria } from '@/types/sap'

export interface ModalAgruparConfirmacao {
  descricao: string
  valor: number
  categoriaId: string | null
  subcategoriaId: string | null
}

interface Props {
  aberto: boolean
  onFechar: () => void
  onConfirmar: (
    descricao: string,
    valor: number,
    categoriaId: string | null,
    subcategoriaId: string | null,
  ) => void
  quantidadeItens: number
  somaSelecionados: number
  categorias: Categoria[]
  subcategorias: Subcategoria[]
}

export function ModalAgruparCaptura({
  aberto,
  onFechar,
  onConfirmar,
  quantidadeItens,
  somaSelecionados,
  categorias,
  subcategorias,
}: Props) {
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState<number>(0)
  const [categoriaId, setCategoriaId] = useState<string | null>(null)
  const [subcategoriaId, setSubcategoriaId] = useState<string | null>(null)

  useEffect(() => {
    if (aberto) {
      setDescricao('')
      setValor(Number(somaSelecionados.toFixed(2)))
      setCategoriaId(null)
      setSubcategoriaId(null)
    }
  }, [aberto, somaSelecionados])

  const subsDaCategoria = useMemo(
    () => subcategorias.filter((s) => s.categoria_id === categoriaId),
    [subcategorias, categoriaId],
  )

  const nomesCategorias = useMemo(() => {
    const mapa: Record<string, string> = {}
    categorias.forEach((c) => {
      mapa[c.id] = c.nome
    })
    return mapa
  }, [categorias])

  const confirmar = () => {
    if (!descricao.trim()) return
    if (!(valor > 0)) return
    onConfirmar(descricao.trim(), Number(valor.toFixed(2)), categoriaId, subcategoriaId)
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-w-md bg-white">
        <DialogHeader>
          <DialogTitle className="text-slate-900">Agrupar itens selecionados</DialogTitle>
          <DialogDescription>
            {quantidadeItens} item(ns) viram UM único candidato para importação. Os itens
            individuais saem da seleção (exclusivo: ou agrupado, ou individuais). Após agrupar, a
            seleção é limpa.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-600">Soma atual dos selecionados</Label>
            <p className="text-lg font-bold text-slate-900">{formatMoneyBRL(somaSelecionados)}</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-600">Descrição do grupo (obrigatória)</Label>
            <Input
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex.: Compras do mercado"
              className="h-9"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-600">Valor do grupo (editável)</Label>
            <ValorCalculadoraInput
              value={String(valor).replace('.', ',')}
              onChange={(v) => setValor(Number(String(v).replace(',', '.')) || 0)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-600">Categoria</Label>
            <SeletorCategoriaFatura
              categorias={categorias}
              valor={categoriaId || ''}
              aoMudar={(id) => {
                setCategoriaId(id)
                // Trocar/limpar a categoria invalida a subcategoria incompatível.
                if (
                  !id ||
                  !subcategorias.some((s) => s.id === subcategoriaId && s.categoria_id === id)
                ) {
                  setSubcategoriaId(null)
                }
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-600">Subcategoria</Label>
            <SeletorSubcategoriaFatura
              subcategorias={subsDaCategoria}
              nomesCategorias={nomesCategorias}
              valor={subcategoriaId || ''}
              aoMudar={(id) => {
                setSubcategoriaId(id)
                // Escolher a subcategoria marca a categoria à qual ela pertence.
                if (id) {
                  const sub = subcategorias.find((s) => s.id === id)
                  if (sub) setCategoriaId(sub.categoria_id)
                }
              }}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onFechar} className="h-9">
            Cancelar
          </Button>
          <Button
            onClick={confirmar}
            disabled={!descricao.trim() || !(valor > 0)}
            className="h-9 bg-indigo-600 hover:bg-indigo-700"
          >
            Agrupar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
