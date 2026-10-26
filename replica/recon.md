# Recon map: Ninja - نينجا (iOS / Android) — Search only

Scope: product search, with focus on search by list. Not ordering, delivery, couriers or dark stores.
For: personal use by Fayez. Not published. Targets: a web app and a mobile app sharing one search API.
Date: 2026-10-26
Status: **v2.** Public sources gave no search detail, so this version is built from the user's own screen recording. Anything not in the recording stays marked unconfirmed.

## Sources

| # | source | URL | notes |
| --- | --- | --- | --- |
| 1 | App Store listing (SA) | https://apps.apple.com/sa/app/ninja-%D9%86%D9%8A%D9%86%D8%AC%D8%A7/id1620153149 | publisher: TECH-ADVANCE FOR INFORMATION TECHNOLOGY CO. Could not be fetched from the build sandbox (DNS blocked). Only search-result snippets read |
| 2 | App Store listing (US) | https://apps.apple.com/us/app/-/id1620153149 | snippet: groceries, personal care, beauty, pharmacy, restaurants, free first delivery, iPhone |
| 3 | Wamda funding article | https://www.wamda.com/en/2025/07/saudi-q-commerce-ninja-raises-250-million-hits-unicorn-valuation-ahead-planned-ipo | company background, markets, categories |
| 4 | Arab News | https://www.arabnews.com/node/2607026/business-economy | company background |
| 5 | User's own phone | recording, 99 s | screen recording of search by list, taken by the user in their own account. Reference frames in `replica/screens/` (local only) |

No help center, changelog or public API docs were found. Nothing about how search is built is public, and none will be read from the app itself (no decompiling, no network capture).

## Core loop (search slice)

**Search by list.** The user types or pastes their whole shopping list, one item per line, taps "عرض النتائج", and gets one row of matching products per list item, each with an add button. One screen replaces many separate searches.

## Findings from the user's screen recording (iPhone, 99 s, 10:20-10:21)

Source: the user's own phone, own account. Frames read at 1 frame per 3 s.

- Home: search field with placeholder "ناقصك مقاضي؟ خضار، خبز، منظفات.. وأكثر", delivery badge "في 13 دقيقة", bottom tabs (مقاضي، المطاعم، جمال، حسابي), category grids, offer carousels.
- Tapping the search field opens the search page: back arrow, field "البحث عن منتجات..." , a **list icon on the left of the field** that opens list search, top tabs (مقاضي / المطاعم / جمال).
- Search page before typing: **عمليات البحث الأخيرة** (recent searches as chips with a history icon, "حذف الكل" to clear), **أبرز المنتجات 🔥** (trending product chips with a small image), **قوائم ذكية مخصصة لك!** (personalised smart lists, below the fold, not opened in the recording).
- List search ("ابحث من خلال القائمة"): a text area with greyed example lines (بطاطس، طماطم، أرز), a tips box ("اكتب العناصر كما تكتبها في قائمة التسوق الخاصة بك", "اضغط على مفتاح الإدخال على لوحة المفاتيح لإضافة المزيد من الأسطر"), a disabled "عرض النتائج" button that turns active once there is text, a remove (×) button per line.
- List results ("قائمتي"): one section per list item (بطاطس، كتشب، لبن، سكر، ماء), each a horizontal product carousel with "مشاهدة الكل", price, old price crossed out when discounted, promo badges ("اشتري ٣ بسعر ..."), add (+) buttons, an edit (pencil) icon to change the list.
- Not seen in the recording: live suggestions while typing in the normal search box, typo handling, filters, sort, no-results state. Those rows stay unconfirmed.

## Screens

| ID | screen | route / how to reach | purpose | key components | states seen |
| --- | --- | --- | --- | --- | --- |
| S01 | Search entry | tap the search field on home | start a search or reuse history | search field, list icon, store tabs, recent searches chips, trending chips, smart lists | empty (seen), typing (not seen) |
| S02 | List search input | list icon on S01 | write a whole shopping list | multi-line list editor, per-line remove, tips box, "عرض النتائج" button | empty (seen), 1-5 lines (seen), button disabled/enabled (seen) |
| S03 | List results ("قائمتي") | "عرض النتائج" on S02 | pick products per list item | per-item carousel, "مشاهدة الكل", product card, add button, edit icon | filled (seen), empty/no match (not seen), loading (not seen) |
| S04 | Single-term results | submit a normal query on S01 | pick a product | product cards | not seen |
| S05 | Per-item full results | "مشاهدة الكل" on S03 | see all matches for one item | product grid | not seen |

## Flows

```
F01 Search a whole shopping list   (the feature the user wants)
    S01 -> S02 -> S03
    happy path taps: open search 1, list icon 1, type N lines (Enter between), show results 1 = N+3 typed lines aside
    edge: empty line, duplicate items, item with no match, very long list, Arabic spelling variants, quantity words ("٢ لبن")

F02 Reuse a past search
    S01 (recent chip) -> results
    edge: clear all history

F03 Edit the list from results
    S03 (pencil) -> S02 -> S03
```

## Components

| component | variants | states | used on |
| --- | --- | --- | --- |
| Search field | normal, with list icon | empty, focused | S01 |
| Recent-search chip | with history icon | default; "حذف الكل" clears | S01 |
| Trending chip | text + small image | default | S01 |
| List editor | bullet lines, grey placeholder lines, × per line | empty, filled | S02 |
| Primary button "عرض النتائج" | teal | disabled, enabled | S02 |
| Product carousel row | with "مشاهدة الكل" link | filled | S03 |
| Product card | price, old price, promo badge, add (+) | default, discounted, promo | S03 |

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

Screens 5 (3 seen), flows 3, entities 4. Hard parts: splitting a list into items and matching each one (Arabic normalisation, plurals, typos, quantity words), ranking, keeping web and mobile on one API. Size: **S to M** (a few weeks part-time for both clients).
