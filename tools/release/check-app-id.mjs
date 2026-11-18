// PUB-05 (P7-02): the store id a signed build uploads under. Google Play never lets a package name change after
// the first upload, so a signed release must not go out under the old game's id by accident. Choosing the id is
// the owner's decision (docs/SHIPPING.md section 6); this only refuses the legacy or a missing one.
//   APP_ID               the Android application id / iOS bundle id for this build
//   ALLOW_LEGACY_APP_ID  '1' to upload under the legacy id on purpose
import { LEGACY_APP_ID, appIdProblem } from './app-id.mjs';

const problem = appIdProblem(process.env.APP_ID, process.env.ALLOW_LEGACY_APP_ID === '1');
if (problem) {
  console.log(`::error title=App id not set::${problem}`);
  process.exit(1);
}
console.log(`App id ${process.env.APP_ID || LEGACY_APP_ID} accepted.`);
