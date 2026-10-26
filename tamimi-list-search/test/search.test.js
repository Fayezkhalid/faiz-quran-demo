import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createListSearch, parseList, normalize } from '../src/index.js';
import { loadDefaults } from '../src/load.js';

const { products, config } = loadDefaults();
const search = createListSearch(products, config);
const ids = (r) => r.items.map((x) => x.product.id);
const cats = (r) => r.items.map((x) => x.product.category);

test('TM-006: "لبن" returns laban first, not labneh, milk, berries or Lebanese makdous', () => {
  const r = search.searchLine('لبن');
  assert.deepEqual(cats(r).slice(0, 6), Array(6).fill('laban'));
  for (const bad of ['p07', 'p08', 'p09', 'p10', 'p13', 'p14', 'p15']) assert.ok(!ids(r).includes(bad), `${bad} should not match`);
});

test('a brand that contains the word stays, but after the real product', () => {
  const r = search.searchLine('لبن');
  const garlic = ids(r).indexOf('p19');
  assert.ok(garlic === -1 || garlic >= 6);
});

test('TM-003: "حليب" and "milk" put milk before labneh', () => {
  for (const q of ['حليب', 'milk']) {
    const r = search.searchLine(q);
    assert.deepEqual(cats(r).slice(0, 3), ['milk', 'milk', 'milk'], q);
    assert.ok(!ids(r).includes('p07'));
  }
});

test('TM-004: "رز" and "rice" show rice before anything else, never pasta', () => {
  for (const q of ['رز', 'أرز', 'rice']) {
    const r = search.searchLine(q);
    assert.deepEqual(cats(r).slice(0, 2), ['rice', 'rice'], q);
    assert.ok(!ids(r).includes('p24'), q);
  }
});

test('TM-005: "شاي" puts tea bags before iced tea', () => {
  assert.equal(search.searchLine('شاي').items[0].product.id, 'p32');
  assert.equal(search.searchLine('شاهي').items[0].product.id, 'p32');
});

test('TM-002: unrelated items do not appear', () => {
  assert.ok(!ids(search.searchLine('خبز')).includes('p30'), 'sugar in bread');
  assert.ok(!ids(search.searchLine('دجاج')).includes('p29'), 'cooking cream in chicken');
  assert.ok(!ids(search.searchLine('بطاطس')).includes('p36'), 'tomato paste in potato');
  assert.ok(!ids(search.searchLine('سكر')).includes('p31'), 'flour in sugar');
});

test('spelling: unknown words fall back to the closest product word', () => {
  assert.equal(search.searchLine('بيظ').items[0].product.category, 'eggs');
  assert.equal(search.searchLine('جبنه').items[0].product.category, 'cheese');
});

test('out-of-stock items go last or can be hidden', () => {
  assert.equal(search.searchLine('كتشب').items.at(-1).product.id, 'p40');
  assert.equal(search.searchLine('كتشب', { includeOutOfStock: false }).total, 0);
});

test('parseList: lines, commas, bullets, numbering, quantities, duplicates', () => {
  const lines = parseList('١- لبن\n• خبز، 2 حليب\nبيض x3\nلبن\n\n');
  assert.deepEqual(lines.map((l) => [l.query, l.quantity]), [['لبن', 1], ['خبز', 1], ['حليب', 2], ['بيض', 3]]);
});

test('searchList: one result row per list line', () => {
  const rows = search.searchList('لبن\nخبز\n2 بيض\nشي ما له وجود');
  assert.equal(rows.length, 4);
  assert.equal(rows[0].items[0].product.category, 'laban');
  assert.equal(rows[1].items[0].product.category, 'bread');
  assert.equal(rows[2].quantity, 2);
  assert.equal(rows[3].total, 0);
});

test('normalize: Arabic letter forms and digits', () => {
  assert.equal(normalize('أَرُزّ إِ آ ـــ ة ى ٢٣'), 'ارز ا ا ه ي 23');
});
