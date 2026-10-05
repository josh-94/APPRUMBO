import { NavLink } from 'react-router-dom'
import type { ReactNode } from 'react'

type Props = {
  title?: string
  eyebrow?: string
  back?: string
  action?: ReactNode
  tabs?: boolean
  children: ReactNode
}

const icons = {
  hoy: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" />
    </svg>
  ),
  tiempo: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16" />
    </svg>
  ),
  plata: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18M7 15h4" />
    </svg>
  ),
  cuenta: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <circle cx="12" cy="8" r="3" />
      <path d="M5 19c1.5-3 4-4.5 7-4.5S17.5 16 19 19" />
    </svg>
  ),
}

export function Shell({ title, eyebrow, back, action, tabs, children }: Props) {
  return (
    <div className="app">
      <header className="top">
        <div className="top-row">
          {back ? (
            <NavLink className="icon-btn" to={back} aria-label="Volver">
              ←
            </NavLink>
          ) : tabs ? (
            <img className="app-mark" src="/logo.svg" alt="Rumbo" width="32" height="32" />
          ) : (
            <span />
          )}
          {action}
        </div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        {title && <h1>{title}</h1>}
      </header>
      <main className={tabs ? 'main with-tabs' : 'main'}>{children}</main>
      {tabs && (
        <nav className="tabs">
          <Tab to="/dia" label="Hoy" icon={icons.hoy} />
          <Tab to="/tiempo" label="Tiempo" icon={icons.tiempo} />
          <Tab to="/plata" label="Plata" icon={icons.plata} />
          <Tab to="/cuenta" label="Cuenta" icon={icons.cuenta} />
        </nav>
      )}
    </div>
  )
}

function Tab({ to, label, icon }: { to: string; label: string; icon: ReactNode }) {
  return (
    <NavLink to={to} className={({ isActive }) => (isActive ? 'tab active' : 'tab')} aria-label={label}>
      {({ isActive }) => (
        <>
          {icon}
          {isActive ? <span>{label}</span> : null}
        </>
      )}
    </NavLink>
  )
}
