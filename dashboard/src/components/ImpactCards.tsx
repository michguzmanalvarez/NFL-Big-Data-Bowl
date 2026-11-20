import type { ReactNode } from 'react'
import type { Stats } from '../api'
import { fmt } from '../api'

function Card({ title, value, unit, oppValue, oppLabel, better, children }: {
  title: string; value: string; unit?: string; oppValue: string; oppLabel: string
  better: boolean | null; children?: ReactNode
}) {
  const tone = better === null ? 'text-slate-300' : better ? 'text-emerald-400' : 'text-rose-400'
  return (
    <div className="animate-fade-in rounded-xl border border-slate-700 bg-slate-800/70 p-4 shadow-lg">
      <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{title}</p>
      <p className="mt-1 text-4xl font-black text-white">
        {value}{unit && <span className="ml-1 text-lg font-semibold text-slate-400">{unit}</span>}
      </p>
      <p className={`text-sm font-semibold ${tone}`}>vs {oppLabel}: {oppValue}</p>
      {children && <div className="mt-2 border-t border-slate-700 pt-2 text-xs text-slate-300">{children}</div>}
    </div>
  )
}

const cmp = (a: number | null, b: number | null, higherIsBetter = true) =>
  a === null || b === null || a === b ? null : higherIsBetter ? a > b : a < b

export default function ImpactCards({ s }: { s: Stats }) {
  const t = s.teamStats, o = s.oppStats
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card title="Puntos" value={String(t.points)} oppValue={String(o.points)} oppLabel={s.opponent}
        better={cmp(t.points, o.points)}>
        {t.passing.touchdowns} TD de pase · {s.games.length} partido(s)
        <span className="block text-slate-500">Marcador al último dropback registrado</span>
      </Card>
      <Card title="Rating del QB" value={fmt(t.passing.rating)} oppValue={fmt(o.passing.rating)} oppLabel={s.opponent}
        better={cmp(t.passing.rating, o.passing.rating)}>
        {t.passing.completions}/{t.passing.attempts} ({fmt(t.passing.compPct, 1, '%')}) · {t.passing.yards} yds ·{' '}
        {t.passing.touchdowns} TD · {t.passing.interceptions} INT
        <span className="block text-slate-500">Yardas por pase completo: {fmt(t.passing.yardsPerCompletion)}</span>
      </Card>
      <Card title="Castigos Críticos / Yds Perdidas" value={`${t.penalties.critical}`} unit={`/ ${t.penalties.criticalYards} yds`}
        oppValue={`${o.penalties.critical} / ${o.penalties.criticalYards} yds`} oppLabel={s.opponent}
        better={cmp(t.penalties.criticalYards, o.penalties.criticalYards, false)}>
        <span className="text-amber-300">{t.penalties.driveKillers} Drive Killers ({t.penalties.driveKillerYards} yds)</span>
        {' · '}
        <span className="text-red-400">{t.penalties.bailouts} Bailouts ({t.penalties.bailoutYards} yds)</span>
        <span className="block text-slate-500">Total castigos aceptados: {t.penalties.total} ({t.penalties.totalYards} yds)</span>
      </Card>
      <Card title="Defensa: Sacks / Presión al QB" value={String(t.passRush.sacks)} unit={`sacks · ${fmt(t.passRush.pressureRate, 1, '%')}`}
        oppValue={`${o.passRush.sacks} sacks · ${fmt(o.passRush.pressureRate, 1, '%')}`} oppLabel={s.opponent}
        better={cmp(t.passRush.sacks, o.passRush.sacks)}>
        {t.passRush.hits} hits · {t.passRush.hurries} hurries · presión→sack {fmt(t.passRush.pressureToSack, 1, '%')}
        <span className="block text-slate-500">
          Líder: {t.passRush.topRushers[0]
            ? `${t.passRush.topRushers[0].displayName} (${t.passRush.topRushers[0].pressures} presiones, ${t.passRush.topRushers[0].sacks} sacks)`
            : 'N/D'}
        </span>
      </Card>
    </div>
  )
}
