import test from 'node:test'
import assert from 'node:assert/strict'
import { freshDocumentData, freshEstimateDocument } from '../src/formReset.ts'

test('fresh document data removes previously entered customer details and keeps only new defaults', () => {
  const previous = { company_name: 'Old Company', customer_name: 'Old Customer', address: 'Old Address' }
  const fresh = freshDocumentData({ company_name: '', customer_name: '', address: '', salesperson_name: 'Admin' }, 'quotation_number', 'Q-002', 'quotation_date', '2026-09-05')
  assert.notDeepEqual(fresh, previous)
  assert.deepEqual(fresh, {
    company_name: '', customer_name: '', address: '', salesperson_name: 'Admin', quotation_number: 'Q-002', quotation_date: '2026-09-05',
  })
})

test('fresh estimate data keeps the next automatic number and current date', () => {
  assert.deepEqual(freshDocumentData({ company_name: '', gstin: '' }, 'estimate_number', 'E-009', 'estimate_date', '2026-09-05'), {
    company_name: '', gstin: '', estimate_number: 'E-009', estimate_date: '2026-09-05',
  })
})

test('successful estimate reset restores the complete default expense set rather than one blank row', () => {
  let id = 0
  const reset = freshEstimateDocument({ company_name: '', gstin: '' }, 'E-010', '2026-09-05', 12, () => `reset-${++id}`)
  assert.equal(reset.data.estimate_number, 'E-010')
  assert.deepEqual(reset.items.map((row) => row.productName), [
    'Technician Wages', 'Food Expenses', 'Hotel Expenses', 'Transportation', 'Local Transportation',
  ])
  assert.deepEqual(reset.items.map((row) => row.id), ['reset-1', 'reset-2', 'reset-3', 'reset-4', 'reset-5'])
})
