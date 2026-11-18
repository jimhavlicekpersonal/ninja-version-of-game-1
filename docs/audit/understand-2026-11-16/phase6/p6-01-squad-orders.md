# P6-01: which squad orders to offer (tools/balance/run-squad-orders.mjs 10)

Per base, the best (stars, destruction) over 3 formations x every point, for each wave order; ties count for every order reaching the best. The raid bots' army at each Keep; ten generated bases a Keep.

| Keep | Bases | Best: tanks | Best: rush | Best: reserve | Mean %: tanks | rush | reserve |
|---|---|---|---|---|---|---|---|
| 9 | 10 | 9 | 9 | 8 | 97.2 | 98.7 | 97.0 |
| 12 | 10 | 7 | 4 | 9 | 87.2 | 81.4 | 89.4 |
| 15 | 10 | 9 | 10 | 6 | 98.6 | 100.0 | 94.5 |

Reserve offered: yes (needs best on >= 1 base in 5 at every Keep)
