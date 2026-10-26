import { buildIndex } from './index-builder.js';
import { createSearcher } from './search.js';

export { normalize, tokenize, stem } from './normalize.js';
export { parseList } from './parseList.js';
export { buildIndex, createSearcher };

// Convenience: catalogue + config -> ready searcher.
export function createListSearch(products, config) {
  return createSearcher(buildIndex(products), config);
}
