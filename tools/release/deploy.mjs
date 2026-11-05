// Deploy one server image (roadmap step 43), used by .github/workflows/server.yml.
// Env: DEPLOY_HOOK (the host's deploy URL, a secret), SERVER_URL (public address),
// TAG (the image tag = the commit), IMAGE (registry path).
// 1. POST the hook with the image to deploy (the host runs migrations, then starts it).
// 2. Wait until SERVER_URL/healthz reports this release and /readyz is green.
const { DEPLOY_HOOK, SERVER_URL, TAG, IMAGE } = process.env;

if (!DEPLOY_HOOK) {
  console.log(`No DEPLOY_HOOK for this environment: built ${IMAGE}:${TAG} but did not deploy it. See docs/SHIPPING.md, "Server releases".`);
  process.exit(0);
}
const image = `${String(IMAGE).toLowerCase()}:${TAG}`;
const res = await fetch(DEPLOY_HOOK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ image, tag: TAG }) });
if (!res.ok) {
  console.error(`The deploy hook answered ${res.status}: ${await res.text()}`);
  process.exit(1);
}
console.log(`Deploy of ${image} requested.`);
if (!SERVER_URL) {
  console.log('No SERVER_URL: not waiting for the new release.');
  process.exit(0);
}
const deadline = Date.now() + 15 * 60_000;
while (Date.now() < deadline) {
  try {
    const h = await (await fetch(`${SERVER_URL}/healthz`)).json();
    const ready = await fetch(`${SERVER_URL}/readyz`);
    if (String(h.version).endsWith(TAG) && ready.ok) {
      console.log(`${SERVER_URL} runs ${h.version} and is ready.`);
      process.exit(0);
    }
    console.log(`Waiting: ${SERVER_URL} runs ${h.version} (ready: ${ready.ok}).`);
  } catch (e) {
    console.log(`Waiting: ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, 15_000));
}
console.error(`${SERVER_URL} did not start ${TAG} within 15 minutes.`);
process.exit(1);
