// Todas las rutas son relativas y SIN diagonal inicial (la app se publica en una subruta).

export type Team = { abbr: string; name: string; isFocus: boolean; games: number[] }
export type GameMeta = {
  gameId: number; week: number; gameDate: string; homeAway: string
  opponent: string; teamScore: number | null; oppScore: number | null
}
export type TeamsResponse = { focus: string; teams: Team[]; games: GameMeta[] }

export type Passing = {
  dropbacks: number; attempts: number; completions: number; yards: number; touchdowns: number
  interceptions: number; sacks: number; rating: number | null; compPct: number | null
  yardsPerAttempt: number | null; yardsPerCompletion: number | null
  sackRate: number | null; pressureRate: number | null; avgTimeToThrow: number | null
  playActionRate: number | null; successRate: number | null
  ratingClean: number | null; ratingPressured: number | null
}
export type QbLine = Passing & { nflId: number; name: string }
export type Rusher = {
  nflId: number; displayName: string; officialPosition: string; rushes: number
  pressures: number; sacks: number; hits: number; hurries: number; pressureRate: number | null
}
export type PassRush = {
  sacks: number; sackRate: number | null; pressures: number; pressureRate: number | null
  hits: number; hurries: number; pressureToSack: number | null; blitzRate: number | null
  avgRushers: number | null; manRate: number | null; zoneRate: number | null
  ratingAllowed: number | null; ratingAllowedPressured: number | null; ratingAllowedClean: number | null
  interceptions: number; topRushers: Rusher[]
}
export type PhasePenalties = {
  offense: { count: number; yards: number; driveKillers: number; driveKillerYards: number; erasedPlays: number; erasedYards: number }
  defense: { count: number; yards: number; bailouts: number; bailoutYards: number; firstDowns: number; rescued: number; shareOfOffenseYards: number | null }
  netSwing: number
}
export type Matchup = {
  offense: string; defense: string; passing: Passing; qbs: QbLine[]; passRush: PassRush; penalties: PhasePenalties
}
export type Penalties = {
  driveKillers: number; driveKillerYards: number; bailouts: number; bailoutYards: number
  critical: number; criticalYards: number; total: number; totalYards: number
}
export type SideStats = { points: number; passing: Passing; passRush: PassRush; penalties: Penalties }

export type RadarRow = {
  axis: string; team: number; teamRating: number | null; teamAtt: number
  opp: number; oppRating: number | null; oppAtt: number
}
export type TttRow = {
  bucket: string; dropbacks: number; pressureRate: number | null; sackRate: number | null
  compRate: number | null; rating: number | null
}
export type PenaltyEntry = {
  gameId: number; playId: number; week: number; phase: 'Ofensiva' | 'Defensiva'
  critical: 'Drive Killer' | 'Bailout' | null; effect: string; foulName: string
  displayName: string | null; officialPosition: string | null; quarter: number; gameClock: string
  down: number; yardsToGo: number; passResult: string; prePenaltyPlayResult: number; playResult: number
  penYds: number; erasedYds: number; gift1st: boolean; rescued: boolean
  possessionTeam: string; defensiveTeam: string; qb: string | null
}
export type UnitRow = {
  qbRating: number | null; passYds: number; qb: string; offPenalties: number; offPenYds: number
  driveKillers: number; sacks: number; pressureRate: number | null; defPenalties: number
  defPenYds: number; bailouts: number
}
export type GameRow = {
  gameId: number; week: number; date: string; homeAway: string; opponent: string; opponentName: string
  teamScore: number | null; oppScore: number | null; team: UnitRow; opp: UnitRow
}
export type PlayRow = {
  gameId: number; playId: number; week: number; quarter: number; gameClock: string; down: number
  yardsToGo: number; yardsToGoal: number; redZone: boolean; losX: number; ballY: number
  passResult: string; playResult: number; pressure: boolean; sack: boolean; timeToThrow: number | null
  playAction: boolean; success: boolean; offFoul: boolean; defFoul: boolean
  foul_off: string | null; foul_def: string | null; driveKiller: boolean; bailout: boolean; penSwing: number
  playDescription: string; possessionTeam: string; defensiveTeam: string; qb: string | null; side: 'off' | 'def'
}
export type PlayerRow = {
  nflId: number; displayName: string; officialPosition: string; alignedAt: string; role: string
  snaps: number; games: number; rushes: number; pressures: number; sacks: number; hits: number; hurries: number
  pressuresAllowed: number; sacksAllowed: number; penalties: number; penaltyYards: number
  qbRating: number | null; qbAttempts: number | null
}
export type Stats = {
  team: string; teamName: string; opponent: string; opponentName: string; gameId: number | null
  games: GameRow[]; teamStats: SideStats; oppStats: SideStats
  matchups: { teamOffense: Matchup; teamDefense: Matchup }
  radar: RadarRow[]; timeToThrow: { team: TttRow[]; opp: TttRow[] }
  penaltyLog: { team: PenaltyEntry[]; opp: PenaltyEntry[] }
  plays: PlayRow[]; players: PlayerRow[]; notes: string[]
}
export type TrackPoint = {
  frameId: number; nflId: number | null; jerseyNumber: number | null
  side: 'off' | 'def' | 'ball'; x: number; y: number; s: number; event: string | null
}
export type RosterRow = {
  nflId: number; displayName: string | null; officialPosition: string | null; jerseyNumber: number | null
  side: 'off' | 'def'; pff_role: string | null; pff_positionLinedUp: string | null
  pressure: boolean | null; allowed: boolean | null; sack: boolean | null; foul: string | null
}
export type PlayFrames = {
  play: PlayRow & {
    snapFrame: number | null; endFrame: number | null; rushers: number | null; prePenaltyPlayResult: number
    pff_passCoverage: string | null; offenseFormation: string | null
    fouler_off: string | null; fouler_def: string | null; erasedYds: number; gift1st: boolean; rescued: boolean
  }
  points: TrackPoint[]; roster: RosterRow[]; frames: number
}
export type CoachAnswer = { team: string; answer: string; source: 'ai' | 'fallback'; detail: string | null }

async function getJSON<T>(path: string, signal?: AbortSignal): Promise<T> {
  const r = await fetch(path, { signal })
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`)
  return r.json() as Promise<T>
}

export const api = {
  teams: (signal?: AbortSignal) => getJSON<TeamsResponse>('api/teams', signal),
  stats: (team: string, gameId: number | null, signal?: AbortSignal) =>
    getJSON<Stats>(`api/stats?team=${team}${gameId ? `&gameId=${gameId}` : ''}`, signal),
  play: (gameId: number, playId: number, signal?: AbortSignal) =>
    getJSON<PlayFrames>(`api/play?gameId=${gameId}&playId=${playId}`, signal),
  askCoach: async (team: string, gameId: number | null, question: string): Promise<CoachAnswer> => {
    const r = await fetch('api/ask-coach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team, gameId, question }),
    })
    if (!r.ok) throw new Error(`${r.status}`)
    return r.json()
  },
}

export const fmt = (v: number | null | undefined, d = 1, suffix = '') =>
  v === null || v === undefined || Number.isNaN(v) ? 'N/D' : `${v.toFixed(d)}${suffix}`

export const RESULT_LABELS: Record<string, string> = {
  C: 'Completo', I: 'Incompleto', S: 'Sack', IN: 'Intercepción', R: 'Scramble',
}
