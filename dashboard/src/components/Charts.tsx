import {
  Bar, CartesianGrid, ComposedChart, Legend, Line, PolarAngleAxis, PolarGrid, PolarRadiusAxis,
  Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import type { RadarRow, Stats } from '../api'
import { useState } from 'react'
import { OPP_COLOR, Panel, TEAM_COLOR, Toggle } from './ui'

const tooltipStyle = { backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }

function RadarTip({ active, payload }: { active?: boolean; payload?: { payload: RadarRow }[] }) {
  if (!active || !payload?.length) return null
  const r = payload[0].payload
  return (
    <div style={tooltipStyle} className="p-2 text-xs">
      <p className="font-bold">{r.axis}</p>
      <p style={{ color: '#f87171' }}>Equipo: rating {r.teamRating ?? 'N/D'} ({r.teamAtt} intentos)</p>
      <p style={{ color: OPP_COLOR }}>Rival: rating {r.oppRating ?? 'N/D'} ({r.oppAtt} intentos)</p>
    </div>
  )
}

export function QbRadar({ s }: { s: Stats }) {
  return (
    <Panel title="Rendimiento del QB por situación" subtitle="Passer rating normalizado (0-100 = 0-158.3)" className="lg:col-span-2">
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={s.radar} outerRadius="75%">
            <PolarGrid stroke="#334155" />
            <PolarAngleAxis dataKey="axis" tick={{ fill: '#cbd5e1', fontSize: 12 }} />
            <PolarRadiusAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} />
            <Radar name={s.team} dataKey="team" stroke={TEAM_COLOR} fill={TEAM_COLOR} fillOpacity={0.45} isAnimationActive />
            <Radar name={s.opponent} dataKey="opp" stroke={OPP_COLOR} fill={OPP_COLOR} fillOpacity={0.2} />
            <Legend wrapperStyle={{ color: '#e2e8f0', fontSize: 12 }} />
            <Tooltip content={<RadarTip />} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  )
}

export function PressureChart({ s }: { s: Stats }) {
  const [who, setWho] = useState<'team' | 'opp'>('team')
  const data = s.timeToThrow[who]
  return (
    <Panel title="Tiempo para lanzar vs Presión" subtitle="Presión y sacks suben cuando el QB retiene el balón"
      className="lg:col-span-2"
      right={<Toggle value={who} onChange={setWho} options={[{ value: 'team', label: s.team }, { value: 'opp', label: s.opponent }]} />}>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
            <XAxis dataKey="bucket" tick={{ fill: '#cbd5e1', fontSize: 12 }} />
            <YAxis yAxisId="pct" unit="%" tick={{ fill: '#94a3b8', fontSize: 11 }} />
            <YAxis yAxisId="rt" orientation="right" domain={[0, 158.3]} tick={{ fill: '#94a3b8', fontSize: 11 }} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#1e293b' }} />
            <Legend wrapperStyle={{ color: '#e2e8f0', fontSize: 12 }} />
            <Bar yAxisId="pct" dataKey="pressureRate" name="% Presión" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            <Bar yAxisId="pct" dataKey="sackRate" name="% Sack (captura)" fill="#ef4444" radius={[4, 4, 0, 0]} />
            <Line yAxisId="rt" dataKey="rating" name="Rating QB" stroke="#e2e8f0" strokeWidth={2} dot={{ r: 4 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-xs text-slate-400">
        Dropbacks por rango: {data.map(d => `${d.bucket}: ${d.dropbacks}`).join(' · ')}
      </p>
    </Panel>
  )
}
