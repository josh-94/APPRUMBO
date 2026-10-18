import type { MoneyDraft, MonthMoney } from './types'

const CATEGORY_SYNONYMS: Record<string, string[]> = {
  farmacia: ['pastilla', 'pastillas', 'medicina', 'medicinas', 'remedio', 'remedios', 'farmacia', 'botica'],
  salud: ['pastilla', 'pastillas', 'medicina', 'doctor', 'clínica', 'clinica', 'salud'],
  comida: ['almuerzo', 'cena', 'desayuno', 'menú', 'menu', 'restaurante', 'café', 'cafe', 'comida', 'alimento', 'alimentos'],
  alimentos: ['alimento', 'alimentos', 'almuerzo', 'cena', 'desayuno', 'comida', 'menú', 'menu'],
  transporte: ['taxi', 'uber', 'bus', 'metro', 'pasaje', 'combustible', 'gasolina', 'transporte', 'llanta', 'llantas'],
  hogar: ['super', 'supermercado', 'mercado', 'casa', 'hogar'],
  casa: ['super', 'supermercado', 'mercado', 'casa', 'hogar'],
  entretenimiento: ['cine', 'netflix', 'spotify', 'juego', 'entrada'],
}

const CURRENCY_NOISE = new Set(['sol', 'soles', 'pen', 'usd', 'dolar', 'dolares', 'dólar', 'dólares'])
const GENERIC_NOISE = new Set(['cuenta', 'tarjeta', 'banco', 'efectivo'])

const AMOUNT_RE = /(?:(?:s\s*\/|soles?)\s*\d{1,6}(?:[.,]\d{1,2})?|\d{1,6}(?:[.,]\d{1,2})?\s*soles?|\d{1,6}[.,]\d{1,2}|(?:gast\w*|pag\w*|compr\w*|anotar|añadir|agregar)\s+\d{1,6}(?:[.,]\d{1,2})?|\b\d{1,6}(?:[.,]\d{1,2})?\b)/i
const NOTE_QUOTED_RE = /['"]([^'"]{1,40})['"]/
const NOTE_CUE_RE = /(?:solo\s+fue\s+en|fue\s+solo\s+en|solo\s+en|la\s+nota\s+es|nota\s*:)\s+['"]?(.+?)['"]?\s*$/i

function hasAmount(text: string) {
  return AMOUNT_RE.test(text.trim())
}

function matchCategory(text: string, money: MonthMoney, kind: MoneyDraft['kind']) {
  const lower = text.toLowerCase()
  let best: { id: number; name: string; score: number } | null = null
  for (const item of money.categories.filter((c) => c.kind === kind)) {
    const name = item.name.toLowerCase()
    let score = 0
    if (name.length >= 3 && lower.includes(name)) score = name.length
    for (const [key, words] of Object.entries(CATEGORY_SYNONYMS)) {
      if (name !== key && !name.includes(key)) continue
      for (const word of words) {
        if (lower.includes(word) && word.length + 1 > score) score = word.length + 1
      }
    }
    if (score > 0 && (!best || score > best.score)) best = { id: item.id, name: item.name, score }
  }
  return best
}

function matchSource(text: string, money: MonthMoney) {
  const lower = text.toLowerCase()
  const preferCard = lower.includes('tarjeta')
  const preferAccount = lower.includes('cuenta') || lower.includes('ahorro')
  let best: { accountId: number; debtId: number; name: string; score: number } | null = null

  function consider(name: string, accountId: number, debtId: number, kind: 'account' | 'debt') {
    const n = name.toLowerCase()
    let score = 0
    if (n.length >= 3 && lower.includes(n)) score = n.length + 8
    for (const part of n.split(/[\s\-/]+/)) {
      if (part.length < 3 || CURRENCY_NOISE.has(part) || GENERIC_NOISE.has(part)) continue
      if ((part === 'ahorro' || part === 'ahorros') && !preferAccount) continue
      if (lower.includes(part) && part.length + 2 > score) score = part.length + 2
    }
    if (preferAccount && kind === 'account' && n.includes('ahorro')) {
      score = Math.max(score, 8) + (score >= 8 ? 4 : 0)
    }
    if (score === 0) return
    if (preferCard && kind === 'debt') score += 4
    if (preferCard && kind === 'account') score -= 2
    if (preferAccount && kind === 'account') score += 3
    if (preferAccount && kind === 'debt') score -= 2
    if (!best || score > best.score) best = { accountId, debtId, name, score }
  }

  for (const card of money.cards ?? []) consider(card.name, 0, card.id, 'debt')
  for (const account of money.accounts ?? []) consider(account.name, account.id, 0, 'account')
  return best
}

function extractNote(text: string) {
  const quoted = text.match(NOTE_QUOTED_RE)
  if (quoted?.[1]?.trim()) return quoted[1].trim().slice(0, 80)
  const cue = text.match(NOTE_CUE_RE)
  if (cue?.[1]?.trim()) return cue[1].trim().slice(0, 80)
  return ''
}

/** Patch the open draft from a short correction. Returns null if the server should handle it. */
export function patchMoneyDraft(text: string, previous: MoneyDraft, money: MonthMoney): MoneyDraft | null {
  const trimmed = text.trim()
  if (!trimmed || !previous.amountCents || hasAmount(trimmed)) return null

  const kind = previous.kind === 'ingreso' ? 'ingreso' : 'gasto'
  const category = matchCategory(trimmed, money, kind)
  const source = matchSource(trimmed, money)
  const note = extractNote(trimmed)
  if (!category && !source && !note) return null

  const next: MoneyDraft = {
    ...previous,
    kind,
    accountId: previous.accountId || 0,
    debtId: previous.debtId || 0,
    sourceName: previous.sourceName || '',
    question: '',
    confidence: 'alta',
  }
  if (category) {
    next.categoryId = category.id
    next.category = category.name
  }
  if (source) {
    next.accountId = source.accountId
    next.debtId = source.debtId
    next.sourceName = source.name
  }
  if (note) next.note = note
  if (!next.categoryId) {
    next.question = '¿En qué categoría lo anoto?'
    next.confidence = 'baja'
  }
  return next
}
