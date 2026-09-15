import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { containedSize, dataUrlByteLength, mmToPixels, pdfImageFormat, PDF_RASTER_DPI, PRODUCT_UPLOAD_MAX_PX } from '../src/imageOptimization.ts'

const app = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')

test('contained dimensions preserve aspect ratio, cap both axes and never upscale', () => {
  assert.deepEqual(containedSize(4032, 3024, 1200, 1200), { width: 1200, height: 900 })
  assert.deepEqual(containedSize(3024, 4032, 1200, 1200), { width: 900, height: 1200 })
  assert.deepEqual(containedSize(320, 200, 1200, 1200), { width: 320, height: 200 })
  assert.equal(PRODUCT_UPLOAD_MAX_PX, 1200)
})

test('PDF dimensions use a high-quality 200 DPI render target', () => {
  assert.equal(PDF_RASTER_DPI, 200)
  assert.equal(mmToPixels(20), 158)
  assert.equal(mmToPixels(18), 142)
  assert.equal(mmToPixels(54), 426)
})

test('data URL byte accounting and supported jsPDF formats are deterministic', () => {
  assert.equal(dataUrlByteLength('data:image/jpeg;base64,YWJj'), 3)
  assert.equal(pdfImageFormat('data:image/png;base64,AA=='), 'PNG')
  assert.equal(pdfImageFormat('data:image/webp;base64,AA=='), 'JPEG')
})

test('all PDF entry pathways converge on awaited shared generation', () => {
  assert.match(app, /generatePdf\(\)[\s\S]*runPdfDownload\('Generating PDF…'/)
  assert.match(app, /generateSalesPdf\(\)[\s\S]*runPdfDownload\('Generating PDF…'/)
  assert.match(app, /generateEstimatePdf\(\)[\s\S]*runPdfDownload\('Generating PDF…'/)
  assert.match(app, /onPdf=\{\(d\) => void runPdfDownload\('Preparing PDF…', \(\) => d\)\}/)
  assert.match(app, /await downloadQuotationPdf\(doc, settings\)/)
})

test('PDF regression guard optimizes detached legacy data and enables jsPDF compression', () => {
  assert.match(app, /optimizeForPdf\(item\.image, 20, 18\)/)
  assert.match(app, /const doc: SavedDocument = \{ \.\.\.sourceDoc, items:/)
  assert.match(app, /new jsPDF\(\{ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true \}\)/)
  assert.match(app, /pdf\.addImage\([^\n]+undefined, 'FAST'\)/)
  assert.doesNotMatch(app, /fileToDataUrl/)
})

test('every image upload is normalized before app state persistence', () => {
  assert.equal((app.match(/normalizeUploadedImage\(/g) || []).length, 2)
  assert.match(app, /normalizeUploadedImage\(file, 'product'\)/)
  assert.match(app, /normalizeUploadedImage\(file, 'logo'\)/)
})
