# Soft launch plan (Beast Mode 2026-11-21 OPS-11)

The owner chooses markets, dates and cohort sizes and fills every **owner** cell before wave A starts (OWN-25). The
targets below are starting points from the retention audit (`docs/audit/areas/09-retention-and-marketing.md`), not
measurements: the model-player campaigns (`docs/game-theory/CAMPAIGN.md`) are not players and are never reported as
such.

## Waves

| Wave | Markets | Dates | Cohort | Goal |
|---|---|---|---|---|
| A (technical) | owner (one or two small English-speaking markets with cheap Android share, e.g. a Nordic or Oceania store) | owner | owner (aim: 2,000+ installs) | crash-free, ANR, cold start, purchase delivery, server load |
| B (retention) | owner (add one large non-English market whose language is ready) | owner | owner (aim: 10,000+ installs) | D1/D7/D30, tutorial, first purchase, raid outcomes per Keep |
| Global | the rest | owner, only after B passes | — | — |

## KPIs, targets and kill lines

| KPI | Source | Target | Pause line (fix before growing) | Kill line (stop the launch) |
|---|---|---|---|---|
| Crash-free users | Play Console vitals, Xcode Organizer (store consoles: every player) | ≥ 99.5% | < 99.0% | < 98.0% |
| ANR rate (Android) | Play Console vitals | < 0.47% | ≥ 0.47% (Play's bad-behaviour line) | — |
| Cold start p90 on the low device class | `DEVICE_MATRIX.md` runs | owner (from the first matrix run) | owner | — |
| Tutorial completion | `GET /admin/v1/stats/funnel` | ≥ 70% | < 60% | < 50% |
| D1 retention | `/admin/v1/stats/funnel` | ≥ 35% | < 30% | **D1 < 25%** |
| D7 retention | `/admin/v1/stats/funnel` | ≥ 15% | < 12% | < 8% |
| D30 retention | `/admin/v1/stats/funnel` | ≥ 5% | < 4% | — |
| Purchases delivered | server `tk_purchase_*`, `PurchasesStalled` alert | 100% within 15 min | any stall | — |
| Raid stars per Keep | `GET /admin/v1/stats/battles` | inside the campaign's pooled band (`campaign.json`) | a Keep under the band's lower 95% bound for two weeks | — |
| Paying share and ARPDAU | store consoles | owner | owner | owner |

**Statistics are a sample.** The funnel and battle reports count only adults who chose "Share play statistics"
(opt-in, a random id). They skew toward engaged players: read them as a trend, compare waves with each other, and
use the store consoles (every player) for installs, crash-free and conversion.

## Decision owner and cadence

- Decision owner: **owner** (name). Review: daily in the first week of each wave, then weekly.
- Each review writes one line in the wave's log (below): date, the numbers, the decision (continue, pause, fix, kill).
- A pause line hit: stop paid acquisition and the next wave until the fix ships and a week of data passes.
- A kill line hit: stop the launch, keep the game running for the players who have it, and decide on a rework or
  the sunset plan (`docs/ops/SUNSET.md`).

## Wave log

| Date | Wave | Installs | Crash-free | D1 | D7 | Tutorial | Decision |
|---|---|---|---|---|---|---|---|
| | | | | | | | |
