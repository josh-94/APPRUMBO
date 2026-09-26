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

export function Shell({ title, eyebrow, back, action, tabs, children }: Props) {
  return (
    <div className="app">
      <header className="top">
        <div className="top-row">
          {back ? (
            <NavLink className="icon-btn" to={back} aria-label="Volver">
              ←
            </NavLink>
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
          <NavLink to="/dia" className={({ isActive }) => (isActive ? 'tab active' : 'tab')}>
            Mi día
          </NavLink>
          <NavLink to="/listas" className={({ isActive }) => (isActive ? 'tab active' : 'tab')}>
            Listas
          </NavLink>
        </nav>
      )}
    </div>
  )
}
