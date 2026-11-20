# Tasks: NFL Coach Command Center

- [x] 1. Scouting de datos
  - [x] 1.1 Descargar `data/tracking` (122 archivos) del repositorio del Big Data Bowl.
  - [x] 1.2 `scripts/scout_data.py`: esquema, llaves, cobertura de requisitos y tiempo para lanzar derivado.
  - [x] 1.3 Confirmar límites: solo dropbacks, sin EPA, sin punto de recepción (YAC).
  - _Requisitos: 0, 4.6, 9.8_

- [x] 2. Motor analítico (`backend/analytics.py`)
  - [x] 2.1 `Store`: filtrar los 7 partidos de SF y leer solo sus 7 archivos de tracking.
  - [x] 2.2 Normalización espacial vectorizada (`x`, `y`, `o`, `dir`) para jugadas hacia la izquierda.
  - [x] 2.3 Snap, fin de jugada, tiempo para lanzar, spot del snap, QB, presión, blitz y situación.
  - [x] 2.4 Tabla de castigos con atribución por rol PFF y solo castigos aceptados.
  - [x] 2.5 Impacto de castigos: Drive Killer, Bailout, ganancia anulada, primer down regalado, jugada rescatada, balance neto.
  - [x] 2.6 Passer rating NFL, `qb_lines`, `pass_rush`, `phase_penalties`, `matchup`.
  - [x] 2.7 `build_stats(team, gameId)` con enfrentamientos ofensiva/defensa, filas por partido, radar, tiempo para lanzar, log de castigos, spots y jugadores.
  - [x] 2.8 `play_frames`: frames normalizados y roster con rol PFF, presión y castigos.
  - _Requisitos: 1.3, 2.1, 3, 4, 5, 6, 7_

- [x] 3. API (`backend/main.py`)
  - [x] 3.1 `cargar_env()` exacto de las reglas al inicio del archivo.
  - [x] 3.2 `GET /health`, `GET /api/teams`, `GET /api/stats`, `GET /api/play` con validación y 404.
  - [x] 3.3 Carga en `lifespan` (en memoria, sin escribir a disco).
  - _Requisitos: 1, 2.2-2.6_

- [x] 4. IA táctica
  - [x] 4.1 `POST /api/ask-coach` con Pydantic v2, Strands `Agent` y `BedrockModel` con región y modelo leídos del entorno, sin llaves.
  - [x] 4.2 Contexto separado por equipo (nosotros y rival), cada uno con ofensiva y defensa.
  - [x] 4.3 Respuesta de 3 líneas como máximo y fallback JSON calculado con los datos.
  - [x] 4.4 Verificar con las llaves del `.env`: `source: "ai"` y respuestas con el equipo correcto.
  - _Requisitos: 8_

- [x] 5. Dashboard (`dashboard/`)
  - [x] 5.1 `vite.config.ts` con `base: './'` y proxy `/api → :8000`; `index.html` con ruta relativa; `animate-fade-in` en Tailwind 3.
  - [x] 5.2 `api.ts` con tipos y rutas relativas sin diagonal inicial.
  - [x] 5.3 Header con selectores de equipo y partido que vuelven a pedir los datos.
  - [x] 5.4 `ImpactCards`, `Matchups` (QB, sacks y presión, castigos con impacto).
  - [x] 5.5 `FieldMap` con filtros, reproducción a 10 fps, anillos de presión y sack, 🚩 de castigos y Red Zone Mode.
  - [x] 5.6 `PenaltyPanel`, `Charts` (Radar QB, tiempo para lanzar vs presión), `GamesTable`, `PlayersTable`, `AskCoach`.
  - [x] 5.7 Quitar YAC y el predictor de jugada.
  - _Requisitos: 4.6, 9, 10_

- [x] 6. Verificación
  - [x] 6.1 `npm run build` (typecheck y build) sin errores; `dist/index.html` con assets `./assets/...`.
  - [x] 6.2 Pruebas HTTP: `/health`, stats de SF (todos los partidos y uno solo), stats de un rival, 404 de equipo y de partido, `/api/play`, `/api/ask-coach`.
  - [x] 6.3 Proxy de Vite (`:5173/api/stats`) contra Uvicorn (`:8000`).
  - _Requisitos: 1, 2, 8, 10_

- [x] 7. Documentación de impacto: redactar `README.md` (última tarea)
  - [x] 7.1 Elevator Pitch.
  - [x] 7.2 Top 3 Hallazgos con los números reales de Pandas.
  - [x] 7.3 Cumplimiento arquitectónico con AWS (ruteo relativo, Bedrock sin llaves).
  - [x] 7.4 Wow Factor: Red Zone Mode, Multi-Equipo, Normalización Espacial.
  - _Requisitos: 11_
