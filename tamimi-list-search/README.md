# Tamimi list search (البحث بالقائمة)

Search by shopping list for the Tamimi Markets app and web store. The customer types or pastes a list, one item per line, and gets one row of products per line. The same matching also fixes the relevance problems found in today's search (see `../replica/bugs.md`).

Written from scratch for Tamimi. No code from any other app.

## What is in here

| path | what |
| --- | --- |
| `src/normalize.js` | Arabic/English normalisation: letter forms, diacritics, digits, light stemming |
| `src/parseList.js` | list text -> lines, with quantities ("2 خبز"), bullets, numbering, commas, duplicates |
| `src/index-builder.js` | in-memory index over product name and brand (not descriptions) |
| `src/search.js` | ranking: whole words, synonyms, category intent, spelling fallback, stock, popularity as tie-break |
| `config/synonyms.json` | words that mean the same product, Arabic and English. Owned by e-commerce |
| `config/intents.json` | word -> the category the customer means. Owned by e-commerce |
| `data/sample-catalog.json` | 40 sample products for tests and demo |
| `examples/server.js` | reference HTTP endpoint, no dependencies |
| `demo/` | single-file demo with a before/after switch (`npm run build:demo`) |
| `test/` | 11 tests, one per bug found plus parsing (`npm test`) |

Node 18+ and no dependencies.

## How ranking works

For each list line:

1. Normalise the text the same way product names were normalised.
2. Match **whole words** only. `لبن` no longer matches `لبنة` (labneh) or `لبناني` (Lebanese).
3. Add synonyms from `config/synonyms.json` (`رز` = `أرز` = `rice`). `لبن` is **not** a synonym of `حليب`.
4. If the word is unknown, try the closest spelling (`بيظ` -> `بيض`). Known words never drift.
5. Every word of the line must match.
6. Score = text match (0-1) + 0.15 if the product name starts with the word + 0.5 if the product is in the intended category (`config/intents.json`), or -0.25 if it is not + popularity x 0.05 as a tie-break. Out of stock: -1.

Each result carries `reasons` (`exact`, `synonym:rice`, `category:laban`, ...) so the team can see why a product was shown.

## API

```js
import { createListSearch } from './src/index.js';
const search = createListSearch(products, { synonyms, intents });
search.searchList('لبن\n2 خبز\nبيض');      // [{ input, query, quantity, total, items: [{ product, score, reasons }] }]
search.searchLine('حليب', { limit: 20, includeOutOfStock: false });
```

Product shape: `{ id, nameAr, nameEn, brandAr, brandEn, category, price, popularity (0-1), inStock }`.

HTTP (reference server): `POST /api/list-search` with `{"list": "لبن\n2 خبز", "limit": 20}`.

## Integration options

| option | how | when |
| --- | --- | --- |
| A. Inside the current search service | Apply the same rules in the existing engine: whole-word Arabic analyser, synonym list, category boost, relevance before popularity. List search calls it once per line. | Best long-term. Needs the search team. |
| B. Small list-search service | Run this module as a service fed nightly from the product catalogue. The app calls `POST /api/list-search`. | Fastest pilot; does not touch the current engine. |
| C. App-side only | The app splits the list and calls the existing search once per line. | Quick UI test only. It inherits today's relevance problems. |

The in-memory index suits a pilot (tens of thousands of products). For the full catalogue, put the same rules in the production search engine (option A).

## Before production

- Feed the real catalogue export and real category ids.
- Fill `intents.json` from the top 500 searches in the search logs.
- Log every query with result count and the product added to the cart; track zero-result rate and search-to-cart rate.
- Security review: limit input size (the reference server caps the body at 10 KB) and lines (40).
