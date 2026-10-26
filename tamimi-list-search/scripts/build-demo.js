// Builds a self-contained demo page: the src modules are inlined as a global `ListSearch`,
// and the sample catalogue and config are inlined as JSON.
//   node scripts/build-demo.js [--logo path/to/logo.svg] [--out path/to/demo.html]
import { readFileSync, writeFileSync } from 'node:fs';
import { loadDefaults } from '../src/load.js';

const arg = (name) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : undefined; };
const logoPath = arg('--logo');
const outPath = arg('--out') ?? new URL('../demo/index.html', import.meta.url);

const files = ['normalize.js', 'levenshtein.js', 'parseList.js', 'index-builder.js', 'search.js'];
const body = files
  .map((f) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8'))
  .map((src) => src.replace(/^import .*$/gm, '').replace(/^export (const|function)/gm, '$1'))
  .join('\n');
const core = `const ListSearch = (() => {\n${body}\nreturn { normalize, tokenize, parseList, buildIndex, createSearcher,\n  createListSearch: (products, config) => createSearcher(buildIndex(products), config) };\n})();`;

const logo = logoPath
  ? `<img src="data:image/svg+xml;base64,${readFileSync(logoPath).toString('base64')}" alt="Tamimi Markets">`
  : '<span class="wordmark">Tamimi Markets</span>';

const tpl = readFileSync(new URL('../demo/template.html', import.meta.url), 'utf8');
const out = tpl
  .replace('/*__LOGO__*/', () => logo)
  .replace('/*__CORE__*/', () => core)
  .replace('/*__DATA__*/', () => JSON.stringify(loadDefaults()));
writeFileSync(outPath, out);
console.log(String(outPath), out.length, 'bytes');
