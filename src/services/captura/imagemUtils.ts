/**
 * Utilitários de imagem para o fluxo de captura de NFC-e (v0.0.98):
 * carregar arquivo/blob → ImageData; recorte; compressão para upload.
 */

export async function blobParaDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error || new Error('Falha ao ler imagem'))
    reader.readAsDataURL(blob)
  })
}

export function carregarImagem(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Não foi possível carregar a imagem'))
    img.src = src
  })
}

export interface Retangulo {
  x: number
  y: number
  w: number
  h: number
}

/** Recorta a região (coordenadas na imagem natural) e devolve dataURL JPEG. */
export function recortarImagem(img: HTMLImageElement, regiao: Retangulo, qualidade = 0.85): string {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(regiao.w))
  canvas.height = Math.max(1, Math.round(regiao.h))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas não suportado neste navegador')
  ctx.drawImage(img, regiao.x, regiao.y, regiao.w, regiao.h, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', qualidade)
}

/**
 * Comprime/redimensiona a imagem para upload no Storage (limite de lado
 * maior configurável — economiza banda e espaço, 1600px preserva a leitura
 * do OCR de cupom).
 */
export async function comprimirImagem(
  dataUrl: string,
  maiorLado = 1600,
  qualidade = 0.8,
): Promise<{ dataUrl: string; blob: Blob }> {
  const img = await carregarImagem(dataUrl)
  const escala = Math.min(1, maiorLado / Math.max(img.naturalWidth, img.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.naturalWidth * escala)
  canvas.height = Math.round(img.naturalHeight * escala)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas não suportado neste navegador')
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  const out = canvas.toDataURL('image/jpeg', qualidade)
  const blob = await (await fetch(out)).blob()
  return { dataUrl: out, blob }
}
