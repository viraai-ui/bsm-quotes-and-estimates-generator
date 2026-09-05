export type EstimateExpensePreset = {
  name: string
  price?: number
}

export const ESTIMATE_EXPENSE_PRESETS: EstimateExpensePreset[] = [
  { name: 'Technician Wages' },
  { name: 'Food Expenses', price: 500 },
  { name: 'Hotel Expenses', price: 1500 },
  { name: 'Transportation' },
  { name: 'Local Transportation' },
]

export type EstimateExpenseRow = {
  id: string
  productName: string
  description: string
  quantity: number
  price: number
  gst: number
}

/** Creates independent editable rows with IDs that remain stable for each row's lifetime. */
export function createDefaultEstimateRows(
  gst: number,
  createId: () => string = () => crypto.randomUUID(),
): EstimateExpenseRow[] {
  return ESTIMATE_EXPENSE_PRESETS.map((preset) => ({
    id: createId(),
    productName: preset.name,
    description: '',
    quantity: 1,
    price: preset.price ?? 0,
    gst,
  }))
}

export function matchingEstimateExpenses(value?: string, showAll = false) {
  const query = (value || '').trim().toLowerCase()
  if (showAll || !query) return ESTIMATE_EXPENSE_PRESETS
  return ESTIMATE_EXPENSE_PRESETS.filter((preset) => preset.name.toLowerCase().includes(query))
}

export function applyEstimateExpensePreset<T extends { productName: string; price: number }>(item: T, preset: EstimateExpensePreset): T {
  return {
    ...item,
    productName: preset.name,
    price: preset.price ?? item.price,
  }
}
