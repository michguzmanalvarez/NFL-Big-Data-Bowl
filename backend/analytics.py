"""Motor analítico del NFL Coach Command Center.

Carga una sola vez los partidos de San Francisco (y sus rivales), normaliza el
tracking para que la ofensiva siempre ataque hacia la derecha y calcula todas
las métricas con pandas/numpy de forma vectorizada.

Cada partido se divide en dos enfrentamientos:
  * Ofensiva del equipo vs Defensa del rival
  * Ofensiva del rival vs Defensa del equipo
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

FOCUS = "SF"
KEY = ["gameId", "playId"]
OFF_ROLES = ["Pass", "Pass Block", "Pass Route"]
DEF_ROLES = ["Coverage", "Pass Rush"]
SNAP_EVENTS = ["ball_snap", "autoevent_ballsnap"]
END_EVENTS = {
    "pass_forward": "pase", "autoevent_passforward": "pase", "pass_shovel": "pase",
    "qb_sack": "sack", "qb_strip_sack": "sack", "run": "scramble",
}
TTT_BINS = [0, 2.5, 3.5, np.inf]
TTT_LABELS = ["< 2.5 s", "2.5 - 3.5 s", "> 3.5 s"]

TEAM_NAMES = {
    "ARI": "Arizona Cardinals", "ATL": "Atlanta Falcons", "BAL": "Baltimore Ravens",
    "BUF": "Buffalo Bills", "CAR": "Carolina Panthers", "CHI": "Chicago Bears",
    "CIN": "Cincinnati Bengals", "CLE": "Cleveland Browns", "DAL": "Dallas Cowboys",
    "DEN": "Denver Broncos", "DET": "Detroit Lions", "GB": "Green Bay Packers",
    "HOU": "Houston Texans", "IND": "Indianapolis Colts", "JAX": "Jacksonville Jaguars",
    "KC": "Kansas City Chiefs", "LA": "Los Angeles Rams", "LAC": "Los Angeles Chargers",
    "LV": "Las Vegas Raiders", "MIA": "Miami Dolphins", "MIN": "Minnesota Vikings",
    "NE": "New England Patriots", "NO": "New Orleans Saints", "NYG": "New York Giants",
    "NYJ": "New York Jets", "PHI": "Philadelphia Eagles", "PIT": "Pittsburgh Steelers",
    "SEA": "Seattle Seahawks", "SF": "San Francisco 49ers", "TB": "Tampa Bay Buccaneers",
    "TEN": "Tennessee Titans", "WAS": "Washington Football Team",
}


def records(df: pd.DataFrame) -> list[dict]:
    """DataFrame -> lista JSON segura (NaN -> null, tipos numpy -> nativos)."""
    return json.loads(df.to_json(orient="records", double_precision=4))


def num(v, nd: int = 2):
    """Escalar numpy/pandas -> float nativo redondeado, o None si es NaN."""
    if v is None or pd.isna(v):
        return None
    return round(float(v), nd)


def pct(mask: pd.Series, nd: int = 1):
    return num(mask.mean() * 100, nd) if len(mask) else None


# --------------------------------------------------------------------------- carga
class Store:
    def __init__(self) -> None:
        games = pd.read_csv(DATA / "games.csv")
        games = games[(games.homeTeamAbbr == FOCUS) | (games.visitorTeamAbbr == FOCUS)]
        self.games = games.sort_values("week").reset_index(drop=True)
        ids = self.games.gameId.tolist()

        plays = pd.read_csv(DATA / "plays.csv")
        self.pff = pd.read_csv(DATA / "pffScoutingData.csv").query("gameId in @ids")
        self.players = pd.read_csv(DATA / "players.csv")
        track = pd.concat(
            [pd.read_csv(DATA / "tracking" / f"tracking_{g}.csv") for g in ids], ignore_index=True
        )
        self.track = self._normalize(track)
        self.plays = self._enrich(plays.query("gameId in @ids").copy())
        self.fouls = self._fouls()
        self.plays = self._penalty_impact(self.plays)
        self.fouls = self.fouls.merge(self.plays[KEY + IMPACT_COLS], on=KEY, how="left")

    # ---- normalización espacial: la ofensiva siempre ataca de izquierda a derecha
    @staticmethod
    def _normalize(t: pd.DataFrame) -> pd.DataFrame:
        left = t.playDirection.eq("left").to_numpy()
        t["x"] = np.where(left, 120.0 - t.x, t.x)
        t["y"] = np.where(left, 53.3 - t.y, t.y)
        for c in ("o", "dir"):
            t[c] = np.where(left, (t[c] + 180.0) % 360.0, t[c])
        return t

    def _enrich(self, p: pd.DataFrame) -> pd.DataFrame:
        # Tiempos y posición del balón desde tracking
        ball = self.track[self.track.team == "football"]
        ev = ball.dropna(subset=["event"])
        snap = ev[ev.event.isin(SNAP_EVENTS)].groupby(KEY).frameId.min().rename("snapFrame")
        end = (ev[ev.event.isin(END_EVENTS)].sort_values("frameId")
               .groupby(KEY)[["frameId", "event"]].first()
               .rename(columns={"frameId": "endFrame", "event": "endEvent"}))
        pos = ball.merge(snap.reset_index(), on=KEY)
        pos = (pos[pos.frameId == pos.snapFrame].set_index(KEY)[["x", "y"]]
               .rename(columns={"x": "losX", "y": "ballY"}))
        p = p.join(snap, on=KEY).join(end, on=KEY).join(pos, on=KEY)
        p["timeToThrow"] = (p.endFrame - p.snapFrame) / 10.0
        p["endType"] = p.endEvent.map(END_EVENTS)
        p["tttBucket"] = pd.cut(p.timeToThrow, TTT_BINS, labels=TTT_LABELS, right=False)

        # QB de la jugada (rol PFF "Pass")
        qb = (self.pff[self.pff.pff_role == "Pass"].drop_duplicates(KEY)
              .merge(self.players[["nflId", "displayName"]], on="nflId", how="left")
              .set_index(KEY)[["nflId", "displayName"]].rename(columns={"nflId": "qbId", "displayName": "qb"}))
        p = p.join(qb, on=KEY)

        # Presión, sacks y blitz desde PFF (nivel jugada)
        d = self.pff[self.pff.pff_role.isin(DEF_ROLES)].copy()
        d["press"] = d[["pff_hit", "pff_hurry", "pff_sack"]].fillna(0).max(axis=1)
        d["rusher"] = d.pff_role.eq("Pass Rush")
        pr = d.groupby(KEY).agg(pressure=("press", "max"), rushers=("rusher", "sum"),
                                hits=("pff_hit", "sum"), hurries=("pff_hurry", "sum"))
        p = p.join(pr, on=KEY)
        p["pressure"] = p.pressure.fillna(0).astype(bool)
        p["blitz"] = p.rushers.fillna(0) >= 5

        desc = p.playDescription.fillna("")
        p["noPlay"] = desc.str.contains("No Play", regex=False)
        p["isAtt"] = p.passResult.isin(["C", "I", "IN"]) & ~p.noPlay
        p["comp"] = p.passResult.eq("C") & p.isAtt
        p["int"] = p.passResult.eq("IN") & p.isAtt
        p["sack"] = p.passResult.eq("S")
        p["passTD"] = p.comp & desc.str.contains("TOUCHDOWN") & ~desc.str.contains("REVERSED")
        p["passYds"] = np.where(p.comp, p.prePenaltyPlayResult, 0)
        p["playAction"] = p.pff_playAction.eq(1)

        # Situación
        p["yardsToGoal"] = np.select(
            [p.yardlineNumber.eq(50), p.yardlineSide.eq(p.possessionTeam)],
            [50, 100 - p.yardlineNumber], p.yardlineNumber).astype(float)
        p["redZone"] = p.yardsToGoal <= 20
        need = np.select([p.down.eq(1), p.down.eq(2)], [0.4, 0.6], 1.0) * p.yardsToGo
        p["success"] = (p.playResult >= need) & p.down.gt(0)
        return p

    # ---- castigos: atribución exacta con el rol PFF del infractor
    def _fouls(self) -> pd.DataFrame:
        cols = KEY + ["possessionTeam", "defensiveTeam", "penaltyYards"]
        parts = [
            self.plays[cols + [f"foulName{i}", f"foulNFLId{i}"]]
            .rename(columns={f"foulName{i}": "foulName", f"foulNFLId{i}": "nflId"})
            for i in (1, 2, 3)
        ]
        f = pd.concat(parts, ignore_index=True).dropna(subset=["nflId"])
        f["nflId"] = f.nflId.astype(int)
        f = f.merge(self.pff[KEY + ["nflId", "pff_role"]], on=KEY + ["nflId"], how="left")
        by_sign = np.where(f.penaltyYards.fillna(0) < 0, "off", "def")
        f["side"] = np.select([f.pff_role.isin(OFF_ROLES), f.pff_role.isin(DEF_ROLES)], ["off", "def"], by_sign)
        f["team"] = np.where(f.side == "off", f.possessionTeam, f.defensiveTeam)
        f["accepted"] = np.where(f.side == "off", f.penaltyYards < 0, f.penaltyYards > 0)
        f = f.merge(self.players[["nflId", "displayName", "officialPosition"]], on="nflId", how="left")
        return f[f.accepted].drop(columns=["penaltyYards", "possessionTeam", "defensiveTeam"])

    def _penalty_impact(self, p: pd.DataFrame) -> pd.DataFrame:
        f = self.fouls
        n = f.groupby(KEY + ["side"]).size().unstack().reindex(columns=["off", "def"])
        names = f.groupby(KEY + ["side"]).foulName.agg(", ".join).unstack().reindex(columns=["off", "def"])
        who = (f.groupby(KEY + ["side"]).displayName.agg(lambda s: ", ".join(s.dropna()))
               .unstack().reindex(columns=["off", "def"]))
        p = p.join(n.fillna(0).astype(int).add_prefix("nFouls_"), on=KEY)
        p = p.join(names.add_prefix("foul_"), on=KEY).join(who.add_prefix("fouler_"), on=KEY)
        p[["nFouls_off", "nFouls_def"]] = p[["nFouls_off", "nFouls_def"]].fillna(0).astype(int)
        p["offFoul"], p["defFoul"] = p.nFouls_off.gt(0), p.nFouls_def.gt(0)
        pen = p.penaltyYards.fillna(0)
        p["resultingYtg"] = p.yardsToGo - p.playResult
        # Drive Killer: castigo ofensivo aceptado que deja 1ra/2da y largo
        p["driveKiller"] = p.offFoul & pen.lt(0) & p.down.isin([1, 2]) & p.resultingYtg.ge(10)
        # Bailout: castigo defensivo aceptado en 3er down
        p["bailout"] = p.defFoul & pen.gt(0) & p.down.eq(3)
        # Impacto en la jugada
        p["penSwing"] = np.where(p.offFoul | p.defFoul, p.playResult - p.prePenaltyPlayResult, 0)
        p["erasedYds"] = np.where(p.offFoul, np.clip(p.prePenaltyPlayResult - p.playResult - pen.abs(), 0, None), 0)
        p["gift1st"] = p.defFoul & p.playResult.ge(p.yardsToGo) & p.prePenaltyPlayResult.lt(p.yardsToGo) & p.down.gt(0)
        p["rescued"] = p.defFoul & p.passResult.isin(["I", "S", "IN"])
        p["penYds"] = pen.abs()
        return p


IMPACT_COLS = ["quarter", "gameClock", "down", "yardsToGo", "resultingYtg", "passResult", "prePenaltyPlayResult",
               "playResult", "penYds", "penSwing", "driveKiller", "bailout", "erasedYds", "gift1st", "rescued",
               "possessionTeam", "defensiveTeam", "playDescription", "qb"]


@lru_cache(maxsize=1)
def store() -> Store:
    return Store()


# --------------------------------------------------------------------------- métricas
def passer_rating(df: pd.DataFrame) -> float | None:
    att = int(df.isAtt.sum())
    if att == 0:
        return None
    parts = np.clip(np.array([
        (df.comp.sum() / att - 0.3) * 5,
        (df.passYds.sum() / att - 3) * 0.25,
        df.passTD.sum() / att * 20,
        2.375 - df.int.sum() / att * 25,
    ]), 0, 2.375)
    return round(float(parts.sum() / 6 * 100), 1)


def passing(df: pd.DataFrame) -> dict:
    att, comp = int(df.isAtt.sum()), int(df.comp.sum())
    return {
        "dropbacks": len(df),
        "attempts": att,
        "completions": comp,
        "yards": int(df.passYds.sum()),
        "touchdowns": int(df.passTD.sum()),
        "interceptions": int(df.int.sum()),
        "sacks": int(df.sack.sum()),
        "rating": passer_rating(df),
        "compPct": num(comp / att * 100, 1) if att else None,
        "yardsPerAttempt": num(df.passYds.sum() / att, 2) if att else None,
        "yardsPerCompletion": num(df.passYds.sum() / comp, 2) if comp else None,
        "sackRate": pct(df.sack),
        "pressureRate": pct(df.pressure),
        "avgTimeToThrow": num(df.loc[df.endType == "pase", "timeToThrow"].mean(), 2),
        "playActionRate": pct(df.playAction),
        "successRate": pct(df.loc[df.down > 0, "success"]),
        "ratingClean": passer_rating(df[~df.pressure]),
        "ratingPressured": passer_rating(df[df.pressure]),
    }


def qb_lines(o: pd.DataFrame) -> list[dict]:
    """Línea por QB en una ofensiva (SF usó a Garoppolo y a Lance)."""
    out = []
    for (qid, name), d in o.dropna(subset=["qbId"]).groupby(["qbId", "qb"]):
        out.append({"nflId": int(qid), "name": name} | passing(d))
    return sorted(out, key=lambda r: -r["dropbacks"])


def pass_rush(s: Store, o: pd.DataFrame) -> dict:
    """Lo que generó la defensa contra la ofensiva `o`: sacks y presión al QB."""
    d = s.pff.merge(o[KEY], on=KEY)
    d = d[d.pff_role.isin(DEF_ROLES)].copy()
    cols = ["pff_hit", "pff_hurry", "pff_sack"]
    d[cols] = d[cols].fillna(0)
    d["pressures"] = d[cols].max(axis=1)
    d["rush"] = d.pff_role.eq("Pass Rush")
    d["rushPress"] = d.pressures * d.rush
    top = (d.groupby("nflId").agg(rushes=("rush", "sum"), pressures=("pressures", "sum"), sacks=("pff_sack", "sum"),
                                  hits=("pff_hit", "sum"), hurries=("pff_hurry", "sum"), rushPress=("rushPress", "sum"))
           .query("rushes > 0").sort_values(["pressures", "sacks"], ascending=False).head(5)
           .join(s.players.set_index("nflId")[["displayName", "officialPosition"]]).reset_index())
    top["pressureRate"] = (top.rushPress / top.rushes * 100).round(1)
    top = top.drop(columns="rushPress")
    pressured = o[o.pressure]
    return {
        "sacks": int(o.sack.sum()),
        "sackRate": pct(o.sack),
        "pressures": int(o.pressure.sum()),
        "pressureRate": pct(o.pressure),
        "hits": int(d.pff_hit.sum()),
        "hurries": int(d.pff_hurry.sum()),
        "pressureToSack": pct(pressured.sack) if len(pressured) else None,
        "blitzRate": pct(o.blitz),
        "avgRushers": num(o.rushers.mean(), 1),
        "manRate": pct(o.pff_passCoverageType.eq("Man")),
        "zoneRate": pct(o.pff_passCoverageType.eq("Zone")),
        "ratingAllowed": passer_rating(o),
        "ratingAllowedPressured": passer_rating(pressured),
        "ratingAllowedClean": passer_rating(o[~o.pressure]),
        "interceptions": int(o.int.sum()),
        "topRushers": records(top),
    }


def phase_penalties(o: pd.DataFrame) -> dict:
    """Castigos dentro de un enfrentamiento (ofensiva `o` vs su defensa) y su impacto."""
    of, df_ = o[o.offFoul], o[o.defFoul]
    gained = o.passYds.sum() + df_.penYds.sum()
    return {
        "offense": {
            "count": int(o.nFouls_off.sum()),
            "yards": int(of.penYds.sum()),
            "driveKillers": int(o.driveKiller.sum()),
            "driveKillerYards": int(o.loc[o.driveKiller, "penYds"].sum()),
            "erasedPlays": int(o.erasedYds.gt(0).sum()),
            "erasedYards": int(o.erasedYds.sum()),
        },
        "defense": {
            "count": int(o.nFouls_def.sum()),
            "yards": int(df_.penYds.sum()),
            "bailouts": int(o.bailout.sum()),
            "bailoutYards": int(o.loc[o.bailout, "penYds"].sum()),
            "firstDowns": int(o.gift1st.sum()),
            "rescued": int(o.rescued.sum()),
            "shareOfOffenseYards": num(df_.penYds.sum() / gained * 100, 1) if gained > 0 else None,
        },
        # + favorece a la ofensiva, - favorece a la defensa
        "netSwing": int(o.penSwing.sum() - o.erasedYds.sum()),
    }


def matchup(s: Store, o: pd.DataFrame, offense: str, defense: str) -> dict:
    return {
        "offense": offense, "defense": defense,
        "passing": passing(o),
        "qbs": qb_lines(o),
        "passRush": pass_rush(s, o),
        "penalties": phase_penalties(o),
    }


def penalty_list(s: Store, team: str, game_ids) -> list[dict]:
    f = s.fouls[(s.fouls.team == team) & s.fouls.gameId.isin(game_ids)].copy()
    if f.empty:
        return []
    f["week"] = f.gameId.map(s.games.set_index("gameId").week)
    off = f.side.eq("off")
    f["critical"] = np.select([off & f.driveKiller, ~off & f.bailout], ["Drive Killer", "Bailout"], "")
    f["critical"] = f.critical.replace("", None)
    f["effect"] = np.select(
        [off & f.driveKiller, off & f.erasedYds.gt(0), off,
         ~off & f.rescued & f.gift1st, ~off & f.gift1st, ~off & f.rescued, ~off],
        [f"Deja " + f.down.astype(str) + "&" + f.resultingYtg.astype(str),
         "Anula ganancia de " + f.erasedYds.astype(int).astype(str) + " yds",
         "Retrocede " + f.penYds.astype(int).astype(str) + " yds",
         "Rescata jugada fallida + 1er down",
         "Regala 1er down",
         "Rescata jugada fallida",
         "Regala " + f.penYds.astype(int).astype(str) + " yds"], "")
    f["phase"] = np.where(off, "Ofensiva", "Defensiva")
    cols = ["gameId", "playId", "week", "phase", "critical", "effect", "foulName", "displayName", "officialPosition",
            "quarter", "gameClock", "down", "yardsToGo", "passResult", "prePenaltyPlayResult", "playResult",
            "penYds", "erasedYds", "gift1st", "rescued", "possessionTeam", "defensiveTeam", "qb"]
    return records(f.sort_values(["week", "quarter", "gameClock"], ascending=[True, True, False])[cols])


RADAR_AXES = [
    ("Play Action", lambda d: d.playAction),
    ("Sin Play Action", lambda d: ~d.playAction),
    ("Bajo Presión", lambda d: d.pressure),
    ("Bolsillo Limpio", lambda d: ~d.pressure),
    ("Pase Rápido (<2.5s)", lambda d: d.timeToThrow < 2.5),
    ("Pase Lento (≥2.5s)", lambda d: d.timeToThrow >= 2.5),
]


def radar(team_off: pd.DataFrame, opp_off: pd.DataFrame) -> list[dict]:
    rows = []
    for axis, mask in RADAR_AXES:
        a, b = team_off[mask(team_off)], opp_off[mask(opp_off)]
        ra, rb = passer_rating(a), passer_rating(b)
        rows.append({
            "axis": axis,
            "team": num((ra or 0) / 158.3 * 100, 1), "teamRating": ra, "teamAtt": int(a.isAtt.sum()),
            "opp": num((rb or 0) / 158.3 * 100, 1), "oppRating": rb, "oppAtt": int(b.isAtt.sum()),
        })
    return rows


def ttt_vs_pressure(off: pd.DataFrame) -> list[dict]:
    g = off.dropna(subset=["tttBucket"]).groupby("tttBucket", observed=False)
    out = g.agg(dropbacks=("playId", "size"), pressureRate=("pressure", "mean"),
                sackRate=("sack", "mean"), compRate=("comp", "mean")).reset_index()
    out[["pressureRate", "sackRate", "compRate"]] = (out[["pressureRate", "sackRate", "compRate"]] * 100).round(1)
    out["rating"] = [passer_rating(off[off.tttBucket == b]) for b in out.tttBucket]
    return records(out.rename(columns={"tttBucket": "bucket"}).astype({"bucket": str}))


def points(games: pd.DataFrame, plays: pd.DataFrame, team: str) -> pd.DataFrame:
    """Marcador por partido al último dropback registrado (cota inferior del final)."""
    sc = plays.groupby("gameId")[["preSnapHomeScore", "preSnapVisitorScore"]].max()
    g = games.join(sc, on="gameId")
    home = g.homeTeamAbbr.eq(team)
    g["teamScore"] = np.where(home, g.preSnapHomeScore, g.preSnapVisitorScore)
    g["oppScore"] = np.where(home, g.preSnapVisitorScore, g.preSnapHomeScore)
    g["opponent"] = np.where(home, g.visitorTeamAbbr, g.homeTeamAbbr)
    g["homeAway"] = np.where(home, "Local", "Visita")
    return g


def player_table(s: Store, plays: pd.DataFrame, team: str) -> list[dict]:
    f = s.pff.merge(plays[KEY + ["possessionTeam", "defensiveTeam"]], on=KEY)
    f["team"] = np.where(f.pff_role.isin(OFF_ROLES), f.possessionTeam, f.defensiveTeam)
    f = f[f.team == team].copy()
    if f.empty:
        return []
    num_cols = ["pff_hit", "pff_hurry", "pff_sack", "pff_hitAllowed", "pff_hurryAllowed", "pff_sackAllowed"]
    f[num_cols] = f[num_cols].fillna(0)
    f["pressures"] = f[["pff_hit", "pff_hurry", "pff_sack"]].max(axis=1)
    f["pressuresAllowed"] = f[["pff_hitAllowed", "pff_hurryAllowed", "pff_sackAllowed"]].max(axis=1)
    f["rush"] = f.pff_role.eq("Pass Rush")
    g = f.groupby("nflId").agg(
        snaps=("playId", "size"), games=("gameId", "nunique"), rushes=("rush", "sum"),
        role=("pff_role", lambda r: r.mode().iat[0]), alignedAt=("pff_positionLinedUp", lambda r: r.mode().iat[0]),
        pressures=("pressures", "sum"), sacks=("pff_sack", "sum"), hits=("pff_hit", "sum"),
        hurries=("pff_hurry", "sum"), pressuresAllowed=("pressuresAllowed", "sum"),
        sacksAllowed=("pff_sackAllowed", "sum"))
    qb = plays[plays.possessionTeam == team].dropna(subset=["qbId"])
    qbs = qb.groupby("qbId")[["isAtt", "comp", "passYds", "passTD", "int"]].apply(passer_rating).rename("qbRating")
    g = g.join(qbs).join(qb.groupby("qbId").isAtt.sum().rename("qbAttempts"))
    fouls = s.fouls[(s.fouls.team == team) & s.fouls.gameId.isin(plays.gameId)]
    g = g.join(fouls.groupby("nflId").size().rename("penalties"))
    g = g.join(fouls.groupby("nflId").penYds.sum().rename("penaltyYards"))
    g[["penalties", "penaltyYards"]] = g[["penalties", "penaltyYards"]].fillna(0).astype(int)
    g = g.join(s.players.set_index("nflId")[["displayName", "officialPosition"]])
    return records(g.reset_index().sort_values(["snaps"], ascending=False))


def team_games(s: Store, team: str) -> pd.DataFrame:
    return s.games[(s.games.homeTeamAbbr == team) | (s.games.visitorTeamAbbr == team)]


def teams() -> list[dict]:
    s = store()
    abbrs = [FOCUS] + sorted((set(s.games.homeTeamAbbr) | set(s.games.visitorTeamAbbr)) - {FOCUS})
    return [{"abbr": a, "name": TEAM_NAMES.get(a, a), "isFocus": a == FOCUS,
             "games": team_games(s, a).gameId.tolist()} for a in abbrs]


def game_row(g, o: pd.DataFrame, d: pd.DataFrame) -> dict:
    """Resumen por partido: ofensiva y defensiva de ambos equipos."""
    def unit(off, deff):
        return {
            "qbRating": passer_rating(off), "passYds": int(off.passYds.sum()), "qb": ", ".join(off.qb.dropna().unique()),
            "offPenalties": int(off.nFouls_off.sum()), "offPenYds": int(off.loc[off.offFoul, "penYds"].sum()),
            "driveKillers": int(off.driveKiller.sum()),
            "sacks": int(deff.sack.sum()), "pressureRate": pct(deff.pressure),
            "defPenalties": int(deff.nFouls_def.sum()), "defPenYds": int(deff.loc[deff.defFoul, "penYds"].sum()),
            "bailouts": int(deff.bailout.sum()),
        }
    return {
        "gameId": g.gameId, "week": g.week, "date": g.gameDate, "homeAway": g.homeAway,
        "opponent": g.opponent, "opponentName": TEAM_NAMES.get(g.opponent, g.opponent),
        "teamScore": num(g.teamScore, 0), "oppScore": num(g.oppScore, 0),
        "team": unit(o, d), "opp": unit(d, o),
    }


@lru_cache(maxsize=64)
def build_stats(team: str, game_id: int | None = None) -> dict:
    s = store()
    games = team_games(s, team)
    if game_id is not None:
        games = games[games.gameId == game_id]
    P = s.plays[s.plays.gameId.isin(games.gameId)]
    off, deff = P[P.possessionTeam == team], P[P.defensiveTeam == team]
    pts = points(games, P, team)
    opp_abbrs = sorted(pts.opponent.unique())
    opp = opp_abbrs[0] if len(opp_abbrs) == 1 else "RIVALES"

    mu_off = matchup(s, off, team, opp)    # ofensiva del equipo vs defensa rival
    mu_def = matchup(s, deff, opp, team)   # ofensiva rival vs defensa del equipo

    def summary(o_mu, d_mu, score):
        po, pd_ = o_mu["penalties"], d_mu["penalties"]
        return {
            "points": int(score),
            "passing": o_mu["passing"],
            "passRush": d_mu["passRush"],
            "penalties": {
                "driveKillers": po["offense"]["driveKillers"], "driveKillerYards": po["offense"]["driveKillerYards"],
                "bailouts": pd_["defense"]["bailouts"], "bailoutYards": pd_["defense"]["bailoutYards"],
                "critical": po["offense"]["driveKillers"] + pd_["defense"]["bailouts"],
                "criticalYards": po["offense"]["driveKillerYards"] + pd_["defense"]["bailoutYards"],
                "total": po["offense"]["count"] + pd_["defense"]["count"],
                "totalYards": po["offense"]["yards"] + pd_["defense"]["yards"],
            },
        }

    map_plays = pd.concat([off.assign(side="off"), deff.assign(side="def")]).dropna(subset=["losX"])
    map_plays = map_plays.assign(week=map_plays.gameId.map(games.set_index("gameId").week))
    play_cols = ["gameId", "playId", "week", "quarter", "gameClock", "down", "yardsToGo", "yardsToGoal",
                 "redZone", "losX", "ballY", "passResult", "playResult", "pressure", "sack", "timeToThrow",
                 "playAction", "success", "offFoul", "defFoul", "foul_off", "foul_def", "driveKiller",
                 "bailout", "penSwing", "playDescription", "possessionTeam", "defensiveTeam", "qb", "side"]

    return {
        "team": team, "teamName": TEAM_NAMES.get(team, team),
        "opponent": opp,
        "opponentName": TEAM_NAMES.get(opp, "Rivales de " + TEAM_NAMES.get(team, team)),
        "gameId": game_id,
        "games": [game_row(g, P[(P.gameId == g.gameId) & (P.possessionTeam == team)],
                           P[(P.gameId == g.gameId) & (P.defensiveTeam == team)]) for g in pts.itertuples()],
        "teamStats": summary(mu_off, mu_def, pts.teamScore.sum()),
        "oppStats": summary(mu_def, mu_off, pts.oppScore.sum()),
        "matchups": {"teamOffense": mu_off, "teamDefense": mu_def},
        "radar": radar(off, deff),
        "timeToThrow": {"team": ttt_vs_pressure(off), "opp": ttt_vs_pressure(deff)},
        "penaltyLog": {"team": penalty_list(s, team, games.gameId),
                       "opp": records(pd.DataFrame(
                           [r for a in opp_abbrs for r in penalty_list(s, a, games.gameId)]))},
        "plays": records(map_plays[play_cols]),
        "players": player_table(s, P, team),
        "notes": [
            "Datos: solo jugadas de pase (dropbacks), semanas 1-8 de 2021.",
            "Puntos = marcador previo al último dropback de cada partido (cota inferior del final).",
            "Presión = hit, hurry o sack acreditado por PFF.",
        ],
    }


def play_frames(game_id: int, play_id: int) -> dict | None:
    s = store()
    row = s.plays[(s.plays.gameId == game_id) & (s.plays.playId == play_id)]
    if row.empty:
        return None
    r = row.iloc[0]
    t = s.track[(s.track.gameId == game_id) & (s.track.playId == play_id)]
    side = np.select([t.team.eq("football"), t.team.eq(r.possessionTeam)], ["ball", "off"], "def")
    t = t.assign(side=side).merge(s.players[["nflId", "displayName", "officialPosition"]], on="nflId", how="left")
    pts = t[["frameId", "nflId", "jerseyNumber", "side", "x", "y", "s", "event"]].round(2)

    # Roles por jugador en esta jugada: QB, presión generada/permitida y castigos
    pf = s.pff[(s.pff.gameId == game_id) & (s.pff.playId == play_id)].copy()
    pf["pressure"] = pf[["pff_hit", "pff_hurry", "pff_sack"]].fillna(0).max(axis=1).astype(bool)
    pf["allowed"] = pf[["pff_hitAllowed", "pff_hurryAllowed", "pff_sackAllowed"]].fillna(0).max(axis=1).astype(bool)
    pf["sack"] = pf.pff_sack.fillna(0).astype(bool)
    fl = s.fouls[(s.fouls.gameId == game_id) & (s.fouls.playId == play_id)].groupby("nflId").foulName.agg(", ".join)
    roster = (t.dropna(subset=["nflId"]).drop_duplicates("nflId")
              [["nflId", "displayName", "officialPosition", "jerseyNumber", "side"]]
              .merge(pf[["nflId", "pff_role", "pff_positionLinedUp", "pressure", "allowed", "sack"]], on="nflId", how="left")
              .join(fl.rename("foul"), on="nflId"))
    info = row[["gameId", "playId", "quarter", "gameClock", "down", "yardsToGo", "yardsToGoal", "redZone",
                "losX", "passResult", "prePenaltyPlayResult", "playResult", "playDescription", "possessionTeam",
                "defensiveTeam", "snapFrame", "endFrame", "timeToThrow", "pressure", "sack", "rushers",
                "pff_passCoverage", "offenseFormation", "qb", "foul_off", "foul_def", "fouler_off", "fouler_def",
                "driveKiller", "bailout", "penSwing", "erasedYds", "gift1st", "rescued"]]
    return {"play": records(info)[0], "points": records(pts), "roster": records(roster),
            "frames": int(t.frameId.max()) if len(t) else 0}
