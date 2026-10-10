import test from 'node:test'
import assert from 'node:assert/strict'
import { salesLineAmounts } from '../src/salesQuotation.ts'

test('wooden is a per-unit additive amount and GST applies to the complete base', () => {
  assert.deepEqual(salesLineAmounts({ quantity: 1, price: 100, wooden: 5, gst: 18 }), {
    wooden: 5,
    taxable: 105,
    gst: 18.9,
    total: 123.9,
  })
  assert.equal(salesLineAmounts({ quantity: 2, price: 100, wooden: 5, gst: 10 }).taxable, 210)
})

test('legacy Sales Quotation items without wooden default to zero', () => {
  assert.deepEqual(salesLineAmounts({ quantity: 2, price: 100, gst: 18 }), {
    wooden: 0,
    taxable: 200,
    gst: 36,
    total: 236,
  })
})
