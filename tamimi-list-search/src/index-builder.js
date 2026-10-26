import { tokenize, isLatin } from './normalize.js';

// Builds an in-memory index over the fields that describe the product itself.
// Descriptions and marketing tags are left out on purpose: they are where
// unrelated words come from (a jerky ad that mentions "laban", a berry box tagged "breakfast").
export function buildIndex(products) {
  const docs = products.map((p, i) => {
    const nameTokens = tokenize(`${p.nameAr ?? ''} ${p.nameEn ?? ''}`);
    const brandTokens = tokenize(`${p.brandAr ?? ''} ${p.brandEn ?? ''}`);
    return {
      i,
      product: p,
      tokens: new Set([...nameTokens, ...brandTokens]),
      firstWord: tokenize(p.nameAr ?? '')[0] ?? tokenize(p.nameEn ?? '')[0],
    };
  });

  const postings = new Map(); // token -> Set(doc index)
  for (const d of docs) {
    for (const t of d.tokens) {
      if (!postings.has(t)) postings.set(t, new Set());
      postings.get(t).add(d.i);
    }
  }
  const vocabulary = [...postings.keys()];
  const vocabByScript = {
    latin: vocabulary.filter(isLatin),
    arabic: vocabulary.filter((w) => !isLatin(w)),
  };
  return { docs, postings, vocabByScript };
}
