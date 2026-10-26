import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

// Node-only helper: loads the bundled config and sample catalogue.
export function loadDefaults() {
  return {
    products: read('data/sample-catalog.json').products,
    config: {
      synonyms: read('config/synonyms.json').groups,
      intents: read('config/intents.json').intents,
    },
  };
}
