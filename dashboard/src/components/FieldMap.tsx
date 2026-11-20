import { useEffect, useMemo, useState } from 'react'
import {
  ReferenceArea, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis,
} from 'recharts'
import type { PlayFrames, PlayRow, RosterRow, Stats, TrackPoint } from '../api'
import { api, RESULT_LABELS } from '../api'
import { OPP_COLOR, TEAM_COLOR, Toggle } from './ui'

export type PlayKey = { gameId: number; playId: number }
type Filter = 'all' | 'pen' | 'sack' | 'pressure' | 'rz'

const YARD_TICKS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110]
const yardLabel = (x: number) => (x === 10 || x === 110 ? 'G' : String(x <= 60 ? x - 10 : 110 - x))

// Color del punto (spot del snap) según lo que más pesó en la jugada
const playColor = (p: PlayRow) =>
  p.offFoul || p.defFoul ? '#facc15' : p.sack ? '#ef4444' : p.pressure ? '#fb923c' : p.success ? '#34d399' : '#94a3b8'

type Dot = { cx?: number; cy?: number; payload?: Record<string, unknown> }
const spotDot = (props: unknown) => {
  const { cx = 0, cy = 0, payload } = props as Dot
  const p = payload as unknown as PlayRow
  return <circle cx={cx} cy={cy} r={p?.offFoul || p?.defFoul || p?.sack ? 6 : 4.5} fill={playColor(p)} stroke="#0f172a" strokeWidth={1.2} />
}

const playerDot = (fill: string, roster: Map<number, RosterRow>) => (props: unknown) => {
  const { cx = 0, cy = 0, payload } = props as Dot
  const r = roster.get(Number(payload?.nflId))
  const ring = r?.sack ? '#ef4444' : r?.pressure ? '#fb923c' : r?.allowed ? '#f472b6' : null
  return (
    <g>
      {ring && <circle cx={cx} cy={cy} r={12} fill="none" stroke={ring} strokeWidth={2.5} />}
      {r?.pff_role === 'Pass' && <circle cx={cx} cy={cy} r={11} fill="none" stroke="#B3995D" strokeWidth={2.5} />}
      <circle cx={cx} cy={cy} r={8} fill={fill} stroke="#f8fafc" strokeWidth={1.5} />
      {payload?.jerseyNumber != null && (
        <text x={cx} y={cy + 3} textAnchor="middle" fontSize={8} fontWeight={800} fill="#fff">{String(payload.jerseyNumber)}</text>
      )}
      {r?.foul && <text x={cx + 7} y={cy - 8} fontSize={12}>🚩</text>}
    </g>
  )
}
const ballDot = (props: unknown) => {
  const { cx = 0, cy = 0 } = props as Dot
  return <ellipse cx={cx} cy={cy} rx={5} ry={3.5} fill="#a16207" stroke="#fde68a" strokeWidth={1.2} />
}

function makeTip(roster: Map<number, RosterRow>) {
  return function Tip({ active, payload }: { active?: boolean; payload?: { payload: Record<string, unknown> }[] }) {
    if (!active || !payload?.length) return null
    const p = payload[0].payload
    if ('playDescription' in p) {
      const r = p as unknown as PlayRow
      return (
        <div className="max-w-xs rounded-lg border border-slate-600 bg-slate-950 p-2 text-xs text-slate-100">
          <p className="font-bold">S{r.week} · Q{r.quarter} {r.gameClock} · {r.down}&amp;{r.yardsToGo} · {r.qb ?? ''}</p>
          {(r.foul_off || r.foul_def) && <p className="text-yellow-300">🚩 {[r.foul_off, r.foul_def].filter(Boolean).join(', ')}</p>}
          <p className="text-slate-300">{r.playDescription}</p>
        </div>
      )
    }
    const r = roster.get(Number(p.nflId))
    return (
      <div className="rounded-lg border border-slate-600 bg-slate-950 p-2 text-xs text-slate-100">
        {p.side === 'ball' ? <p className="font-bold">Balón</p> : (
          <>
            <p className="font-bold">#{String(p.jerseyNumber ?? '')} {r?.displayName} · {r?.pff_positionLinedUp ?? r?.officialPosition}</p>
            <p className="text-slate-400">{r?.pff_role ?? ''} · {Number(p.s ?? 0).toFixed(1)} yd/s</p>
            {r?.sack && <p className="text-red-400">Sack</p>}
            {r?.pressure && !r.sack && <p className="text-orange-400">Generó presión</p>}
            {r?.allowed && <p className="text-pink-400">Permitió presión</p>}
            {r?.foul && <p className="text-yellow-300">🚩 {r.foul}</p>}
          </>
        )}
      </div>
    )
  }
}

export default function FieldMap({ s, selected, onSelect, className = '' }: {
  s: Stats; selected: PlayKey | null; onSelect: (k: PlayKey | null) => void; className?: string
}) {
  const [side, setSide] = useState<'off' | 'def'>('off')
  const [filter, setFilter] = useState<Filter>('all')
  const [data, setData] = useState<PlayFrames | null>(null)
  const [frame, setFrame] = useState(1)
  const [playing, setPlaying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selPlay = useMemo(
    () => (selected ? s.plays.find(p => p.gameId === selected.gameId && p.playId === selected.playId) ?? null : null),
    [s.plays, selected])

  const plays = useMemo(() => s.plays.filter(p => p.side === side && (
    filter === 'all' || (filter === 'pen' && (p.offFoul || p.defFoul)) || (filter === 'sack' && p.sack)
    || (filter === 'pressure' && p.pressure) || (filter === 'rz' && p.redZone))), [s.plays, side, filter])

  // Cargar los frames de la jugada seleccionada
  useEffect(() => {
    setData(null); setPlaying(false); setError(null)
    if (!selected) return
    if (selPlay && selPlay.side !== side) setSide(selPlay.side)
    const ctl = new AbortController()
    api.play(selected.gameId, selected.playId, ctl.signal)
      .then(d => { setData(d); setFrame(d.play.snapFrame ?? 1) })
      .catch(e => { if (e.name !== 'AbortError') setError(String(e)) })
    return () => ctl.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.gameId, selected?.playId])

  // Reproducción a 10 fps (igual que el tracking) sin librerías de animación
  useEffect(() => {
    if (!playing || !data) return
    const id = window.setInterval(() => {
      setFrame(f => {
        if (f >= data.frames) { setPlaying(false); return f }
        return f + 1
      })
    }, 100)
    return () => window.clearInterval(id)
  }, [playing, data])

  const byFrame = useMemo(() => {
    const m = new Map<number, TrackPoint[]>()
    data?.points.forEach(p => { const a = m.get(p.frameId) ?? []; a.push(p); m.set(p.frameId, a) })
    return m
  }, [data])
  const roster = useMemo(() => new Map((data?.roster ?? []).map(r => [r.nflId, r])), [data])
  const Tip = useMemo(() => makeTip(roster), [roster])

  const current = byFrame.get(frame) ?? []
  const event = current.find(p => p.event)?.event
  const alert = filter === 'rz' || !!selPlay?.redZone
  const offColor = selPlay ? (selPlay.possessionTeam === s.team ? TEAM_COLOR : OPP_COLOR) : TEAM_COLOR
  const defColor = offColor === TEAM_COLOR ? OPP_COLOR : TEAM_COLOR
  const toXY = (p: PlayRow) => ({ ...p, x: p.losX, y: p.ballY })
  const pick = (d: unknown) => {
    const p = ((d as { payload?: PlayRow })?.payload ?? d) as PlayRow
    if (p?.gameId) onSelect({ gameId: p.gameId, playId: p.playId })
  }
  const offTeam = side === 'off' ? s.team : s.opponent
  const defTeam = side === 'off' ? s.opponent : s.team
  const pp = data?.play
  const keyPlayers = (data?.roster ?? []).filter(r => r.foul || r.sack || r.pressure || r.allowed)

  return (
    <section id="field-map" className={`relative animate-fade-in rounded-xl border p-4 shadow-lg transition-colors duration-500 ${className} ${
      alert ? 'border-red-700 bg-red-950/40' : 'border-slate-700 bg-slate-800/70'}`}>
      {alert && <div className="pointer-events-none absolute inset-0 animate-pulse rounded-xl border-4 border-red-500" />}
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className={`text-sm font-bold uppercase tracking-wider ${alert ? 'text-red-300' : 'text-slate-100'}`}>
            {alert ? '🚨 Red Zone Mode · ' : 'Mapa del campo · '}Ofensiva {offTeam} → vs Defensa {defTeam}
          </h2>
          <p className="text-xs text-slate-400">
            Coordenadas normalizadas (la ofensiva siempre ataca a la derecha). Cada punto es el spot del snap. Clic para reproducir la jugada.
          </p>
        </div>
        <Toggle value={side} onChange={v => { setSide(v); onSelect(null) }}
          options={[{ value: 'off', label: `Ofensiva ${s.team}` }, { value: 'def', label: `Defensa ${s.team}` }]} />
      </header>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Toggle value={filter} onChange={v => { setFilter(v); onSelect(null) }} options={[
          { value: 'all', label: 'Todas' }, { value: 'pen', label: '🚩 Castigos' }, { value: 'sack', label: 'Sacks' },
          { value: 'pressure', label: 'Presión' }, { value: 'rz', label: 'Red Zone' },
        ]} />
        <span className="flex flex-wrap gap-2 text-[11px] text-slate-300">
          <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-yellow-400" />Castigo</span>
          <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-red-500" />Sack</span>
          <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-orange-400" />Presión</span>
          <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-emerald-400" />Exitosa</span>
          <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-slate-400" />Fallida</span>
          <span className="text-slate-500">({plays.length} jugadas)</span>
        </span>
      </div>

      <div className="rounded-lg bg-emerald-950/60">
        <ResponsiveContainer width="100%" aspect={2.25}>
          <ScatterChart margin={{ top: 8, right: 8, bottom: 4, left: 8 }}>
            <XAxis type="number" dataKey="x" domain={[0, 120]} ticks={YARD_TICKS} tickFormatter={yardLabel}
              tick={{ fill: '#cbd5e1', fontSize: 11 }} stroke="#475569" allowDataOverflow />
            <YAxis type="number" dataKey="y" domain={[0, 53.3]} hide allowDataOverflow />
            <ReferenceArea x1={0} x2={10} fill="#1e293b" fillOpacity={0.9} />
            <ReferenceArea x1={110} x2={120} fill="#7f1d1d" fillOpacity={0.8} />
            <ReferenceArea x1={90} x2={110} fill="#ef4444" fillOpacity={alert ? 0.28 : 0.1} />
            {YARD_TICKS.slice(1, -1).map(x => <ReferenceLine key={x} x={x} stroke="#ffffff22" />)}
            {selPlay && <ReferenceLine x={selPlay.losX} stroke="#38bdf8" strokeWidth={2} />}
            {selPlay && <ReferenceLine x={Math.min(110, selPlay.losX + selPlay.yardsToGo)} stroke="#facc15" strokeWidth={2} />}
            <Tooltip content={<Tip />} cursor={false} />
            {!data && <Scatter data={plays.map(toXY)} shape={spotDot} onClick={pick} isAnimationActive={false} />}
            {data && <Scatter data={current.filter(p => p.side === 'def')} shape={playerDot(defColor, roster)} isAnimationActive={false} />}
            {data && <Scatter data={current.filter(p => p.side === 'off')} shape={playerDot(offColor, roster)} isAnimationActive={false} />}
            {data && <Scatter data={current.filter(p => p.side === 'ball')} shape={ballDot} isAnimationActive={false} />}
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {selected && (
        <div className="mt-3 space-y-2 rounded-lg border border-slate-700 bg-slate-900/80 p-3 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="rounded bg-slate-700 px-2 py-1 font-bold hover:bg-slate-600"
              onClick={() => { setPlaying(false); setFrame(pp?.snapFrame ?? 1) }}>⏮ Snap</button>
            <button type="button" className="rounded bg-niners-red px-3 py-1 font-bold text-white hover:bg-red-700"
              disabled={!data} onClick={() => { if (data && frame >= data.frames) setFrame(1); setPlaying(p => !p) }}>
              {playing ? '⏸ Pausa' : '▶ Reproducir'}
            </button>
            <button type="button" className="rounded bg-slate-700 px-2 py-1 font-bold hover:bg-slate-600"
              onClick={() => { setPlaying(false); setFrame(pp?.endFrame ?? frame) }}>Lanzamiento / Sack ⏭</button>
            <input type="range" min={1} max={data?.frames ?? 1} value={frame} className="w-40 accent-red-600"
              onChange={e => { setPlaying(false); setFrame(Number(e.target.value)) }} />
            <span className="font-mono text-slate-300">frame {frame}/{data?.frames ?? '…'} {event && `· ${event}`}</span>
            <button type="button" className="ml-auto rounded border border-slate-600 px-2 py-1 hover:bg-slate-800"
              onClick={() => onSelect(null)}>✕ Ver todas</button>
          </div>
          {selPlay && (
            <div className="text-slate-300">
              <span className={`mr-2 rounded px-1.5 py-0.5 font-bold ${selPlay.redZone ? 'bg-red-600 text-white' : 'bg-slate-700'}`}>
                {selPlay.redZone ? `RED ZONE · ${selPlay.yardsToGoal} yds a la meta` : `${selPlay.yardsToGoal} yds a la meta`}
              </span>
              S{selPlay.week} Q{selPlay.quarter} {selPlay.gameClock} · {selPlay.down}&amp;{selPlay.yardsToGo} · QB {selPlay.qb ?? 'N/D'} ·{' '}
              {RESULT_LABELS[selPlay.passResult]} ({selPlay.playResult} yds)
              {selPlay.timeToThrow != null && ` · ${selPlay.timeToThrow.toFixed(1)} s`}
              {pp?.rushers != null && ` · ${pp.rushers} pass rushers`}
              {pp?.pff_passCoverage && ` · ${pp.pff_passCoverage}`}
              <span className="block text-slate-400">{selPlay.playDescription}</span>
            </div>
          )}
          {pp && (pp.foul_off || pp.foul_def) && (
            <div className="rounded border border-yellow-600/60 bg-yellow-900/20 p-2 text-yellow-100">
              🚩 <b>Impacto del castigo:</b>{' '}
              {pp.foul_off && <>Ofensiva: {pp.foul_off} ({pp.fouler_off ?? 'N/D'}). </>}
              {pp.foul_def && <>Defensa: {pp.foul_def} ({pp.fouler_def ?? 'N/D'}). </>}
              La jugada valía {pp.prePenaltyPlayResult} yds y terminó en {pp.playResult} yds ({pp.penSwing > 0 ? '+' : ''}{pp.penSwing}).
              {pp.driveKiller && ' Drive Killer: dejó a la ofensiva en down largo.'}
              {pp.bailout && ' Bailout en 3er down.'}
              {pp.rescued && ' Rescató una jugada fallida.'}
              {pp.gift1st && ' Regaló un primer down.'}
              {pp.erasedYds > 0 && ` Borró ${pp.erasedYds} yds de ganancia.`}
            </div>
          )}
          {data && (
            <div className="flex flex-wrap gap-1.5">
              <span className="text-slate-500">Leyenda: <span className="text-niners-gold">◯ QB</span> · <span className="text-orange-400">◯ presión</span> ·{' '}
                <span className="text-red-400">◯ sack</span> · <span className="text-pink-400">◯ permitió presión</span> · 🚩 castigo</span>
              {keyPlayers.map(r => (
                <span key={r.nflId} className="rounded bg-slate-800 px-1.5 py-0.5">
                  #{r.jerseyNumber} {r.displayName}: {[r.sack && 'sack', r.pressure && !r.sack && 'presión', r.allowed && 'permitió presión', r.foul && `🚩 ${r.foul}`].filter(Boolean).join(' · ')}
                </span>
              ))}
            </div>
          )}
          {error && <p className="text-rose-400">No se pudo cargar la jugada: {error}</p>}
        </div>
      )}

      <div className="mt-3 max-h-44 overflow-y-auto rounded-lg border border-slate-700">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-slate-900 text-slate-400">
            <tr><th className="px-2 py-1">Sem</th><th>Q / Reloj</th><th>Down</th><th>QB</th><th>A la meta</th><th>Resultado</th><th>Tiempo</th><th>Marcas</th></tr>
          </thead>
          <tbody>
            {plays.map(p => {
              const isSel = selected?.gameId === p.gameId && selected?.playId === p.playId
              return (
                <tr key={`${p.gameId}-${p.playId}`} onClick={() => onSelect({ gameId: p.gameId, playId: p.playId })}
                  className={`cursor-pointer border-t border-slate-800 hover:bg-slate-700/60 ${isSel ? 'bg-red-900/50' : ''}`}>
                  <td className="px-2 py-1">{p.week}</td>
                  <td>Q{p.quarter} {p.gameClock}</td>
                  <td>{p.down}&amp;{p.yardsToGo}</td>
                  <td>{p.qb ?? '-'}</td>
                  <td className={p.redZone ? 'font-bold text-red-400' : ''}>{p.yardsToGoal}</td>
                  <td className={p.success ? 'text-emerald-400' : 'text-rose-400'}>{RESULT_LABELS[p.passResult]} {p.playResult}</td>
                  <td>{p.timeToThrow != null ? `${p.timeToThrow.toFixed(1)} s` : '-'}</td>
                  <td className="space-x-1">
                    {p.redZone && <span className="rounded bg-red-700 px-1">RZ</span>}
                    {p.sack && <span className="rounded bg-red-500 px-1">SACK</span>}
                    {p.pressure && !p.sack && <span className="rounded bg-orange-600 px-1">PRES</span>}
                    {(p.offFoul || p.defFoul) && <span className="rounded bg-yellow-500 px-1 text-slate-900">🚩 {p.offFoul ? 'OF' : 'DEF'}</span>}
                    {p.driveKiller && <span className="rounded bg-amber-400 px-1 text-slate-900">DK</span>}
                    {p.bailout && <span className="rounded bg-rose-600 px-1">BO</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
