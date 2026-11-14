# Japan: selling Jade and the Season Scroll (DRAFT, owner and legal review)

Written 2026-11-05 from the code. Statements of law are from knowledge and the sources listed; mark of **[recheck]** means confirm against the current text (e-Gov 法令検索 or the Japanese Law Translation database, the Consumer Affairs Agency and the FSA / Local Finance Bureau) before relying on it. Nothing here has been reviewed by a Japanese lawyer.

Pages prepared (shipped in `public/`, facts from `public/legal-config.js`, "未公開 (not published yet)" until filled, draft banner until `termsEffective` is set):
- `public/tokushoho.html` — 特定商取引法に基づく表記 (Act on Specified Commercial Transactions, mail-order notice).
- `public/shikin-kessai.html` — 資金決済法に基づく表示 (Payment Services Act, prepaid payment instruments).
- `public/terms.html` §3 — no cash value, no expiry, free Jade counts as spent first, refund on closure with 60 days' notice.

## 1. Which laws apply

| Law | Applies because | What it requires | Status |
|---|---|---|---|
| 特定商取引法 (通信販売) | Selling digital items to consumers in Japan online | Art. 11 advertising notice: seller name, address, phone, responsible person, prices, other charges, payment method and timing, delivery timing, cancellation/returns (申込みの撤回) terms, operating environment. Since June 2022, Art. 12-6: the final confirmation screen must show quantity, price, payment and delivery timing, and cancellation terms, and must not mislead [recheck] | `tokushoho.html` draft; owner fills seller facts. **Gap:** the in-game confirm step (`ui/economyUi.ts` `buy`) does not state the no-cancellation-after-delivery term or link the notice. |
| 資金決済法 (前払式支払手段, 自家型) | Purchased Jade is value paid in advance and used only for the issuer's own goods/services; it does not expire (the six-month-or-less exemption does not apply) | Art. 13 display items (issuer, value, expiry, where usable, complaints contact, how to check the unused balance, usage notes, where the terms are) [recheck the 内閣府令 item list]; Art. 5 notification to the Local Finance Bureau once the **unused paid balance on a base date (31 March / 30 September) exceeds ¥10,000,000**, within two months of that date; Art. 14 **deposit (発行保証金供託) of at least half of the whole unused balance on that base date** once it exceeds the threshold (or a guarantee/trust contract instead); semi-annual reports after notification; Art. 20 **refund of unused balances when issuance ends** (service closure), after at least 60 days' public notice | `shikin-kessai.html` draft; terms §3. Server-side measurement: the staff report in section 3 (2026-11-14). |
| 景品表示法 | Sales promotions and free gifts | No misleading prices or deadlines; premium (景品) limits; "kompu gacha" is banned | Nothing random is sold; offers have real deadlines (`events.json`, `offers.json`); the daily chest is free. No action beyond keeping claims accurate. |
| 民法 (minors' contracts) | Age of majority is 18 | A minor's purchase without consent can be rescinded | Under-18 monthly cap and "check with a grown-up" step; refunds go through the stores. |
| 個人情報保護法 (APPI) | Personal data of players in Japan | Purpose of use, safety measures, rules for providing data to third parties abroad (Art. 28: inform the person of the country and its data-protection system, or rely on an equivalent-system recipient) [recheck how this applies to hosting and Sentry outside Japan] | Privacy policy lists processors and transfers; add the country names once `hosting` and `crashReportRegion` are known. |

The 資金決済法 applies to issuers outside Japan that offer prepaid instruments to people in Japan [recheck with the FSA/LFB: the Kanto Local Finance Bureau handles issuers without a Japanese office]. Sources: Local Finance Bureau prepaid pages, e.g. https://lfb.mof.go.jp/kantou/kinyuu/pagekthp00400036.html and the Shikoku LFB guide https://lfb.mof.go.jp/shikoku/content/000227846.pdf; the Cabinet Office ordinance in the Japanese Law Translation database https://www.japaneselawtranslation.go.jp/ja/laws/view/2580/ja.

## 2. What is a prepaid instrument here

| Item | Prepaid (有償)? | Why |
|---|---|---|
| Jade packs (`moonstones_1`…`6`) | **Yes** | Paid for, stored as a balance, spent on items/features later. |
| Offers that contain Jade (`offers.json`) | The Jade part **yes**; resources delivered at once are a direct sale | Same reasoning; record the Jade amount per offer. |
| Season Scroll (`lantern_pass`) | **No** for the Scroll itself (a direct purchase of a service for one season) | Its premium-track Jade rewards are best treated as **free (無償) bonus** Jade [legal decision; conservative alternative: count them as paid]. |
| Jade earned by play (achievements, leagues, daily chest, free track) | **No** | Given for free. |
| Resources bought with Jade (top-up) | No | This is the use of Jade, not a new instrument. |

## 3. The unused paid balance: what exists and what is needed

**Today:** paid and earned Jade share one number (`state.resources.moonstones` in the village; the server's `ledger` rows with `resource = 'moonstones'` for server-held villages). Nothing records which Jade was paid. The game shows one total.

**What the server already has:**
- `purchases`: every store transaction it credited, with `player_id`, `product_id`, `status` (`credited` / refunded) and `at`. Jade per product is in `store.json` (`products[].grants.moonstones`, and offers' grants).
- For a server-held village: the current Jade balance (village file) and every change with its reason (`ledger`).
- For a device-held village: only purchase records; the current balance is unknown to the server.

**Accounting rule (proposed; must match terms §3 and `shikin-kessai.html`):** free Jade is spent first. Then, per player:

```
paidCredited   = Σ Jade of credited, unrefunded purchases (Jade packs + Jade in offers)
unusedPaid     = min(paidCredited − paidAlreadyCountedSpent, currentBalance)
```

With "free first", `unusedPaid = min(paidCredited, currentBalance)` is a sound upper bound for a server-held village (any Jade spent beyond the free Jade must have come from paid Jade, and the balance can never hold more paid Jade than was bought). For a device-held village, count `paidCredited` minus nothing (conservative: the balance is unknown) unless the owner chooses to report the last balance the device sent.

**Yen value:** the base-date amount is money, not Jade. `purchases.cents` holds the catalog **USD** list price (audit GLOBAL-007), not what the Japanese customer paid. Backend follow-up:
1. Record each purchase's storefront and price: Apple's signed transaction carries `storefront` (e.g. `JPN`), `currency` and `price` (milli-units) [recheck the field names in the App Store Server API JWS]; for Google Play, take the order's region and price from the Play Developer API / Orders API or monthly financial reports [recheck which API returns price per order].
2. Value unused paid Jade at the average yen price per paid Jade the player paid (FIFO is also acceptable if documented) [legal/accounting decision].
3. Restrict the measure to purchases made in the Japan storefront (Apple `JPN`, Play region `JP`).

**Staff report: built 2026-11-14** (`server/core/japanBalance.ts`, `GET /admin/v1/reports/jp-unused-balance?date=YYYY-03-31|YYYY-09-30`, default the latest ended base date; test `tests/backend/server/japan-balance.test.ts`). It counts Production purchases whose recorded storefront is `JPN`/`JP` (migration 0023 columns; older purchases have none and are not counted), credited and not refunded by the end of the base date in JST; paid Jade per product (packs, offers' Jade contents, a stipend's Jade over all its payments; Jade an offer gave for resources that did not fit is not recorded and not counted); free Jade first, so unused paid Jade = min(paid, the ledger balance at the base date) for server-held villages and all paid Jade for device-held ones; yen at the JPY price Apple reported, Play purchases (no price) at the average of the priced ones, else the catalog USD price through `USD_RATES.JPY`, else reported as `unpricedJade`. It answers the threshold, `exceeds`, `depositDueYen` (half) and `notifyBy`, and keeps each run as a staff action `jp-unused-balance` (numbers, protocol, data version). Still open: Play price per order (Orders API or financial reports), the accounting decision on valuation, and an accountant's check of the numbers.

The original spec:
- Input: a base date (31 March or 30 September, end of day JST).
- Output: number of Japan purchasers; total paid Jade credited; total unused paid Jade (rule above, as of the base date: use `ledger` rows up to that time for server-held villages, purchase records only for device-held ones); yen value; whether it exceeds ¥10,000,000; and, if so, the deposit due (at least half of the whole unused balance).
- Keep each run (date, numbers, code version) as the record behind any notification or report.
- Run it every base date from launch in Japan, even while far below the threshold, so the first crossing is noticed in time (notification within two months).

**In-game follow-ups (GUI / GAME THEORY):**
- Show the paid and free Jade separately for Japanese players (or all players), or at least make the paid balance reachable in game; the notice currently says "contact support" for the paid balance, which a regulator may find weak [recheck].
- In the Store confirm step for Japan, add the cancellation term ("Purchases cannot be cancelled after delivery") and a link to `tokushoho.html` and `shikin-kessai.html` (Art. 12-6 final confirmation screen) [recheck whether the store sheet alone satisfies it; it shows price but not the seller's terms].
- On service closure: stop selling Jade at announcement, publish the refund procedure for 60+ days, refund unused paid balances (server data needed from the report above; device-held villages need a claim process).

## 4. Owner steps

1. Decide the seller/issuer (individual or company); fill `operator`, `operatorAddress`, `operatorPhone` (or decide on "disclosed without delay on request", allowed for some items when stated [recheck the CAA guidance]), `responsiblePerson`, `supportEmail`.
2. Legal review of `tokushoho.html`, `shikin-kessai.html` and terms §3 (free-first rule, Scroll classification, refund on closure).
3. Backend: price/storefront capture and the unused-balance report (section 3): built 2026-11-14; run it every base date and keep its output; Play prices per order still need the Orders API or financial reports.
4. GUI: confirm-step text and paid-balance display for Japan.
5. Calendar: base dates 31 March / 30 September; notification deadline two months later; deposit with the Legal Affairs Bureau (法務局) if over the threshold.
6. Listing: link both notices from the Japanese App Store/Play description or support page.
