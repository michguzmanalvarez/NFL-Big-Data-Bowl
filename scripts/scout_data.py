"""Scouting de datos: lee todos los CSV de data/ y reporta esquema y cobertura.

Uso:  python scripts/scout_data.py
"""
from __future__ import annotations

import re
from collections import Counter
from pathlib import Path

import pandas as pd

DATA = Path(__file__).resolve().parents[1] / "data"
KEYWORDS = r"epa|wpa|\bep\b|\bwp\b|expected|team|penal|foul|sack|hit|hurry|time|down|yardsToGo|score|x$|y$|dir|playDirection"


def section(title: str) -> None:
    print(f"\n{'=' * 80}\n{title}\n{'=' * 80}")


def schema(df: pd.DataFrame, name: str) -> None:
    section(f"{name}  ->  {len(df):,} filas x {df.shape[1]} columnas")
    info = pd.DataFrame({
        "dtype": df.dtypes.astype(str),
        "nulos_%": (df.isna().mean() * 100).round(1),
        "unicos": df.nunique(),
        "ejemplo": [df[c].dropna().iloc[0] if df[c].notna().any() else None for c in df.columns],
    })
    print(info.to_string())


# ---------------------------------------------------------------- tablas chicas
tables: dict[str, pd.DataFrame] = {}
for f in sorted(DATA.glob("*.csv")):
    tables[f.stem] = pd.read_csv(f, low_memory=False)
    schema(tables[f.stem], f.name)

games, plays, players, pff = (tables[k] for k in ("games", "plays", "players", "pffScoutingData"))

# ---------------------------------------------------------------- tracking (todos)
track_files = sorted((DATA / "tracking").glob("tracking_*.csv"))
cols_seen: Counter = Counter()
events: Counter = Counter()
directions: Counter = Counter()
teams_track: Counter = Counter()
n_rows = 0
xmin = ymin = float("inf")
xmax = ymax = float("-inf")
ttt_parts = []
sample = None

END_EVENTS = {"pass_forward", "qb_sack", "qb_strip_sack", "run", "fumble", "pass_shovel"}

for f in track_files:
    t = pd.read_csv(f)
    if sample is None:
        sample = t
    cols_seen.update(t.columns)
    n_rows += len(t)
    events.update(t["event"].dropna())
    directions.update(t["playDirection"].dropna())
    teams_track.update(t["team"].dropna())
    xmin, xmax = min(xmin, t["x"].min()), max(xmax, t["x"].max())
    ymin, ymax = min(ymin, t["y"].min()), max(ymax, t["y"].max())

    # Time to Throw: frame del evento final de QB - frame del snap (10 fps)
    ball = t[t["team"] == "football"][["gameId", "playId", "frameId", "event"]].dropna(subset=["event"])
    snap = ball[ball["event"] == "ball_snap"].groupby(["gameId", "playId"])["frameId"].min()
    end = ball[ball["event"].isin(END_EVENTS)].groupby(["gameId", "playId"])["frameId"].min()
    end_evt = (ball[ball["event"].isin(END_EVENTS)]
               .sort_values("frameId").groupby(["gameId", "playId"])["event"].first())
    ttt = pd.concat({"snap": snap, "end": end, "end_event": end_evt}, axis=1).dropna()
    ttt["time_to_throw_s"] = (ttt["end"] - ttt["snap"]) / 10
    ttt_parts.append(ttt.reset_index())

schema(sample, f"tracking (muestra: {track_files[0].name})")
section(f"TRACKING GLOBAL: {len(track_files)} archivos, {n_rows:,} filas")
print("Columnas consistentes en todos los archivos:",
      all(v == len(track_files) for v in cols_seen.values()))
print(f"x: {xmin:.2f} .. {xmax:.2f}   y: {ymin:.2f} .. {ymax:.2f}")
print("playDirection:", dict(directions))
print("team (top):", dict(teams_track.most_common(5)))
print("\nEventos (todos):")
for e, c in events.most_common():
    print(f"  {e:<30}{c:>10,}")

ttt = pd.concat(ttt_parts, ignore_index=True)
section("TIME TO THROW (derivado de tracking)")
print(f"Jugadas con snap y evento final: {len(ttt):,} de {len(plays):,} en plays.csv")
print(ttt.groupby("end_event")["time_to_throw_s"].describe().round(2).to_string())

# ---------------------------------------------------------------- llaves y joins
section("INTEGRIDAD DE LLAVES")
pk = lambda df, k: (len(df), df.duplicated(k).sum())
for name, df, k in [("games", games, ["gameId"]), ("plays", plays, ["gameId", "playId"]),
                    ("players", players, ["nflId"]), ("pff", pff, ["gameId", "playId", "nflId"])]:
    n, d = pk(df, k)
    print(f"{name:<8} {k} -> filas {n:,}, duplicados {d}")
tr_games = {int(re.search(r"(\d+)", f.stem).group(1)) for f in track_files}
print(f"gameIds en games.csv: {games.gameId.nunique()}  | archivos tracking: {len(tr_games)}"
      f"  | games sin tracking: {len(set(games.gameId) - tr_games)}")
pp = plays.merge(pff[["gameId", "playId"]].drop_duplicates(), how="left", indicator=True)
print("plays con datos PFF:", pp["_merge"].eq("both").sum(), "de", len(plays))

# ---------------------------------------------------------------- checklist del diseño
section("CHECKLIST DE REQUERIMIENTOS")
allcols = {n: list(df.columns) for n, df in tables.items()}
allcols["tracking"] = list(cols_seen)
for n, cs in allcols.items():
    hits = [c for c in cs if re.search(KEYWORDS, c, re.I)]
    print(f"{n:<16}{hits}")

print("\n[1] Equipos H2H: possessionTeam / defensiveTeam")
print(plays[["possessionTeam", "defensiveTeam"]].value_counts().head(5).to_string())
print("Equipos:", sorted(plays.possessionTeam.dropna().unique()))

print("\n[3] Penalties")
print("Jugadas con foulName1:", plays.foulName1.notna().sum(),
      "| penaltyYards != 0:", (plays.penaltyYards.fillna(0) != 0).sum())
print(plays.foulName1.value_counts().head(10).to_string())

print("\n[4] Presión (PFF)")
for c in ["pff_hit", "pff_hurry", "pff_sack", "pff_hitAllowed", "pff_hurryAllowed", "pff_sackAllowed"]:
    if c in pff:
        print(f"  {c:<18} suma={pff[c].fillna(0).sum():,.0f}")
print("passResult:", plays.passResult.value_counts(dropna=False).to_dict())

print("\n[5] Situación")
print(plays[["quarter", "down", "yardsToGo", "gameClock", "preSnapHomeScore",
             "preSnapVisitorScore", "absoluteYardlineNumber"]].describe(include="all").round(2).to_string())

print("\n[6] EPA / WPA / EP / WP")
adv = [f"{n}.{c}" for n, cs in allcols.items() for c in cs if re.search(r"epa|wpa|\bep\b|\bwp\b|expected|prob", c, re.I)]
print("Columnas encontradas:", adv or "NINGUNA")
