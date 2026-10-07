// Pure scoring logic — no DOM, no storage. Everything here is unit-tested.

/**
 * A game type describes how a game is scored.
 *  winCondition: 'high' | 'low'          — who is winning: most or fewest points
 *  end: { type: 'target' | 'rounds' | 'manual', value }
 *      target: game ends once any player's total reaches `value`
 *      rounds: game ends after `value` rounds
 *      manual: you tap "Finish game" when you're done
 *  roundEntry: 'each' | 'winner-takes'
 *      each:         enter a score for every player each round
 *      winner-takes: pick the round winner, enter what everyone else is holding,
 *                    and the winner scores the sum (official UNO rules)
 *  cardValues: 'uno' | null              — shows the hand calculator
 *  allowNegative: boolean
 */
export const BUILTIN_TYPES = [
  {
    id: 'uno',
    name: 'UNO',
    description: 'Round winner scores the cards left in everyone else’s hand. First to 500 wins.',
    winCondition: 'high',
    end: { type: 'target', value: 500 },
    roundEntry: 'winner-takes',
    cardValues: 'uno',
    allowNegative: false,
    builtin: true,
  },
  {
    id: 'uno-low',
    name: 'UNO (lowest wins)',
    description: 'Everyone scores the cards left in their own hand. When someone hits 500, lowest total wins.',
    winCondition: 'low',
    end: { type: 'target', value: 500 },
    roundEntry: 'each',
    cardValues: 'uno',
    allowNegative: false,
    builtin: true,
  },
  {
    id: 'hearts',
    name: 'Hearts',
    description: 'Game ends when someone reaches 100. Lowest total wins.',
    winCondition: 'low',
    end: { type: 'target', value: 100 },
    roundEntry: 'each',
    cardValues: null,
    allowNegative: false,
    builtin: true,
  },
  {
    id: 'golf',
    name: 'Golf (cards)',
    description: 'Nine holes, lowest total wins. Negative scores allowed.',
    winCondition: 'low',
    end: { type: 'rounds', value: 9 },
    roundEntry: 'each',
    cardValues: null,
    allowNegative: true,
    builtin: true,
  },
  {
    id: 'points-high',
    name: 'Points – highest wins',
    description: 'General-purpose scoring. Finish whenever you like.',
    winCondition: 'high',
    end: { type: 'manual', value: null },
    roundEntry: 'each',
    cardValues: null,
    allowNegative: true,
    builtin: true,
  },
  {
    id: 'points-low',
    name: 'Points – lowest wins',
    description: 'General-purpose scoring. Finish whenever you like.',
    winCondition: 'low',
    end: { type: 'manual', value: null },
    roundEntry: 'each',
    cardValues: null,
    allowNegative: true,
    builtin: true,
  },
];

/** UNO card values: number cards = face value, Skip/Reverse/Draw Two = 20, Wilds = 50. */
export const UNO_CARDS = [
  ...Array.from({ length: 10 }, (_, n) => ({ label: String(n), value: n })),
  { label: 'Skip', value: 20 },
  { label: 'Reverse', value: 20 },
  { label: '+2', value: 20 },
  { label: 'Wild', value: 50 },
  { label: 'Wild +4', value: 50 },
];

export function sumCards(cards) {
  return cards.reduce((sum, c) => sum + c.value, 0);
}

/**
 * Build the per-player scores for a round.
 * For 'each' rounds, `entries` is { playerId: points }.
 * For 'winner-takes' rounds, `entries` is { playerId: handValue } for the losers
 * and the winner gets the sum.
 */
export function roundScores(type, players, entries, winnerId = null) {
  const scores = {};
  if (type.roundEntry === 'winner-takes') {
    let pot = 0;
    for (const p of players) {
      if (p.id === winnerId) continue;
      pot += toInt(entries[p.id]);
      scores[p.id] = 0;
    }
    if (winnerId) scores[winnerId] = pot;
  } else {
    for (const p of players) scores[p.id] = toInt(entries[p.id]);
  }
  return scores;
}

export function toInt(v) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
}

export function totals(game) {
  const t = Object.fromEntries(game.players.map((p) => [p.id, 0]));
  for (const r of game.rounds) {
    for (const p of game.players) t[p.id] += r.scores[p.id] ?? 0;
  }
  return t;
}

/** Players sorted best-first, with shared ranks for ties. */
export function standings(game) {
  const t = totals(game);
  const dir = game.type.winCondition === 'low' ? 1 : -1;
  const sorted = game.players
    .map((p, seat) => ({ player: p, total: t[p.id], seat }))
    .sort((a, b) => dir * (a.total - b.total) || a.seat - b.seat);
  let rank = 0;
  return sorted.map((row, i) => {
    if (i === 0 || row.total !== sorted[i - 1].total) rank = i + 1;
    return { ...row, rank };
  });
}

/** True once the game's end condition has been met. Manual games never end on their own. */
export function isOver(game) {
  const { end } = game.type;
  if (end.type === 'rounds') return game.rounds.length >= end.value;
  if (end.type === 'target') {
    return Object.values(totals(game)).some((v) => v >= end.value);
  }
  return false;
}

/** Ids of the player(s) currently in first place (more than one on a tie). */
export function leaderIds(game) {
  if (game.rounds.length === 0) return [];
  return standings(game)
    .filter((s) => s.rank === 1)
    .map((s) => s.player.id);
}

/** Points still needed to hit the target (high-wins target games only). */
export function pointsToGo(game, playerId) {
  const { end, winCondition } = game.type;
  if (end.type !== 'target' || winCondition !== 'high') return null;
  return Math.max(0, end.value - totals(game)[playerId]);
}

/** Win counts per player across finished games, optionally filtered to one game type. */
export function winStats(games, typeId = null) {
  const stats = new Map();
  for (const g of games) {
    if (g.status !== 'finished') continue;
    if (typeId && g.type.id !== typeId) continue;
    for (const p of g.players) {
      const s = stats.get(p.id) ?? { player: p, played: 0, wins: 0 };
      s.player = p;
      s.played += 1;
      if (g.winnerIds?.includes(p.id)) s.wins += 1;
      stats.set(p.id, s);
    }
  }
  return [...stats.values()].sort((a, b) => b.wins - a.wins || b.played - a.played);
}
