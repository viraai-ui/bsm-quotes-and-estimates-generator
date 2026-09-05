import { createDefaultEstimateRows } from './estimateExpenses.ts'

export function freshDocumentData(
  defaults: Record<string, string>,
  numberKey: string,
  nextNumber: string,
  dateKey: string,
  currentDate: string,
) {
  return {
    ...defaults,
    [numberKey]: nextNumber,
    [dateKey]: currentDate,
  }
}

export function freshEstimateDocument(
  defaults: Record<string, string>,
  nextNumber: string,
  currentDate: string,
  gst: number,
  createId?: () => string,
) {
  return {
    data: freshDocumentData(defaults, 'estimate_number', nextNumber, 'estimate_date', currentDate),
    items: createDefaultEstimateRows(gst, createId),
  }
}
