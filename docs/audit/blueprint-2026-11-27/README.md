# Development blueprint (2026-11-27)

`BLUEPRINT.pdf` is the owner's document: 73 new findings that appear in none of the earlier audits (Part A), what is
still open from the five documents the owner supplied (Part B), and a phased plan whose every phase ends at a gate
that only a person, a phone, a store or a player can open (Part C). Audited commit: `4b79711` (`main`). The three
unmerged branches of that date were not audited (finding X-1).

`FINDINGS.md` is the same Part A in a form a coding session can parse: one section per finding with where, what
happens, fix and how it was checked. It is a snapshot: revalidate each finding against the current code, write the
failing test first, and close it with the fixing commit and the test (the loop in `docs/prompts/BEAST_MODE_2026-11-21.md`
section 0.4 still applies).

`evidence/` holds what the document cites, so it can be checked later (finding X-3 is about earlier evidence that was
not kept):

- `reports/`: the nine auditors' full reports (native shells, server data layer, server routes, simulation fuzzer,
  first run in a browser, soak, translation and accessibility, time bombs, repository). Three were cut short and say so.
  `soak.md` withdraws its own interim headline; the blueprint uses the corrected numbers.
- `reproducers/`: the scripts behind the reproduced findings, saved as `.txt` so that lint, type-check and the test
  runner ignore them. The `fuzz-*` and `time-*` files are Vitest tests: copy them into a scratch folder under `tests/`
  (dropping `.txt`) to run them; `api-*` are Node scripts against a local server on the in-memory store.
- two screenshots for RUN-1 and RUN-2 (headless Chromium at 360x640, not a phone).

Nothing here was run on a phone, in a store sandbox, against a deployed server or with a player.

Regenerate (needs Python with reportlab and the DejaVu Sans fonts):

    cd docs/audit/blueprint-2026-11-27/source
    python3 make_blueprint.py ../BLUEPRINT.pdf
    python3 make_blueprint.py --markdown ../FINDINGS.md

Findings live in `source/findings*.py`; the other parts in `source/part_*.py` and `source/front.py`.
