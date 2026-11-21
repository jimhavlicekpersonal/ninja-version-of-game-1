# Release bulletproofing audit and beast-mode prompt (2026-11-21)

Audited commit `560ce7a`. Built from the *Game Release Bulletproofing Checklist*, the *Game Release Bulletproofing
Masterclass* and page 15 of an earlier bulletproofing audit of the same day. Seven auditors each checked one lane
against the code.

| File | What it is |
|---|---|
| `BEAST_MODE_2026-11-21.pdf` | The deliverable: the agent prompt, 97 work items, the owner checklist, verdict tables. Text-extractable, with a bookmark per section and per work item. |
| `../../prompts/BEAST_MODE_2026-11-21.md` | The same document as Markdown: the canonical, machine-readable source an AI session should read |
| `PROGRESS.md` | The ledger: one row per work item, all `open` at the start |
| `ECO.md`, `SEC.md`, `SAV.md`, `STB.md`, `OPS.md`, `UX.md`, `GT.md` | The seven lane reports: verdict table, work items, verified-sound list |
| `evidence/shots/` | Playwright screenshots (Chromium touch emulation, not devices), e.g. the double purchase and the short-landscape battle |
| `evidence/ux-probes/` | The Playwright probes behind the UX findings (run against `npx vite --port 5199`, `?sandbox&debug`; `OUT_DIR` sets where screenshots go) |
| `evidence/gt/` | Game-theory measurement scripts and output: multi-seed campaigns (`rep.mjs`, `rep_*.jsonl`), the Trials ladder and seed-noise probes (`gt.ts`, `run.mjs`, `trials.out`, `luck.out`). Copy `gt.ts` to `tools/scratch/` to run, as `run.mjs` expects. |
| `tools/` | How the PDF is made: `assemble.py` joins `front.md`, the lane reports and `appendix_c.md` into the Markdown; `md2pdf.py` renders it |

Regenerate (Python 3 with reportlab, DejaVu fonts; run from this folder):

    python3 tools/md2pdf.py ../../prompts/BEAST_MODE_2026-11-21.md BEAST_MODE_2026-11-21.pdf \
      "Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)" \
      "AI agent prompt and audit: 97 work items, owner checklist, verdict tables"

`assemble.py` was run once on the auditors' raw reports. After that, edit the Markdown directly. This audit is a
snapshot, not a status file. Revalidate every item against the current code before you act on it. Nothing here was
run on a device, in a store sandbox or by a player.
