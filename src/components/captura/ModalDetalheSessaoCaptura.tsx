/**
 * Detalhe de uma sessão do histórico "Capturas recentes" (BLOCO 21):
 * tipo/trilha, data, Pago com, miniaturas (URL assinada), status, itens e
 * acesso a lançamentos relacionados (rastreabilidade, nunca exclusão).
 */
import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  capturaService,
  CapturaSessao,
  rotuloStatusSessao,
  rotuloTipoDocumento,
} from '@/services/captura/capturaService'
import { formatMoneyBRL } from '@/lib/formatters'
import { Image as ImageIcon } from 'lucide-react'

interface Props {
  sessao: CapturaSessao | null
  onFechar: () => void
}

export function ModalDetalheSessaoCaptura({ sessao, onFechar }: Props) {
  const [urls, setUrls] = useState<string[]>([])
  const [carregando, setCarregando] = useState(false)
  const [erroImagens, setErroImagens] = useState<string | null>(null)

  useEffect(() => {
    let ativo = true
    setUrls([])
    setErroImagens(null)
    if (!sessao) return
    setCarregando(true)
    ;(async () => {
      try {
        const imgs = await capturaService.listarImagens(sessao.id, sessao.workspace_id)
        const lista: string[] = []
        for (const im of imgs) {
          try {
            lista.push(await capturaService.urlAssinada(im.storage_path, 300))
          } catch {
            /* imagem individual pode falhar sem travar as demais */
          }
        }
        if (ativo) setUrls(lista)
      } catch (e: any) {
        if (ativo) setErroImagens('Não foi possível carregar as imagens desta captura.')
      } finally {
        if (ativo) setCarregando(false)
      }
    })()
    return () => {
      ativo = false
    }
  }, [sessao])

  if (!sessao) return null

  return (
    <Dialog open={!!sessao} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-w-lg bg-white max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-slate-900 flex items-center gap-2 flex-wrap">
            {rotuloTipoDocumento(sessao.tipo_documento)}
            <span className="text-xs font-normal text-slate-500">
              • {sessao.trilha === 'papel' ? 'Cupom em papel (foto)' : 'NFC-e digital (tela)'}
            </span>
          </DialogTitle>
          <DialogDescription>
            {sessao.data_captura
              ? new Date(sessao.data_captura + 'T12:00:00').toLocaleDateString('pt-BR')
              : '—'}{' '}
            • {rotuloStatusSessao(sessao.status)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {sessao.meio_pagamento_nome && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider font-bold text-emerald-700">
                Pago com
              </p>
              <p className="text-sm font-semibold text-emerald-900">{sessao.meio_pagamento_nome}</p>
            </div>
          )}

          <div>
            <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-2">
              Imagens da captura ({urls.length})
            </p>
            {carregando && <p className="text-xs text-slate-400">Carregando imagens…</p>}
            {erroImagens && <p className="text-xs text-rose-600">{erroImagens}</p>}
            {!carregando && urls.length === 0 && !erroImagens && (
              <p className="text-xs text-slate-400">Nenhuma imagem armazenada.</p>
            )}
            {urls.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {urls.map((u, i) => (
                  <a key={i} href={u} target="_blank" rel="noreferrer" className="block">
                    <img
                      src={u}
                      alt={`Captura ${i + 1}`}
                      className="w-full h-20 object-cover rounded border border-slate-200"
                    />
                  </a>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={async () => {
                if (!sessao) return
                try {
                  const itens = await capturaService.listarItens(sessao.id, sessao.workspace_id)
                  if (itens.length === 0) {
                    alert('Esta captura ainda não tem itens reconhecidos.')
                    return
                  }
                  const txt = itens
                    .map(
                      (it) =>
                        `${it.ordem}. ${it.descricao} — ${formatMoneyBRL(it.valor)}${
                          it.lancamento_criado_id ? ' (importado)' : ''
                        }`,
                    )
                    .join('\n')
                  alert(`Itens reconhecidos:\n\n${txt}`)
                } catch {
                  alert('Não foi possível carregar os itens desta captura.')
                }
              }}
            >
              Ver itens reconhecidos
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={async () => {
                if (!sessao) return
                try {
                  const itens = await capturaService.listarItens(sessao.id, sessao.workspace_id)
                  const comLanc = itens.filter((it) => it.lancamento_criado_id)
                  if (comLanc.length === 0) {
                    alert(
                      'Esta captura ainda não gerou lançamentos. Use "Processar capturas" e "Importar selecionados" na página de captura.',
                    )
                    return
                  }
                  const txt = comLanc
                    .map((it) => `${it.descricao} — lançamento ${it.lancamento_criado_id}`)
                    .join('\n')
                  alert(
                    `Lançamentos relacionados (rastreabilidade):\n\n${txt}\n\nConsulte-os na tela Lançamentos.`,
                  )
                } catch {
                  alert('Não foi possível carregar os lançamentos relacionados.')
                }
              }}
            >
              Ver lançamentos relacionados
            </Button>
          </div>

          {sessao.valor_total_documento != null && (
            <p className="text-xs text-slate-500 flex items-center gap-1.5">
              <ImageIcon className="w-3.5 h-3.5" />
              {sessao.quantidade_imagens} imagem(ns) • {sessao.quantidade_itens} item(ns) • Total do
              documento: {formatMoneyBRL(sessao.valor_total_documento)}
            </p>
          )}
          <Badge variant="outline" className="text-[10px]">
            As imagens ficam armazenadas de forma privada (URL temporária de 5 minutos).
          </Badge>
        </div>
      </DialogContent>
    </Dialog>
  )
}
