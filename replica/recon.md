# Recon map: Ninja - نينجا (iOS / Android) — Search only

Scope: product search only (search box, suggestions, results, filters). Not ordering, delivery, couriers or dark stores.
For: personal use by Fayez. Not published. Targets: a web app and a mobile app sharing one search API.
Date: 2026-10-26
Status: **DRAFT. Public sources gave no detail on the search screens.** Rows marked `needs-screenshot` get filled from the user's own screenshots or screen recording of the app on their own phone.

## Sources

| # | source | URL | notes |
| --- | --- | --- | --- |
| 1 | App Store listing (SA) | https://apps.apple.com/sa/app/ninja-%D9%86%D9%8A%D9%86%D8%AC%D8%A7/id1620153149 | publisher: TECH-ADVANCE FOR INFORMATION TECHNOLOGY CO. Could not be fetched from the build sandbox (DNS blocked). Only search-result snippets read |
| 2 | App Store listing (US) | https://apps.apple.com/us/app/-/id1620153149 | snippet: groceries, personal care, beauty, pharmacy, restaurants, free first delivery, iPhone |
| 3 | Wamda funding article | https://www.wamda.com/en/2025/07/saudi-q-commerce-ninja-raises-250-million-hits-unicorn-valuation-ahead-planned-ipo | company background, markets, categories |
| 4 | Arab News | https://www.arabnews.com/node/2607026/business-economy | company background |
| 5 | User's own phone | n/a | screenshots and screen recording of the search, taken by the user in their own account |

No help center, changelog or public API docs were found. Nothing about how search is built is public, and none will be read from the app itself (no decompiling, no network capture).

## Core loop (search slice)

The user types a few letters, sees helpful suggestions at once, and reaches the right product in as few taps as possible.

## Screens

| ID | screen | route / how to reach | purpose | key components | states seen |
| --- | --- | --- | --- | --- | --- |
| S01 | Search entry | search bar on home | start a search | search field, recent searches, trending | needs-screenshot |
| S02 | Live suggestions | typing in S01 | complete the query early | suggestion list, matched text highlight, category hints | needs-screenshot |
| S03 | Results | submit a query | pick a product | product cards, add button, count | needs-screenshot |
| S04 | Filters / sort | from S03 | narrow results | category, brand, price, sort | needs-screenshot |
| S05 | No results | S03 with no match | recover | message, suggestion to rephrase, popular items | needs-screenshot |

## Flows

```
F01 Find a product by typing
    S01 -> S02 -> S03
    happy path taps: needs-screenshot
    edge: typo, Arabic vs English word, Arabic letter variants, no results, empty query

F02 Refine results
    S03 -> S04 -> S03
    edge: filters leave nothing, many filters at once
```

## Components

| component | variants | states | used on |
| --- | --- | --- | --- |
| Search field | with clear button, with voice/scan (unknown) | empty, focused, typing | S01, S02 |
| Suggestion row | text, text + category | normal, highlighted | S02 |
| Product card | grid or list (unknown) | in stock, out of stock, in cart | S03 |
| Filter chip | single, multi | on, off | S04 |

## Inferred data model (guess, from the search behaviour a quick-commerce app needs)

```
Product   id, name_ar, name_en, brand, category_id, price, unit, in_stock, image_url
          evidence: store listing says groceries, personal care, beauty, pharmacy
          confidence: guess
Category  id, name_ar, name_en, parent_id        confidence: guess
Synonym   term, canonical_term, lang             (own design, not seen in the app)
SearchLog id, query, normalised_query, results_count, clicked_product_id, at   (own design)
```

## Feature matrix

See `features.csv`. Search-quality rows are the target list for the user's own build, written from common search UX patterns. Each is marked `confirmed` only after the user's screenshots show the app doing it.

## Out of scope (cannot or should not be cloned)

- Ninja's source code, bundles, private APIs and network calls (not read, not copied).
- Their product catalogue, prices, images and brand assets.
- Orders, delivery, couriers, dark stores, inventory, payments.
- Their ranking data and user behaviour data.

## Size

Screens 5, flows 2, entities 4. Hard parts: Arabic text normalisation, typo tolerance on Arabic, ranking, keeping web and mobile on one API. Size: **S to M** (a few weeks part-time for both clients).
