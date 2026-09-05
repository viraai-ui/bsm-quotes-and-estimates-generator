import test from 'node:test'
import assert from 'node:assert/strict'
import { applyEstimateExpensePreset, createDefaultEstimateRows, matchingEstimateExpenses } from '../src/estimateExpenses.ts'

test('new estimates contain all standard independent expense rows with unique stable IDs', () => {
  let sequence = 0
  const rows = createDefaultEstimateRows(18, () => `expense-${++sequence}`)
  assert.deepEqual(rows.map(({ id, productName, quantity, price, gst }) => ({ id, productName, quantity, price, gst })), [
    { id: 'expense-1', productName: 'Technician Wages', quantity: 1, price: 0, gst: 18 },
    { id: 'expense-2', productName: 'Food Expenses', quantity: 1, price: 500, gst: 18 },
    { id: 'expense-3', productName: 'Hotel Expenses', quantity: 1, price: 1500, gst: 18 },
    { id: 'expense-4', productName: 'Transportation', quantity: 1, price: 0, gst: 18 },
    { id: 'expense-5', productName: 'Local Transportation', quantity: 1, price: 0, gst: 18 },
  ])
  assert.equal(new Set(rows.map((row) => row.id)).size, 5)
})

test('estimate expense suggestions show all on open and filter as the user types', () => {
  assert.equal(matchingEstimateExpenses('', true).length, 5)
  assert.equal(matchingEstimateExpenses('Food Expenses', true).length, 5)
  assert.deepEqual(matchingEstimateExpenses('f').map((item) => item.name), ['Food Expenses'])
  assert.deepEqual(matchingEstimateExpenses('fo').map((item) => item.name), ['Food Expenses'])
  assert.deepEqual(matchingEstimateExpenses('tr').map((item) => item.name), ['Transportation', 'Local Transportation'])
  assert.deepEqual(matchingEstimateExpenses('Food Expenses').map((item) => item.name), ['Food Expenses'])
  assert.deepEqual(matchingEstimateExpenses('not a preset'), [])
})

test('fixed daily rates are applied but other editable values are retained', () => {
  const row = { productName: 'fo', description: 'Vegetarian meals', quantity: 4, price: 0, gst: 18 }
  assert.deepEqual(applyEstimateExpensePreset(row, { name: 'Food Expenses', price: 500 }), {
    productName: 'Food Expenses', description: 'Vegetarian meals', quantity: 4, price: 500, gst: 18,
  })
})

test('presets without fixed rates preserve the manually entered cost', () => {
  const row = { productName: 'tech', description: '', quantity: 2, price: 2400, gst: 18 }
  assert.equal(applyEstimateExpensePreset(row, { name: 'Technician Wages' }).price, 2400)
})
