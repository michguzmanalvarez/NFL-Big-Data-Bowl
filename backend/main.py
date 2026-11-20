"""NFL Coach Command Center (San Francisco 49ers). Ejecuta: .venv/bin/uvicorn backend.main:app --reload"""
import os
from pathlib import Path

def cargar_env():
    f = Path(__file__).resolve().parent.parent / ".env"
    if f.exists():
        for linea in f.read_text(encoding="utf-8-sig").splitlines():
            linea = linea.strip()
            if linea and not linea.startswith("#") and "=" in linea:
                k, v = linea.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

cargar_env()

import json  # noqa: E402
import logging  # noqa: E402
from contextlib import asynccontextmanager  # noqa: E402
from typing import Literal  # noqa: E402

from fastapi import FastAPI, HTTPException, Query  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402

from . import analytics as an  # noqa: E402

log = logging.getLogger("coach")


@asynccontextmanager
async def lifespan(_: FastAPI):
    an.store()  # carga y procesa los datos una sola vez al arrancar (en memoria, sin escribir a disco)
    yield


app = FastAPI(title="NFL Coach Command Center - San Francisco 49ers", lifespan=lifespan)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


# --------------------------------------------------------------------------- helpers
def _check(team: str, game_id: int | None) -> str:
    team = team.upper()
    valid = {t["abbr"]: t for t in an.teams()}
    if team not in valid:
        raise HTTPException(404, f"Equipo '{team}' no está en los partidos de {an.FOCUS}. Opciones: {sorted(valid)}")
    if game_id is not None and game_id not in valid[team]["games"]:
        raise HTTPException(404, f"El partido {game_id} no pertenece a {team}.")
    return team


# --------------------------------------------------------------------------- API
@app.get("/api/teams")
def api_teams() -> dict:
    s = an.store()
    games = an.points(s.games, s.plays, an.FOCUS)
    return {
        "focus": an.FOCUS,
        "teams": an.teams(),
        "games": an.records(games[["gameId", "week", "gameDate", "homeAway", "opponent", "teamScore", "oppScore"]]),
    }


@app.get("/api/stats")
def api_stats(team: str = Query(an.FOCUS), gameId: int | None = Query(None)) -> dict:
    return an.build_stats(_check(team, gameId), gameId)


@app.get("/api/play")
def api_play(gameId: int, playId: int) -> dict:
    data = an.play_frames(gameId, playId)
    if data is None:
        raise HTTPException(404, "Jugada no encontrada en los partidos de San Francisco.")
    return data


# --------------------------------------------------------------------------- IA (Bedrock + Strands)
class AskCoachRequest(BaseModel):
    team: str = Field(default=an.FOCUS, min_length=2, max_length=3)
    gameId: int | None = None
    question: str = Field(default="¿Qué ajuste táctico recomiendas para el próximo partido?", max_length=500)


class AskCoachResponse(BaseModel):
    team: str
    answer: str
    source: Literal["ai", "fallback"]
    detail: str | None = None


SYSTEM_PROMPT = (
    "Eres el coordinador táctico de un staff de la NFL. Analizas castigos críticos "
    "(Drive Killers: castigos ofensivos que dejan 1ra/2da y largo; Bailouts: castigos defensivos en 3er down), "
    "el desempeño del QB, la presión y los sacks de la defensa. Responde SIEMPRE en español, "
    "en máximo 3 líneas cortas. Cita números concretos del contexto (jugadores, yardas, porcentajes) "
    "y termina con una recomendación accionable. Si un dato no está en el contexto, no lo inventes."
)

_PASS_KEYS = ("rating", "compPct", "yards", "touchdowns", "interceptions", "sackRate", "pressureRate",
              "avgTimeToThrow", "ratingClean", "ratingPressured", "playActionRate")
_RUSH_KEYS = ("sacks", "pressureRate", "pressureToSack", "blitzRate", "manRate", "zoneRate",
              "ratingAllowedPressured", "ratingAllowedClean")


def _team_block(name: str, own_off: dict, opp_off: dict, log: list[dict]) -> dict:
    """Ofensiva y defensa de UN equipo, sin mezclar perspectivas.

    own_off: enfrentamiento donde este equipo tiene el balón.
    opp_off: enfrentamiento donde este equipo defiende.
    """
    rush = opp_off["passRush"]
    return {
        "nombre": name,
        "ofensiva": {
            "qbs": [{"qb": q["name"]} | {k: q[k] for k in _PASS_KEYS} for q in own_off["qbs"]],
            "sacks_recibidos": own_off["passRush"]["sacks"],
            "presion_recibida_pct": own_off["passRush"]["pressureRate"],
            "castigos_ofensivos": own_off["penalties"]["offense"],
            "yardas_regaladas_por_la_defensa_rival": own_off["penalties"]["defense"]["yards"],
        },
        "defensa": {
            "presion_generada": {k: rush[k] for k in _RUSH_KEYS},
            "pass_rushers_lideres": [{k: r[k] for k in ("displayName", "officialPosition", "pressures", "sacks")}
                                     for r in rush["topRushers"][:4]],
            "castigos_defensivos": opp_off["penalties"]["defense"],
        },
        "lista_castigos": [
            {k: c[k] for k in ("week", "phase", "critical", "effect", "foulName", "displayName", "down", "yardsToGo", "penYds")}
            for c in log[:15]],
    }


def _coach_context(st: dict) -> dict:
    o, d = st["matchups"]["teamOffense"], st["matchups"]["teamDefense"]
    return {
        "nota": "'equipo' es el equipo del coach (nosotros). 'rival' es el oponente. No mezcles sus datos.",
        "partidos": [{k: g[k] for k in ("week", "opponent", "teamScore", "oppScore")} for g in st["games"]],
        "equipo": _team_block(st["teamName"], o, d, st["penaltyLog"]["team"]),
        "rival": _team_block(st["opponentName"], d, o, st["penaltyLog"]["opp"]),
        "tiempo_para_lanzar_vs_presion_equipo": st["timeToThrow"]["team"],
    }


def _fallback(st: dict) -> str:
    o, d = st["matchups"]["teamOffense"], st["matchups"]["teamDefense"]
    tp, pp, rush = st["teamStats"]["penalties"], o["passing"], d["passRush"]
    top = rush["topRushers"][0]["displayName"] if rush["topRushers"] else "N/D"
    return "\n".join([
        f"Castigos críticos de {st['team']}: {tp['driveKillers']} Drive Killers ({tp['driveKillerYards']} yds) y "
        f"{tp['bailouts']} Bailouts ({tp['bailoutYards']} yds); {o['penalties']['offense']['erasedYards']} yds de ganancia anuladas.",
        f"QB: rating {pp['rating']} (limpio {pp['ratingClean']} vs presionado {pp['ratingPressured']}), "
        f"{pp['avgTimeToThrow']} s para lanzar; la defensa logró {rush['sacks']} sacks y {rush['pressureRate']}% de presión (líder: {top}).",
        "Ajuste: limpiar castigos en 1ra/2da down y sostener la presión en 3er down para evitar Bailouts.",
    ])


@app.post("/api/ask-coach", response_model=AskCoachResponse)
def ask_coach(req: AskCoachRequest) -> AskCoachResponse:
    team = _check(req.team, req.gameId)
    st = an.build_stats(team, req.gameId)
    try:
        import boto3
        from botocore.config import Config
        from strands import Agent
        from strands.models import BedrockModel

        region = os.environ.get("AWS_REGION", "us-east-1")
        model = BedrockModel(
            model_id=os.environ.get("BEDROCK_MODEL_ID", "us.amazon.nova-pro-v1:0"),
            boto_session=boto3.Session(region_name=region),
            boto_client_config=Config(connect_timeout=5, read_timeout=25, retries={"max_attempts": 1}),
            temperature=0.3, max_tokens=300,
        )
        agent = Agent(model=model, system_prompt=SYSTEM_PROMPT, callback_handler=None)
        prompt = (f"Contexto (JSON):\n{json.dumps(_coach_context(st), ensure_ascii=False)}\n\n"
                  f"Somos {st['teamName']} y enfrentamos a {st['opponentName']}. "
                  f"Pregunta del coach: {req.question}")
        text = str(agent(prompt)).strip()
        lines = [ln.strip() for ln in text.splitlines() if ln.strip()][:3]
        if not lines:
            raise ValueError("Respuesta vacía del modelo")
        return AskCoachResponse(team=team, answer="\n".join(lines), source="ai")
    except Exception as exc:  # la app sigue funcionando sin IA
        log.warning("ask-coach fallback: %s", type(exc).__name__)
        return AskCoachResponse(team=team, answer=_fallback(st), source="fallback",
                                detail=f"IA no disponible ({type(exc).__name__}); respuesta calculada con los datos.")
