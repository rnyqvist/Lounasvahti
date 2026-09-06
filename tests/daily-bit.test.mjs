import test from 'node:test';
import assert from 'node:assert/strict';
import { DAILY_BITS, dailyBit } from '../lib/daily-bit.ts';
import { menuDate } from '../lib/menu-date.ts';

test('daily rotation contains 60 distinct complete entries', () => {
  assert.equal(DAILY_BITS.length, 60);
  assert.equal(new Set(DAILY_BITS.map(bit => bit.title)).size, 60);
  assert.equal(new Set(DAILY_BITS.map(bit => bit.lines.join('\n'))).size, 60);
  for (const bit of DAILY_BITS) {
    assert.ok(bit.tip.length > 40);
    assert.ok(bit.lines.length >= 2 && bit.lines.length <= 3);
  }
});

test('same Finnish day gives everyone the same entry, rollover changes it', () => {
  const morning = menuDate(new Date('2026-09-07T05:00:00Z'));
  const evening = menuDate(new Date('2026-09-07T20:59:59Z'));
  const midnight = menuDate(new Date('2026-09-07T21:00:00Z'));
  assert.deepEqual(dailyBit(morning), dailyBit(evening));
  assert.notEqual(dailyBit(evening).title, dailyBit(midnight).title);
});

test('no repeated entries during the full rotation or on adjacent days at its boundary', () => {
  const entries = Array.from({ length: 61 }, (_, offset) => dailyBit(new Date(Date.UTC(2026, 8, 7 + offset)).toISOString().slice(0, 10)).title);
  assert.equal(new Set(entries.slice(0, 60)).size, 60);
  assert.equal(entries[0], entries[60]);
  assert.notEqual(entries[59], entries[60]);
});

test('calendar selection works over DST, year changes and leap days', () => {
  for (const [a,b] of [['2026-10-24','2026-10-25'], ['2026-12-31','2027-01-01'], ['2028-02-28','2028-02-29'], ['2028-02-29','2028-03-01']]) {
    assert.notEqual(dailyBit(a).title, dailyBit(b).title);
  }
  assert.ok(dailyBit('2026-01-01').title);
  assert.throws(() => dailyBit('2026-02-30'));
});
