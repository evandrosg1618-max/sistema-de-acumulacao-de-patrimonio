import { useState } from 'react'
import { ChevronDown, ChevronRight, Copy, Check, FileText, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { PdfExtractionOutput } from '@/services/pdf/pdfReader'
import { ParserResult } from '@/types/faturaPdf'

export interface PainelTextoExtraidoProps {
  extraction: PdfExtractionOutput | null
  parsed: ParserResult | null
}

export function PainelTextoExtraido({ extraction, parsed }: PainelTextoExtraidoProps) {
  const [expandido, setExpandido] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const [paginaAberta, setPaginaAberta] = useState<number | null>(1)

  const avisos = parsed?.avisos || []
  const paginas = extraction?.pages || []

  // Monta texto consolidado para cópia
  const gerarTextoCompleto = () => {
    const partes: string[] = []

    partes.push('=== INFORMAÇÕES DO PARSER ===')
    if (parsed) {
      partes.push(`Emissor detectado: ${parsed.cabecalho.emissorNome || parsed.cabecalho.emissor}`)
      partes.push(`Competência: ${parsed.cabecalho.competencia || 'N/D'}`)
      partes.push(`Vencimento: ${parsed.cabecalho.vencimento || 'N/D'}`)
      partes.push(`Fechamento: ${parsed.cabecalho.fechamento || 'N/D'}`)
      partes.push(`Valor Total Declarado: R$ ${parsed.cabecalho.valorTotalFatura.toFixed(2)}`)
      partes.push(`Itens extraídos: ${parsed.linhas.length}`)
      partes.push(`Titulares: ${parsed.cabecalho.titulares.join(', ') || 'nenhum'}`)
      partes.push(`Finais de cartão: ${parsed.cabecalho.finais.join(', ') || 'nenhum'}`)
    }

    if (avisos.length > 0) {
      partes.push('\n=== AVISOS DO PARSER ===')
      avisos.forEach((av, idx) => partes.push(`[${idx + 1}] ${av}`))
    }

    partes.push('\n=== TEXTO EXTRAÍDO POR PÁGINA ===')
    if (paginas.length > 0) {
      paginas.forEach((p) => {
        partes.push(`\n--- PÁGINA ${p.pageNumber} (${p.lines.length} linhas) ---`)
        p.lines.forEach((l, lIdx) => {
          partes.push(`${String(lIdx + 1).padStart(3, ' ')}: ${l}`)
        })
      })
    } else if (extraction?.fullText) {
      partes.push(extraction.fullText)
    } else {
      partes.push('(Nenhum texto extraído em memória)')
    }

    return partes.join('\n')
  }

  const handleCopiarTudo = async () => {
    try {
      const texto = gerarTextoCompleto()
      await navigator.clipboard.writeText(texto)
      setCopiado(true)
      toast.success('Texto extraído e avisos copiados para a área de transferência!')
      setTimeout(() => setCopiado(false), 2500)
    } catch {
      toast.error('Não foi possível copiar automaticamente para a área de transferência.')
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden text-xs">
      {/* Barra de título recolhível */}
      <div className="p-3.5 flex flex-wrap items-center justify-between gap-2 bg-slate-50 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setExpandido((v) => !v)}
          className="flex items-center gap-2 font-semibold text-slate-800 hover:text-emerald-700 transition-colors"
        >
          {expandido ? (
            <ChevronDown className="w-4 h-4 text-slate-500" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-500" />
          )}
          <FileText className="w-4 h-4 text-slate-600" />
          <span>Ver texto extraído do PDF & Diagnóstico</span>
          <span className="text-[11px] font-normal text-slate-500 ml-1">
            ({paginas.length} página(s), {avisos.length} aviso(s))
          </span>
        </button>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleCopiarTudo}
            className="h-7 text-xs border-slate-300 text-slate-700 hover:bg-slate-100 gap-1.5"
          >
            {copiado ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-emerald-700 font-medium">Copiado!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-slate-500" />
                <span>Copiar tudo</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {expandido && (
        <div className="p-4 space-y-4">
          {/* Seção de Avisos do Parser */}
          {avisos.length > 0 && (
            <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg space-y-2">
              <div className="flex items-center gap-2 font-semibold text-amber-900">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Avisos e Linhas Não Reconhecidas ({avisos.length})</span>
              </div>
              <ul className="space-y-1 pl-5 list-disc text-amber-800 text-[11px] leading-relaxed max-h-56 overflow-y-auto">
                {avisos.map((av, idx) => (
                  <li key={idx} className="whitespace-pre-wrap break-all">
                    {av}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Seção de Páginas e Linhas */}
          {paginas.length > 0 ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 pb-2">
                <span className="text-[11px] text-slate-500 mr-1">Página:</span>
                {paginas.map((p) => (
                  <button
                    key={p.pageNumber}
                    type="button"
                    onClick={() =>
                      setPaginaAberta((atual) => (atual === p.pageNumber ? null : p.pageNumber))
                    }
                    className={`px-2.5 py-1 rounded text-xs transition-colors ${
                      paginaAberta === p.pageNumber
                        ? 'bg-slate-800 text-white font-medium'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    Página {p.pageNumber} ({p.lines.length} l.)
                  </button>
                ))}
              </div>

              {paginas
                .filter((p) => paginaAberta === null || p.pageNumber === paginaAberta)
                .map((p) => (
                  <div
                    key={p.pageNumber}
                    className="border border-slate-200 rounded-lg overflow-hidden"
                  >
                    <div className="bg-slate-100 px-3 py-1.5 font-semibold text-slate-700 flex justify-between items-center text-[11px]">
                      <span>
                        Página {p.pageNumber} — {p.lines.length} linha(s) extraída(s)
                      </span>
                    </div>
                    <div className="bg-slate-900 text-slate-100 p-3 font-mono text-[11px] leading-tight overflow-x-auto max-h-72 overflow-y-auto space-y-0.5 select-text">
                      {p.lines.length === 0 ? (
                        <span className="text-slate-400 italic">Nenhum texto nesta página.</span>
                      ) : (
                        p.lines.map((linha, lIdx) => (
                          <div key={lIdx} className="hover:bg-slate-800/80 px-1 rounded flex">
                            <span className="text-slate-500 w-10 shrink-0 select-none text-right pr-2">
                              {lIdx + 1}
                            </span>
                            <span className="text-slate-100 whitespace-pre-wrap break-all">
                              {linha}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-slate-500 text-center">
              {extraction?.fullText ? (
                <div className="bg-slate-900 text-slate-100 p-3 font-mono text-[11px] text-left max-h-72 overflow-y-auto whitespace-pre-wrap select-text">
                  {extraction.fullText}
                </div>
              ) : (
                <span>
                  O texto extraído em memória está disponível quando a fatura é processada nesta
                  sessão do navegador.
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
