// Reference HTTP endpoint with no dependencies: `npm run serve`, then
//   curl -s localhost:8787/api/list-search -H 'content-type: application/json' \
//        -d '{"list":"لبن\n2 خبز\nبيض"}'
// In production the same functions run inside Tamimi's own backend, fed by the real catalogue.
import { createServer } from 'node:http';
import { createListSearch } from '../src/index.js';
import { loadDefaults } from '../src/load.js';

const { products, config } = loadDefaults();
const search = createListSearch(products, config);
const PORT = Number(process.env.PORT ?? 8787);

createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/api/list-search') return send(res, 404, { error: 'POST /api/list-search' });
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 10_000) return send(res, 413, { error: 'list too long' });
  }
  let input;
  try { input = JSON.parse(body); } catch { return send(res, 400, { error: 'body must be JSON: {"list": "..."}' }); }
  if (typeof input.list !== 'string') return send(res, 400, { error: '"list" must be a string' });

  const rows = search.searchList(input.list, { limit: Math.min(Number(input.limit) || 20, 50) });
  send(res, 200, {
    lines: rows.map((r) => ({
      input: r.input,
      query: r.query,
      quantity: r.quantity,
      total: r.total,
      products: r.items.map(({ product, score }) => ({ ...product, score })),
    })),
  });
}).listen(PORT, () => console.log(`list search on http://localhost:${PORT}/api/list-search`));

function send(res, status, json) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(json));
}
