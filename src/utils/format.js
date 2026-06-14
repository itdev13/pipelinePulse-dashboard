// Shared formatters. The client is UK-based (Crittall) → £ + en-GB.
const gbp = new Intl.NumberFormat('en-GB', {
  style: 'currency', currency: 'GBP', maximumFractionDigits: 0,
})

export const money = (v) => (v == null ? '—' : gbp.format(Number(v)))

export const num = (v) => (v == null ? '—' : new Intl.NumberFormat('en-GB').format(Number(v)))

export const pct = (v) => (v == null ? '—' : `${Number(v).toFixed(1)}%`)

// Hours → human ("3.5h", "2.1d"). Input is a number of hours.
export const hours = (h) => {
  if (h == null) return '—'
  const n = Number(h)
  if (n < 1) return `${Math.round(n * 60)}m`
  if (n < 48) return `${n.toFixed(1)}h`
  return `${(n / 24).toFixed(1)}d`
}

// Chart palette — colour-blind-safe, brand-led.
export const PALETTE = ['#3563e9', '#22c55e', '#f59e0b', '#a855f7', '#ef4444', '#06b6d4', '#ec4899', '#84cc16']
export const STATUS_COLORS = { won: '#22c55e', lost: '#ef4444', open: '#3563e9', abandoned: '#94a3b8' }
