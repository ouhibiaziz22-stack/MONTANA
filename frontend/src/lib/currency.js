/** The order-level delivery fee. It is never multiplied by item quantity. */
export const DELIVERY_FEE = 7

/** Formats all customer-facing prices in Tunisian dinar without changing stored values. */
export function formatPrice(value) {
  const amount = Number(value)

  if (!Number.isFinite(amount)) return '—'

  const formatted = Number.isInteger(amount)
    ? String(amount)
    : amount.toFixed(2).replace(/\.00$/, '').replace('.', ',')

  return `${formatted} DT`
}

export function calculateOrderTotal(subtotal, discount = 0) {
  return Math.max(0, Number(subtotal) - Number(discount)) + DELIVERY_FEE
}
