// Arabic + English text normalisation shared by the index and the queries.
// Rule: anything done to product names must be done to queries the same way.

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

export function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)))
    .replace(/[ً-ٰٟـ]/g, '') // diacritics and tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Light stemming. It removes only what never changes the meaning of a grocery word:
// the article "ال" and the plural endings "ات/ون/ين". It never cuts letters off the
// end of a word otherwise, so "لبنه" (labneh) stays different from "لبن" (laban).
export function stem(word) {
  let w = word;
  if (w.length > 5 && /^(بال|وال|كال|فال)/.test(w)) w = w.slice(3); // "بالحليب" -> "حليب"
  else if (w.length > 4 && w.startsWith('لل')) w = w.slice(2);
  else if (w.length > 4 && w.startsWith('ال')) w = w.slice(2);
  if (w.length > 5 && /(ات|ون|ين)$/.test(w)) w = w.slice(0, -2);
  return w;
}

export function tokenize(text) {
  return normalize(text).split(' ').filter(Boolean).map(stem);
}

export const isLatin = (w) => /[a-z]/.test(w);
