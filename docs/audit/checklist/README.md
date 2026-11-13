# Build and fix checklist (2026-11-13)

`KAGEMURA_CHECKLIST_2026-11-13.pdf` lists 339 open items to build or fix, reviewed at commit `2174d05`.
It is compiled from the audits in `docs/audit/` and `docs/store/WORLDWIDE_AUDIT.md`, the balance audit, the
fresh-slate review, `docs/backend/PVP_ROADMAP.md`, the release/testing checklists, the legal and localization
docs, and a test and build run on that commit. Section 18 is the mainland China release track
(owner decision, 2026-11-13: pursue China through a licensed publisher).

It is a snapshot, not a status file: check items against current code before acting on them.

Regenerate (needs Python with reportlab, plus DejaVu Sans and WenQuanYi Zen Hei fonts):

    cd docs/audit/checklist
    python3 make_checklist.py KAGEMURA_CHECKLIST_2026-11-13.pdf

Items live in `content.py`.
