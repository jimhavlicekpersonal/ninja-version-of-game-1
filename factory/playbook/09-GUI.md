# Stage 9: interface

## What this stage decides

How the game looks and speaks on the template's screens: the feel, the theme tokens, what changes on each screen, the tutorial retold, the mentor, and the words at the moments that matter.

## What the template gives you

Read the interface brief, the interface and boot text catalogues and the tutorial code in this stage's context; they win over this page.

- A DOM and CSS HUD over the scene: a top bar, a rail, a bottom bar that fits 320 pixels, sheets and dialogs; a battle HUD; panels for army, codex, store, daily rewards, events, pass, goals, alliance, friends, small groups, settings.
- The interface reads state and pure functions from the game rules and changes state only by sending commands. No rule or number lives in interface code.
- Every string through the text layer with keyed plurals; right-to-left layout; numbers and dates through formatters.
- A tutorial with a fixed number of steps in a fixed order (saves store the step index); a step points only at its own building's sheet or the building on the map; a one-line coach in the first battle.
- Progressive disclosure: features appear on the rail as the player reaches them.
- Rules already built in: generated opponents labelled; real prices only in the store and its confirm step; a confirm step on every purchase; results show what was really banked and what overflowed; reduced motion and zoom respected.
- Device targets: a small Android phone, an iPhone, a laptop with mouse and keyboard; portrait and landscape; safe areas; checked at 320×568, 360×640, 390×844 and 844×390.

## Method

1. **Feel.** One paragraph: materials, weight, motion, sound of a tap. It follows the brand's tone and the art direction's palette.
2. **Theme tokens.** The colours, radii, borders, shadows and font stacks as the template's stylesheet names them, with new values. A display font only if the engine stage allowed it, with fallbacks for every script.
3. **Screen by screen.** What changes in words, icons and emphasis; what must not move (the bottom bar at 320 pixels, tap targets, selectors the tutorial points at).
4. **Tutorial retold.** The same steps in the same order, each with its new line in the mentor's voice. The steps teach what the rules reward. Lines are short: they will be translated and must fit a bubble at 320 pixels in the longest language.
5. **Mentor.** Who speaks, how, and where else they appear (empty states, first failures, the first purchase prompt never).
6. **Microcopy** for the moments that decide trust: first raid result, first loss, the store confirm step, the age question, the notification ask, the generated-opponent label, server-confirming states, an offline notice, an update-needed notice.
7. **Honesty labels** in the new fiction: the word for a generated rival still says it is generated; practice is called practice.
8. **Accessibility.** Contrast, text size, reduced motion, colour not carrying meaning alone, screen-reader names for the main controls.
9. **Text budgets** for the languages stage's rules: label lengths, no sentence built from pieces.

## What went wrong last time

- The Build button fell outside a narrow viewport; filters crowded small screens; a battle opened zoomed out so far the base was a stamp.
- Resource ids showed in a purchase confirmation; fixed dollar prices instead of the store's; plurals were wrong until keyed.
- The tutorial pointed at a button under an open dialog.
- Troop cards refreshed by display name instead of id showed ×0 after a rename: **never key interface logic on a display name.**
- No next-objective hint; notifications asked for at the wrong moment; privacy and support links missing in the app.
- Everything was checked in an emulator only.

## Limits

- The step count and order of the tutorial; the selectors it uses; the command surface.
- Doctrine 5, 6, 9 and 10.
- New art keys or commands are requests to the art or gameplay lane.

## A good record

A session could restyle the HUD and rewrite the tutorial from it, and a translator would find every new line short, whole and free of grammar traps.
