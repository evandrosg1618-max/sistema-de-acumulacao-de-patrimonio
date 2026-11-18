/**
 * Orquestra OCR das capturas com o perfil NFC-e (SAP v0.0.98):
 * imagens (dataURL/Blob) → Tesseract (por) → linhas → parser da trilha.
 * Reutiliza tesseractService existente. O parser da FATURA nunca é chamado.
 */

import { executarOcrImagem } from '@/services/imageOcr/tesseractService'
import {
  parseItensNfce,
  marcarRepeticoesEntreCapturas,
  extrairTotalDocumento,
  extrairDataDocumento,
  type ItemCandidatoOcr,
  type TrilhaCaptura,
} from '@/services/captura/nfceParser'

export interface ProgressoOcrCaptura {
  imagemIndex: number
  total: number
  status: string
  progresso: number
}

export interface ResultadoProcessamentoCaptura {
  itens: ItemCandidatoOcr[]
  totalDocumento: number | null
  dataDocumento: string | null
  totalConfianca: 'alta' | 'baixa'
  dataConfianca: 'alta' | 'baixa'
  linhasPorImagem: string[][]
}

export async function processarCapturasNfce(
  imagens: string[] | Blob[],
  trilha: TrilhaCaptura,
  onProgresso?: (p: ProgressoOcrCaptura) => void,
  signal?: AbortSignal,
): Promise<ResultadoProcessamentoCaptura> {
  const todasLinhas: string[][] = []
  const itensOcr: ItemCandidatoOcr[] = []

  for (let i = 0; i < imagens.length; i++) {
    onProgresso?.({
      imagemIndex: i,
      total: imagens.length,
      status: 'Processando captura ' + (i + 1),
      progresso: 0,
    })
    const { lines } = await executarOcrImagem(
      imagens[i],
      (p) => {
        onProgresso?.({
          imagemIndex: i,
          total: imagens.length,
          status: p.status,
          progresso: p.progress,
        })
      },
      signal,
    )
    todasLinhas.push(lines)
    const itens = parseItensNfce(lines, trilha, i)
    itensOcr.push(...itens)
  }

  // Repetições por sobreposição entre capturas consecutivas: só MARCAR
  const itensMarcados = marcarRepeticoesEntreCapturas(itensOcr)

  // Total do documento: melhor tentativa sobre TODAS as linhas combinadas
  const todasLinhasFlat = todasLinhas.flat()
  const { total, confianca: tc } = extrairTotalDocumento(todasLinhasFlat)
  const { data, confianca: dc } = extrairDataDocumento(todasLinhasFlat)

  return {
    itens: itensMarcados,
    totalDocumento: total,
    dataDocumento: data,
    totalConfianca: tc,
    dataConfianca: dc,
    linhasPorImagem: todasLinhas,
  }
}
