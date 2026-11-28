# Repository, pipeline and process audit (lens: REPO)

Read-only. Tree audited: `origin/main` at `4b79711` (2026-11-24). No tracked file was changed; `git status` is clean for my files.

**Windows used.** "Full history" = `origin/main`, 1,536 commits (1,449 non-merge), 2026-11-02 03:43 UTC to 2026-11-24 18:04 UTC. The secret scan also covered every remote ref (49 refs, 1,622 commits) through a separate bare clone in the scratch folder. "CI history" = the 196 workflow runs GitHub lists for `main` (2026-11-02 to 2026-11-26). "Tree" = files at `4b79711` (other auditors' untracked `tests/_scratch_*` folders ignored). Nothing below uses the earlier 50-commit shallow window.

**Not done (budget):** function-level complexity, dead exports, `any`/`eslint-disable`/`console.log`/empty-catch counts, a README fresh-clone run, the 15-file "would the test fail if the fix were reverted" sample (only 3 test files were read for that), shuffle runs beyond 14 files. GHCR package visibility, the repository's default token permission, environments and secrets could not be read (the API proxy refuses those paths).

## 1. Metrics

| Metric | Value | Window |
|---|---|---|
| Commits on main | 1,536 (86 merges) | full history |
| Span | 23 calendar days, 20 active | full history |
| Commits per day | 67 per calendar day, 77 per active day; peaks 642 (11-14), 203 (11-13), 176 (11-18) | full history |
| Remote branches / tags / releases | 49 branches (45 `claude/*`, 2 `codex/*`, `theory/rules10`, `main`), none protected; 0 tags; 0 releases | GitHub API |
| Visibility / licence / rulesets | public / none (`license: null`) / none (`[]`) | GitHub API |
| "Test, build and deploy" pushes on main | 70 runs: 41 success, 23 failure, 6 cancelled | CI history |
| Time main was red | 229 of 533 hours (43 %); longest non-green streak 9 runs, 11-15 03:27 to 11-20 05:32; in the last 10 days main was green for about 25 hours | CI history |
| "Server release" pushes on main | 39 runs: 27 success, 12 failure | CI history |
| Backup workflow | 22 scheduled runs, 22 "success", 0 backups made | CI history |
| Duration of a successful main deploy | 1 to 9 min until 11-14; 38.5, 46.9, 45.7 min on 11-20, 11-21, 11-25 (`npm run test:slow` alone 36.5 min) | CI history |
| Lines changed, docs vs `src`+`server` | 182,069 vs 104,902 (ratio 1.74). Per ISO week: 45: 47.6k vs 67.7k; 46: 27.8k vs 26.6k; 47: 94.9k vs 9.3k; 48: 11.8k vs 1.4k | full history, non-merge |
| Current size (lines) | `src` 48,512; `server` 20,503; tests 40,501; tools 8,092; archived rules `server/rules` 192,805; locales 266,547 | tree |
| Markdown | 252 files, 31,655 lines, 529,576 words | tree |
| Audit, prompt and history documents | 73 files, 18,311 lines | tree |
| Finding-ID prefixes | 40 with 3 or more mentions in docs (GT, OPS, P0-P7, SEC, SAV, ECO, STB, GLOBAL, OWN, XPL, UX, DEF, CU, RET, PUB, UIS, R3, PAC, SCR, BNL, CMB, PS, LD, DZ, RM, DM, AS, PLY, JD, SECR, CR, MONEY, K5 ...) | tree |
| Open or partial rows, by ledger | bulletproof `PROGRESS.md` 47 partial, 16 owner/blocked, 1 open; understand `PROGRESS.md` 11 partial, 7 open; `WORLDWIDE_AUDIT.md` 39 open, 11 partial, 14 owner, 16 "code done"; plus `OWNER_CHECKLIST.md` (87 rows) | tree |
| Reading CLAUDE.md requires before work | `WORLDWIDE_AUDIT.md` 52,857 words + `CLAUDE.md` 1,041 + `AGENTS.md` 1,032, then a compartment brief of 940 to 7,479 words | tree |
| Subjects naming a ledger, closure, record or STATUS | 160 (10.4 %) | full history |
| Rework | 38 subjects say follow-up, review fixes, verification fixes, re-audit or revert (2.6 %). Rough fix-on-fix: of 219 fix-like commits touching `src`/`server`, 198 (90 %) had a file touched again by another fix-like commit within 3 days (inflated by the hot files below) | full history |
| Churn hot spots (commits touching) | `docs/STATUS.md` 142; bulletproof `PROGRESS.md` 102; `locales/availability.json` 100; `ui/hud.ts` 98; `src/main.ts` 88; `WORLDWIDE_AUDIT.md` 87; `sim/village.ts` 80; `sim/types.ts` 79; `src/backend/CLAUDE.md` 75; `docs/PROTOCOL.md` 69 | full history |
| Largest source files (lines) | `ui/hud.ts` 2,726; `sim/village.ts` 2,693; `art/ninja.ts` 2,648; `net/connection.ts` 1,574; `sim/types.ts` 1,436; `render/BattleScene.ts` 1,364; `src/main.ts` 1,340; `net/protocol.ts` 1,325; `ui/battleHud.ts` 1,138; `server/core/pvp.ts` 1,023 | tree |
| Tests | 342 files, about 2,307 test blocks | tree |
| Skipped by environment | 19 tests in 11 `skipIf` sites: 1 IPv6, 11 Postgres, 6 Redis, 1 both | tree |
| Expected-fail | 7 `it.fails`: 5 in `npm test`, 2 in `test:slow` | tree |
| Tests asserting on source text | 156 blocks (6.8 %) in 52 files; 25 read Android/iOS source, 22 read workflows | tree |
| Server tests that can run on Postgres | 33 of 86 files in `tests/backend/server` | tree |
| Shuffled runs | `tests/gameplay/control`, `tests/backend/pwa`, `tests/gameplay/social` (14 files, 117 tests), seeds 11, 22, 33: all passed | run 2026-11-27 |
| Doc accuracy | 652 distinct file paths cited, 30 missing (4.6 %), 8 in living docs. Code identifiers cited and absent: `WORLDWIDE_AUDIT.md` 22 of 578, backend brief 5 of 515, gameplay brief 4 of 329 | tree |
| Dependencies | 12 runtime + 12 dev direct; 317 locked packages (73 non-dev, 244 dev); lockfile v3; every entry has an integrity hash and resolves to registry.npmjs.org | tree |
| Install scripts | 1 in the lockfile (`fsevents`, optional, macOS only) | tree |
| `npm audit` | all: 11 (1 high `happy-dom`, 10 moderate), all dev-only; `--omit=dev`: 0 | run 2026-11-27 |
| Licences | runtime: MIT 64, BSD-3 4, ISC 4, 0BSD 1. All 317: MIT 242, Apache-2.0 17, ISC 17, BlueOak 13, MPL-2.0 12, BSD-2 7, BSD-3 6, Unlicense 2, 0BSD 1 | lockfile |
| Bundled third-party assets | 2 fonts (M PLUS 1, Dela Gothic One; SIL OFL 1.1). Art and audio are generated in code; `public/art` holds only a manifest | tree |
| Git size | 95.85 MiB packed, 31,287 objects (all refs) | bare clone |

### What CI really runs

| Workflow | On a branch push or PR | On a push to main | By hand |
|---|---|---|---|
| `deploy.yml` | version check, lint, audit (never fails), `npm test`, preflight notice, determinism pins, `test:slow`, server typecheck, build, bundle budget; `server` job on Postgres (server, net and contract tests only) plus contract tests against the built server | the same, then Pages deploy and a fetch-only check of the published pages | same as a push |
| `server.yml` | nothing | only when the path filter matches: full `npm test` with Postgres and Redis, image to GHCR, "staging" (no deploy hook, no server URL: both steps warn and pass) | staging or production |
| `android.yml` | nothing | debug APK with no lint or tests; AAB job skips every step (no keystore) and is green | AAB |
| `ios-testflight.yml` | nothing | nothing | never run |
| `backup.yml` | nothing | nightly; exits 0 with no backup | drill |

Never run by any workflow: `i18n:check` (a unit test covers it), `balance:armies`, `balance:campaign`, `ui:surfaces`, `i18n:smoke`, `perf:lowend`, any workflow linter, any secret scanner, any browser run of the built game. The 6 Redis-only tests run only in `server.yml`, so only after a merge. All 35 `uses:` lines are pinned to 40-character commits and resolved in real runs.

### Skipped and expected-fail tests

| Where | Kind | What it hides |
|---|---|---|
| `network.test.ts:12` | skip without IPv6 | 1 test, environment only |
| `migrate.test.ts:101` (3), `repo.test.ts:336,362` (3), `push.test.ts:130` (1), `last-gaps.test.ts:139` (1), `verification-fixes.test.ts:324` (1), `village-writes.test.ts:71` (2) | skip without Postgres | run in CI's `server` job; no defect hidden |
| `redis.test.ts:54` (5), `last-gaps.test.ts:168` (1), `instances.test.ts:24` (1, needs both) | skip without Redis | run only in `server.yml` after a merge to main |
| `rating-convergence.test.ts:162` | `it.fails` | GT-14, a smurf still meets about 0.95 expected score (recorded, needs players) |
| `campaign-gates.test.ts:154, 162, 199, 207` | `it.fails` | GT-02 and GT-05 balance gaps (recorded) |
| `kits-tiers.test.ts:80`, `trial-ladder.test.ts:19` | `it.fails`, slow suite | GT-07 and GT-09 (recorded) |

The "5 expected fail" in the ledger are the first five `it.fails`. All seven are recorded balance gaps, not hidden defects. No `.skip`, `.todo` or `.only` exists.

## 2. Ranked new findings

| ID | Severity | Confidence | Title |
|---|---|---|---|
| REPO-1 | HIGH | high | `main` has no protection and was red 43 % of the time; work and closure records kept landing on a red trunk |
| REPO-2 | HIGH | high | The repository is public: exploit catalogues, open security items, anti-cheat code and every CI artifact are readable by anyone |
| REPO-3 | MEDIUM | high | A push to main now takes 46 minutes to publish, and the documented hotfix path cannot publish the web game |
| REPO-4 | MEDIUM | high | The nightly backup has passed 22 times without making a backup, and would stall on the approval SHIPPING.md asks for |
| REPO-5 | MEDIUM | high | Store workflows have no `permissions:` block and hand the signing keystore and passwords to every step |
| REPO-6 | MEDIUM | medium | Five npm scripts need Playwright, which is not a dependency; CI never runs the built game, which uses a different Phaser than the tests |
| REPO-7 | MEDIUM | high | `.gitignore` misses `.env*`, `*.p8`, `google-services.json` and `backups/`, all of which the project's own tools and docs create |
| REPO-8 | MEDIUM | medium | Closed but regressed (quality 11): mandatory reading is now about 55,000 words, and open items sit in four ledgers under 40 ID schemes |
| REPO-9 | MEDIUM-LOW | medium | No dependency update process; the CI audit ignores dev packages and cannot fail; one high advisory is open |
| REPO-10 | LOW-MEDIUM | high | `docs/STATUS.md` embeds the test-file count: the most-changed file in the repository and a guaranteed post-merge failure |
| REPO-11 | LOW | medium | A committed test signing key plus an unguarded `APPLE_ROOT_CA_SHA256` override |
| REPO-12 | LOW | medium | No licence or copyright statement for a public repository; Google Play SDK notices missing from the licences page |

## 3. Findings

### REPO-1 (HIGH, high): `main` has no protection and was red 43 % of the time

- **Evidence.** GitHub API: `branches` lists `main` with `"protected": false`; `rulesets` returns `[]`. CI history (scratch `repo/runs_main.tsv`): 70 push runs of "Test, build and deploy" on main, 41 success, 23 failure, 6 cancelled; red 229 of 533 hours. Red streaks: 11-15 03:27 to 11-20 05:32 (9 runs) and 11-21 20:17 to 11-25 03:20 (7 runs). 49 branches remain on the remote.
- **What is new.** `publish.md` section 1 and N24-OPS-2/9 record the causes of two red periods. Neither records that nothing prevents a push on a red tree, or the 43 % figure.
- **Consequence.** 393 non-merge commits on main are dated 11-15 or later, a period in which main was green for about 25 hours. A red trunk hides new failures: N24-OPS-9 sat behind N24-OPS-2 for three days. Closure records written in those windows describe code that had never passed CI as merged.
- **Fix.** A ruleset on `main` requiring the `build` and `server` checks, merges through pull requests only, and an automatic delete of merged branches. With one owner this costs one click per merge.

### REPO-2 (HIGH, high): the repository is public

- **Evidence.** GitHub API: `"private": false, "visibility": "public"`. Tracked files include `docs/audit/understand-2026-11-16/exploits.md`, the bulletproof ledger (SEC-01 BLOCKER "partial", GT-01 collusion "blocked-owner", device-village trust gaps), both BEAST MODE prompts and all of `server/`. Artifacts in a public repository can be downloaded by any signed-in GitHub user: `kagemura-android-release-aab-*` (`android.yml:279-283`, 30 days), `kagemura-content-preview` (`content-preview.yml:36-40`, 14 days, described as "for testers the owner names"), `kagemura-db-<run>` (`backup.yml:63-68`, the encrypted production dump, 35 days). Job logs are public too. No document records this as a decision (0 matches for "public repo" in the known lists).
- **Consequence.** At launch, a cheater gets a maintained list of what is not yet closed plus the server's validation rules. Unreleased content and signed store builds are downloadable. If `BACKUP_KEY` ever leaks, every dump from the previous 35 days is already in strangers' hands.
- **Fix.** Decide before the first store build: make the repository private (Pages then needs a paid plan or another static host), or move audits, prompts and exploit notes to a private repository and move backups and release artifacts off Actions. Record the decision in `docs/DECISIONS.md`.

### REPO-3 (MEDIUM, high): 46 minutes to publish, and the hotfix path cannot publish the web game

- **Evidence.** Successful main deploys took 1 to 9 minutes until 11-14 and 38.5, 46.9 and 45.7 minutes since 11-20. In run 45539292375 `npm run test:slow` ran 03:26:31 to 04:03:02; `tests/slow.ts:3` still says "about 50 s of CPU together". `deploy.yml:14-16` cancels an in-progress run on the same ref, and 6 of 70 main runs were cancelled. `docs/ops/LAUNCH_DAY.md:55-60` says to branch a hotfix from the release tag and then run "the web game" workflow, but `deploy.yml:86` and `:169` publish only from `refs/heads/main`.
- **Consequence.** A web hotfix cannot ship from the hotfix branch. It ships as main's head, with everything merged since the release, and no sooner than 46 minutes after the push, provided nobody pushes again in that window.
- **Fix.** Move `test:slow` to its own job that does not gate the deploy (or run it only when `src/gameplay/data` or `sim` change). Either allow `deploy.yml` to publish a named release branch by hand, or rewrite the hotfix path to say that web fixes go through main.

### REPO-4 (MEDIUM, high): the backup is green without backing anything up

- **Evidence.** All 22 scheduled runs succeeded; in run 45819871767 the "Back up" step took 0 s and both the upload and the restore drill were skipped. `backup.yml:61` prints a plain line and exits 0 when `BACKUP_DATABASE_URL` is empty, with no warning annotation (unlike `deploy.mjs` and the AAB job). `backup.yml:31` and `android.yml:103` use `environment: production`, and `docs/SHIPPING.md:226` tells the owner to give `production` required reviewers. GitHub also disables scheduled workflows in a public repository after 60 days without repository activity.
- **What is new.** "Backups to GitHub artifacts will not scale" is a known owner item. The silent pass, the approval stall and the 60-day rule are not recorded; the BEAST MODE document scores backups as PASS from the YAML alone.
- **Consequence.** A missing, renamed or expired secret looks exactly like a healthy backup. With required reviewers on `production`, every nightly backup and every main push's AAB job waits for a manual approval.
- **Fix.** Fail (or at least emit `::warning` and a summary line) when the secret is missing and `DEPLOY_ENV`-style evidence says production exists; give backups their own environment without reviewers; alert on "no artifact in 36 hours" from outside GitHub.

### REPO-5 (MEDIUM, high): store workflows lack least privilege

- **Evidence.** `android.yml` and `ios-testflight.yml` have no `permissions:` block (the other five do), so they take the repository default, which could not be read here. `android.yml:104-110` puts `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD` in the job environment, so `npm ci` (lifecycle scripts on), `npm test`, `npx --yes @sentry/cli@2.39.1` (fetched outside the lockfile, runs its own install step) and every Gradle plugin can read them. `server.yml:49-51` grants `packages: write` to all jobs, including the test job. The Gradle wrapper has no `distributionSha256Sum` and no wrapper validation step.
- **Consequence.** One compromised transitive package or Gradle plugin can exfiltrate the Play upload key. Today only `fsevents` has an install script, so the exposure is one dependency update away rather than present.
- **Fix.** Add `permissions: contents: read` to both workflows; move the four keystore values to the two steps that need them (`Install the upload key`, `Build signed release AAB`); use `npm ci --ignore-scripts` everywhere (the Dockerfile and the drill already do); scope `packages: write` to the `image` job; add `@sentry/cli` to devDependencies so the lockfile pins it.

### REPO-6 (MEDIUM, medium): undeclared Playwright, and CI never runs the built game

- **Evidence.** `tools/ui/surfaces.mjs:16`, `tools/perf/lowend.mjs:14`, `tools/perf/profile.mjs:7`, `tools/i18n/smoke.mjs:13` and `tools/store/screenshots.mjs:37` require `playwright`; it is in neither `package.json` nor `node_modules`. `vite.config.ts:216` swaps in `render/phaserBuild.js` only for `vite build`; dev and tests use full Phaser. The guard, `tests/presentation/render/phaserBuild.test.ts`, reads source text and checks `.add.<kind>` factories. `check-published-game.mjs` only fetches pages.
- **What is known.** `ui-surface.md:29` noted that Playwright was not a dependency. The consequences below are not recorded.
- **Consequence.** `npm run ui:surfaces`, `perf:lowend`, `perf:profile`, `i18n:smoke` and `store:screenshots` fail on a clean clone, so closure evidence that cites `tools/ui/surfaces.mjs` (UX-02, N24-UX-3) cannot be reproduced from the repository. A production-only break in the Phaser subset would pass every check and be published. My one-off comparison of the 35 `Phaser.*` names the game uses against the build's exports found no gap today.
- **Fix.** Declare Playwright as a dev dependency and add one CI step that serves `dist/` and waits for the first frame in headless Chromium (the `i18n:smoke` script is most of it).

### REPO-7 (MEDIUM, high): `.gitignore` gaps

- **Evidence.** `git check-ignore` reports as not ignored: `.env`, `.env.local`, `.env.production.local`, `AuthKey_*.p8`, `android/app/google-services.json`, `ios/App/App/GoogleService-Info.plist`, `backups/*.dump.enc`, a root-level `upload.jks`. The N24-OPS-7 fix was tested "with a `.env.production.local`"; `tools/ops/backup.mjs:18` writes to `backups/` by default and leaves the plaintext dump there if `pg_dump` or the encryption throws (no `finally`); `android/.gitignore:66` has `google-services.json` commented out.
- **Consequence.** In a public repository where sessions commit with broad adds, one `git add -A` publishes a server URL file, an Apple key or a database dump. The earlier `dump.rdb` commit shows this path is real.
- **Fix.** Add `.env*` (keep `!.env.example`), `*.p8`, `*.p12`, `*.jks`, `*.keystore`, `google-services.json`, `GoogleService-Info.plist`, `backups/`, `*.dump`, `*.dump.enc`; wrap the dump in `try/finally`.

### REPO-8 (MEDIUM, medium): mandatory reading regressed; no single open list

- **Evidence.** Quality 11 flagged about 47,000 words of required reading and was closed as fixed (`WORLDWIDE_AUDIT.md:526`) by cutting root `CLAUDE.md` to about 940 words. `CLAUDE.md:5` still orders every session to read `WORLDWIDE_AUDIT.md`, which is now 52,857 words (it was 7,263). Open and partial rows are spread over four ledgers (table above) under 40 ID prefixes. Row 4 at `WORLDWIDE_AUDIT.md:1256` still cites `settlePassSeason` and `tests/gameplay/economy/scroll-rollover.test.ts`, neither of which ever existed on main; line 1302, 46 lines later, says that implementation was dropped at a merge. `src/gameplay/CLAUDE.md:72-78` records that two sessions fixed the same five findings in parallel.
- **Consequence.** Every session spends roughly 70,000 tokens (estimated from the word count) before its task, on a file where a row can be overruled further down. The owner cannot answer "what is open?" without reading about 2,000 ledger lines. Week 47 changed ten doc lines for every source line.
- **Fix.** One generated `docs/OPEN.md` (ID, severity, owner/device/code, source ledger) with a test that it matches the ledgers; make `CLAUDE.md` point at that instead of the whole audit; freeze closed passes under `docs/history/`.

### REPO-9 (MEDIUM-LOW, medium): no dependency update process

- **Evidence.** No `.github/dependabot.yml` (API 404), no Renovate config, no `CODEOWNERS` or `SECURITY.md` among the tracked files. `deploy.yml:33-35` audits with `--omit=dev` and `continue-on-error: true`. `npm audit` today: `happy-dom` 20.14.5 is pinned exactly and has a high advisory (GHSA-834v-8h66-3h79; npm proposes 20.14.6), plus 10 moderate in the lint and YAML chain. Runtime packages: 0.
- **What is known.** `continue-on-error` is recorded as a choice. The missing update process and the dev-side blind spot are not.
- **Consequence.** Dev packages run on every CI job next to the secrets in REPO-5, and nothing will ever tell the owner about a runtime advisory either, because the step cannot fail.
- **Fix.** Enable Dependabot (npm weekly, GitHub Actions monthly, Gradle monthly); make the runtime audit blocking with a dated allowlist; add a non-blocking full audit that writes to the job summary.

### REPO-10 (LOW-MEDIUM, high): `docs/STATUS.md` carries the test-file count

- **Evidence.** `tests/architecture/status.test.ts:11` compares the committed file with the generator's output, which includes "Test files | N". `docs/STATUS.md` is the most-changed file in the history (142 of 1,449 non-merge commits). `c3d989e` exists only to restate the count. During this audit the test failed locally solely because other auditors' scratch tests raised the count from 342 to 349.
- **Consequence.** Any two branches that each add a test file both edit the same line; whichever value survives the merge is wrong and `npm test` fails on main.
- **Fix.** Drop the test-file count (and any other additive count) from the generated file, or have the test compare everything except counts.

### REPO-11 (LOW, medium): test signing key and an unguarded root override

- **Evidence.** `tests/backend/fixtures/appstore/leaf.key` (with `inter.pem`, `root.pem` and `sign.ts`) is in the public repository. `server/config.ts:258` passes `APPLE_ROOT_CA_SHA256` to the verifier as the trusted root, and the variable appears nowhere in the production checks (it is named only in `config.ts`, comments in `apple.ts` and `main.ts`, and `SHIPPING.md`).
- **Consequence.** A staging or production server pointed at the test root, for example to exercise purchases without Apple, accepts receipts that anyone can sign.
- **Fix.** Refuse to start in production when `APPLE_ROOT_CA_SHA256` is set to anything but Apple's root, and warn on staging.

### REPO-12 (LOW, medium): licence statements

- **Evidence.** No `LICENSE` file and `license: null` on a public repository. `tools/release/licenses.mjs:16-20` lists AndroidX, Cordova and Firebase Messaging as the native libraries; `android/app/build.gradle` also compiles Play Billing 9.1.0, `credentials-play-services-auth`, `googleid` and Play Age Signals, and the in-app-review plugin brings Play Review.
- **Consequence.** Without a statement the code is all-rights-reserved by default, but nothing says so to people who fork it. Google asks apps that use Play services libraries to show their open-source notices.
- **Fix.** Add a short `LICENSE` ("All rights reserved", owner name once the legal entity exists) and generate the Android notices from the Gradle dependency graph.

## 4. Checked and found sound

- **Secrets:** no live secret in any ref (patterns for AWS, Google, Stripe, GitHub, Slack and npm tokens, PEM keys, JWTs, DSNs, database and Redis URLs with passwords, OAuth secrets, service accounts). The three private keys found are test fixtures. Four author addresses appear in commit metadata only. No keystore, provisioning profile or `.env` file was ever committed.
- **Workflows:** every action pinned to a commit and resolved in real runs; no `pull_request_target`; no input or secret interpolated into a run script (a test enforces it); the upload key and the App Store key are written to `RUNNER_TEMP`; source maps are deleted before packaging.
- **Supply chain:** lockfile complete with integrity hashes; Docker base pinned by digest and built with `--ignore-scripts`; Android dependency versions are fixed, none dynamic; the Phaser build is an entry file over the locked npm package, not a vendored copy.
- **Server path filter:** covers 90 of the 91 `src` files the server imports (only `src/backend/analytics/sentryEnvelope.ts` is outside it).
- **Licences shipped:** `public/licenses.html` is generated, tested for staleness, and linked from the support pages; both fonts carry their OFL text; art and audio are generated in code.
- **Identity:** "Kagemura" is consistent in `package.json`, the web manifest, `index.html`, Capacitor config, Android strings and iOS `Info.plist`; iOS `MARKETING_VERSION` equals `package.json` 0.2.0.
- **Docs:** 95 % of cited paths and 96 to 99 % of cited identifiers exist; the BEAST MODE prompt's lane reports and `evidence/` folder are the main missing ones, all in historical files.
- **Tests:** expected-fail tests are recorded gaps; three shuffled runs of 117 tests passed.

## 5. Already known, skipped

Legacy bundle id and "Kagemura" trademark search (T01, PUB-05); `npm audit` as a warning (publish.md section 2); the iOS workflow has never run; no `v*` tag (SAV-08, OPS-01); the APK job runs no tests (publish.md); backups on artifacts will not scale (owner); `dump.rdb` in history; the 174-method `Repo` implemented twice and the Postgres-only gaps (quality 16, 26, N24-OPS-2); large files and long functions (quality 16-21); archived rule copies (quality 4); wall-clock assertions (quality 25); text-only workflow checks (N24-OPS-1, whose test header admits it "does not prove a run succeeds"); staging without a deploy hook only warns (publish.md); the causes of the two red periods (PUB section 1, N24-OPS-2/9); the tutorial timer that outlives `hud.dom.test.ts` on `claude/gifted-darwin-xt5n6e` (established by the lead).

Scratch files: `scratchpad/repo/` (`commits.tsv`, `runs_main.tsv`, `numstat.txt`, `secretscan.py` and `.out`, `links.py`, `broken_links.json`, `texttests.json`, `graph.py`, `audit.json`, `shuf_a_*.log`, `full.git`).
