// Persistence: everything lives in localStorage on this device.
import { BUILTIN_TYPES } from './scoring.js';

const KEY = 'scorer:v1';
const COLORS = ['#e53935', '#1e88e5', '#43a047', '#fdd835', '#8e24aa', '#fb8c00', '#00acc1', '#d81b60'];

const empty = () => ({ players: [], customTypes: [], games: [] });

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...empty(), ...JSON.parse(raw) } : empty();
  } catch {
    return empty();
  }
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (err) {
    console.error('Could not save', err);
  }
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

// ---- Game types ----
export const allTypes = () => [...BUILTIN_TYPES, ...state.customTypes];
export const getType = (id) => allTypes().find((t) => t.id === id);

export function saveType(type) {
  const i = state.customTypes.findIndex((t) => t.id === type.id);
  if (i >= 0) state.customTypes[i] = type;
  else state.customTypes.push({ ...type, id: type.id || uid(), builtin: false });
  save();
}

export function deleteType(id) {
  state.customTypes = state.customTypes.filter((t) => t.id !== id);
  save();
}

// ---- Players ----
export const players = () => state.players;
export const getPlayer = (id) => state.players.find((p) => p.id === id);

export function addPlayer(name) {
  const used = new Set(state.players.map((p) => p.color));
  const color = COLORS.find((c) => !used.has(c)) ?? COLORS[state.players.length % COLORS.length];
  const p = { id: uid(), name: name.trim(), color };
  state.players.push(p);
  save();
  return p;
}

export function updatePlayer(id, changes) {
  const p = getPlayer(id);
  if (!p) return;
  Object.assign(p, changes);
  // Keep names in games in sync so history shows the current name.
  for (const g of state.games) {
    for (const gp of g.players) if (gp.id === id) Object.assign(gp, changes);
  }
  save();
}

export function deletePlayer(id) {
  state.players = state.players.filter((p) => p.id !== id);
  save();
}

// ---- Games ----
export const games = () => state.games;
export const getGame = (id) => state.games.find((g) => g.id === id);

export function createGame(type, gamePlayers) {
  const g = {
    id: uid(),
    // Snapshot the type so later edits to it don't rewrite old games.
    type: structuredClone(type),
    players: gamePlayers.map((p) => ({ id: p.id, name: p.name, color: p.color })),
    rounds: [],
    status: 'active',
    winnerIds: [],
    createdAt: Date.now(),
    finishedAt: null,
  };
  state.games.unshift(g);
  save();
  return g;
}

export function updateGame(game) {
  const i = state.games.findIndex((g) => g.id === game.id);
  if (i >= 0) state.games[i] = game;
  save();
}

export function deleteGame(id) {
  state.games = state.games.filter((g) => g.id !== id);
  save();
}

// ---- Backup ----
export const exportData = () => JSON.stringify(state, null, 2);

export function importData(json) {
  const data = JSON.parse(json);
  if (!Array.isArray(data.games) || !Array.isArray(data.players)) {
    throw new Error('That file doesn’t look like a Scorer backup.');
  }
  state = { ...empty(), ...data };
  save();
}
