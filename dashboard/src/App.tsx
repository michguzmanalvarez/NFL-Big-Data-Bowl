import { useEffect, useMemo, useState } from 'react'
import type { Stats, TeamsResponse } from './api'
import { api } from './api'
import AskCoach from './components/AskCoach'
import { PressureChart, QbRadar } from './components/Charts'
import FieldMap, { type PlayKey } from './components/FieldMap'
import ImpactCards from './components/ImpactCards'
import Matchups from './components/Matchups'
import { GamesTable, PenaltyPanel, PlayersTable } from './components/Tables'

const selectCls = 'rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm font-semibold text-white focus:border-niners-gold focus:outline-none'

export default function App() {
  const [meta, setMeta] = useState<TeamsResponse | null>(null)
  const [team, setTeam] = useState('SF')
  const [gameId, setGameId] = useState<number | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<PlayKey | null>(null)

  useEffect(() => {
    const ctl = new AbortController()
    api.teams(ctl.signal).then(setMeta).catch(e => { if (e.name !== 'AbortError') setError(String(e)) })
    return () => ctl.abort()
  }, [])

  // Cada cambio de equipo o partido vuelve a pedir los datos y actualiza toda la pantalla
  useEffect(() => {
    const ctl = new AbortController()
    setLoading(true); setError(null); setSelected(null)
    api.stats(team, gameId, ctl.signal)
      .then(d => { setStats(d); setLoading(false) })
      .catch(e => { if (e.name !== 'AbortError') { setError(String(e)); setLoading(false) } })
    return () => ctl.abort()
  }, [team, gameId])

  const gameOptions = useMemo(() => {
    if (!meta) return []
    const ids = meta.teams.find(t => t.abbr === team)?.games ?? []
    return meta.games.filter(g => ids.includes(g.gameId))
  }, [meta, team])

  const pickGame = (id: number) => { setGameId(id); window.scrollTo({ top: 0, behavior: 'smooth' }) }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <header className="sticky top-0 z-20 border-b border-niners-red/60 bg-slate-950/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1880px] flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <h1 className="text-xl font-black tracking-tight text-white">
              <span className="text-niners-red">NFL</span> Coach Command Center
            </h1>
            <p className="text-xs text-niners-gold">San Francisco 49ers · Scouting táctico 2021 (semanas 1-8)</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs uppercase text-slate-400" htmlFor="team">Equipo</label>
            <select id="team" className={selectCls} value={team}
              onChange={e => { setTeam(e.target.value); setGameId(null) }}>
              {(meta?.teams ?? [{ abbr: 'SF', name: 'San Francisco 49ers', isFocus: true, games: [] }]).map(t => (
                <option key={t.abbr} value={t.abbr}>{t.isFocus ? '★ ' : ''}{t.name}</option>
              ))}
            </select>
            <label className="text-xs uppercase text-slate-400" htmlFor="game">Partido</label>
            <select id="game" className={selectCls} value={gameId ?? ''}
              onChange={e => setGameId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">{gameOptions.length > 1 ? 'Todos los partidos' : 'Partido vs SF'}</option>
              {gameOptions.length > 1 && gameOptions.map(g => (
                <option key={g.gameId} value={g.gameId}>
                  Sem {g.week} · SF {g.homeAway === 'Local' ? 'vs' : '@'} {g.opponent} ({g.teamScore}-{g.oppScore})
                </option>
              ))}
            </select>
            {stats && (
              <span className="rounded-lg bg-slate-800 px-3 py-2 text-xs text-slate-300">
                vs <span className="font-bold text-sky-400">{stats.opponentName}</span>
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1880px] space-y-4 p-4">
        {error && <div className="rounded-lg border border-rose-700 bg-rose-950/60 p-3 text-sm text-rose-200">Error al cargar datos: {error}</div>}
        {loading && !stats && <p className="animate-pulse p-8 text-center text-niners-gold">Cargando película…</p>}
        {stats && (
          <div key={`${stats.team}-${stats.gameId}`} className={`space-y-4 transition-opacity ${loading ? 'opacity-50' : 'opacity-100'}`}>
            <ImpactCards s={stats} />
            <Matchups s={stats} />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              <FieldMap s={stats} selected={selected} onSelect={setSelected} className="md:col-span-2 lg:col-span-3" />
              <PenaltyPanel s={stats} className="md:col-span-2 lg:col-span-1" onSelect={k => {
                setSelected(k)
                document.getElementById('field-map')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }} />
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              <QbRadar s={stats} />
              <PressureChart s={stats} />
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              <GamesTable s={stats} onPickGame={pickGame} />
              <PlayersTable s={stats} />
              <AskCoach s={stats} />
            </div>
            <footer className="pb-4 text-xs text-slate-500">{stats.notes.join(' · ')}</footer>
          </div>
        )}
      </main>
    </div>
  )
}
