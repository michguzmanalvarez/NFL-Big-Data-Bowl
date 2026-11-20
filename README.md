# NFL Coach Command Center · San Francisco 49ers

Dashboard táctico y de scouting construido con los datos del NFL Big Data Bowl (temporada 2021, semanas 1-8).
Separa cada partido de los 49ers en **ofensiva y defensa de ambos equipos**, mide cuánto pesaron los
**castigos** en cada jugada y destaca el **desempeño del QB** y la **presión de la defensa**.

---

## Elevator Pitch

Un coordinador revisa decenas de jugadas por partido y la pregunta que más le cuesta contestar es dónde se ganó o se perdió el juego.
El Coach Command Center la contesta en un clic. Eliges el partido, ves frente a frente la ofensiva y la defensa
de los 49ers y de su rival, y cada castigo trae su consecuencia en yardas: si mató un drive, si regaló un primer
down o si rescató un pase incompleto del rival. Después puedes reproducir esa jugada sobre el campo y ver quién
presionó al QB y quién cometió la falta. Arriba de todo, Amazon Nova resume la situación en 3 líneas.

**Datos procesados:** 7 partidos de SF (la semana 6 fue de descanso), 449 dropbacks, 436,057 filas de tracking
a 10 fps, 54 jugadores de SF y los de sus 7 rivales (ARI, CHI, DET, GB, IND, PHI, SEA).

---

## Top 3 Hallazgos

Todos los números salen de `backend/analytics.py` (pandas/numpy) sobre los 7 partidos de SF.

### 1. La defensa de SF regaló con castigos más jugadas de las que ganó con sacks

| Defensa de SF contra el pase | Valor |
|---|---|
| Sacks logrados | **14** |
| Jugadas fallidas del rival (incompleto, sack o INT) rescatadas por un castigo de SF | **16** |
| Primeros downs regalados por castigo | 16 |
| Castigos defensivos aceptados | 20 (335 yds) |
| Bailouts en 3er down | 9 (177 yds) |
| Parte de las yardas de pase rivales que vino de castigos | **20.5 %** |
| Balance neto de castigos en esas jugadas | **+230 yds para los rivales** |

En la otra dirección, las defensas rivales le cometieron a SF 11 castigos (129 yds), y el balance neto de esas
jugadas fue de −54 yds para la ofensiva de SF, por sus propios 6 Drive Killers.

**El partido que lo resume es la semana 3, SF vs Green Bay.** Los 3 Bailouts de SF fueron interferencias de pase en 3er down,
sobre pases que Aaron Rodgers ya había fallado:

| Infractor | Situación | La jugada valía | Terminó en |
|---|---|---|---|
| Deommodore Lenoir (CB) | 3&4 | 0 yds (incompleto) | +25 yds, 1er down |
| Emmanuel Moseley (CB) | 3&6 | 0 yds (incompleto) | +32 yds, 1er down |
| Fred Warner (LB) | 3&2 | 0 yds (incompleto) | +24 yds, 1er down |

Fueron 81 yardas regaladas en un partido que se decidió por 2 puntos (28-30, resultado oficial; el dataset
solo registra el marcador previo a cada dropback).

### 2. Cuando la presión llega, la defensa de SF cambia de nivel, y Nick Bosa la genera

- SF presionó al QB rival en el **35.2 %** de los dropbacks, y el **17.3 %** de esas presiones terminó en sack.
- **Rating permitido:** **98.7** cuando el QB rival lanzó sin presión, y **73.3** cuando fue presionado.
- **Nick Bosa:** 31 presiones y **7 de los 14 sacks** del equipo (50 %). El siguiente es Arik Armstead con 21 presiones.
- Con un blitz de 5 o más en el 28.7 % de las jugadas, la mayor parte de la presión llegó con 4 hombres.

### 3. El QB de SF vive en la ventana de 2.5 a 3.5 segundos

| Tiempo para lanzar (SF) | Dropbacks | % presión | % sack | % completos | Rating |
|---|---|---|---|---|---|
| < 2.5 s | 72 | 13.9 % | 1.4 % | 62.5 % | 80.7 |
| **2.5 - 3.5 s** | 81 | 29.6 % | **0.0 %** | 54.3 % | **111.1** |
| > 3.5 s | 63 | **66.7 %** | **15.9 %** | 33.3 % | 83.4 |

- **Más de 3.5 s:** dos de cada tres dropbacks terminan bajo presión, y casi uno de cada seis termina en sack.
- **Garoppolo vs Lance bajo presión:**

  | QB | Dropbacks | Rating limpio | Rating presionado |
  |---|---|---|---|
  | Jimmy Garoppolo | 159 | 98.0 | 99.0 |
  | Trey Lance | 60 | 93.9 | **45.4** |

  Garoppolo no pierde nada bajo presión; Lance se desploma.
- **Play action:** el rating de SF sube a **113.4** con play action (57 intentos), contra 84.9 sin él.

> Límites: los datos solo incluyen jugadas de pase. Las muestras por QB y por situación son pequeñas
> (Lance: 60 dropbacks), así que estos hallazgos sirven para orientar el scouting, no son conclusiones definitivas.

---

## Wow Factor

### Red Zone Mode
Cuando una jugada empieza a 20 yardas o menos de la meta, o activas el filtro **Red Zone**, el mapa del campo
cambia a modo alerta. El fondo y los textos pasan a tonos rojos y el borde pulsa con
`animate-pulse border-4 border-red-500`. La franja de las últimas 20 yardas se intensifica en el campo.
Todo se hace con clases de Tailwind 3, sin librerías de animación. Hay 55 jugadas de red zone en los partidos de SF
(23 de la ofensiva de SF).

### Multi-Equipo
El backend calcula **todas** las métricas para cualquiera de los 8 equipos: SF y sus 7 rivales.

- `GET /api/stats?team=GB` voltea la perspectiva: Green Bay pasa a ser "nosotros" y SF el rival.
- `&gameId=` aísla un partido.
- Cada vista trae dos enfrentamientos: **Ofensiva X vs Defensa Y** y **Ofensiva Y vs Defensa X**.
- El selector del header vuelve a pedir los datos y actualiza toda la pantalla.

### Normalización Espacial
En los partidos de SF, el 57.4 % de las filas de tracking corresponde a jugadas hacia la izquierda.
Se normalizan de forma vectorizada al arrancar:

```python
left = t.playDirection.eq("left").to_numpy()
t["x"] = np.where(left, 120.0 - t.x, t.x)
t["y"] = np.where(left, 53.3 - t.y, t.y)
t["o"], t["dir"] = [np.where(left, (t[c] + 180) % 360, t[c]) for c in ("o", "dir")]
```

Así, toda ofensiva ataca de izquierda a derecha. Los spots del snap de todos los partidos se pueden comparar en un
solo campo, y la reproducción de cada jugada (10 fps con `setInterval`) siempre se lee en el mismo sentido.
En la reproducción se marcan el QB (anillo dorado), los defensores que presionaron (naranja), quien hizo el sack
(rojo), el bloqueador que permitió presión (rosa) y el infractor (🚩).

---

## Cumplimiento arquitectónico con AWS

| Regla | Cómo se cumple |
|---|---|
| Stack fijo | FastAPI 0.115.14, Pydantic 2.11.7, pandas 2.2.3, numpy 2.1.3, React 18.3.1, Vite 5.4.21, Tailwind 3.4.19, Recharts 3.10.1, strands-agents, boto3. Sin dependencias extra. |
| `GET /health` | `backend/main.py` expone `app` y responde `{"status": "ok"}`. Toda la API vive bajo `/api/`. |
| Ruteo relativo | Todas las llamadas están en `dashboard/src/api.ts` y no llevan diagonal inicial: `fetch('api/teams')`, `` fetch(`api/stats?team=${team}`) ``, `fetch('api/ask-coach')`. `index.html` carga `./src/main.tsx`, y el build genera `./assets/...`. Funciona en la subruta `/evento/equipo/`. |
| Vite | `vite.config.ts` conserva `base: './'` y tiene un proxy de `/api` a `http://localhost:8000` solo para desarrollo. No hay `localhost` ni URLs absolutas en el código del dashboard. |
| Bedrock sin llaves | `BedrockModel(model_id=os.environ.get("BEDROCK_MODEL_ID", "us.amazon.nova-pro-v1:0"), boto_session=boto3.Session(region_name=os.environ.get("AWS_REGION", "us-east-1")))`. El código no lee, valida ni pasa `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` ni `AWS_SESSION_TOKEN`. En AWS firma el rol de la tarea. |
| `.env` local | `cargar_env()` copiado tal cual de las reglas, como primera instrucción de `main.py`. Sin `python-dotenv`. `.env` está en `.gitignore`. |
| La IA es opcional | Si Bedrock falla, `/api/ask-coach` responde 200 con `source: "fallback"` y 3 líneas calculadas con los datos. El dashboard funciona completo sin IA. |
| Servidor efímero | Los datos se leen de `data/` (solo lectura, rutas relativas a la raíz) y se procesan en memoria al arrancar, en unos 3.5 s. No se escribe nada en disco. |
| Sin otros servicios | Solo Bedrock: no hay S3, DynamoDB ni Lambda. |

---

## Cómo correrlo

### 1. Descargar el tracking (no viene en este repositorio)

`data/` incluye `games.csv`, `plays.csv`, `players.csv` y `pffScoutingData.csv`. Los 122 archivos
`data/tracking/tracking_[gameId].csv` (≈820 MB) se descargan del repositorio original del evento:

```powershell
git clone --filter=blob:none --no-checkout --sparse https://github.com/ThompsonJamesBliss/nfl-big-data-bowl-regional-event-data.git $env:TEMP\nfl-data
git -C $env:TEMP\nfl-data sparse-checkout set data/tracking
git -C $env:TEMP\nfl-data checkout 85da22eeff2f1d5be106faa9dfe06a1205f2defd
Copy-Item $env:TEMP\nfl-data\data\tracking .\data\ -Recurse
```

La app solo lee los 7 archivos de los partidos de SF: `2021091204`, `2021091907`, `2021092613`,
`2021100310`, `2021101011`, `2021102410` y `2021103102`.

### 2. Levantar la API y el dashboard

```powershell
# API (raíz del proyecto)
.venv\Scripts\uvicorn.exe backend.main:app --reload --port 8000

# Dashboard (en dashboard/)
npm run dev        # http://localhost:5173
npm run build      # genera dashboard/dist

# Verificar entorno y generar la entrega
.\.hackathon\setup.cmd --check
.\.hackathon\setup.cmd --entregar
```

Para usar Amazon Nova en tu computadora, copia `.env.example` a `.env` y pega las llaves temporales del workshop.

## API

| Método | Ruta | Devuelve |
|---|---|---|
| GET | `/health` | `{"status": "ok"}` |
| GET | `/api/teams` | SF, sus 7 rivales y los partidos |
| GET | `/api/stats?team=SF[&gameId=…]` | enfrentamientos ofensiva y defensa, QB, presión, castigos, radar, tiempo para lanzar, spots, jugadores |
| GET | `/api/play?gameId=…&playId=…` | frames normalizados, roster con presión y castigos |
| POST | `/api/ask-coach` | `{team, answer, source: "ai" \| "fallback", detail}` |

## Definiciones

- **Presión:** hit, hurry o sack acreditado por PFF.
- **Drive Killer:** castigo ofensivo aceptado en 1ra o 2da down que deja 10 o más yardas por avanzar.
- **Bailout:** castigo defensivo aceptado en 3er down.
- **Jugada rescatada:** castigo defensivo sobre un incompleto, sack o intercepción.
- **Tiempo para lanzar:** frames del tracking entre el snap y el pase, sack o scramble, divididos entre 10.
- **Castigos:** se atribuyen con el rol PFF del infractor y solo cuentan los aceptados.
- **Puntos:** marcador previo al último dropback de cada partido; es una cota inferior del marcador final.
- **Lo que no se incluye:** YAC (el tracking termina 0.5 s después del pase), predicción de corrida contra pase
  (solo hay pases) y EPA (no viene en el dataset).

## Estructura

```
backend/   main.py (API + IA) · analytics.py (motor pandas/numpy)
dashboard/ src/App.tsx · src/api.ts · src/components/*
data/      CSV originales (solo lectura)
scripts/   scout_data.py (scouting inicial de los datos)
.kiro/specs/nfl-coach-command-center/  requirements.md · design.md · tasks.md
```
