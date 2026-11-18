# Content preview: tester checklist (P7-12)

The built-but-not-live content (fifteen counters, the Hero Hall and three heroes, Warrior Mastery as a preview) can be
played only in a **content preview build**: `.github/workflows/content-preview.yml`, started by hand with "build"
ticked. It never runs on a push, never deploys and never touches the public site; it uploads `dist/` as the
artifact `kagemura-content-preview` (kept 14 days). Whether such a build may exist at all, and who tests it, is the
owner's decision (`OWNER_CHECKLIST.md`).

To test:

1. Download the artifact and serve the folder over HTTP (`npx serve dist` or any static server).
2. Open it with `?debug&preview`. It uses the sandbox save (separate from a real village) and never goes online.
3. Check each preview building at its Keep: it can be built, it shows its effect in battle, its text matches what it
   does. Note anything that looks unfinished: none of it is live, and `docs/game-theory/PREVIEW_BALANCE.md` says which
   pieces meet the go-live bar (today only the Lightning Rod).
4. Choose a hero at the Hero Hall, fight with it, and read the ability text against what happens.
5. Report with the build's commit (Settings shows the build), the device, and a replay where it matters.

Nothing in a preview build is a promise of content: do not show it to players or in store material.
