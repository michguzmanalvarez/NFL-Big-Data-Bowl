# Requirements: NFL Coach Command Center (San Francisco 49ers)

## Introducción

Dashboard táctico y de scouting para el staff de los San Francisco 49ers. Usa los datos del NFL Big Data Bowl
(temporada 2021, semanas 1-8, solo jugadas de pase). Separa cada partido en la ofensiva y la defensa de los dos
equipos, destaca el desempeño del QB, el impacto de los castigos y la presión de la defensa (sacks, hits, hurries),
y permite reproducir cada jugada en un campo con coordenadas normalizadas.

Alcance de datos: 7 partidos de SF (semana 6 fue de descanso), 449 dropbacks, 436,057 filas de tracking.

## Glosario

- **Dropback:** jugada de pase registrada en `plays.csv` (`passResult` C, I, S, IN o R).
- **Presión:** dropback donde algún defensor recibe `pff_hit`, `pff_hurry` o `pff_sack` de PFF.
- **Drive Killer:** castigo ofensivo aceptado en 1ra o 2da down que deja a la ofensiva con 10 o más yardas por avanzar.
- **Bailout:** castigo defensivo aceptado en 3er down.
- **Jugada rescatada:** castigo defensivo aceptado en una jugada que terminó incompleta, en sack o en intercepción.
- **Tiempo para lanzar:** (frame del pase, sack o scramble − frame del snap) / 10 s, tomado del tracking.
- **Equipo enfocado:** San Francisco (`SF`). **Rivales:** ARI, CHI, DET, GB, IND, PHI, SEA.

## Requisito 0: Reglas del proyecto

**Historia:** Como equipo del hackathon, quiero respetar `.kiro/steering/rules.md` para que AWS pueda hospedar la app.

1. EL sistema DEBE usar solo el stack fijo: FastAPI 0.115.14, Pydantic 2.11.7, pandas 2.2.3, numpy 2.1.3, React 18.3.1, Vite 5.4.21, Tailwind 3.4.19, Recharts 3.10.1, strands-agents y boto3.
2. EL sistema NO DEBE agregar dependencias (incluidas librerías de animación ni `python-dotenv`).
3. EL sistema DEBE conservar la estructura `backend/`, `dashboard/`, `data/` sin mover `.hackathon/`, `.venv/` ni `.kiro/`.
4. EL sistema NO DEBE escribir archivos en disco para funcionar; los cálculos se hacen en memoria al arrancar.

## Requisito 1: Servidor y salud

1. `backend/main.py` DEBE exponer `app` (FastAPI) con `GET /health` que responda `{"status": "ok"}`.
2. Toda la API DEBE vivir bajo `/api/...`.
3. CUANDO el servidor arranque, EL sistema DEBE cargar y procesar `data/` una sola vez, con rutas relativas a la raíz del proyecto.

## Requisito 2: Filtrado a San Francisco y Multi-Equipo

**Historia:** Como coach de SF, quiero ver todos nuestros partidos y jugadores, incluyendo a cada rival.

1. EL sistema DEBE filtrar `games`, `plays`, `pffScoutingData` y `tracking` a los partidos donde juega SF.
2. `GET /api/teams` DEBE devolver SF y sus 7 rivales, con los partidos de cada uno.
3. `GET /api/stats?team=<abbr>[&gameId=<id>]` DEBE calcular todas las métricas para el equipo pedido y para su rival.
4. SI `team` no jugó contra SF, ENTONCES EL sistema DEBE responder 404 con las opciones válidas.
5. SI `gameId` no pertenece a `team`, ENTONCES EL sistema DEBE responder 404.
6. CUANDO se pida SF sin `gameId`, EL sistema DEBE agregar a los 7 rivales como `RIVALES`.

## Requisito 3: División ofensiva / defensiva

**Historia:** Como coach, quiero ver por separado la ofensiva y la defensa de cada equipo en cada partido.

1. EL sistema DEBE devolver dos enfrentamientos: ofensiva del equipo vs defensa del rival, y ofensiva del rival vs defensa del equipo.
2. Cada enfrentamiento DEBE incluir el desempeño de cada QB, la presión de la defensa y los castigos de ambas unidades.
3. EL sistema DEBE devolver una fila por partido con ofensiva y defensa de ambos equipos (rating QB, castigos, Drive Killers, sacks, % presión, Bailouts).

## Requisito 4: Desempeño del QB

1. EL sistema DEBE calcular el passer rating oficial de la NFL por QB y por equipo.
2. EL sistema DEBE reportar C/A, yardas, yardas por pase completo, TD, INT, sacks y tiempo promedio para lanzar.
3. EL sistema DEBE comparar el rating sin presión contra el rating bajo presión.
4. EL sistema DEBE calcular el rating en seis situaciones: con y sin play action, bajo presión, bolsillo limpio, pase rápido (< 2.5 s) y pase lento (≥ 2.5 s).
5. EL sistema DEBE agrupar el tiempo para lanzar en `< 2.5 s`, `2.5 - 3.5 s` y `> 3.5 s`, con % de presión, % de sack y rating en cada rango.
6. EL sistema NO DEBE mostrar YAC: el tracking termina 0.5 s después del pase y no hay punto de recepción.

## Requisito 5: Defensa: sacks y presión al QB

1. EL sistema DEBE reportar sacks, % de sack, presiones, % de presión, hits, hurries y % de presiones que terminan en sack.
2. EL sistema DEBE reportar % de blitz (5 o más pass rushers) y % de cobertura man y zona.
3. EL sistema DEBE reportar el rating permitido, sin presión y con presión.
4. EL sistema DEBE listar los 5 pass rushers con más presiones (presiones, sacks, hits, hurries, % de presión por rush).

## Requisito 6: Castigos críticos y su impacto

1. EL sistema DEBE atribuir cada castigo con el rol PFF del infractor (ofensivo o defensivo) y contar solo castigos aceptados.
2. EL sistema DEBE contar Drive Killers y Bailouts y sumar sus yardas.
3. EL sistema DEBE calcular, por jugada: yardas antes y después del castigo, ganancia anulada, primer down regalado y jugada rescatada.
4. EL sistema DEBE calcular el balance neto de yardas por castigos en cada enfrentamiento.
5. EL sistema DEBE devolver una lista de castigos con infractor, efecto, down y distancia, y la jugada para abrirla en el campo.

## Requisito 7: Normalización espacial

1. SI `playDirection` es `left`, ENTONCES EL sistema DEBE transformar `x = 120 − x`, `y = 53.3 − y` y rotar `o` y `dir` 180°.
2. `GET /api/play?gameId&playId` DEBE devolver los frames normalizados, el roster con rol PFF, la presión generada o permitida y los castigos por jugador.

## Requisito 8: IA táctica (Amazon Nova vía Bedrock)

1. `POST /api/ask-coach` DEBE recibir `team`, `gameId` opcional y `question`, y usar el equipo actual como contexto.
2. `backend/main.py` DEBE empezar con el código exacto de `cargar_env()` de las reglas.
3. EL sistema DEBE crear el cliente de Bedrock solo con la región (`AWS_REGION`, por defecto `us-east-1`) y el modelo (`BEDROCK_MODEL_ID`, por defecto `us.amazon.nova-pro-v1:0`). NO DEBE leer, validar ni pasar llaves.
4. La respuesta DEBE tener como máximo 3 líneas y analizar castigos, QB y presión.
5. SI la IA falla, ENTONCES EL sistema DEBE responder 200 con `source: "fallback"` y 3 líneas calculadas con los datos.

## Requisito 9: Dashboard

1. La UI DEBE usar React/Vite, Dark Mode `slate-900`, alto contraste y Tailwind 3 (`animate-fade-in` definido en `tailwind.config.js`).
2. La UI DEBE usar CSS Grid responsivo (`grid-cols-1 md:grid-cols-2 lg:grid-cols-4`) y verse bien a 1080p.
3. El header DEBE tener un selector de equipo y uno de partido. CUANDO cambien, EL dashboard DEBE pedir los datos y actualizar toda la pantalla.
4. EL dashboard DEBE mostrar tarjetas de Puntos, Rating del QB, Castigos Críticos / Yardas Perdidas y Defensa: Sacks / Presión.
5. EL dashboard DEBE mostrar un RadarChart de Recharts con el rendimiento del QB por situación.
6. EL dashboard DEBE mostrar un mapa del campo con los spots del snap, con filtros (castigos, sacks, presión, red zone) y reproducción de la jugada a 10 fps sin librerías de animación.
7. CUANDO la jugada esté a 20 yardas o menos de la meta, o el filtro Red Zone esté activo, EL mapa DEBE activar el Red Zone Mode (`animate-pulse`, bordes rojos, tonos de alerta).
8. EL dashboard NO DEBE incluir un predictor de la siguiente jugada: los datos solo tienen pases y no permiten predecir corrida contra pase.

## Requisito 10: Ruteo relativo

1. Cada `fetch` y asset DEBE usar rutas relativas sin diagonal inicial (`fetch('api/stats?team=...')`).
2. `vite.config.ts` DEBE conservar `base: './'` y tener un proxy de `/api` a `http://localhost:8000`.
3. El código del dashboard NO DEBE usar `localhost`, `127.0.0.1` ni URLs absolutas.

## Requisito 11: Documentación de impacto

1. `README.md` en la raíz DEBE incluir un Elevator Pitch, los Top 3 Hallazgos con números reales calculados con Pandas, el cumplimiento arquitectónico con AWS y el Wow Factor (Red Zone Mode, Multi-Equipo, Normalización Espacial).
2. La redacción del README DEBE ser la última tarea del plan.
