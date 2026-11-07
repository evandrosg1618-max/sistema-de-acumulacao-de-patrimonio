export interface OcrProgress {
  status: string
  progress: number
}

export interface OcrImageResult {
  imageIndex: number
  imageName: string
  fullText: string
  lines: string[]
}

const TESSERACT_CDN_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'

let tesseractScriptPromise: Promise<any> | null = null

/**
 * Garante o carregamento sob demanda do Tesseract.js via CDN no navegador.
 * Apenas inicializado quando o usuário utilizar print/imagem/câmera.
 */
export async function carregarTesseract(): Promise<any> {
  if (typeof window === 'undefined') {
    throw new Error('OCR suportado apenas no navegador.')
  }

  const w = window as any
  if (w.Tesseract) {
    return w.Tesseract
  }

  if (!tesseractScriptPromise) {
    tesseractScriptPromise = new Promise((resolve, reject) => {
      // Verifica se tag script já existe
      const scriptExistente = document.querySelector(`script[src="${TESSERACT_CDN_URL}"]`)
      if (scriptExistente) {
        scriptExistente.addEventListener('load', () => resolve((window as any).Tesseract))
        scriptExistente.addEventListener('error', (e) => reject(e))
        return
      }

      const script = document.createElement('script')
      script.src = TESSERACT_CDN_URL
      script.async = true
      script.onload = () => {
        if ((window as any).Tesseract) {
          resolve((window as any).Tesseract)
        } else {
          reject(new Error('Tesseract global não encontrado após carregar script.'))
        }
      }
      script.onerror = (err) => {
        tesseractScriptPromise = null
        reject(
          new Error('Falha ao carregar biblioteca de OCR (Tesseract.js). Verifique sua conexão.'),
        )
      }
      document.head.appendChild(script)
    })
  }

  return tesseractScriptPromise
}

/**
 * Executa o OCR em uma imagem (File ou Blob ou DataURL) com Web Worker e idioma pt-BR (por)
 */
export async function executarOcrImagem(
  source: File | Blob | string,
  onProgress?: (p: OcrProgress) => void,
  signal?: AbortSignal,
): Promise<{ text: string; lines: string[] }> {
  if (signal?.aborted) {
    throw new Error('Processamento cancelado pelo usuário.')
  }

  const Tesseract = await carregarTesseract()

  if (signal?.aborted) {
    throw new Error('Processamento cancelado pelo usuário.')
  }

  // Cria worker com logger de progresso
  const worker = await Tesseract.createWorker('por', 1, {
    logger: (m: any) => {
      if (onProgress && m) {
        onProgress({
          status: m.status || 'processando',
          progress: typeof m.progress === 'number' ? m.progress : 0,
        })
      }
    },
  })

  try {
    if (signal?.aborted) {
      throw new Error('Processamento cancelado pelo usuário.')
    }

    // Configura parâmetros para OCR de texto financeiro
    await worker.setParameters({
      tessedit_char_whitelist:
        '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÀÁÂÃÉÊÍÓÔÕÚÇàáâãéêíóôõúç.,/:$-* ',
    })

    const ret = await worker.recognize(source)
    const text = ret?.data?.text || ''
    const lines = text
      .split('\n')
      .map((l: string) => l.trim())
      .filter((l: string) => l.length > 0)

    return { text, lines }
  } finally {
    try {
      await worker.terminate()
    } catch {
      // Ignora erro no encerramento do worker
    }
  }
}
