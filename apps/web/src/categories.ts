export const categoryIcons = ['🍽', '🍔', '👕', '🚗', '🏠', '🐶', '🚌', '🎉', '💊', '🎮', '✨']

export const categoryTints = [
  { id: 'bruma', label: 'Verde' },
  { id: 'ciruela', label: 'Ciruela' },
  { id: 'azul', label: 'Azul' },
] as const

export function categoryIcon(icon: string) {
  return icon || '✨'
}

export function categoryTint(tint: string) {
  return tint === 'ciruela' || tint === 'azul' ? tint : 'bruma'
}
