# Test plan: Tamimi web store search (shop.tamimimarkets.com/en)

Date: 2026-10-26. Tested by hand-style requests, 20 searches, 4 s apart. Authorised by the owner (works at Tamimi, e-commerce director agreed to the project).
Scope: result relevance of the search box, Arabic vs English. Web store only. The iPhone app is not tested yet.

| case | query (ar / en) | what a good result looks like |
| --- | --- | --- |
| S-H1 | لبن / laban | laban products first |
| S-H2 | حليب / milk | milk products first |
| S-H3 | رز / rice | rice products first |
| S-H4 | بيض / eggs | egg products first |
| S-H5 | دجاج / chicken | chicken products first |
| S-H6 | سكر / sugar | sugar first |
| S-H7 | شاي / tea | tea first |
| S-H8 | ماء / water | water first |
| S-H9 | بطاطس / potato | potatoes first |
| S-H10 | خبز / bread | bread first |

Measure: relevant products in the first 10 (p@10) and position of the first relevant product. "Relevant" = English product name contains the expected word (a rough proxy, checked by eye).
Raw data: `tamimi-probe.json`.

## Results (p@10 = relevant in first 10)

| term | Arabic p@10 | English p@10 | first relevant (ar / en) |
| --- | --- | --- | --- |
| لبن / laban | **1** | 10 | **6** / 1 |
| حليب / milk | 5 | 5 | 4 / 4 |
| رز / rice | 2 | 2 | 1 / 4 |
| بيض / eggs | 7 | 10 | 1 / 1 |
| دجاج / chicken | 6 | 6 | 1 / 1 |
| سكر / sugar | 7 | 10 | 1 / 1 |
| شاي / tea | 5 | 10 | 2 / 1 |
| ماء / water | 8 | 8 | 1 / 1 |
| بطاطس / potato | 5 | 6 | 1 / 1 |
| خبز / bread | 4 | 6 | 1 / 1 |
| **average** | **5.0** | **7.3** | |

Cases: 20 run. Ten show a clear relevance problem (see bugs.md).
