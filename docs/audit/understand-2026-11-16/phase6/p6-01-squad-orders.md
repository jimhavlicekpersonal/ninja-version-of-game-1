# P6-01: which squad orders to offer (tools/balance/run-squad-orders.mjs 10)

Per base, the best (stars, destruction) over 3 formations x every point, for each wave order. The raid bots' army at each Keep; ten generated bases a Keep. First run counted ties for every order that reached the best (review M2: with the army clearing most bases, every order passed that way). Decided on the strict count: the bases where an order is the best on its own.

| Keep | Bases | Best (ties): tanks | rush | reserve | Alone best: tanks | rush | reserve | Mean %: tanks | rush | reserve |
|---|---|---|---|---|---|---|---|---|---|---|
| 9 | 10 | 9 | 9 | 8 | 0 | 0 | 1 | 97.2 | 98.7 | 97.0 |
| 12 | 10 | 7 | 4 | 9 | 1 | 0 | 3 | 87.2 | 81.4 | 89.4 |
| 15 | 10 | 9 | 10 | 6 | 0 | 0 | 0 | 98.6 | 100.0 | 94.5 |

Reserve offered: no (needs to be the best order alone, no tie, on >= 1 base in 5 at every Keep)

Outcome: the reserve is not offered (SQUAD_RESERVE false). Tanks first and Rush stay.
