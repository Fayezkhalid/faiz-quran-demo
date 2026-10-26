# Bugs: Tamimi web store search

Only reproduced items. Run on 2026-10-26 at https://shop.tamimimarkets.com/en/search?query=...

## TM-001 (S2) Arabic "لبن" is treated as milk, real laban comes sixth
- Steps: search `لبن`, then search `laban`.
- Expected: laban products first, as for `laban`.
- Actual: `لبن` returns Labneh x3, Fresh Milk, **Blueberry**, then Fresh Laban (6th), UHT Milk, **Raspberry**, lactose-free milk, cottage cheese, protein yoghurt. 1 relevant in the first 10. `laban` returns 10 of 10.
- Evidence: `tamimi-probe.json`. Results for `حليب` and `milk` are identical, which suggests Arabic is converted to an English word before matching. In Saudi Arabia "لبن" means laban (a drink), not milk.

## TM-002 (S3) Unrelated products inside results
- `دجاج` and `chicken`: Cooking Cream x3 at positions 2-4.
- `خبز` (bread): Fine Sugar at positions 2-3.
- `بطاطس` (potato): Tomato Paste at position 6.
- `سكر` (sugar): All Purpose Flour, Apple Juice, Ice Tea in the first 10.
- `شاي` (tea): Classic Coffee first, Black Olives and Black Pepper in the first 10.
- `لبن`: Blueberry and Raspberry (see TM-001).
- Likely cause (to check): matching on description/tags or fuzzy matching without a category check, then sorted by popularity.

## TM-003 (S3) English "milk" puts Labneh first
- Steps: search `milk`.
- Actual: Premium Labneh x3 first, Fresh Milk 4th. 5 of 10 relevant.

## TM-004 (S3) "rice" lists pasta before rice
- Steps: search `rice`.
- Actual: Spaghetti, Penne first; Calrose Rice 4th. 2 of 10 relevant.
- Steps: search `رز`. Actual: only 2 shown in the first results (Rice Flour, Mango Sticky Rice), no plain rice. Total count 21.

## TM-005 (S3) `tea` shows only iced tea in the first 10
- Tea bags and loose tea are not in the first 10 (all Ice Tea).

## To check (not reproduced or unclear)
- The result counter looks unreliable: `لبن` and `milk` both say 284, `eggs` says 1 while many eggs are listed.
- The iPhone app may use a different search service. Needs the user's screen recording.
- Colloquial Arabic spellings (رز / أرز, بيظ, شاهي) not tested systematically.
- Search by list is not offered on the web store (no list input found on the home page).

## Summary
Cases run 20. Bugs by severity: S1 0, S2 1, S3 4. Average relevant in first 10: Arabic 5.0, English 7.3.

---

# iPhone app (user's screen recording, 116 s, 10:40-10:42)

Same Bureidah pickup store. The app shows the same ranking as the web store, so both most likely use the same search service.

## TM-006 (S2) App: "لبن" returns 399 products, most are not laban
- Steps: tap search, type `لبن`, press search. Sort is the default "الأكثر رواجاً".
- Actual, in order: Labneh 700g, Fresh Milk 2L, Fresh Milk 2.85L, **Driscoll's Blueberries**, then laban 2L, long-life milk, lactose-free milk, YoPro yoghurt, Greek labneh, Romi cheese, Kefir, **Strawberries, Raspberries**, cheddar, feta, **"Darna Lebanese makdous" (مكدوس لبناني)**, spicy cheese, labneh with za'atar, powdered milk...
- Expected: laban drinks first (Almarai, Nadec, Al Safi laban), then close items.
- Evidence: frames at 10:41. Three causes are visible:
  1. **Arabic substring match.** "لبن" is inside "لبنة" (labneh) and "لبناني" (Lebanese), so those match.
  2. **Arabic mapped to milk.** Many plain milk products match although they have no "لبن" in the name (same as TM-001 on web).
  3. **Popularity sort beats relevance.** The default sort "الأكثر رواجاً" puts best sellers above exact matches.
  The berries have no visible link to the word. Cause unknown (to check).

## TM-007 (S3) App: first live suggestions for "لبن" are unrelated
- Steps: type `لبن` in the search box and watch the suggestion list.
- Actual: first list shows "معجون الثوم الطازج" (garlic paste), then "لحم بقري مجفف أصلي" and "لحم بقري مجفف ترياكي" (beef jerky). A second later, typing again, it shows Almarai and Nadec fresh laban.
- Likely cause (to check): suggestions from an earlier, shorter input arriving late, or matching on brand or other fields.

## Seen in the app, useful for the proposal
- Search has recent searches ("عمليات سابقة", × per item, "مسح الكل"), barcode scan and voice icons.
- There is **no search by list** and no way to search several items at once.

## Updated summary
Web: 20 cases. App: 1 query recorded. Bugs: S1 0, S2 2 (TM-001, TM-006), S3 5.
