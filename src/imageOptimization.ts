export const PRODUCT_UPLOAD_MAX_PX = 1200
export const LOGO_UPLOAD_MAX_PX = 800
export const PDF_RASTER_DPI = 200
export const JPEG_QUALITY = 0.84

export type ImageSource = Blob | string
export type OptimizedImage = { dataUrl: string; width: number; height: number; changed: boolean }

export function dataUrlByteLength(value: string): number {
  const comma = value.indexOf(',')
  if (comma < 0) return value.length
  const payload = value.slice(comma + 1)
  return Math.max(0, Math.floor(payload.length * 3 / 4) - (payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0))
}

export function containedSize(width: number, height: number, maxWidth: number, maxHeight: number) {
  if (width <= 0 || height <= 0 || maxWidth <= 0 || maxHeight <= 0) return { width: 0, height: 0 }
  const scale = Math.min(1, maxWidth / width, maxHeight / height)
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

export function mmToPixels(mm: number, dpi = PDF_RASTER_DPI) {
  return Math.max(1, Math.ceil(mm / 25.4 * dpi))
}

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error || new Error('Image could not be read'))
    reader.readAsDataURL(blob)
  })
}

async function decode(source: ImageSource): Promise<{ image: CanvasImageSource; width: number; height: number; close?: () => void }> {
  const blob = typeof source === 'string' ? await (await fetch(source)).blob() : source
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' })
      return { image: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() }
    } catch { /* Safari/older browser fallback below */ }
  }
  const url = URL.createObjectURL(blob)
  try {
    const image = new Image()
    image.decoding = 'async'
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('Image could not be decoded')); image.src = url })
    return { image, width: image.naturalWidth, height: image.naturalHeight }
  } finally { URL.revokeObjectURL(url) }
}

function canvasDataUrl(canvas: HTMLCanvasElement, type: string, quality?: number) {
  const result = canvas.toDataURL(type, quality)
  if (!result.startsWith(`data:${type}`)) throw new Error(`${type} encoding is unavailable`)
  return result
}

export async function optimizeImage(source: ImageSource, options: { maxWidth: number; maxHeight: number; quality?: number; preserveSmall?: boolean }): Promise<OptimizedImage> {
  const fallback = typeof source === 'string' ? source : await readBlob(source)
  try {
    const decoded = await decode(source)
    try {
      const size = containedSize(decoded.width, decoded.height, options.maxWidth, options.maxHeight)
      const isSmall = size.width === decoded.width && size.height === decoded.height
      if (isSmall && options.preserveSmall !== false) return { dataUrl: fallback, width: decoded.width, height: decoded.height, changed: false }
      const canvas = document.createElement('canvas')
      canvas.width = size.width
      canvas.height = size.height
      const context = canvas.getContext('2d', { alpha: true })
      if (!context) throw new Error('Canvas is unavailable')
      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = 'high'
      context.drawImage(decoded.image, 0, 0, size.width, size.height)
      const pixels = context.getImageData(0, 0, size.width, size.height).data
      let transparent = false
      for (let i = 3; i < pixels.length; i += 4) { if (pixels[i] < 255) { transparent = true; break } }
      const dataUrl = transparent ? canvasDataUrl(canvas, 'image/png') : canvasDataUrl(canvas, 'image/jpeg', options.quality ?? JPEG_QUALITY)
      // Never replace an image with a larger representation merely to normalize it.
      if (typeof source === 'string' && dataUrlByteLength(dataUrl) >= dataUrlByteLength(source)) return { dataUrl: source, width: decoded.width, height: decoded.height, changed: false }
      return { dataUrl, width: size.width, height: size.height, changed: true }
    } finally { decoded.close?.() }
  } catch {
    // Unsupported formats, decode failures and canvas security/memory failures retain the original.
    return { dataUrl: fallback, width: 0, height: 0, changed: false }
  }
}

export async function normalizeUploadedImage(file: File, kind: 'product' | 'logo' = 'product') {
  const max = kind === 'logo' ? LOGO_UPLOAD_MAX_PX : PRODUCT_UPLOAD_MAX_PX
  return (await optimizeImage(file, { maxWidth: max, maxHeight: max })).dataUrl
}

export async function optimizeForPdf(image: string, renderedWidthMm: number, renderedHeightMm: number) {
  return (await optimizeImage(image, {
    maxWidth: mmToPixels(renderedWidthMm),
    maxHeight: mmToPixels(renderedHeightMm),
    preserveSmall: true,
  })).dataUrl
}

export function pdfImageFormat(image: string): 'PNG' | 'JPEG' {
  return image.startsWith('data:image/png') ? 'PNG' : 'JPEG'
}
