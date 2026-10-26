import { normalize } from './normalize.js';

// Turns what the customer typed or pasted into clean list lines.
// Accepts new lines, Arabic or Latin commas, bullets and numbering ("1-", "2.").
// A bare number before or after the item is read as a quantity: "2 حليب", "حليب 2", "حليب x2".
export function parseList(input, { maxLines = 40 } = {}) {
  const lines = String(input ?? '')
    .split(/\n|،|,|؛|;/)
    .map((l) => l.replace(/^\s*(?:[-•*·▪]|\d+\s*[.)\-])\s*/u, '').trim())
    .filter(Boolean);

  const seen = new Set();
  const out = [];
  for (const raw of lines) {
    const { text, quantity } = readQuantity(normalize(raw));
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push({ input: raw, query: text, quantity });
    if (out.length >= maxLines) break;
  }
  return out;
}

function readQuantity(text) {
  let m = text.match(/^(\d{1,2})\s+(.+)$/);
  if (m) return { quantity: clamp(+m[1]), text: m[2] };
  m = text.match(/^(.+?)\s+x?(\d{1,2})$/);
  if (m) return { quantity: clamp(+m[2]), text: m[1] };
  return { quantity: 1, text };
}

const clamp = (n) => Math.max(1, Math.min(n, 99));
