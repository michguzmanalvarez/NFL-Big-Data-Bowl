import type { ReactNode } from 'react'
import type { Matchup, Stats } from '../api'
import { fmt } from '../api'

function Stat({ label, value, tone = 'text-white', hint }: { label: string; value: ReactNode; tone?: string; hint?: string }) {
  return (
    <div className="rounded-lg bg-slate-900/80 p-2" title={hint}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`text-lg font-black leading-tight ${tone}`}>{value}</p>
    </div>
  )
}

function Section({ title, accent, children }: { title: string; accent: string; children: ReactNode }) {
  return (
    <div className={`rounded-lg border-l-4 ${accent} bg-slate-800/60 p-3`}>
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-200">{title}</h3>
      {children}
    </div>
  )
}

const ratingTone = (r: number | null) =>
  r === null ? 'text-slate-400' : r >= 100 ? 'text-emerald-400' : r >= 85 ? 'text-white' : 'text-rose-400'
// Para la defensa, un rating permitido bajo es bueno
const allowedTone = (r: number | null) =>
  r === null ? 'text-slate-400' : r <= 80 ? 'text-emerald-400' : r <= 95 ? 'text-white' : 'text-rose-400'

function MatchupPanel({ mu, highlight }: { mu: Matchup; highlight: 'off' | 'def' }) {
  const { passing: p, qbs, passRush: r, penalties: pen } = mu
  const swing = pen.netSwing
  return (
    <section className={`animate-fade-in rounded-xl border bg-slate-800/70 p-4 shadow-lg ${
      highlight === 'off' ? 'border-niners-red/70' : 'border-sky-500/50'}`}>
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-black uppercase tracking-wide text-white">
          Ofensiva <span className={highlight === 'off' ? 'text-red-400' : 'text-sky-400'}>{mu.offense}</span>
          <span className="mx-2 text-slate-500">vs</span>
          Defensa <span className={highlight === 'off' ? 'text-sky-400' : 'text-red-400'}>{mu.defense}</span>
        </h2>
        <span className="text-xs text-slate-400">{p.dropbacks} dropbacks</span>
      </header>

      <div className="space-y-3">
        {/* ---------------- QB ---------------- */}
        <Section title={`Desempeño del QB · ${mu.offense}`} accent="border-niners-gold">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-400">
                <tr><th className="py-1">QB</th><th>Rating</th><th>C/A</th><th>Yds</th><th>Yds/comp</th><th>TD</th><th>INT</th>
                  <th>Sacks</th><th>T. lanzar</th><th title="Rating sin presión / bajo presión">Limpio / Presión</th></tr>
              </thead>
              <tbody>
                {qbs.map(q => (
                  <tr key={q.nflId} className="border-t border-slate-700">
                    <td className="py-1 font-semibold text-white">{q.name}</td>
                    <td className={`font-black ${ratingTone(q.rating)}`}>{fmt(q.rating)}</td>
                    <td>{q.completions}/{q.attempts}</td>
                    <td>{q.yards}</td>
                    <td>{fmt(q.yardsPerCompletion)}</td>
                    <td>{q.touchdowns}</td>
                    <td className={q.interceptions ? 'text-rose-400' : ''}>{q.interceptions}</td>
                    <td>{q.sacks}</td>
                    <td>{fmt(q.avgTimeToThrow, 2, ' s')}</td>
                    <td><span className={ratingTone(q.ratingClean)}>{fmt(q.ratingClean)}</span>
                      <span className="text-slate-500"> / </span>
                      <span className={ratingTone(q.ratingPressured)}>{fmt(q.ratingPressured)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {/* ---------------- DEFENSA: sacks y presión ---------------- */}
        <Section title={`Defensa ${mu.defense} · Sacks y presión al QB`} accent="border-red-500">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Sacks" value={r.sacks} tone="text-red-400" hint="Jugadas terminadas en sack" />
            <Stat label="Presión" value={fmt(r.pressureRate, 1, '%')} tone="text-amber-300"
              hint="Dropbacks con hit, hurry o sack (PFF)" />
            <Stat label="Hits / Hurries" value={`${r.hits} / ${r.hurries}`} />
            <Stat label="Presión → Sack" value={fmt(r.pressureToSack, 1, '%')} hint="% de presiones que terminaron en sack" />
            <Stat label="Blitz (5+)" value={fmt(r.blitzRate, 1, '%')} />
            <Stat label="Man / Zona" value={`${fmt(r.manRate, 0, '%')} / ${fmt(r.zoneRate, 0, '%')}`} />
            <Stat label="Rating permitido" value={fmt(r.ratingAllowed)} tone={allowedTone(r.ratingAllowed)} />
            <Stat label="Limpio / Presión" value={`${fmt(r.ratingAllowedClean, 0)} / ${fmt(r.ratingAllowedPressured, 0)}`}
              hint="Rating que permitió la defensa sin presión / con presión" />
          </div>
          {r.topRushers.length > 0 && (
            <table className="mt-2 w-full text-left text-xs">
              <thead className="text-slate-400">
                <tr><th className="py-1">Pass rusher</th><th>Pos</th><th>Presiones</th><th>Sacks</th><th>Hits</th><th>Hurries</th><th>% presión</th></tr>
              </thead>
              <tbody>
                {r.topRushers.map(x => (
                  <tr key={x.nflId} className="border-t border-slate-700">
                    <td className="py-1 font-semibold text-white">{x.displayName}</td>
                    <td>{x.officialPosition}</td>
                    <td className="font-bold text-amber-300">{x.pressures}</td>
                    <td className={x.sacks ? 'font-bold text-red-400' : ''}>{x.sacks}</td>
                    <td>{x.hits}</td><td>{x.hurries}</td><td>{fmt(x.pressureRate, 1, '%')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        {/* ---------------- CASTIGOS ---------------- */}
        <Section title="Castigos y su impacto en las jugadas" accent="border-amber-400">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="rounded-lg bg-slate-900/80 p-2 text-xs">
              <p className="mb-1 font-bold text-slate-200">Ofensiva {mu.offense}: {pen.offense.count} castigos · {pen.offense.yards} yds</p>
              <p><span className="font-bold text-amber-300">{pen.offense.driveKillers} Drive Killers</span> ({pen.offense.driveKillerYards} yds)</p>
              <p>{pen.offense.erasedPlays} jugadas con ganancia anulada · <span className="font-bold text-rose-400">{pen.offense.erasedYards} yds borradas</span></p>
            </div>
            <div className="rounded-lg bg-slate-900/80 p-2 text-xs">
              <p className="mb-1 font-bold text-slate-200">Defensa {mu.defense}: {pen.defense.count} castigos · {pen.defense.yards} yds</p>
              <p><span className="font-bold text-red-400">{pen.defense.bailouts} Bailouts</span> en 3er down ({pen.defense.bailoutYards} yds)</p>
              <p>{pen.defense.firstDowns} primeros downs regalados · {pen.defense.rescued} jugadas fallidas rescatadas</p>
              <p className="text-slate-400">{fmt(pen.defense.shareOfOffenseYards, 1, '%')} de las yardas de {mu.offense} vinieron por castigo</p>
            </div>
          </div>
          <p className={`mt-2 rounded-lg px-2 py-1 text-center text-sm font-bold ${
            swing > 0 ? 'bg-emerald-900/50 text-emerald-300' : swing < 0 ? 'bg-rose-900/50 text-rose-300' : 'bg-slate-900 text-slate-300'}`}>
            Balance neto por castigos: {swing > 0 ? '+' : ''}{swing} yds para la ofensiva de {mu.offense}
          </p>
        </Section>
      </div>
    </section>
  )
}

export default function Matchups({ s }: { s: Stats }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <MatchupPanel mu={s.matchups.teamOffense} highlight="off" />
      <MatchupPanel mu={s.matchups.teamDefense} highlight="def" />
    </div>
  )
}
