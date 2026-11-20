import type { ReactNode } from 'react'

export function Panel({ title, subtitle, right, className = '', children }: {
  title: string; subtitle?: string; right?: ReactNode; className?: string; children: ReactNode
}) {
  return (
    <section className={`animate-fade-in rounded-xl border border-slate-700 bg-slate-800/70 p-4 shadow-lg ${className}`}>
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-100">{title}</h2>
          {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
        </div>
        {right}
      </header>
      {children}
    </section>
  )
}

export function Toggle<T extends string>({ value, options, onChange }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void
}) {
  return (
    <div className="inline-flex rounded-lg border border-slate-600 bg-slate-900 p-0.5 text-xs">
      {options.map(o => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={`rounded-md px-2.5 py-1 font-semibold transition-colors ${
            value === o.value ? 'bg-niners-red text-white' : 'text-slate-300 hover:text-white'}`}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Bar({ label, value, color = 'bg-niners-gold' }: { label: string; value: number | null; color?: string }) {
  const v = value ?? 0
  return (
    <div className="text-xs">
      <div className="mb-0.5 flex justify-between text-slate-300">
        <span>{label}</span><span className="font-mono font-semibold text-white">{value === null ? 'N/D' : `${v.toFixed(0)}%`}</span>
      </div>
      <div className="h-2 rounded bg-slate-700">
        <div className={`h-2 rounded ${color} transition-all duration-500`} style={{ width: `${Math.min(100, v)}%` }} />
      </div>
    </div>
  )
}

export const TEAM_COLOR = '#AA0000'
export const OPP_COLOR = '#38bdf8'
