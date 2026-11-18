/**
 * Orquestra OCR das capturas com o perfil NFC-e (SAP v0.0.98):
 * imagens (dataURL/Blob) → Tesseract (por) → linhas → parser da trilha.
 * Reutiliza tesseractService existente. O parser da FATURA nunca é chamado.
 */

import { executarOcrImagem } from '@/services/imageOcr/tesseractService'
import {
  parseItensNfce,
  eliminarDuplicatasProcessamento,
  marcarRepeticoesEntreCapturas,
  extrairTotalDocumento,
  extrairDataDocumento,
  type ItemCandidatoOcr,
  type TrilhaCaptura,
} from '@/services/captura/nfceParser'
import { isolarTextoAzul, removerCodigoProduto } from '@/services/captura/preProcessoOcr'

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

/**
 * Ordena os candidatos na sequência da captura: primeiro pela imagem de
 * origem, depois pela posição relativa da linha bruta dentro do OCR daquela
 * imagem — assim a lista de revisão segue a ordem física do cupom/nota.
 */
function ordenarPorSequenciaCaptura(itens: ItemCandidatoOcr[]): ItemCandidatoOcr[] {
  return [...itens].sort((a, b) => {
    if (a.origemImagemIndex !== b.origemImagemIndex) {
      return a.origemImagemIndex - b.origemImagemIndex
    }
    return (a.ordemLinha ?? 0) - (b.ordemLinha ?? 0)
  })
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

    // Trilha DIGITAL: pré-processamento da imagem (isolar texto azul do bloco
    // de itens). Fallback seguro: sem azul suficiente devolve null e o OCR roda
    // normalmente sobre a imagem original — nunca interrompe o fluxo.
    let imagemEntrada: string | Blob = imagens[i]
    if (trilha === 'digital' && typeof imagens[i] === 'string') {
      try {
        const imagemAzul = await isolarTextoAzul(imagens[i] as string)
        if (imagemAzul) imagemEntrada = imagemAzul
      } catch {
        // pré-processamento é best-effort: qualquer falha segue sem ele
      }
    }

    const { lines } = await executarOcrImagem(
      imagemEntrada,
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

  // Qualidade do OCR: 1) elimina duplicatas EXATAS de processamento (mesma
  // linha OCR repetida por captura sobreposta/bloco duplicado); 2) ordena os
  // candidatos na sequência da captura (imagem + posição da linha no OCR);
  // 3) SÓ ENTÃO marca compras genuinamente repetidas entre capturas.
  const itensSemDuplicatas = eliminarDuplicatasProcessamento(itensOcr)
  const itensOrdenados = ordenarPorSequenciaCaptura(itensSemDuplicatas)
  const itensMarcados = marcarRepeticoesEntreCapturas(itensOrdenados)

  // Descrição final: remove código de produto embutido (ex: "7891234 CENOURA")
  const itensFinais = itensMarcados.map((item) => ({
    ...item,
    descricao: removerCodigoProduto(item.descricao) || item.descricao,
  }))

  // Total do documento: melhor tentativa sobre TODAS as linhas combinadas
  const todasLinhasFlat = todasLinhas.flat()
  const { total, confianca: tc } = extrairTotalDocumento(todasLinhasFlat)
  const { data, confianca: dc } = extrairDataDocumento(todasLinhasFlat)

  return {
    itens: itensFinais,
    totalDocumento: total,
    dataDocumento: data,
    totalConfianca: tc,
    dataConfianca: dc,
    linhasPorImagem: todasLinhas,
  }
}
