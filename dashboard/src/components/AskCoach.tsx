import { useEffect, useState } from 'react'
import type { CoachAnswer, Stats } from '../api'
import { api } from '../api'
import { Panel } from './ui'

const PRESETS = [
  '¿Cuánto nos costaron los castigos y quién los cometió?',
  '¿Cómo rindió el QB bajo presión?',
  '¿Qué tan efectiva fue nuestra presión y quién la generó?',
]

export default function AskCoach({ s }: { s: Stats }) {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<CoachAnswer | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { setAnswer(null); setError(null) }, [s.team, s.gameId])

  const ask = async (q: string) => {
    if (!q.trim() || loading) return
    setLoading(true); setError(null)
    try { setAnswer(await api.askCoach(s.team, s.gameId, q.trim())) }
    catch (e) { setError(String(e)) }
    finally { setLoading(false) }
  }

  return (
    <Panel title="Ask the Coach · Amazon Nova" subtitle={`Contexto: ${s.teamName} vs ${s.opponentName}`} className="lg:col-span-2">
      <form className="flex gap-2" onSubmit={e => { e.preventDefault(); ask(question) }}>
        <input value={question} onChange={e => setQuestion(e.target.value)} maxLength={500}
          placeholder="Pregunta táctica sobre castigos, presión o tendencias…"
          className="flex-1 rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-niners-gold focus:outline-none" />
        <button type="submit" disabled={loading}
          className="rounded-lg bg-niners-red px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50">
          Preguntar
        </button>
      </form>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {PRESETS.map(p => (
          <button key={p} type="button" onClick={() => { setQuestion(p); ask(p) }} disabled={loading}
            className="rounded-full border border-slate-600 px-2.5 py-1 text-xs text-slate-300 hover:border-niners-gold hover:text-white">
            {p}
          </button>
        ))}
      </div>
      <div className="mt-3 min-h-[5.5rem] rounded-lg border border-slate-700 bg-slate-900/80 p-3 text-sm">
        {loading && <p className="animate-pulse text-niners-gold">El coordinador está analizando la película…</p>}
        {!loading && error && <p className="text-rose-400">No se pudo consultar: {error}</p>}
        {!loading && answer && (
          <div className="animate-fade-in space-y-1">
            {answer.answer.split('\n').map((l, i) => <p key={i} className="text-slate-100">{l}</p>)}
            <p className="pt-1 text-xs text-slate-500">
              {answer.source === 'ai' ? 'Respuesta de Amazon Nova (Bedrock)' : answer.detail ?? 'Respuesta calculada con los datos'}
            </p>
          </div>
        )}
        {!loading && !answer && !error && <p className="text-slate-500">Haz una pregunta o elige una sugerencia.</p>}
      </div>
    </Panel>
  )
}
