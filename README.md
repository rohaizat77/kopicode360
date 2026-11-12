# SmartPark — Unlock Hidden Parking Capacity

KopiCode hackathon MVP (12 Nov 2026), **Work** angle connected to **Serve**.

Live demo: https://work3.rohaizat.cloud

> **Mock data only.** Every person, plate and sensor reading is fictional. No real company system, sensor or sign-in is connected.

## The idea

Reserved bays sit empty while their owners travel, take leave or work from home, and everyone else circles the basement. SmartPark lets an owner release a bay in one tap, opens it first come, first served, and uses a floor sensor so that parking and leaving need no app interaction at all.

Hero demo bay: **B5-024** (Alex Tan's reserved bay on Level B5).

1. **Supply** — Alex releases B5-024 for a 3-day business trip. It turns green.
2. **Move-in** — Sarah drives in. The floor puck detects the car; her access card, the pillar QR or BLE links her identity. The bay becomes "reallocated".
3. **Move-out** — Sarah drives off. The puck sees the bay empty and clears it. Zero clicks.
4. **ParkIQ** — management sees unused allocated bays, recovered bay-days and lease cost avoided.

## What is in the app

| Screen | What it does |
|---|---|
| Demo bar | Persona switcher (owner, commuter, management) and a 4-step IoT simulator for B5-024, plus an explicit demo reset. |
| SmartBay Portal | Persona-specific banner, live 70-bay map for B4 and B5, search and filters, photo overlay with clickable pins, bay inspector with sensor telemetry and simulator actions. |
| ParkIQ | KPI strip, utilisation breakdown, department release and demand table, chronic idle bay watchlist, live IoT activity. |
| Odin AI | Chat panel that calls the MCP tools. Changes need an explicit confirmation step. |

## Architecture

```
client/     React 19 + Mantine 9 + Zustand (Vite)
functions/  NestJS 11 API + MCP endpoint
  src/parking/   ParkingService (state authority), controller, seed, types
  src/mcp/       MCP tools over JSON-RPC at /api/mcp
  src/common/    demo persona guard
  test/e2e.mjs   15 end-to-end checks of the B5-024 scenario
deploy/     nginx site and systemd unit
scripts/    deploy.sh
```

One Node process serves the API and the built client on `127.0.0.1:3600`, behind nginx with a Let's Encrypt certificate.

### Differences from the original plan

The plan targets a Firebase stack that this standalone demo does not have. The stand-ins are:

| Plan | This build |
|---|---|
| Firestore | In-memory state persisted to `data/state.json`. Same document schema. |
| Realtime listener | 2.5 second polling. Unchanged polls return a few bytes. |
| `AuthGuard` + `AppCheckGuard` | `DemoAuthGuard`: the caller names a demo persona in the `x-demo-persona` header. There is no real sign-in. |
| Odin AI | A keyword matcher chooses the tool. The MCP tools and the confirmation gate are real. |
| LoRaWAN floor pucks | Simulated through the `iot-event` endpoint. |

### API

- `GET /api/parking/overview` — bays, summary metrics, departments, watchlist, recent events
- `POST /api/parking/bays/:bayId/release` — `{ startDate?, endDate? | durationDays?, reason, notes? }`
- `POST /api/parking/bays/:bayId/reclaim`
- `POST /api/parking/bays/:bayId/iot-event` — `{ type: VEHICLE_ARRIVED | LINK_IDENTITY | VEHICLE_DEPARTED | AUTH_FAILED, authMethod?, plate? }`
- `POST /api/parking/bays/:bayId/photo-coords` — `{ xPct, yPct }` or `{ clear: true }`
- `POST /api/parking/demo/reset` — explicit only, never run on page load
- `POST /api/mcp` — tools: `get_parking_summary`, `list_unlocked_bays`, `get_bay_status`, `release_parking_bay`, `reclaim_parking_bay` (the last two return a preview unless `confirmed: true`)

### Rendering scope

Each bay tile subscribes to its own bay in the Zustand store, and the store keeps the previous object for bays that did not change. An event on B5-024 re-renders that one tile and the counters. Form inputs (release modal, search, simulator fields) keep their state in the leaf component.

## Run locally

Requires Node.js 22 or newer.

```bash
cd functions && npm install && npm run build && npm start
```

```bash
cd client && npm install && npm run dev
```

Open http://localhost:5173 and press **Initialize 70-Bay Demo Dataset**.

Tests (build the API first):

```bash
cd functions && npm test
```

## Deploy

`scripts/deploy.sh` builds both halves, runs the tests and installs to `/opt/smartpark3`. First-time setup uses `deploy/smartpark3.service` and `deploy/work3.rohaizat.cloud`.

## 3-minute demo

1. Press **Reset demo**. Point at B5-024, red and locked, and at ParkIQ: 13 reserved bays empty.
2. Press **1. Owner releases**. B5-024 turns green; unused drops to 12; recovered bay-days rise by 3.
3. Press **2. Car pulls in**. The tile turns amber: the puck sees a car but does not know whose.
4. Press **3. Link ID**. The tile turns blue with Sarah's plate.
5. Press **4. Car leaves**. The bay clears itself.
6. Open **Odin AI**, ask "I need my bay back", and show the confirmation step.
7. Finish on **ParkIQ**: the watchlist and lease cost avoided.

## Calendar-triggered release (demo)

When a bay owner's calendar shows them out of the office, SmartPark asks whether to release their bay for those days. Nothing is released without the owner's answer.

- The calendar is **mock data standing in for Google Calendar**. No real Google account is connected.
- Simulate a calendar update with **Calendar: away 3 days** in the demo simulator, or from the **My calendar** card (shown to the bay owner).
- The owner gets a prompt: release for the calendar's dates, keep the bay, or be asked later. In-office meetings never trigger it.
- API: `POST /api/calendar/events`, `POST /api/calendar/events/:id/remove`, `POST /api/calendar/suggestions/:id/accept` and `.../decline`. The calendar and pending prompts are returned inside `GET /api/parking/overview`.

To make this real: Google OAuth per user, a Calendar push-notification webhook, and reading the "Out of office" event type instead of the mock entry.

## Parking suggestions: nearest to the lift

Every parking suggestion comes from one ranking: free bays sorted by walking distance to the lift lobby (`ParkingService.freeRanking`, distances in `parking.layout.ts`). Ties go to Level B5, then the lower bay number. No bay is special-cased, including the demo bay B5-024.

- The commuter banner suggests rank #1 and lists the next nearest.
- The map marks the nearest free bay on the level shown.
- Odin's `list_unlocked_bays` returns the same order, and `get_parking_summary` names the nearest free bay.
- The distances are mock survey figures.
