import type { CardTint } from './types'

export const cardTints: { id: CardTint; label: string }[] = [
  { id: 'noche', label: 'Noche' },
  { id: 'oro', label: 'Oro' },
  { id: 'azul', label: 'Azul' },
  { id: 'ciruela', label: 'Ciruela' },
  { id: 'bosque', label: 'Bosque' },
  { id: 'grafito', label: 'Grafito' },
  { id: 'cobre', label: 'Cobre' },
]

export function cardTint(tint: string): CardTint {
  return cardTints.some((item) => item.id === tint) ? tint as CardTint : 'noche'
}
