# Interface fonts

Self-hosted (Latin subset, woff2) so the installed app works offline; the service worker precaches them with the build. M PLUS 1 sets all text; Dela Gothic One sets titles and big labels (`--font-display`, `DISPLAY_FONT`). Dela Gothic One has a single weight: always use it at 400, or the browser synthesises a bold.

| File | Family | Use | License |
|---|---|---|---|
| `mplus1-latin-var.woff2` | M PLUS 1 (variable, 100–900) | body text, numbers, buttons | SIL Open Font License 1.1 (© The M+ FONTS Project Authors) |
| `dela-gothic-one-latin-400.woff2` | Dela Gothic One | Attack/Build labels, panel titles and headings, building names, battle header and results, the battle Attack! button, loading screen, floating loot numbers, splash wordmark | SIL Open Font License 1.1 (© The Dela Gothic Project Authors) |

Both come from Google Fonts. The OFL allows bundling and redistribution with the game; the fonts may not be sold on their own. Full license text: https://openfontlicense.org
