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

type SourceHit = { accountId: number; debtId: number; name: string; score: number }

function scoreSource(
  textLower: string,
  name: string,
  kind: 'account' | 'debt',
  preferCard: boolean,
  preferAccount: boolean,
) {
  const n = name.toLowerCase()
  let score = 0
  if (n.length >= 3 && textLower.includes(n)) score = n.length + 8
  for (const part of n.split(/[\s\-/]+/)) {
    if (part.length < 3 || CURRENCY_NOISE.has(part) || GENERIC_NOISE.has(part)) continue
    if ((part === 'ahorro' || part === 'ahorros') && !preferAccount) continue
    if (textLower.includes(part) && part.length + 2 > score) score = part.length + 2
  }
  if (preferAccount && kind === 'account' && n.includes('ahorro')) {
    score = Math.max(score, 8) + (score >= 8 ? 4 : 0)
  }
  if (score === 0) return 0
  if (preferCard && kind === 'debt') score += 4
  if (preferCard && kind === 'account') score -= 2
  if (preferAccount && kind === 'account') score += 3
  if (preferAccount && kind === 'debt') score -= 2
  return score
}

function matchSource(text: string, money: MonthMoney): SourceHit | null {
  const lower = text.toLowerCase()
  const preferCard = lower.includes('tarjeta')
  const preferAccount = lower.includes('cuenta') || lower.includes('ahorro')
  let best: SourceHit | null = null

  for (const card of money.cards ?? []) {
    const score = scoreSource(lower, card.name, 'debt', preferCard, preferAccount)
    if (score > 0 && (!best || score > best.score)) {
      best = { accountId: 0, debtId: card.id, name: card.name, score }
    }
  }
  for (const account of money.accounts ?? []) {
    const score = scoreSource(lower, account.name, 'account', preferCard, preferAccount)
    if (score > 0 && (!best || score > best.score)) {
      best = { accountId: account.id, debtId: 0, name: account.name, score }
    }
  }
  return best
}

function extractNote(text: string) {
  const quoted = text.match(NOTE_QUOTED_RE)
  if (quoted?.[1]?.trim()) return quoted[1].trim().slice(0, 80)
  const cue = text.match(NOTE_CUE_RE)
  if (cue?.[1]?.trim()) return cue[1].trim().slice(0, 80)
  return ''
}

const CREATE_CATEGORY_RE = /^(?:crea(?:r)?|nueva)\s+categor[ií]a\s+(.+)$/i
const JUNK_NAMES = new Set([
  'no', 'si', 'sí', 'ok', 'okay', 'vale', 'ya', 'listo', 'gracias', 'hola',
  'no se', 'no sé', 'nose', 'nada', 'ninguna', 'ninguno', 'tal vez', 'quizas', 'quizás',
])

function sanitizeCategoryName(raw: string) {
  let name = raw.trim().replace(/^['"]+|['"]+$/g, '')
  name = name.replace(/\s+/g, ' ').slice(0, 40).trim()
  if (!name) return ''
  return name.charAt(0).toUpperCase() + name.slice(1)
}

function isJunkName(name: string) {
  const key = name.trim().toLowerCase()
  if (!key || key.length < 2) return true
  if (JUNK_NAMES.has(key)) return true
  if (/^\?+$/.test(key)) return true
  return false
}

export type NewCategoryProposal = { name: string; kind: 'gasto' | 'ingreso' }

/** Suggest creating a category when the open draft needs one (or user says "crea categoría X"). */
export function proposeNewCategory(text: string, previous: MoneyDraft, money: MonthMoney): NewCategoryProposal | null {
  const trimmed = text.trim()
  if (!trimmed || !previous.amountCents || hasAmount(trimmed)) return null

  const kind = previous.kind === 'ingreso' ? 'ingreso' : 'gasto'
  const createMatch = trimmed.match(CREATE_CATEGORY_RE)
  let name = ''
  if (createMatch) {
    name = sanitizeCategoryName(createMatch[1] || '')
  } else {
    if (previous.categoryId > 0) return null
    if ([...trimmed].length > 40) return null
    if (matchCategory(trimmed, money, kind) || matchSource(trimmed, money) || extractNote(trimmed)) return null
    name = sanitizeCategoryName(trimmed)
  }
  if (!name || isJunkName(name)) return null
  const exists = money.categories.some(
    (item) => item.kind === kind && item.name.trim().toLowerCase() === name.toLowerCase(),
  )
  if (exists) return null
  return { name, kind }
}

/** Patch the open draft from a short correction. Returns null if the server should handle it. */
export function patchMoneyDraft(text: string, previous: MoneyDraft, money: MonthMoney): MoneyDraft | null {
  const trimmed = text.trim()
  if (!trimmed || !previous.amountCents || hasAmount(trimmed)) return null
  if (CREATE_CATEGORY_RE.test(trimmed)) return null

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
