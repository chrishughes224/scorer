import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILTIN_TYPES,
  UNO_CARDS,
  sumCards,
  roundScores,
  totals,
  standings,
  isOver,
  leaderIds,
  pointsToGo,
  winStats,
} from '../js/scoring.js';

const type = (id) => BUILTIN_TYPES.find((t) => t.id === id);
const players = [
  { id: 'a', name: 'Ann' },
  { id: 'b', name: 'Ben' },
  { id: 'c', name: 'Cat' },
];
const game = (typeId, rounds) => ({
  type: type(typeId),
  players,
  rounds: rounds.map((scores) => ({ scores })),
});

test('UNO card values follow the official rules', () => {
  const v = (label) => UNO_CARDS.find((c) => c.label === label).value;
  assert.equal(v('7'), 7);
  assert.equal(v('Skip'), 20);
  assert.equal(v('+2'), 20);
  assert.equal(v('Wild +4'), 50);
  assert.equal(sumCards([{ value: 7 }, { value: 20 }, { value: 50 }]), 77);
});

test('winner-takes round gives the winner the sum of the other hands', () => {
  const s = roundScores(type('uno'), players, { b: 30, c: '12' }, 'a');
  assert.deepEqual(s, { a: 42, b: 0, c: 0 });
});

test('winner-takes ignores any value typed for the winner', () => {
  const s = roundScores(type('uno'), players, { a: 99, b: 5, c: 5 }, 'a');
  assert.equal(s.a, 10);
});

test('each-player round records every score, blanks as zero', () => {
  const s = roundScores(type('hearts'), players, { a: 13, b: '', c: '-4' });
  assert.deepEqual(s, { a: 13, b: 0, c: -4 });
});

test('totals and standings for highest-wins', () => {
  const g = game('uno', [
    { a: 100, b: 0, c: 0 },
    { a: 0, b: 150, c: 0 },
  ]);
  assert.deepEqual(totals(g), { a: 100, b: 150, c: 0 });
  assert.deepEqual(
    standings(g).map((s) => [s.player.id, s.rank]),
    [['b', 1], ['a', 2], ['c', 3]],
  );
});

test('standings for lowest-wins, ties share a rank', () => {
  const g = game('hearts', [{ a: 10, b: 5, c: 5 }]);
  assert.deepEqual(
    standings(g).map((s) => [s.player.id, s.rank]),
    [['b', 1], ['c', 1], ['a', 3]],
  );
  assert.deepEqual(leaderIds(g), ['b', 'c']);
});

test('no leader before any rounds are played', () => {
  assert.deepEqual(leaderIds(game('uno', [])), []);
});

test('target games end when anyone reaches the target', () => {
  assert.equal(isOver(game('uno', [{ a: 499, b: 0, c: 0 }])), false);
  assert.equal(isOver(game('uno', [{ a: 499, b: 0, c: 0 }, { a: 1, b: 0, c: 0 }])), true);
  // Hearts: reaching 100 ends the game even though low wins.
  assert.equal(isOver(game('hearts', [{ a: 100, b: 0, c: 0 }])), true);
});

test('rounds games end after N rounds; manual games never auto-end', () => {
  const nine = Array.from({ length: 9 }, () => ({ a: 1, b: 2, c: 3 }));
  assert.equal(isOver(game('golf', nine.slice(0, 8))), false);
  assert.equal(isOver(game('golf', nine)), true);
  assert.equal(isOver(game('points-high', [{ a: 1e6, b: 0, c: 0 }])), false);
});

test('pointsToGo only applies to highest-wins target games', () => {
  const g = game('uno', [{ a: 120, b: 0, c: 0 }]);
  assert.equal(pointsToGo(g, 'a'), 380);
  assert.equal(pointsToGo(game('hearts', []), 'a'), null);
});

test('winStats counts finished games only and filters by type', () => {
  const games = [
    { status: 'finished', type: type('uno'), players, winnerIds: ['a'] },
    { status: 'finished', type: type('uno'), players, winnerIds: ['a', 'b'] },
    { status: 'finished', type: type('hearts'), players, winnerIds: ['c'] },
    { status: 'active', type: type('uno'), players, winnerIds: [] },
  ];
  const all = winStats(games);
  assert.deepEqual(all.map((s) => [s.player.id, s.wins, s.played]), [
    ['a', 2, 3],
    ['b', 1, 3],
    ['c', 1, 3],
  ]);
  const uno = winStats(games, 'uno');
  assert.deepEqual(uno.map((s) => [s.player.id, s.wins]), [['a', 2], ['b', 1], ['c', 0]]);
});
