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
| 5 | 1.00 | 268 | 1,664 |
| 8 | 2.29 | 557 | 3,914 |
| 10 | 3.91 | 793 | 4,920 |
| 15 | 15.12 | 2,428 | – |

The scale is `(average loot at Keep / average loot at Keep 5) ^ 0.5`, lowered where needed so that rushing the next Keep still costs more at every Keep (balance fix #20). Regenerate it with `node tools/balance/topup.mjs` after changing loot, Keep costs or either curve.

## What the tests guard

- A raid's worth of loot costs within 50× from Keep 1 to 15 (it was 1,766×), and never less at a higher Keep.
- The starting Jade buys under 8 raids at Keep 2.
- From Keep 6 on, a raid's worth costs at most 100× a two-hour training skip.
- Rushing the next Keep costs more at every Keep, rush(4) is more than the starting Jade, and rush(5) is at least 3× it.
- Finishing a two-hour army costs the plain price up to Keep 5, more after, and stays 1–10× cheaper than buying the same loot.
- Nothing is charged when the action can't happen, when nothing is missing, or beyond storage. Top-ups pay only for upgrade, place, train and research.

## Skip training, then raid

The other way to turn Jade into resources is to finish army training with Jade and raid again. At the flat time price, a two-hour army cost ~37 Jade to finish at every Keep. At Keep 15 its raid then looted what a top-up sells for ~2,428 Jade: a 65× discount, which made the top-up price meaningless to big spenders.

Finishing training now costs the time price × `trainingSkipScaleByHall[keep]`: the top-up scale, never below 1, written by the same tool. Building and research skips keep the plain time price, because they don't feed a loot loop.

| Keep | Finish a 2 h army | One raid's loot by top-up | Top-up ÷ skip-and-raid |
|---|---|---|---|
| 1–5 | 37 | 69–268 | 1.9–7.2 |
| 6 | 55 | 391 | 7.1 |
| 10 | 145 | 793 | 5.5 |
| 15 | 559 | 2,428 | 4.3 |

Time stays the better buy at every Keep: the tests require a ratio between 1 and 10.

## Where players see it

- **Building sheet:** "Buy missing" starts the upgrade.
- **Build menu:** a card short only of resources shows "Buy missing" with its Jade price. The player picks a spot; on confirm, the HUD asks before spending (`placement:buy`), then buys and places in one step.
- **Army panel, Train tab:** "Buy & Fill N" (or "Buy & Next N"), full width below the normal buttons.
- **Army panel, Research tab:** "Buy missing".
- **Every buy** goes through the Jade confirm step, which names what is bought and the price.

The model player doesn't buy, so the pacing tests are unchanged.

## Offers follow the same rule (design re-audit, November 2026)

Offers used to grant their contents raw: at Keep 1 the Rebuild Kit's 20,000 Coins and Provisions were about 7x a Keep 1 storage (a stockpile for raiders, against rule 1), and at Keep 12+ the same numbers were trivial. Now `productGrantsFor(state, productId)` (`sim/monetization.ts`) decides what a purchase delivers, and `grantPurchase` delivers exactly that:

1. **Jade is never scaled.** Packs give their Jade; an offer gives its Jade in full.
2. **Coins and Provisions are written at the Keep 5 economy** and multiplied by `topUpScaleByHall[keep]`, so an offer's resources are worth the same number of Jade (as top-ups) at every Keep (tested within 10% from Keep 1 to 15).
3. **No stockpile.** The part that does not fit in storage right now is delivered as the Jade a top-up of exactly that amount costs at this Keep (`converted`, `convertedJade`). Nothing is withheld, and that Jade only turns back into resources through top-ups (exact, immediate), so there is still no exchange.
4. **The Store shows what you would get.** The UI shows `productGrantsFor(...).grants` (and the converted part) instead of the catalog `productInfo().grants`. A purchase record keeps what it delivered (`PurchaseRecord.grants`, save v16), so a refund takes back that, not the catalog contents.

The Clan Stipend (`store.json` `stipend`) delivers nothing at once: 30 daily Jade payments, one claimable per UTC day by opening the game (`claimStipend`); missed days are not lost (it lasts until every payment is claimed), and it can be bought again only when none are left. The cheapest pack is now the $0.99 Pinch of Jade (`moonstones_0`, store id `jade_pinch`).

