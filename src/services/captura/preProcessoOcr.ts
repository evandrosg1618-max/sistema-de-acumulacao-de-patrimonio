/**
 * T4.2 — Pré-processamento para a TRILA DIGITAL do OCR NFC-e:
 * isola os pixels de texto AZUL do print e os converte em texto PRETO sobre
 * FUNDO BRANCO (canvas), melhorando o Tesseract. Fallback seguro: qualquer
 * falha devolve a imagem original sem erro (OCR normal segue).
 */

/** Converte um pixel RGB em { cinza, ehAzul } pelo espaço HSL simplificado. */
function pixelEhAzul(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const dif = max - min
  if (dif < 12) return false // acinzentado (código do produto) ou neutro
  // azul: canal B dominante com saturação perceptível
  return b > 70 && b >= max && b - g >= 18 && b - r >= 18
}

/**
 * Gera um data URL em preto e branco contendo APENAS o texto azul da imagem.
 * Retornos possíveis: data URL processado, OU null quando nada de azul foi
 * encontrado (imagem original é usada — fallback garantido).
 */
export async function isolarTextoAzul(dataUrl: string): Promise<string | null> {
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('imagem inválida'))
      el.src = dataUrl
    })

    const canvas = document.createElement('canvas')
    // Amplia 2x: fonte pequena de print de celular é o principal limitador do OCR
    const escala = 2
    canvas.width = img.naturalWidth * escala
    canvas.height = img.naturalHeight * escala
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

    const dados = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const px = dados.data
    let pixelsAzuis = 0
    for (let i = 0; i < px.length; i += 4) {
      if (pixelEhAzul(px[i], px[i + 1], px[i + 2])) {
        px[i] = 0
        px[i + 1] = 0
        px[i + 2] = 0
        pixelsAzuis++
      } else {
        px[i] = 255
        px[i + 1] = 255
        px[i + 2] = 255
      }
      px[i + 3] = 255
    }
    // Menos de 0,2% de azul: provavelmente NÃO é o print da NFC-e digital —
    // não vale trocar a imagem (evita piorar o OCR de fotos sem azul).
    if (pixelsAzuis < (px.length / 4) * 0.002) return null

    ctx.putImageData(dados, 0, 0)
    return canvas.toDataURL('image/png')
  } catch {
    return null // fallback seguro: usa a imagem original
  }
}

/**
 * T4.2 — remove o código de produto em cinza "(...)" da descrição final
 * (ex.: "CENOURA (4821) KGR" → "CENOURA KGR"); códigos fora de parênteses
 * numéricos isolados no fim também caem.
 */
export function removerCodigoProduto(descricao: string): string {
  return descricao
    .replace(/\((?:\d[\d.\-/x\s]*)\)/g, ' ') // "(4821)", "(4821/1)"
    .replace(/\s{2,}/g, ' ')
    .trim()
}
