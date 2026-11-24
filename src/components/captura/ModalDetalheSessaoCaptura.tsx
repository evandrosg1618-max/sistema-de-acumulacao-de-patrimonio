/**
 * Detalhe de uma sessão do histórico "Capturas recentes" (BLOCO 21):
 * tipo/trilha, data, Pago com, miniaturas (URL assinada), status, itens e
 * acesso a lançamentos relacionados (rastreabilidade, nunca exclusão).
 * R3: "Ver itens reconhecidos" leva à MESMA tela de revisão da sessão
 * (Continuar revisão); lançamentos relacionados são listados DENTRO do modal
 * (zero alert(); itens importados aparecem marcados e nunca são reimportados).
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
import { cn } from '@/lib/utils'
import { smFullDialog } from '@/lib/responsive'
import { Image as ImageIcon, ListChecks, Loader2, Receipt } from 'lucide-react'

interface Props {
  sessao: CapturaSessao | null
  onFechar: () => void
  /** R3 — abre a etapa de revisão desta sessão na página (ou avisa se já importada). */
  onContinuarRevisao?: (sessao: CapturaSessao) => void
  /** A.5/T3 — desabilita "Continuar revisão" enquanto a sessão é recarregada. */
  processando?: boolean
}

interface LancRelacionado {
  descricao: string
  lancamentoId: string
}

export function ModalDetalheSessaoCaptura({
  sessao,
  onFechar,
  onContinuarRevisao,
  processando = false,
}: Props) {
  const [urls, setUrls] = useState<string[]>([])
  const [carregando, setCarregando] = useState(false)
  const [erroImagens, setErroImagens] = useState<string | null>(null)
  const [carregandoItens, setCarregandoItens] = useState(false)
  const [erroItens, setErroItens] = useState<string | null>(null)
  const [lancRelacionados, setLancRelacionados] = useState<LancRelacionado[] | null>(null)

  useEffect(() => {
    let ativo = true
    setUrls([])
    setErroImagens(null)
    setLancRelacionados(null)
    setErroItens(null)
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

  const abrirRevisao = () => {
    if (!sessao || !onContinuarRevisao) return
    onFechar()
    onContinuarRevisao(sessao)
  }

  const verLancamentos = async () => {
    if (!sessao) return
    setCarregandoItens(true)
    setErroItens(null)
    try {
      const itens = await capturaService.listarItens(sessao.id, sessao.workspace_id)
      setLancRelacionados(
        itens
          .filter((it) => it.lancamento_criado_id)
          .map((it) => ({
            descricao: it.descricao,
            lancamentoId: String(it.lancamento_criado_id),
          })),
      )
    } catch {
      setErroItens('Não foi possível carregar os lançamentos relacionados.')
      setLancRelacionados(null)
    } finally {
      setCarregandoItens(false)
    }
  }

  if (!sessao) return null

  const podeRetomar = sessao.status === 'revisao' || sessao.status === 'parcial'

  return (
    <Dialog open={!!sessao} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent
        className={cn(
          'max-w-lg bg-white max-h-[85vh] overflow-y-auto',
          // Parte A (0.0.160) — smartphone: quase tela cheia; desktop: como está
          smFullDialog,
        )}
      >
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
            {/* R3 — um único caminho para a revisão: sessões em revisão/parcial
                retomam a edição; sessões importadas caem no aviso da página. */}
            <Button
              variant={podeRetomar ? 'default' : 'outline'}
              size="sm"
              className="h-8 text-xs"
              disabled={processando}
              onClick={abrirRevisao}
            >
              {processando ? (
                <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
              ) : (
                <ListChecks className="w-3.5 h-3.5 mr-1" />
              )}
              {processando
                ? 'Abrindo…'
                : podeRetomar
                  ? 'Continuar revisão'
                  : 'Ver itens reconhecidos'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              disabled={carregandoItens}
              onClick={verLancamentos}
            >
              <Receipt className="w-3.5 h-3.5 mr-1" />
              Ver lançamentos relacionados
            </Button>
          </div>

          {/* R3.2 — lista legível DENTRO do modal (sem alert()). */}
          {carregandoItens && <p className="text-xs text-slate-400">Carregando lançamentos…</p>}
          {erroItens && <p className="text-xs text-rose-600">{erroItens}</p>}
          {lancRelacionados !== null && !carregandoItens && (
            <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
              <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-2">
                Lançamentos relacionados (rastreabilidade)
              </p>
              {lancRelacionados.length === 0 ? (
                <p className="text-xs text-slate-500">
                  Esta captura ainda não gerou lançamentos. Use “Processar capturas” e “Importar
                  selecionados” na página de captura.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {lancRelacionados.map((l, i) => (
                    <li key={i} className="text-xs text-slate-700 flex flex-col">
                      <span className="font-semibold text-slate-900">{l.descricao}</span>
                      <span className="text-slate-500">
                        Lançamento #{l.lancamentoId.slice(0, 8)} • consulte na tela Lançamentos
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

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
