// Deploy one server image (roadmap step 43), used by .github/workflows/server.yml.
// Env: DEPLOY_HOOK (the host's deploy URL, a secret), SERVER_URL (public address),
// TAG (the image tag = the commit), IMAGE (registry path), TARGET (staging | production).
// 1. POST the hook with the image to deploy (the host runs migrations, then starts it).
// 2. Wait until SERVER_URL/healthz reports this release and /readyz is green.
// Report section 5 step 2: nothing deployed is never silent. Staging without a hook warns on the
// run; a production deploy without a hook fails (someone asked for a release and got none).
import { ciNote } from './ci-note.mjs';

const { DEPLOY_HOOK, SERVER_URL, TAG, IMAGE, TARGET } = process.env;

if (!DEPLOY_HOOK) {
  const msg = `No DEPLOY_HOOK secret for the ${TARGET || 'target'} environment: the image ${IMAGE}:${TAG} was built but not deployed. See docs/SHIPPING.md, "Server releases".`;
  if (TARGET === 'production') {
    ciNote('error', 'Production not deployed', msg);
    process.exit(1);
  }
  ciNote('warning', 'Server not deployed', msg);
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
  ciNote('warning', 'Deploy not confirmed', `Deploy of ${image} was requested, but there is no SERVER_URL variable, so nothing checked that the new release started.`);
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
