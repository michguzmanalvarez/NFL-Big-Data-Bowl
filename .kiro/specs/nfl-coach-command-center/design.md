# Design: NFL Coach Command Center

## Visión general

```
data/ (CSV, solo lectura)
   │  pandas, al arrancar (≈3.5 s, en memoria)
   ▼
backend/analytics.py ── Store (filtrado a SF + normalización + enriquecimiento)
   │                    build_stats(team, gameId)  [lru_cache]
   │                    play_frames(gameId, playId)
   ▼
backend/main.py ─────── FastAPI: /health, /api/teams, /api/stats, /api/play, /api/ask-coach
   │                    └─ Strands Agent + BedrockModel (Amazon Nova), fallback JSON
   ▼  (misma URL y puerto en AWS; proxy de Vite en desarrollo)
dashboard/ ──────────── React + Tailwind 3 + Recharts, fetch('api/...') relativo
```

## Backend

### Carga y enriquecimiento (`Store`)

| Paso | Detalle |
|---|---|
| Filtrado | `games` donde SF es local o visitante → 7 `gameId`. `plays`, `pffScoutingData` y solo esos 7 `tracking_[gameId].csv`. |
| Normalización | Vectorizada con `np.where`: si `playDirection == 'left'` → `x = 120 − x`, `y = 53.3 − y`, `o` y `dir` + 180° (mód 360). |
| Snap y fin | Del balón (`team == 'football'`): primer `ball_snap`/`autoevent_ballsnap` y primer `pass_forward`/`qb_sack`/`run`. `timeToThrow = Δframes / 10`. |
| Spot | `losX`, `ballY` = posición normalizada del balón en el frame del snap. |
| QB | Jugador con `pff_role == 'Pass'` en la jugada. |
| Presión | `max(pff_hit, pff_hurry, pff_sack)` entre defensores; `blitz = rushers ≥ 5`. |
| Pase | `isAtt`, `comp`, `int`, `sack`, `passTD` (desde `playDescription`, excluye `REVERSED`), `passYds = prePenaltyPlayResult` si completo. |
| Situación | `yardsToGoal` a partir de `yardlineSide`/`yardlineNumber`; `redZone = yardsToGoal ≤ 20`; `success` con 40/60/100 % de la distancia por down. |

### Castigos

1. Se desdoblan `foulName1-3` / `foulNFLId1-3` en una tabla larga.
2. **Atribución:** se cruza con el `pff_role` del infractor (roles ofensivos o defensivos). Si no hay rol, se usa el signo de `penaltyYards`.
3. **Aceptado:** el castigo ofensivo tiene `penaltyYards < 0` y el defensivo tiene `penaltyYards > 0`.
4. **Impacto por jugada:**
   - `driveKiller`: castigo ofensivo, down 1 o 2, y `yardsToGo − playResult ≥ 10`.
   - `bailout`: castigo defensivo en down 3.
   - `penSwing = playResult − prePenaltyPlayResult`.
   - `erasedYds = max(prePenaltyPlayResult − playResult − |penaltyYards|, 0)`.
   - `gift1st`: castigo defensivo, `playResult ≥ yardsToGo` y `prePenaltyPlayResult < yardsToGo`.
   - `rescued`: castigo defensivo con `passResult ∈ {I, S, IN}`.

### Métricas

- **Passer rating NFL:** 4 componentes acotados a [0, 2.375]; `rating = Σ / 6 × 100`.
- **`matchup(o)`** para las jugadas `o` de una ofensiva:
  - `passing`: estadísticas del QB.
  - `qbs`: una línea por QB.
  - `passRush`: sacks, presión, hits, hurries, presión→sack, blitz, man y zona, rating permitido con y sin presión, top 5 rushers.
  - `penalties`: castigos de la ofensiva y de la defensa, más `netSwing`.
- **`build_stats(team, gameId)`** devuelve:
  - `matchups.teamOffense` y `matchups.teamDefense`.
  - `teamStats` y `oppStats` para las tarjetas.
  - `games[]` con las unidades de ambos equipos por partido.
  - `radar`, `timeToThrow`, `penaltyLog`, `plays` (spots para el mapa) y `players`.
- **Caché:** `@lru_cache` en `store()` y `build_stats()`. Son 8 equipos × 8 opciones de partido como máximo, todo en memoria.

### API

| Método | Ruta | Respuesta |
|---|---|---|
| GET | `/health` | `{"status": "ok"}` |
| GET | `/api/teams` | equipos (SF + 7 rivales) y partidos de SF |
| GET | `/api/stats?team&gameId` | objeto `Stats` completo; 404 si el equipo o el partido no aplican |
| GET | `/api/play?gameId&playId` | `play`, `points` (frames), `roster` (rol PFF, presión, castigo), `frames` |
| POST | `/api/ask-coach` | `AskCoachResponse {team, answer, source: ai \| fallback, detail}` |

Los modelos de entrada y salida de la IA usan Pydantic v2 (`AskCoachRequest`, `AskCoachResponse`), con límites de longitud.

### IA (Bedrock + Strands)

```
cargar_env()   ← primera instrucción de main.py (código exacto de las reglas)
region = os.environ.get("AWS_REGION", "us-east-1")
model  = BedrockModel(model_id=os.environ.get("BEDROCK_MODEL_ID", "us.amazon.nova-pro-v1:0"),
                      boto_session=boto3.Session(region_name=region),   # sin llaves
                      boto_client_config=Config(timeouts, 1 intento), temperature=0.3, max_tokens=300)
Agent(model, system_prompt=<coordinador táctico, ≤ 3 líneas, español, no inventar>)
```

- **Contexto:** se separa por equipo para que el modelo no mezcle perspectivas. `equipo` (nosotros) y `rival` traen cada uno su `ofensiva` (QBs, sacks recibidos, castigos ofensivos) y su `defensa` (presión generada, pass rushers líderes, castigos defensivos). Se agrega la lista de castigos.
- **Post-proceso:** se recorta la respuesta a 3 líneas.
- **Fallback:** cualquier excepción devuelve 3 líneas calculadas (castigos críticos, QB limpio vs presionado, presión generada y su líder) con `source: "fallback"`. En el log solo queda el tipo de error, nunca credenciales.

## Frontend

| Componente | Contenido |
|---|---|
| `App.tsx` | Header sticky con selectores de equipo y partido; `useEffect([team, gameId])` con `AbortController` pide `api/stats`. |
| `ImpactCards` | Puntos · Rating del QB (yds por pase completo) · Castigos Críticos / Yds · Defensa: Sacks / Presión. |
| `Matchups` | 2 paneles: Ofensiva X vs Defensa Y. Secciones QB, Defensa (sacks y presión, top rushers) y Castigos con su impacto. |
| `FieldMap` | `ScatterChart` 0-120 × 0-53.3; spots coloreados por castigo, sack, presión o éxito; filtros; reproducción con `setInterval` a 100 ms; anillos para QB, presión, sack y presión permitida; 🚩 para el infractor; **Red Zone Mode**. |
| `PenaltyPanel` | Castigos jugada por jugada (equipo o rival, ofensiva o defensiva) con su efecto; clic abre la jugada en el mapa. |
| `Charts` | `RadarChart` con el rating del QB en 6 situaciones; `ComposedChart` con tiempo para lanzar vs presión y sacks. |
| `GamesTable` | Head-to-Head por partido en 4 bloques: ofensiva y defensa de cada equipo. |
| `PlayersTable` | Jugadores PFF; la vista defensiva se ordena por presiones. |
| `AskCoach` | Formulario y preguntas sugeridas hacia `api/ask-coach`; muestra si respondió la IA o el respaldo. |

**Estilo:** `bg-slate-900`, tarjetas `slate-800/70`, colores 49ers (`niners.red #AA0000`, `niners.gold #B3995D`) y keyframe `fade-in` propio en `tailwind.config.js`. Red Zone Mode usa `border-red-700 bg-red-950/40` y una capa `animate-pulse border-4 border-red-500`.

**Ruteo:** `api.ts` concentra todas las rutas (`'api/teams'`, `` `api/stats?team=${team}` ``, `'api/play?...'`, `'api/ask-coach'`). `index.html` usa `./src/main.tsx`. `vite.config.ts` tiene `base: './'` y `server.proxy['/api'] → http://localhost:8000`.

## Decisiones y límites de los datos

| Decisión | Motivo |
|---|---|
| Sin YAC | El tracking termina 5 frames (0.5 s) después del pase; no hay punto de recepción. |
| Sin predictor de jugada | `plays.csv` solo tiene dropbacks, así que no se puede estimar corrida contra pase. |
| Puntos = cota inferior | Solo hay marcador previo a cada dropback; el último dropback no siempre es el final del partido. |
| Atribución de castigos por rol PFF | Más exacta que el signo de las yardas (un castigo de 0 yds o compensado no tiene signo). |
| Sin EPA | El dataset no lo trae y el equipo decidió no usar nflverse. |
