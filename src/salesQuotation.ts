export type WoodenLineItem = {
  quantity: number
  price: number
  wooden?: number
  gst: number
}

/** Sales Quotation-only taxable base. Legacy rows without wooden remain unchanged. */
export function salesLineAmounts(item: WoodenLineItem, gstEnabled = true, gstRate = item.gst) {
  const wooden = Number(item.wooden ?? 0)
  const taxable = Number(item.quantity) * (Number(item.price) + wooden)
  const gst = gstEnabled ? taxable * (Number(gstRate) / 100) : 0
  return { wooden, taxable, gst, total: taxable + gst }
}
