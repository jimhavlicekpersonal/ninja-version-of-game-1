// A message a GitHub Actions run shows where people look (report section 5 step 2): an annotation on
// the run (::warning / ::notice) and a line in the job summary. A skipped release or deploy used to
// leave the run green with the reason only in a step's log, so "green" read as "released".
// Outside Actions it is a plain log line.
import { appendFileSync } from 'node:fs';

/** level: 'warning' | 'notice' | 'error'. The title and message are one line each. */
export function ciNote(level, title, message) {
  const one = (s) => String(s).replace(/\r?\n/g, ' ');
  console.log(`::${level} title=${one(title)}::${one(message)}`);
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) {
    const icon = level === 'error' ? '❌' : level === 'warning' ? '⚠️' : 'ℹ️';
    appendFileSync(summary, `${icon} **${one(title)}.** ${one(message)}\n\n`);
  }
}
