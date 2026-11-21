# Server runbook (one section per alert)

Beast Mode 2026-11-21 OPS-07. Every rule in `ops/prometheus/alerts.yml` links here (`runbook_url`) and carries `team: server` and a severity: `page` wakes the on-call person, `warn` goes to the team chat, `info` to email (`ops/alertmanager/alertmanager.example.yml`). The owner routes `page` to a real pager and names the on-call rota (owner step OWN-18).

**First three checks for any alert:** (1) the server's structured log for the alert's window (request ids in `x-request-id`); (2) `GET /readyz` (`ok`/`down` per dependency; detail in the log only); (3) the Grafana panel for the metric in the alert's expression (`ops/grafana/`).

**Mitigations you can always use:** `SERVER_NOTICE` (a message every game shows in Settings and on the HUD), more instances or `RESIM_WORKERS`, `MIN_CLIENT_BUILD` (older games pause online play with "Update Kagemura"), the kill switches (`docs/SHIPPING.md`), rolling back the server or the web build (`docs/store/RELEASE.md`, rollback), and halting a store's staged rollout.

**Escalate to:** the owner (store accounts, money, legal), the server maintainer (code), the hosting provider's support (database, network).

## serverdown

The scrape of a server instance fails. Check the host's status page and the container logs (a crash loop on start is usually a configuration error: `checkConfig` refuses production without its switches, or a pending migration without `MIGRATE_ON_BOOT=1`). Restart the instance; if the last deploy caused it, roll the server back. Games keep playing offline and send their queues later.

## higherrorrate

More than the threshold of requests end in 5xx. Find the route in `tk_http_requests_total{status=~"5.."}`, then its errors in the log and Sentry (`SENTRY_DSN`). A database or Redis outage shows in `/readyz`. Roll back if it started with a deploy.

## slowresponses

p95 latency is high. Check `tk_db_pool_connections{state="waiting"}`, `tk_event_loop_delay_ms` and `tk_resim_wait_ms`. Scale instances; raise `PG_POOL_MAX` only if the database has headroom.

## eventloopblocked

The Node event loop stalls (a CPU-heavy request on the main thread). Re-simulation must run in workers (`RESIM_WORKERS` > 0); check that it is not 0 and that the worker pool is healthy. Look for one route dominating `tk_http_request_duration_ms`.

## redisdown

Redis is unreachable. The server degrades (per-instance rate limits, leaderboard from the database, locks from tickets), so play continues. Restore Redis; with `REDIS_REQUIRED=1`, `/readyz` fails and instances leave the load balancer: unset it during the outage if needed.

## databasepoolsaturated

Requests wait for a database connection. Check slow queries (the database's own console), a long migration, or a retention job holding connections (`tk_retention_*`). Scale the database or lower traffic with `SERVER_NOTICE` and `MIN_CLIENT_BUILD` if necessary.

## refundspike

Refunds are far above normal. Look at `/admin/v1/players` for the accounts (refund pauses apply after several refunds); check whether a store outage or a duplicate charge caused it (Beast Mode ECO-01 guards). Tell the owner: store refund abuse may need the store's fraud team.

## desyncsrising

Re-simulations disagree with the games' own results. Usually a client build with different battle rules: check `DesyncsRisingForOneVersion`, `tk_client_requests_total` by build and `SIM_RULES`. Never edit an archived rules snapshot; pause the affected build with `MIN_CLIENT_BUILD`.

## desyncsrisingforoneversion

One game version desyncs. Pause it (`MIN_CLIENT_BUILD` to the next build) and check the rules snapshot that build should use (`server/rules/v<N>`).

## gamesrefusedforversion

Many requests are refused for an outdated build or protocol. Expected for a short while after a release; if it lasts, the store builds are not reaching players: check the store rollout, and that `MIN_CLIENT_BUILD` is not ahead of the published build.

## ratelimitstorm

Many requests hit rate limits. Find the rule (`tk_rate_limited_total{rule}`): a client bug retrying in a loop (check the build), an abusive address (`ADMIN_ALLOW_IPS` does not help here; use the host's firewall), or limits too tight for real traffic behind carrier NAT.

## staffauthfailures

Wrong staff tokens. Someone is guessing at `/admin`, or a revoked token is still in a tool. Check the source addresses in the log; set `ADMIN_ALLOW_IPS`; rotate `ADMIN_TOKENS` if a token may have leaked.

## retentionstalled

No retention run finished for a day: replays, logs and idempotency rows pile up. Check the `retention` job's log lines and its lease (`job_leases`); a long `prune` hit its time budget every run (raise it off-peak).

## metricsseriesoverflow

A metric reached its label-set cap and counts into `{overflow="1"}` (`tk_metrics_series_dropped_total{metric}` names it). A client is sending made-up label values, or a new label needs a normaliser (Beast Mode SEC-02). Memory stays bounded; fix the label in code.

## latereportsrising

More than 2% of raid reports arrive later than 8 minutes after Attack (Beast Mode SEC-04). Look at `/admin/v1/suspects` and players' late-report counts; a network incident also delays reports (check the time window against other alerts). Switch on `LATE_REPORT_RULE=1` only once the game build that sends its outbox first is out.

## purchasesstalled

No production purchase credited for 6 hours while the game is busy. Check `/v1/hello` for `purchases-apple`/`purchases-google`, the verifier errors in the log (an expired App Store key, a revoked Google service account), and both stores' status pages. Tell the owner at once: paid purchases may be waiting (they are delivered once the server accepts them).

## resimbusy

Battle reports are refused with `503 busy`: the re-simulation queue is full. Scale instances or raise `RESIM_WORKERS` (cores − 1 by default); check `tk_resim_ms` for a slow battle type. Games retry, so no report is lost, but players wait.
