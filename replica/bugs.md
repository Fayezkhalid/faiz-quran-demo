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
