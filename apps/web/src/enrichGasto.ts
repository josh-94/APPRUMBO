import type { CaptureDraft, MonthMoney } from './types'

const CATEGORY_SYNONYMS: Record<string, string[]> = {
  farmacia: ['pastilla', 'pastillas', 'medicina', 'medicinas', 'remedio', 'remedios', 'farmacia', 'botica'],
  salud: ['pastilla', 'pastillas', 'medicina', 'doctor', 'clínica', 'clinica', 'salud'],
  comida: ['almuerzo', 'cena', 'desayuno', 'menú', 'menu', 'restaurante', 'café', 'cafe', 'comida'],
  transporte: ['taxi', 'uber', 'bus', 'metro', 'pasaje', 'combustible', 'gasolina', 'transporte'],
  hogar: ['super', 'supermercado', 'mercado', 'casa', 'hogar'],
  entretenimiento: ['cine', 'netflix', 'spotify', 'juego', 'entrada'],
}

function cleanGastoTitle(raw: string, sourceName: string, category: string) {
  let note = raw
  note = note.replace(/\b(?:gast[eé]|pagu[eé]|compré|compre)\b/gi, ' ')
  note = note.replace(/(?:s\s*\/\s*)?\d{1,6}(?:[.,]\d{1,2})?\s*(?:soles?)?/gi, ' ')
  note = note.replace(/\b(?:de\s+)?(?:mi\s+)?(?:la\s+)?(?:tarjeta|cuenta)\b/gi, ' ')
  if (sourceName) {
    note = note.replace(new RegExp(`\\b${sourceName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), ' ')
    for (const part of sourceName.toLowerCase().split(/[\s\-/]+/)) {
      if (part.length >= 3) note = note.replace(new RegExp(`\\b${part}\\b`, 'gi'), ' ')
    }
  }
  note = note.replace(/\b(?:en|por|de|del|la|el|un|una|mi|con|hoy|ayer)\b/gi, ' ')
  note = note.replace(/\s{2,}/g, ' ').trim()
  if (!note || note.toLowerCase() === category.toLowerCase()) return category || note
  return note
}

function matchCategory(text: string, money: MonthMoney) {
  const lower = text.toLowerCase()
  let best: { id: number; name: string; score: number } | null = null
  for (const item of money.categories.filter((c) => c.kind === 'gasto')) {
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
  let best: { accountId: number; debtId: number; name: string; currency: string; score: number } | null = null
  for (const card of money.cards ?? []) {
    const name = card.name.toLowerCase()
    let score = 0
    if (name.length >= 3 && lower.includes(name)) score = name.length
    for (const part of name.split(/[\s\-/]+/)) {
      if (part.length >= 3 && lower.includes(part) && part.length > score) score = part.length
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { accountId: 0, debtId: card.id, name: card.name, currency: card.currency, score }
    }
  }
  for (const account of money.accounts ?? []) {
    const name = account.name.toLowerCase()
    let score = 0
    if (name.length >= 3 && lower.includes(name)) score = name.length
    for (const part of name.split(/[\s\-/]+/)) {
      if (part.length >= 3 && lower.includes(part) && part.length > score) score = part.length
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { accountId: account.id, debtId: 0, name: account.name, currency: 'pen', score }
    }
  }
  return best
}

/** Fill category / payment from the user's money lists while Ollama thinks (or if it fails). */
export function enrichGastoDraft(raw: string, draft: CaptureDraft, money: MonthMoney | null | undefined): CaptureDraft {
  if (!money || draft.kind !== 'gasto') return draft
  const category = draft.categoryId
    ? { id: draft.categoryId, name: draft.category }
    : matchCategory(raw, money)
  const source = draft.debtId || draft.accountId
    ? {
        accountId: draft.accountId ?? 0,
        debtId: draft.debtId ?? 0,
        name: draft.sourceName ?? '',
        currency: draft.currency,
      }
    : matchSource(raw, money)

  const categoryName = category?.name || draft.category || ''
  const sourceName = source?.name || draft.sourceName || ''
  const title = cleanGastoTitle(draft.title || raw, sourceName, categoryName) || draft.title

  const accountId = source?.accountId ?? draft.accountId ?? 0
  const debtId = source?.debtId ?? draft.debtId ?? 0
  const amountCents = draft.amountCents
  const categoryId = category?.id ?? draft.categoryId ?? 0
  const hasAmount = amountCents > 0
  const hasCategory = categoryId > 0
  const hasSource = accountId > 0 || debtId > 0
  const questions: string[] = []
  if (!hasAmount) questions.push('¿De cuánto fue?')
  if (!hasCategory) questions.push('¿En qué categoría lo anoto?')
  if (!hasSource) questions.push('¿Con qué cuenta o tarjeta?')

  return {
    ...draft,
    title,
    categoryId,
    category: categoryName,
    accountId,
    debtId,
    sourceName,
    currency: source?.currency === 'usd' ? 'usd' : draft.currency || 'pen',
    confidence: questions.length === 0 ? 'alta' : 'baja',
    question: questions.join(' '),
  }
}

export function mergeCaptureDraft(model: CaptureDraft | null, local: CaptureDraft | null, raw: string, money?: MonthMoney | null): CaptureDraft | null {
  if (!model && !local) return null
  const base = model ?? local!
  const filled: CaptureDraft = {
    ...base,
    amountCents: model?.amountCents || local?.amountCents || 0,
    categoryId: model?.categoryId || local?.categoryId || 0,
    category: model?.category || local?.category || '',
    accountId: model?.accountId || local?.accountId || 0,
    debtId: model?.debtId || local?.debtId || 0,
    sourceName: model?.sourceName || local?.sourceName || '',
    title: model && model.title && model.title.toLowerCase() !== raw.trim().toLowerCase()
      ? model.title
      : (local?.title || model?.title || raw),
  }
  return enrichGastoDraft(raw, filled, money)
}
