import * as pdfjsLib from 'pdfjs-dist'

// Configura o worker de forma segura usando unpkg da mesma versão do pdfjs-dist instalado
if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`
  } catch {
    // Fallback silencioso
  }
}

export interface PdfTextPage {
  pageNumber: number
  text: string
  lines: string[]
}

export interface PdfExtractionOutput {
  numPages: number
  pages: PdfTextPage[]
  fullText: string
  isProtected: boolean
}

export class PasswordRequiredError extends Error {
  constructor(
    message = 'PDF protegido — Este arquivo exige uma senha para leitura. Informe a senha para continuar.',
  ) {
    super(message)
    this.name = 'PasswordRequiredError'
  }
}

export class InvalidPasswordError extends Error {
  constructor(message = 'Não foi possível abrir o PDF. Verifique a senha e tente novamente.') {
    super(message)
    this.name = 'InvalidPasswordError'
  }
}

/**
 * Lê o conteúdo em texto do PDF carregado via Uint8Array ou File/Blob.
 * Se o PDF for protegido por senha e nenhuma for fornecida, dispara PasswordRequiredError.
 * Se a senha fornecida for inválida, dispara InvalidPasswordError.
 * A senha existe estritamente em memória local durante o processamento.
 */
export async function extrairTextoPdf(
  arquivo: ArrayBuffer | Uint8Array,
  senha?: string,
): Promise<PdfExtractionOutput> {
  const data = arquivo instanceof Uint8Array ? arquivo : new Uint8Array(arquivo)

  const loadingTask = pdfjsLib.getDocument({
    data,
    password: senha || undefined,
  })

  // Hook para capturar solicitação de senha do pdf.js
  let passwordRequired = false
  loadingTask.onPassword = (callback: (password: string) => void, reason: number) => {
    passwordRequired = true
    if (senha) {
      callback(senha)
    } else {
      // Interrompe sem travar
      callback('')
    }
  }

  let pdfDoc: pdfjsLib.PDFDocumentProxy
  try {
    pdfDoc = await loadingTask.promise
  } catch (err: any) {
    if (err?.name === 'PasswordException' || passwordRequired) {
      if (!senha) {
        throw new PasswordRequiredError()
      } else {
        throw new InvalidPasswordError()
      }
    }
    throw err
  }

  const pages: PdfTextPage[] = []
  let fullText = ''

  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i)
    const textContent = await page.getTextContent()

    // Reagrupar itens de texto considerando sua coordenada Y para formar linhas coerentes
    const items = textContent.items as Array<{
      str: string
      transform: number[]
      hasEOL?: boolean
    }>

    // Agrupar por coordenada Y aproximada (arredondando para tolerar pequenas variações na mesma linha)
    const lineBuckets = new Map<number, Array<{ x: number; text: string }>>()
    for (const item of items) {
      if (!item.str || item.str.trim() === '') continue
      const y = Math.round(item.transform[5])
      const x = item.transform[4]

      let bucket = lineBuckets.get(y)
      if (!bucket) {
        // Tenta achar bucket existente a ±2 unidades
        for (const [k, v] of lineBuckets.entries()) {
          if (Math.abs(k - y) <= 2) {
            bucket = v
            break
          }
        }
      }

      if (!bucket) {
        bucket = []
        lineBuckets.set(y, bucket)
      }

      bucket.push({ x, text: item.str })
    }

    // Ordena do topo para a base (Y decrescente)
    const sortedYs = Array.from(lineBuckets.keys()).sort((a, b) => b - a)
    const pageLines: string[] = []

    for (const y of sortedYs) {
      const bucket = lineBuckets.get(y)!
      // Ordena da esquerda para a direita (X crescente)
      bucket.sort((a, b) => a.x - b.x)
      const lineText = bucket
        .map((b) => b.text)
        .join(' ')
        .trim()
      if (lineText) {
        pageLines.push(lineText)
      }
    }

    const pageText = pageLines.join('\n')
    pages.push({
      pageNumber: i,
      text: pageText,
      lines: pageLines,
    })
    fullText += pageText + '\n\n'
  }

  return {
    numPages: pdfDoc.numPages,
    pages,
    fullText,
    isProtected: passwordRequired || !!senha,
  }
}

/**
 * Calcula hash SHA-256 do arquivo para detecção de reimportação idempotente.
 */
export async function calcularHashArquivo(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}
