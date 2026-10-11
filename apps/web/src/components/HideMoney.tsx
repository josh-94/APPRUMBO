import { useState } from 'react'

const PREFERENCE = 'rumbo-hide-on-open'
let sessionHidden: boolean | null = null

export function hideOnOpen() {
  try {
    return window.localStorage.getItem(PREFERENCE) !== '0'
  } catch {
    return true
  }
}

export function setHideOnOpen(next: boolean) {
  try {
    window.localStorage.setItem(PREFERENCE, next ? '1' : '0')
  } catch {
    /* the choice still applies until the page closes */
  }
  sessionHidden = next
}

export function useHideMoney() {
  const [hidden, setHidden] = useState(() => sessionHidden ?? hideOnOpen())
  function toggle() {
    setHidden((current) => {
      sessionHidden = !current
      return !current
    })
  }
  return { hidden, toggle }
}

export function EyeButton({ hidden, onToggle }: { hidden: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className="eye"
      aria-pressed={hidden}
      aria-label={hidden ? 'Mostrar saldo' : 'Ocultar saldo'}
      onClick={onToggle}
    >
      {hidden ? <EyeOff /> : <EyeOpen />}
    </button>
  )
}

function EyeOpen() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

function EyeOff() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 3l18 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M9.9 5.6A10 10 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-3.2 4.2M6.1 7.2C3.6 9 2 12 2 12s3.5 7 10 7c1.5 0 2.9-.4 4.1-1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}
