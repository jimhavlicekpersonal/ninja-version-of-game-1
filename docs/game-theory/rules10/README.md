# Rules 10 (built, not live)

A proposed set of battle, raid and economy rules, measured in the balance lab (`tools/balance/lab`). Nothing here is
live: the simulator hooks exist behind data values that live data does not set, and SIM_RULES is unchanged.

- `Kagemura_Core_Design_v5.pdf`: what Rules 10 is, what it fixed, what it did not, and every measurement.
- `Kagemura_Core_Design_v4.pdf`: the round before (Rules 9), for the history of the raid rules.
- `Kagemura_Plan_to_8.pdf`: the plan from here, with pass/fail tests.
- `rules10_data_patch.json`: the values. `warrior_tuning_by_keep.csv`: the multiplier for each warrior at each Keep's
  research cap.

Correction to the plan's step B2: combat numbers never ship in balance bundles (root `CLAUDE.md`), so the battle side of
Rules 10 cannot be switched on by a bundle. It needs a SIM_RULES bump with the server deployed first, or the
`?sandbox&preview` path used for other built-but-not-live content. Only the raid and economy numbers could go in a bundle.

Limits: the payoff is the best of six entry points with the bots' formation; Keeps 9, 12 and 15 were scored on fresh
bases, the other seven Keeps have the tuner's own estimate only; model-player outcomes are not observed retention or
revenue; no person has played any of it.
