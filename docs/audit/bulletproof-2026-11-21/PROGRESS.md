# Progress ledger: beast-mode release bulletproofing pass (2026-11-21)

One row per work item in `docs/prompts/BEAST_MODE_2026-11-21.md` (the section 3 index).

Status values: `open`, `done`, `skipped-not-reproduced`, `reverted-with-numbers`, `blocked-owner`, `blocked-device`. For each item, record the commit, the proving test and the numbers before and after. Never mark an OWNER, DEVICE or NEEDS-PLAYERS item done from code.

| ID | Sev | Phase | Dup of | Status | Commit | Proving test | Before → after / limits |
|---|---|---|---|---|---|---|---|
| SEC-01 | BLOCKER | 2 |  | open | | | |
| ECO-01 | HIGH | 1 |  | open | | | |
| ECO-05 | HIGH | Owner/device |  | open | | | |
| GT-01 | HIGH | 2 |  | open | | | |
| GT-02 | HIGH | 7 |  | open | | | |
| GT-03 | HIGH | 7 |  | open | | | |
| GT-04 | HIGH | 7 |  | open | | | |
| GT-05 | HIGH | 7 |  | open | | | |
| GT-06 | HIGH | 7 |  | open | | | |
| OPS-01 | HIGH | 5 |  | open | | | |
| OPS-02 | HIGH | 4 |  | open | | | |
| OPS-03 | HIGH | 4 |  | open | | | |
| SAV-01 | HIGH | 3 |  | open | | | |
| SEC-02 | HIGH | 2 |  | open | | | |
| SEC-03 | HIGH | 1 |  | open | | | |
| STB-01 | HIGH | 4 |  | open | | | |
| STB-02 | HIGH | 4 | OPS-02 | open | | | |
| STB-03 | HIGH | 4 |  | open | | | |
| STB-04 | HIGH | 4 | OPS-03 | open | | | |
| STB-11 | HIGH | Owner/device |  | open | | | |
| UX-01 | HIGH | 1 | ECO-01 | open | | | |
| UX-02 | HIGH | 1 |  | open | | | |
| UX-03 | HIGH | 1 |  | open | | | |
| ECO-02 | MEDIUM | 1 |  | open | | | |
| ECO-03 | MEDIUM | 7 | GT-11 | open | | | |
| ECO-04 | MEDIUM | 7 | GT-06 | open | | | |
| GT-07 | MEDIUM | 7 |  | open | | | |
| GT-08 | MEDIUM | 7 |  | open | | | |
| GT-09 | MEDIUM | 7 |  | open | | | |
| GT-10 | MEDIUM | 7 |  | open | | | |
| GT-11 | MEDIUM | 7 |  | open | | | |
| GT-12 | MEDIUM | 7 |  | open | | | |
| OPS-04 | MEDIUM | 5 |  | open | | | |
| OPS-05 | MEDIUM | 5 |  | open | | | |
| OPS-06 | MEDIUM | 4 |  | open | | | |
| OPS-07 | MEDIUM | 4 |  | open | | | |
| OPS-08 | MEDIUM | 4 | STB-05 | open | | | |
| OPS-09 | MEDIUM | 5 |  | open | | | |
| OPS-10 | MEDIUM | 5 |  | open | | | |
| OPS-11 | MEDIUM | 8 |  | open | | | |
| SAV-02 | MEDIUM | 3 |  | open | | | |
| SAV-03 | MEDIUM | 3 |  | open | | | |
| SAV-04 | MEDIUM | 3 |  | open | | | |
| SAV-05 | MEDIUM | 3 |  | open | | | |
| SAV-06 | MEDIUM | 3 |  | open | | | |
| SAV-07 | MEDIUM | 3 |  | open | | | |
| SAV-08 | MEDIUM | 5 | OPS-01 | open | | | |
| SAV-09 | MEDIUM | 3 |  | open | | | |
| SEC-04 | MEDIUM | 2 |  | open | | | |
| SEC-05 | MEDIUM | 2 | SAV-12 | open | | | |
| SEC-06 | MEDIUM | 2 |  | open | | | |
| SEC-07 | MEDIUM | 2 |  | open | | | |
| SEC-08 | MEDIUM | 5 |  | open | | | |
| SEC-09 | MEDIUM | 5 | OPS-05 | open | | | |
| STB-05 | MEDIUM | 4 |  | open | | | |
| STB-06 | MEDIUM | 4 |  | open | | | |
| STB-07 | MEDIUM | 6 |  | open | | | |
| STB-08 | MEDIUM | 6 |  | open | | | |
| STB-12 | MEDIUM | Owner/device |  | open | | | |
| UX-04 | MEDIUM | 6 |  | open | | | |
| UX-05 | MEDIUM | 6 | STB-09 | open | | | |
| UX-06 | MEDIUM | 6 |  | open | | | |
| UX-07 | MEDIUM | 6 |  | open | | | |
| UX-08 | MEDIUM | 6 |  | open | | | |
| ECO-06 | LOW | 1 |  | open | | | |
| ECO-07 | LOW | 2 | SEC-12 | open | | | |
| ECO-08 | LOW | 1 |  | open | | | |
| ECO-09 | LOW | 1 |  | open | | | |
| ECO-10 | LOW | 1 |  | open | | | |
| GT-13 | LOW | 7 |  | open | | | |
| GT-14 | LOW | 7 |  | open | | | |
| GT-15 | LOW | 7 |  | open | | | |
| GT-16 | LOW | 7 |  | open | | | |
| GT-17 | LOW | 7 |  | open | | | |
| OPS-12 | LOW | 5 |  | open | | | |
| OPS-13 | LOW | 5 |  | open | | | |
| OPS-14 | LOW | 6 |  | open | | | |
| SAV-10 | LOW | 3 |  | open | | | |
| SAV-11 | LOW | 3 |  | open | | | |
| SAV-12 | LOW | 2 |  | open | | | |
| SAV-13 | LOW | 3 |  | open | | | |
| SAV-14 | LOW | 3 |  | open | | | |
| SAV-15 | LOW | Owner/device |  | open | | | |
| SAV-16 | LOW | Owner/device |  | open | | | |
| SEC-10 | LOW | 2 |  | open | | | |
| SEC-11 | LOW | Owner/device |  | open | | | |
| SEC-12 | LOW | 2 |  | open | | | |
| SEC-13 | LOW | 2 |  | open | | | |
| SEC-14 | LOW | 2 |  | open | | | |
| SEC-15 | LOW | 2 |  | open | | | |
| SEC-16 | LOW | 2 |  | open | | | |
| SEC-17 | LOW | 2 |  | open | | | |
| STB-09 | LOW | 6 |  | open | | | |
| STB-10 | LOW | 6 |  | open | | | |
| UX-09 | LOW | 1 |  | open | | | |
| UX-10 | LOW | 6 | OPS-14 | open | | | |
| UX-11 | LOW | 6 |  | open | | | |

## Owner decisions (section 2.9)

| # | Decision | Recorded in `docs/DECISIONS.md` |
|---|---|---|
| D1 | X1 backdate window | not yet |
| D2 | honor model | not yet |
| D3 | casual loss target | not yet |
| D4 | duplicate Scroll receipt | not yet |
| D5 | certificate pinning | not yet |
| D6 | under-18 cap currency | not yet |
| D7 | crash-report consent and Sentry setup | not yet |
| D8 | REQUIRE_SERVER_VILLAGE rollout | not yet |
