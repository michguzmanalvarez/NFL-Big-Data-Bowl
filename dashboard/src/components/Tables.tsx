import { useState } from 'react'
import type { PenaltyEntry, Stats } from '../api'
import { fmt, RESULT_LABELS } from '../api'
import type { PlayKey } from './FieldMap'
import { Panel, Toggle } from './ui'

type Phase = 'all' | 'Ofensiva' | 'Defensiva'

export function PenaltyPanel({ s, onSelect, className = '' }: { s: Stats; onSelect: (k: PlayKey) => void; className?: string }) {
  const [who, setWho] = useState<'team' | 'opp'>('team')
  const [phase, setPhase] = useState<Phase>('all')
  const all: PenaltyEntry[] = s.penaltyLog[who]
  const rows = all.filter(r => phase === 'all' || r.phase === phase)
  const p = (who === 'team' ? s.teamStats : s.oppStats).penalties
  return (
    <Panel title="Castigos jugada por jugada" className={className}
      subtitle="Drive Killer: castigo ofensivo que deja 1ra/2da y 10+ · Bailout: castigo defensivo en 3er down. Clic para verla en el campo."
      right={<Toggle value={who} onChange={setWho} options={[{ value: 'team', label: s.team }, { value: 'opp', label: s.opponent }]} />}>
      <div className="mb-2 grid grid-cols-2 gap-2 text-center">
        <div className="rounded-lg bg-amber-500/10 p-2">
          <p className="text-2xl font-black text-amber-300">{p.driveKillers}</p>
          <p className="text-xs text-slate-300">Drive Killers · {p.driveKillerYards} yds</p>
        </div>
        <div className="rounded-lg bg-red-500/10 p-2">
          <p className="text-2xl font-black text-red-400">{p.bailouts}</p>
          <p className="text-xs text-slate-300">Bailouts · {p.bailoutYards} yds</p>
        </div>
      </div>
      <div className="mb-2">
        <Toggle value={phase} onChange={setPhase} options={[
          { value: 'all', label: `Todos (${all.length})` },
          { value: 'Ofensiva', label: `Ofensiva (${all.filter(r => r.phase === 'Ofensiva').length})` },
          { value: 'Defensiva', label: `Defensiva (${all.filter(r => r.phase === 'Defensiva').length})` },
        ]} />
      </div>
      <div className="max-h-[26rem] overflow-y-auto pr-1">
        {rows.length === 0 && <p className="text-sm text-slate-400">Sin castigos aceptados.</p>}
        <ul className="space-y-1.5">
          {rows.map((r, i) => (
            <li key={`${r.gameId}-${r.playId}-${i}`} onClick={() => onSelect({ gameId: r.gameId, playId: r.playId })}
              className={`cursor-pointer rounded-lg border bg-slate-900/70 p-2 text-xs hover:border-niners-gold ${
                r.critical ? 'border-red-700' : 'border-slate-700'}`}>
              <div className="flex flex-wrap items-center gap-1">
                <span className={`rounded px-1.5 py-0.5 font-bold ${r.phase === 'Ofensiva' ? 'bg-slate-600' : 'bg-slate-700'}`}>{r.phase}</span>
                {r.critical && (
                  <span className={`rounded px-1.5 py-0.5 font-bold ${r.critical === 'Bailout' ? 'bg-red-600 text-white' : 'bg-amber-400 text-slate-900'}`}>
                    {r.critical}
                  </span>
                )}
                <span className="font-semibold text-white">{r.foulName}</span>
                <span className="ml-auto font-mono text-slate-200">{r.penYds} yds</span>
              </div>
              <p className="mt-1 text-slate-300">{r.displayName ?? 'N/D'} ({r.officialPosition ?? '-'}) · <span className="font-semibold text-amber-200">{r.effect}</span></p>
              <p className="text-slate-500">
                Sem {r.week} · Q{r.quarter} {r.gameClock} · {r.possessionTeam} {r.down}&amp;{r.yardsToGo} ·{' '}
                {RESULT_LABELS[r.passResult] ?? r.passResult} ({r.prePenaltyPlayResult} → {r.playResult} yds)
              </p>
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  )
}

const th = 'px-1.5 py-1 font-semibold'
const td = 'px-1.5 py-1.5'

export function GamesTable({ s, onPickGame }: { s: Stats; onPickGame: (gameId: number) => void }) {
  return (
    <Panel title="Head-to-Head por partido · Ofensiva y Defensiva" className="md:col-span-2 lg:col-span-4"
      subtitle={`Cada fila muestra a ${s.team} y a su rival en ese juego. Clic para abrir el partido.`}>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="text-slate-400">
            <tr>
              <th className={th} rowSpan={2}>Sem</th><th className={th} rowSpan={2}>Partido</th><th className={th} rowSpan={2}>Marcador</th>
              <th className={`${th} border-b border-red-700 text-center text-red-300`} colSpan={3}>Ofensiva {s.team}</th>
              <th className={`${th} border-b border-red-700 text-center text-red-300`} colSpan={3}>Defensa {s.team}</th>
              <th className={`${th} border-b border-sky-700 text-center text-sky-300`} colSpan={3}>Ofensiva rival</th>
              <th className={`${th} border-b border-sky-700 text-center text-sky-300`} colSpan={3}>Defensa rival</th>
            </tr>
            <tr>
              <th className={th}>QB · Rating</th><th className={th}>Castigos</th><th className={th}>DK</th>
              <th className={th}>Sacks</th><th className={th}>Presión</th><th className={th}>Castigos · BO</th>
              <th className={th}>QB · Rating</th><th className={th}>Castigos</th><th className={th}>DK</th>
              <th className={th}>Sacks</th><th className={th}>Presión</th><th className={th}>Castigos · BO</th>
            </tr>
          </thead>
          <tbody>
            {s.games.map(g => {
              const win = (g.teamScore ?? 0) > (g.oppScore ?? 0)
              const T = g.team, O = g.opp
              return (
                <tr key={g.gameId} onClick={() => onPickGame(g.gameId)}
                  className={`cursor-pointer border-t border-slate-700 hover:bg-slate-700/60 ${s.gameId === g.gameId ? 'bg-slate-700/50' : ''}`}>
                  <td className={td}>{g.week}</td>
                  <td className={`${td} font-semibold text-white`}>{s.team} {g.homeAway === 'Local' ? 'vs' : '@'} {g.opponent}</td>
                  <td className={`${td} font-bold ${win ? 'text-emerald-400' : 'text-rose-400'}`}>{g.teamScore}-{g.oppScore} {win ? 'G' : 'P'}</td>
                  <td className={td}><span className="text-slate-300">{T.qb}</span> · <b>{fmt(T.qbRating)}</b></td>
                  <td className={td}>{T.offPenalties} ({T.offPenYds} yds)</td>
                  <td className={`${td} ${T.driveKillers ? 'font-bold text-amber-300' : ''}`}>{T.driveKillers}</td>
                  <td className={`${td} font-bold text-red-400`}>{T.sacks}</td>
                  <td className={`${td} text-amber-300`}>{fmt(T.pressureRate, 1, '%')}</td>
                  <td className={td}>{T.defPenalties} ({T.defPenYds} yds) · <span className={T.bailouts ? 'font-bold text-red-400' : ''}>{T.bailouts}</span></td>
                  <td className={td}><span className="text-slate-300">{O.qb}</span> · <b>{fmt(O.qbRating)}</b></td>
                  <td className={td}>{O.offPenalties} ({O.offPenYds} yds)</td>
                  <td className={`${td} ${O.driveKillers ? 'font-bold text-amber-300' : ''}`}>{O.driveKillers}</td>
                  <td className={`${td} font-bold text-red-400`}>{O.sacks}</td>
                  <td className={`${td} text-amber-300`}>{fmt(O.pressureRate, 1, '%')}</td>
                  <td className={td}>{O.defPenalties} ({O.defPenYds} yds) · <span className={O.bailouts ? 'font-bold text-red-400' : ''}>{O.bailouts}</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-slate-500">DK = Drive Killers · BO = Bailouts · Presión = % de dropbacks del rival con hit, hurry o sack.</p>
      </div>
    </Panel>
  )
}

export function PlayersTable({ s }: { s: Stats }) {
  const [unit, setUnit] = useState<'off' | 'def'>('def')
  const offRoles = ['Pass', 'Pass Block', 'Pass Route']
  const rows = s.players
    .filter(p => offRoles.includes(p.role) === (unit === 'off'))
    .sort((a, b) => unit === 'def' ? b.pressures - a.pressures || b.snaps - a.snaps : b.snaps - a.snaps)
  return (
    <Panel title={`Jugadores · ${s.teamName}`} subtitle="Métricas PFF en dropbacks" className="md:col-span-2"
      right={<Toggle value={unit} onChange={setUnit} options={[{ value: 'def', label: 'Defensiva' }, { value: 'off', label: 'Ofensiva' }]} />}>
      <div className="max-h-80 overflow-y-auto">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-slate-800 text-slate-400">
            {unit === 'off'
              ? <tr><th className="py-1">Jugador</th><th>Pos</th><th>Snaps</th><th>Presiones perm.</th><th>Sacks perm.</th><th>Castigos (yds)</th><th>Rating QB</th></tr>
              : <tr><th className="py-1">Jugador</th><th>Pos</th><th>Snaps</th><th>Rushes</th><th>Presiones</th><th>Sacks</th><th>Hits</th><th>Hurries</th><th>Castigos (yds)</th></tr>}
          </thead>
          <tbody>
            {rows.map(p => (
              <tr key={p.nflId} className="border-t border-slate-700">
                <td className="py-1 font-semibold text-white">{p.displayName}</td>
                <td>{p.officialPosition} <span className="text-slate-500">({p.alignedAt})</span></td>
                <td>{p.snaps}</td>
                {unit === 'off' ? (
                  <>
                    <td className={p.pressuresAllowed >= 5 ? 'text-rose-400' : ''}>{p.pressuresAllowed}</td>
                    <td className={p.sacksAllowed ? 'text-rose-400' : ''}>{p.sacksAllowed}</td>
                    <td className={p.penalties ? 'text-amber-300' : ''}>{p.penalties} ({p.penaltyYards})</td>
                    <td>{p.qbRating != null ? `${fmt(p.qbRating)} (${p.qbAttempts} int)` : '-'}</td>
                  </>
                ) : (
                  <>
                    <td>{p.rushes}</td>
                    <td className={p.pressures >= 5 ? 'font-bold text-amber-300' : ''}>{p.pressures}</td>
                    <td className={p.sacks ? 'font-bold text-red-400' : ''}>{p.sacks}</td>
                    <td>{p.hits}</td><td>{p.hurries}</td>
                    <td className={p.penalties ? 'text-amber-300' : ''}>{p.penalties} ({p.penaltyYards})</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}
