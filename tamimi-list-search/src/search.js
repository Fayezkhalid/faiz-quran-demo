import { tokenize, normalize, isLatin } from './normalize.js';
import { withinDistance } from './levenshtein.js';
import { parseList } from './parseList.js';

const WEIGHTS = { exact: 1, synonym: 0.9, typo: 0.7 };

export function createSearcher(index, config = {}) {
  const synonyms = buildSynonyms(config.synonyms ?? []);
  const intents = buildIntents(config.intents ?? {});

  // All the ways one query word can match: itself, its synonyms, then close spellings.
  function expand(word) {
    const out = new Map([[word, { weight: WEIGHTS.exact, why: 'exact' }]]);
    for (const s of synonyms.get(word) ?? []) if (!out.has(s)) out.set(s, { weight: WEIGHTS.synonym, why: `synonym:${s}` });
    // Spelling fallback only when the word itself is unknown ("بيظ"), never for a known word:
    // otherwise "لبن" would drift to "لبنه" (labneh), one letter away.
    const known = [...out.keys()].some((t) => index.postings.has(t));
    if (!known && word.length >= 3) {
      const pool = isLatin(word) ? index.vocabByScript.latin : index.vocabByScript.arabic;
      const max = word.length >= 7 ? 2 : 1;
      for (const v of pool) {
        if (out.has(v)) continue;
        if (word.length === 3 && v[0] !== word[0]) continue; // short words: first letter must agree
        if (v.length >= 3 && withinDistance(word, v, max)) out.set(v, { weight: WEIGHTS.typo, why: `typo:${v}` });
      }
    }
    return out;
  }

  // One list line -> ranked products.
  // Whole-word matching only: "لبن" no longer matches "لبنه" (labneh) or "لبناني" (Lebanese).
  function searchLine(query, { limit = 20, includeOutOfStock = true } = {}) {
    const words = tokenize(query);
    if (!words.length) return { total: 0, items: [] };

    const perWord = words.map((w) => {
      const hits = new Map(); // doc index -> best {weight, why}
      for (const [term, m] of expand(w)) {
        for (const i of index.postings.get(term) ?? []) {
          const prev = hits.get(i);
          if (!prev || prev.weight < m.weight) hits.set(i, m);
        }
      }
      return hits;
    });

    // Every word of the line must match (AND).
    let candidates = [...perWord[0].keys()];
    for (const hits of perWord.slice(1)) candidates = candidates.filter((i) => hits.has(i));

    const intent = intents.get(normalize(query)) ?? intents.get(words.join(' '));
    const scored = [];
    for (const i of candidates) {
      const doc = index.docs[i];
      const p = doc.product;
      if (!includeOutOfStock && p.inStock === false) continue;

      const matches = perWord.map((h) => h.get(i));
      let score = matches.reduce((s, m) => s + m.weight, 0) / words.length; // 0..1 text relevance
      const reasons = matches.map((m) => m.why);

      if (doc.firstWord && expand(words[0]).has(doc.firstWord)) { score += 0.15; reasons.push('starts-with'); }
      if (intent) {
        if (intent.has(p.category)) { score += 0.5; reasons.push(`category:${p.category}`); }
        else { score -= 0.25; reasons.push('other-category'); }
      }
      if (p.inStock === false) { score -= 1; reasons.push('out-of-stock'); }
      score += (p.popularity ?? 0) * 0.05; // popularity only breaks ties

      scored.push({ product: p, score: +score.toFixed(3), reasons });
    }
    scored.sort((a, b) => b.score - a.score);
    return { total: scored.length, items: scored.slice(0, limit) };
  }

  // The feature itself: the whole list -> one result row per line.
  function searchList(input, options = {}) {
    return parseList(input, options).map((line) => ({ ...line, ...searchLine(line.query, options) }));
  }

  return { searchLine, searchList, expand };
}

function buildSynonyms(groups) {
  const map = new Map();
  for (const group of groups) {
    const words = group.map((w) => tokenize(w).join(' ')).filter(Boolean);
    for (const w of words) map.set(w, new Set([...(map.get(w) ?? []), ...words.filter((x) => x !== w)]));
  }
  return map;
}

function buildIntents(intents) {
  const map = new Map();
  for (const [term, categories] of Object.entries(intents)) {
    map.set(normalize(term), new Set(categories));
    map.set(tokenize(term).join(' '), new Set(categories));
  }
  return map;
}
