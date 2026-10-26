// Builds demo/index.html as one self-contained file: the src modules are inlined as a
// global `ListSearch`, and the sample catalogue and config are inlined as JSON.
import { readFileSync, writeFileSync } from 'node:fs';
import { loadDefaults } from '../src/load.js';

const files = ['normalize.js', 'levenshtein.js', 'parseList.js', 'index-builder.js', 'search.js'];
const body = files
  .map((f) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8'))
  .map((src) => src.replace(/^import .*$/gm, '').replace(/^export (const|function)/gm, '$1'))
  .join('\n');
const core = `const ListSearch = (() => {\n${body}\nreturn { normalize, tokenize, parseList, buildIndex, createSearcher,\n  createListSearch: (products, config) => createSearcher(buildIndex(products), config) };\n})();`;

const tpl = readFileSync(new URL('../demo/template.html', import.meta.url), 'utf8');
const out = tpl.replace('/*__CORE__*/', () => core).replace('/*__DATA__*/', () => JSON.stringify(loadDefaults()));
writeFileSync(new URL('../demo/index.html', import.meta.url), out);
console.log('demo/index.html', out.length, 'bytes');
