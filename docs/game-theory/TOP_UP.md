# Buying Coins and Provisions with Jade

Players can't swap Jade for Coins or Provisions freely. A **top-up** buys exactly what one action is short of: an upgrade, a new building, a Fill of warriors or a research level. It is priced at the buyer's Keep, and the action starts in the same step (`{ type: 'topUp', then: action }` in `src/gameplay/sim/village.ts`). Tests: `tests/gameplay/economy/topup.test.ts`.

## Why not a free-standing exchange

We calculated what an open "spend Jade, get Coins/Provisions" market would do:

| Problem | Numbers (old flat curve) |
|---|---|
| The price ignored the Keep while the economy grows ~4,600× | One raid of loot cost 19 Jade at Keep 1 and 33,557 at Keep 15, a 1,700× swing |
| Early Keeps were a giveaway | The 500 starting Jade bought ~16 raids of loot at Keep 2, skipping the raid loop |
| Late Keeps were a trap | Buying a raid's loot cost ~900× more than skipping 2 h of training (~37 Jade) and raiding for it |
| Stockpiles fed raiders | Bought resources sat in storage: a raid takes 20% (up to `storageLootCapByHall`), which is 40% of a full Keep 2 store |
| Online PvP | Bought resources would become other players' loot, and Gang friends could raid each other to pass along what one of them bought |

## The rules now

1. **Exact and immediate.** Jade buys only the shortfall for one action, and the action happens at once. If the action can't start (no free Artisan, camps full, Keep too low), nothing is offered or charged. Bought resources never sit in storage, so raids, the server's loot and collusion between friends are unaffected.
2. **Storage cap.** Nothing is offered when the action's full cost wouldn't fit in storage.
3. **Not counted as earned.** Top-ups never count toward `collectedAcorns` or `collectedDew`, so the collection achievements can't be bought.
4. **Keep-scaled price.** The amount is divided by `topUpScaleByHall[keep]` (`store.json`) before `topUpCurve` prices it. The curve is the Keep 5 price (scale 1).

| Keep | Scale | Jade per raid of loot | Rush next Keep (Coins + timer) |
|---|---|---|---|
| 1 | 0.22 | 69 | 33 |
| 2 | 0.30 | 89 | 82 |
| 5 | 1.00 | 268 | 2,636 |
| 8 | 2.29 | 557 | 3,914 |
| 10 | 3.91 | 793 | 5,295 |
| 15 | 15.12 | 2,428 | – |

The scale is `(average loot at Keep / average loot at Keep 5) ^ 0.5`, lowered where needed so that rushing the next Keep still costs more at every Keep (balance fix #20). Regenerate it with `node tools/balance/topup.mjs` after changing loot, Keep costs or either curve.

## What the tests guard

- A raid's worth of loot costs within 50× from Keep 1 to 15 (it was 1,766×), and never less at a higher Keep.
- The starting Jade buys under 8 raids at Keep 2.
- From Keep 6 on, a raid's worth costs at most 100× a two-hour training skip.
- Rushing the next Keep costs more at every Keep, rush(4) is more than the starting Jade, and rush(5) is at least 3× it.
- Nothing is charged when the action can't happen, when nothing is missing, or beyond storage. Top-ups pay only for upgrade, place, train and research.

## Left open

- **Skip training, then raid.** Skipping training and raiding is still the cheapest way to turn Jade into resources (about 37 Jade per two-hour army). It is bounded by battle length and the Next fee, but deserves its own look.
- **Model player.** The model player doesn't buy, so pacing tests are unchanged.
