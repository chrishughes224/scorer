import * as store from './store.js';
import {
  UNO_CARDS,
  sumCards,
  roundScores,
  totals,
  standings,
  isOver,
  leaderIds,
  pointsToGo,
  winStats,
  toInt,
} from './scoring.js';

const app = document.getElementById('app');
const tabs = document.getElementById('tabs');
const sheet = document.getElementById('sheet');

// ---------- helpers ----------
const h = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const dot = (p) => `<span class="dot" style="background:${h(p.color)}"></span>`;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const names = (list) => list.map((p) => h(p.name)).join(', ');
const fmtDate = (ts) =>
  new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

function describeType(t) {
  const win = t.winCondition === 'low' ? 'Lowest wins' : 'Highest wins';
  const end =
    t.end.type === 'target' ? `ends at ${t.end.value}` : t.end.type === 'rounds' ? `${t.end.value} rounds` : 'finish any time';
  return `${win} · ${end}`;
}

function go(path) {
  location.hash = path;
}

function route() {
  const [name = '', id] = location.hash.replace(/^#\/?/, '').split('/');
  return { name, id };
}

// Keep the screen awake while a game is on screen.
let wakeLock = null;
async function setWakeLock(on) {
  try {
    if (on && !wakeLock && 'wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => (wakeLock = null));
    } else if (!on && wakeLock) {
      await wakeLock.release();
    }
  } catch {
    /* not supported or denied — fine */
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && route().name === 'game') setWakeLock(true);
});

// ---------- views ----------
const views = {
  '': homeView,
  new: newGameView,
  game: gameView,
  stats: statsView,
  players: playersView,
  settings: settingsView,
  type: typeView,
};

function render() {
  const r = route();
  const view = views[r.name] ?? homeView;
  app.innerHTML = view(r.id);
  const top = ['', 'stats', 'players', 'settings'].includes(r.name);
  tabs.hidden = !top;
  for (const a of tabs.querySelectorAll('a')) a.classList.toggle('active', a.dataset.tab === r.name);
  setWakeLock(r.name === 'game');
}

function header(title, { back = null, actions = '' } = {}) {
  return `<header class="bar">
    ${back !== null ? `<a class="icon-btn" href="#/${back}" aria-label="Back">‹</a>` : ''}
    <h1>${h(title)}</h1>
    <div class="bar-actions">${actions}</div>
  </header>`;
}

function homeView() {
  const all = store.games();
  const active = all.filter((g) => g.status === 'active');
  const done = all.filter((g) => g.status === 'finished').slice(0, 10);
  const card = (g) => {
    const lead = leaderIds(g).map((id) => g.players.find((p) => p.id === id));
    const sub = g.status === 'active'
      ? `${plural(g.rounds.length, 'round')}${lead.length ? ` · ${names(lead)} leading` : ''}`
      : `${fmtDate(g.finishedAt)} · 🏆 ${names(g.players.filter((p) => g.winnerIds.includes(p.id)))}`;
    return `<a class="card game-card" href="#/game/${g.id}">
      <div class="card-title">${h(g.type.name)}</div>
      <div class="dots">${g.players.map(dot).join('')} <span class="muted">${names(g.players)}</span></div>
      <div class="muted small">${sub}</div>
    </a>`;
  };
  return `${header('Scorer')}
  <section class="page">
    <a class="btn primary big" href="#/new">+ New game</a>
    ${active.length ? `<h2>In progress</h2>${active.map(card).join('')}` : ''}
    ${done.length ? `<h2>Recent</h2>${done.map(card).join('')}` : ''}
    ${!all.length ? `<p class="empty">No games yet. Tap <b>New game</b> to start scoring.</p>` : ''}
  </section>`;
}

// New-game draft survives re-renders while you pick things.
let draft = null;
function newGameView() {
  if (!draft) {
    const last = store.games()[0];
    draft = {
      typeId: last?.type.id && store.getType(last.type.id) ? last.type.id : 'uno',
      playerIds: [],
    };
  }
  const types = store.allTypes();
  const type = store.getType(draft.typeId) ?? types[0];
  const roster = store.players();
  const order = (id) => draft.playerIds.indexOf(id);
  const minPlayers = type.roundEntry === 'winner-takes' ? 2 : 1;
  return `${header('New game', { back: '' })}
  <section class="page">
    <h2>Game</h2>
    <div class="choice-list">
      ${types
        .map(
          (t) => `<button class="choice ${t.id === type.id ? 'selected' : ''}" data-action="pick-type" data-id="${t.id}">
            <span class="card-title">${h(t.name)}</span>
            <span class="muted small">${describeType(t)}</span>
          </button>`,
        )
        .join('')}
    </div>
    <h2>Players <span class="muted small">(tap in seating order)</span></h2>
    <div class="chips">
      ${roster
        .map((p) => {
          const n = order(p.id);
          return `<button class="chip ${n >= 0 ? 'selected' : ''}" data-action="toggle-player" data-id="${p.id}">
            ${dot(p)}${h(p.name)}${n >= 0 ? `<span class="badge">${n + 1}</span>` : ''}
          </button>`;
        })
        .join('')}
    </div>
    <form class="inline-form" data-form="add-player">
      <input name="name" placeholder="Add a player" autocomplete="off" maxlength="24" />
      <button class="btn">Add</button>
    </form>
    <button class="btn primary big" data-action="start-game" ${draft.playerIds.length < minPlayers ? 'disabled' : ''}>
      Start ${h(type.name)}
    </button>
  </section>`;
}

function gameView(id) {
  const g = store.getGame(id);
  if (!g) return `${header('Not found', { back: '' })}<p class="empty">That game no longer exists.</p>`;
  const t = totals(g);
  const rows = standings(g);
  const leaders = leaderIds(g);
  const over = isOver(g);
  const finished = g.status === 'finished';
  const target = g.type.end.type === 'target' ? g.type.end.value : null;
  const dealer = g.players[g.rounds.length % g.players.length];

  let banner = '';
  if (finished) {
    banner = `<div class="banner win">🏆 ${names(g.players.filter((p) => g.winnerIds.includes(p.id)))} won!
      <div class="banner-actions">
        <button class="btn primary" data-action="rematch">Rematch</button>
        <button class="btn" data-action="resume">Reopen</button>
      </div></div>`;
  } else if (over) {
    banner = `<div class="banner">Game over — ${names(g.players.filter((p) => leaders.includes(p.id)))} ${leaders.length > 1 ? 'tie' : 'wins'}!
      <div class="banner-actions">
        <button class="btn primary" data-action="finish">Finish game</button>
      </div></div>`;
  }

  const standingsHtml = rows
    .map(({ player: p, total, rank }) => {
      const pct = target ? Math.min(100, Math.max(0, (total / target) * 100)) : 0;
      const toGo = pointsToGo(g, p.id);
      return `<div class="standing ${leaders.includes(p.id) ? 'leader' : ''}">
        <span class="rank">${rank}</span>
        ${dot(p)}
        <span class="name">${h(p.name)}${!finished && p.id === dealer.id ? ' <span class="tag">deals</span>' : ''}</span>
        <span class="total">${total}</span>
        ${target ? `<div class="progress"><div style="width:${pct}%;background:${h(p.color)}"></div></div>` : ''}
        ${toGo !== null && toGo > 0 ? `<span class="muted small togo">${toGo} to go</span>` : ''}
      </div>`;
    })
    .join('');

  const table = g.rounds.length
    ? `<div class="table-wrap"><table class="rounds">
        <thead><tr><th>#</th>${g.players.map((p) => `<th>${dot(p)}<span>${h(p.name)}</span></th>`).join('')}</tr></thead>
        <tbody>
          ${g.rounds
            .map(
              (r, i) => `<tr data-action="${finished ? '' : 'edit-round'}" data-id="${r.id}">
                <td class="muted">${i + 1}</td>
                ${g.players
                  .map((p) => `<td class="${r.winnerId === p.id ? 'round-win' : ''}">${r.scores[p.id] ?? 0}</td>`)
                  .join('')}
              </tr>`,
            )
            .join('')}
        </tbody>
        <tfoot><tr><th>Σ</th>${g.players.map((p) => `<th>${t[p.id]}</th>`).join('')}</tr></tfoot>
      </table></div>
      ${finished ? '' : '<p class="muted small center">Tap a round to fix it.</p>'}`
    : `<p class="empty">No rounds yet. ${h(dealer.name)} deals first.</p>`;

  return `${header(g.type.name, {
    back: '',
    actions: `<button class="icon-btn" data-action="game-menu" aria-label="Game options">⋯</button>`,
  })}
  <section class="page game">
    <p class="muted small center">${describeType(g.type)}</p>
    ${banner}
    <div class="standings">${standingsHtml}</div>
    <h2>Rounds</h2>
    ${table}
  </section>
  ${finished ? '' : `<button class="fab" data-action="add-round">+ Round ${g.rounds.length + 1}</button>`}`;
}

function statsView(typeId = '') {
  const types = store.allTypes();
  const stats = winStats(store.games(), typeId || null);
  const finished = store.games().filter((g) => g.status === 'finished' && (!typeId || g.type.id === typeId));
  return `${header('Stats')}
  <section class="page">
    <select data-action="stats-filter">
      <option value="">All games</option>
      ${types.map((t) => `<option value="${t.id}" ${t.id === typeId ? 'selected' : ''}>${h(t.name)}</option>`).join('')}
    </select>
    ${
      stats.length
        ? `<table class="stats">
            <thead><tr><th>Player</th><th>Wins</th><th>Played</th><th>Win %</th></tr></thead>
            <tbody>${stats
              .map(
                (s) => `<tr><td>${dot(s.player)}${h(s.player.name)}</td><td>${s.wins}</td><td>${s.played}</td>
                  <td>${Math.round((s.wins / s.played) * 100)}%</td></tr>`,
              )
              .join('')}</tbody>
          </table>
          <h2>History</h2>
          ${finished
            .map(
              (g) => `<a class="card row-card" href="#/game/${g.id}">
                <span>${h(g.type.name)} <span class="muted small">${fmtDate(g.finishedAt)}</span></span>
                <span>🏆 ${names(g.players.filter((p) => g.winnerIds.includes(p.id)))}</span>
              </a>`,
            )
            .join('')}`
        : '<p class="empty">Finish a game to see stats here.</p>'
    }
  </section>`;
}

function playersView() {
  const roster = store.players();
  return `${header('Players')}
  <section class="page">
    ${roster
      .map(
        (p) => `<div class="card row-card">
          <label class="color-pick">${dot(p)}<input type="color" value="${h(p.color)}" data-action="player-color" data-id="${p.id}" /></label>
          <span class="grow">${h(p.name)}</span>
          <button class="btn small" data-action="rename-player" data-id="${p.id}">Rename</button>
          <button class="btn small danger" data-action="delete-player" data-id="${p.id}">Remove</button>
        </div>`,
      )
      .join('')}
    ${!roster.length ? '<p class="empty">Add the people you play with.</p>' : ''}
    <form class="inline-form" data-form="add-player">
      <input name="name" placeholder="Player name" autocomplete="off" maxlength="24" />
      <button class="btn">Add</button>
    </form>
  </section>`;
}

function settingsView() {
  return `${header('Settings')}
  <section class="page">
    <h2>Game types</h2>
    ${store
      .allTypes()
      .map(
        (t) => `<a class="card" href="#/type/${t.id}">
          <div class="card-title">${h(t.name)} ${t.builtin ? '<span class="tag">built-in</span>' : ''}</div>
          <div class="muted small">${describeType(t)}</div>
        </a>`,
      )
      .join('')}
    <a class="btn big" href="#/type/new">+ New game type</a>
    <h2>Backup</h2>
    <p class="muted small">Scores are stored only on this phone. Export a backup to move them to another device.</p>
    <div class="row">
      <button class="btn" data-action="export">Export</button>
      <label class="btn">Import<input type="file" accept="application/json,.json" data-action="import" hidden /></label>
    </div>
  </section>`;
}

function typeView(id) {
  const existing = id === 'new' ? null : store.getType(id);
  const t = existing ?? {
    name: '',
    description: '',
    winCondition: 'high',
    end: { type: 'target', value: 500 },
    roundEntry: 'each',
    cardValues: null,
    allowNegative: false,
  };
  const ro = existing?.builtin;
  const radio = (name, value, label, checked) =>
    `<label class="seg"><input type="radio" name="${name}" value="${value}" ${checked ? 'checked' : ''} ${ro ? 'disabled' : ''}/><span>${label}</span></label>`;
  return `${header(existing ? t.name : 'New game type', { back: 'settings' })}
  <section class="page">
    ${ro ? `<p class="banner">Built-in types can’t be changed, but you can make a copy and tweak it.</p>` : ''}
    <form class="type-form" data-form="type" data-id="${existing && !ro ? existing.id : ''}">
      <label>Name<input name="name" required maxlength="40" value="${h(t.name)}" ${ro ? 'disabled' : ''}/></label>
      <label>Description<input name="description" maxlength="140" value="${h(t.description)}" ${ro ? 'disabled' : ''}/></label>
      <fieldset><legend>Who wins?</legend><div class="segs">
        ${radio('winCondition', 'high', 'Highest score', t.winCondition === 'high')}
        ${radio('winCondition', 'low', 'Lowest score', t.winCondition === 'low')}
      </div></fieldset>
      <fieldset><legend>Game ends</legend><div class="segs">
        ${radio('endType', 'target', 'At a score', t.end.type === 'target')}
        ${radio('endType', 'rounds', 'After rounds', t.end.type === 'rounds')}
        ${radio('endType', 'manual', 'When we say', t.end.type === 'manual')}
      </div>
      <label class="end-value">Score / rounds<input name="endValue" inputmode="numeric" pattern="[0-9]*" value="${h(t.end.value ?? '')}" ${ro ? 'disabled' : ''}/></label>
      </fieldset>
      <fieldset><legend>Each round</legend><div class="segs">
        ${radio('roundEntry', 'each', 'Everyone scores', t.roundEntry === 'each')}
        ${radio('roundEntry', 'winner-takes', 'Winner takes others’ points', t.roundEntry === 'winner-takes')}
      </div></fieldset>
      <label class="check"><input type="checkbox" name="cardValues" ${t.cardValues === 'uno' ? 'checked' : ''} ${ro ? 'disabled' : ''}/> UNO card calculator</label>
      <label class="check"><input type="checkbox" name="allowNegative" ${t.allowNegative ? 'checked' : ''} ${ro ? 'disabled' : ''}/> Allow negative scores</label>
      ${ro ? '' : '<button class="btn primary big">Save</button>'}
    </form>
    ${existing ? `<button class="btn big" data-action="copy-type" data-id="${existing.id}">Make a copy</button>` : ''}
    ${existing && !ro ? `<button class="btn big danger" data-action="delete-type" data-id="${existing.id}">Delete</button>` : ''}
  </section>`;
}

// ---------- round entry sheet ----------
let entry = null; // { gameId, roundId, winnerId, values: {pid: string}, cards: {pid: card[]}, calcFor }

function openRoundSheet(game, round = null) {
  entry = {
    gameId: game.id,
    roundId: round?.id ?? null,
    winnerId: round?.winnerId ?? null,
    values: Object.fromEntries(
      game.players.map((p) => {
        const v = round ? (round.entries ?? round.scores)[p.id] : '';
        return [p.id, String(v ?? '')];
      }),
    ),
    cards: round?.cards ? structuredClone(round.cards) : {},
    calcFor: null,
  };
  renderSheet();
  sheet.showModal();
  if (game.type.roundEntry === 'each') sheet.querySelector('input')?.focus();
}

function renderSheet() {
  const g = store.getGame(entry.gameId);
  const t = g.type;
  const n = entry.roundId ? g.rounds.findIndex((r) => r.id === entry.roundId) + 1 : g.rounds.length + 1;

  if (entry.calcFor) {
    const p = g.players.find((x) => x.id === entry.calcFor);
    const cards = entry.cards[p.id] ?? [];
    sheet.innerHTML = `<div class="sheet-body">
      <header class="bar"><h1>${dot(p)} ${h(p.name)}’s cards</h1></header>
      <div class="calc-total">${sumCards(cards)}</div>
      <div class="hand">${
        cards.map((c, i) => `<button class="card-chip" data-action="calc-remove" data-i="${i}">${h(c.label)} ×</button>`).join('') ||
        '<span class="muted small">Tap each card left in the hand</span>'
      }</div>
      <div class="card-pad">
        ${UNO_CARDS.map((c) => `<button class="pad-btn ${c.value === 50 ? 'wild' : c.value === 20 ? 'action' : ''}" data-action="calc-add" data-label="${h(c.label)}">${h(c.label)}<small>${c.value}</small></button>`).join('')}
      </div>
      <div class="row">
        <button class="btn" data-action="calc-clear">Clear</button>
        <button class="btn primary grow" data-action="calc-done">Use ${sumCards(cards)}</button>
      </div>
    </div>`;
    return;
  }

  const winnerTakes = t.roundEntry === 'winner-takes';
  const rows = g.players
    .filter((p) => !(winnerTakes && p.id === entry.winnerId))
    .map(
      (p) => `<div class="entry-row">
        <span class="name">${dot(p)}${h(p.name)}</span>
        ${t.allowNegative ? `<button type="button" class="icon-btn" data-action="negate" data-id="${p.id}" aria-label="Make negative">±</button>` : ''}
        <input type="text" inputmode="numeric" pattern="-?[0-9]*" data-pid="${p.id}" value="${h(entry.values[p.id])}" placeholder="0" aria-label="${h(p.name)} points" />
        ${t.cardValues === 'uno' ? `<button type="button" class="btn small" data-action="calc-open" data-id="${p.id}">Cards</button>` : ''}
      </div>`,
    )
    .join('');

  sheet.innerHTML = `<form class="sheet-body" data-form="round" method="dialog">
    <header class="bar">
      <h1>Round ${n}</h1>
      <div class="bar-actions"><button type="button" class="icon-btn" data-action="close-sheet" aria-label="Close">✕</button></div>
    </header>
    ${
      winnerTakes
        ? `<p class="label">Who won the round?</p>
           <div class="chips">${g.players
             .map(
               (p) => `<button type="button" class="chip ${entry.winnerId === p.id ? 'selected' : ''}" data-action="pick-winner" data-id="${p.id}">${dot(p)}${h(p.name)}</button>`,
             )
             .join('')}</div>
           ${entry.winnerId ? `<p class="label">Points left in everyone else’s hand</p>${rows}` : ''}`
        : rows
    }
    <p class="sheet-summary" id="sheet-summary">${summaryText(g)}</p>
    <div class="row">
      ${entry.roundId ? '<button type="button" class="btn danger" data-action="delete-round">Delete</button>' : ''}
      <button class="btn primary grow" ${winnerTakes && !entry.winnerId ? 'disabled' : ''}>Save round</button>
    </div>
  </form>`;
}

function summaryText(g) {
  if (g.type.roundEntry !== 'winner-takes' || !entry.winnerId) return '';
  const s = roundScores(g.type, g.players, entry.values, entry.winnerId);
  const w = g.players.find((p) => p.id === entry.winnerId);
  return `${h(w.name)} scores <b>${s[w.id]}</b>`;
}

function saveRound() {
  const g = store.getGame(entry.gameId);
  const values = Object.fromEntries(Object.entries(entry.values).map(([k, v]) => [k, toInt(v)]));
  if (g.type.roundEntry === 'winner-takes') delete values[entry.winnerId];
  const round = {
    id: entry.roundId ?? store.uid(),
    scores: roundScores(g.type, g.players, values, entry.winnerId),
    entries: values,
    winnerId: entry.winnerId,
    cards: entry.cards,
    at: Date.now(),
  };
  const i = g.rounds.findIndex((r) => r.id === round.id);
  if (i >= 0) g.rounds[i] = round;
  else g.rounds.push(round);
  store.updateGame(g);
  closeSheet();
  render();
}

function closeSheet() {
  entry = null;
  if (sheet.open) sheet.close();
}

sheet.addEventListener('close', () => (entry = null));
sheet.addEventListener('click', (e) => {
  if (e.target === sheet) closeSheet(); // tap on backdrop
});
sheet.addEventListener('input', (e) => {
  const pid = e.target.dataset.pid;
  if (!pid || !entry) return;
  entry.values[pid] = e.target.value.replace(/[^0-9-]/g, '');
  // Typing a number by hand replaces whatever the calculator had.
  delete entry.cards[pid];
  const g = store.getGame(entry.gameId);
  document.getElementById('sheet-summary').innerHTML = summaryText(g);
});

// ---------- actions ----------
const actions = {
  'pick-type': (el) => {
    draft.typeId = el.dataset.id;
    render();
  },
  'toggle-player': (el) => {
    const id = el.dataset.id;
    const i = draft.playerIds.indexOf(id);
    if (i >= 0) draft.playerIds.splice(i, 1);
    else draft.playerIds.push(id);
    render();
  },
  'start-game': () => {
    const type = store.getType(draft.typeId);
    const ps = draft.playerIds.map(store.getPlayer).filter(Boolean);
    const g = store.createGame(type, ps);
    draft = null;
    go(`/game/${g.id}`);
  },
  'add-round': () => openRoundSheet(store.getGame(route().id)),
  'edit-round': (el) => {
    const g = store.getGame(route().id);
    openRoundSheet(g, g.rounds.find((r) => r.id === el.dataset.id));
  },
  'delete-round': () => {
    if (!confirm('Delete this round?')) return;
    const g = store.getGame(entry.gameId);
    g.rounds = g.rounds.filter((r) => r.id !== entry.roundId);
    store.updateGame(g);
    closeSheet();
    render();
  },
  'close-sheet': closeSheet,
  'pick-winner': (el) => {
    entry.winnerId = el.dataset.id;
    renderSheet();
  },
  negate: (el) => {
    const id = el.dataset.id;
    const v = entry.values[id] || '';
    entry.values[id] = v.startsWith('-') ? v.slice(1) : `-${v}`;
    renderSheet();
    sheet.querySelector(`input[data-pid="${id}"]`)?.focus();
  },
  'calc-open': (el) => {
    entry.calcFor = el.dataset.id;
    renderSheet();
  },
  'calc-add': (el) => {
    const card = UNO_CARDS.find((c) => c.label === el.dataset.label);
    (entry.cards[entry.calcFor] ??= []).push(card);
    renderSheet();
  },
  'calc-remove': (el) => {
    entry.cards[entry.calcFor].splice(Number(el.dataset.i), 1);
    renderSheet();
  },
  'calc-clear': () => {
    entry.cards[entry.calcFor] = [];
    renderSheet();
  },
  'calc-done': () => {
    const pid = entry.calcFor;
    entry.values[pid] = String(sumCards(entry.cards[pid] ?? []));
    entry.calcFor = null;
    renderSheet();
  },
  finish: () => {
    closeSheet();
    const g = store.getGame(route().id);
    g.status = 'finished';
    g.winnerIds = leaderIds(g);
    g.finishedAt = Date.now();
    store.updateGame(g);
    render();
  },
  resume: () => {
    const g = store.getGame(route().id);
    g.status = 'active';
    g.winnerIds = [];
    g.finishedAt = null;
    store.updateGame(g);
    render();
  },
  rematch: () => {
    const g = store.getGame(route().id);
    // Rotate seats so a different person deals first.
    const ps = [...g.players.slice(1), g.players[0]].map((p) => store.getPlayer(p.id) ?? p);
    const ng = store.createGame(store.getType(g.type.id) ?? g.type, ps);
    go(`/game/${ng.id}`);
  },
  'game-menu': () => {
    const g = store.getGame(route().id);
    sheet.innerHTML = `<div class="sheet-body menu">
      ${g.status === 'active' && g.rounds.length ? '<button class="btn big" data-action="finish">Finish game now</button>' : ''}
      <button class="btn big danger" data-action="delete-game">Delete game</button>
      <button class="btn big" data-action="close-sheet">Cancel</button>
    </div>`;
    sheet.showModal();
  },
  'delete-game': () => {
    if (!confirm('Delete this game for good?')) return;
    store.deleteGame(route().id);
    go('/');
  },
  'stats-filter': (el) => go(`/stats/${el.value}`),
  'rename-player': (el) => {
    const p = store.getPlayer(el.dataset.id);
    const name = prompt('New name', p.name)?.trim();
    if (name) store.updatePlayer(p.id, { name });
    render();
  },
  'player-color': (el) => {
    store.updatePlayer(el.dataset.id, { color: el.value });
    render();
  },
  'delete-player': (el) => {
    const p = store.getPlayer(el.dataset.id);
    if (confirm(`Remove ${p.name}? Their past games are kept.`)) store.deletePlayer(p.id);
    render();
  },
  'copy-type': (el) => {
    const t = store.getType(el.dataset.id);
    const copy = { ...structuredClone(t), id: store.uid(), name: `${t.name} (copy)`, builtin: false };
    store.saveType(copy);
    go(`/type/${copy.id}`);
  },
  'delete-type': (el) => {
    if (!confirm('Delete this game type? Games already played keep their scores.')) return;
    store.deleteType(el.dataset.id);
    go('/settings');
  },
  export: () => {
    const blob = new Blob([store.exportData()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `scorer-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  },
  import: async (el) => {
    const file = el.files[0];
    if (!file || !confirm('Replace everything on this phone with the backup?')) return;
    try {
      store.importData(await file.text());
      alert('Backup restored.');
      render();
    } catch (err) {
      alert(err.message);
    }
  },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.tagName === 'SELECT' || el.type === 'file' || el.type === 'color') return;
  const fn = actions[el.dataset.action];
  if (fn) {
    e.preventDefault();
    fn(el);
  }
});

document.addEventListener('change', (e) => {
  const el = e.target;
  if (['stats-filter', 'import', 'player-color'].includes(el.dataset.action)) actions[el.dataset.action](el);
});

const forms = {
  'add-player': (form) => {
    const name = form.name.value.trim();
    if (!name) return;
    const p = store.addPlayer(name);
    if (draft && route().name === 'new') draft.playerIds.push(p.id);
    render();
    app.querySelector('[data-form="add-player"] input')?.focus();
  },
  round: saveRound,
  type: (form) => {
    const f = new FormData(form);
    const endType = f.get('endType');
    const endValue = toInt(f.get('endValue'));
    if (endType !== 'manual' && endValue <= 0) return alert('Enter the score or number of rounds the game ends at.');
    const type = {
      id: form.dataset.id || undefined,
      name: f.get('name').trim(),
      description: f.get('description').trim(),
      winCondition: f.get('winCondition'),
      end: { type: endType, value: endType === 'manual' ? null : endValue },
      roundEntry: f.get('roundEntry'),
      cardValues: f.get('cardValues') ? 'uno' : null,
      allowNegative: !!f.get('allowNegative'),
      builtin: false,
    };
    store.saveType(type);
    go('/settings');
  },
};

document.addEventListener('submit', (e) => {
  const fn = forms[e.target.dataset.form];
  if (fn) {
    e.preventDefault();
    fn(e.target);
  }
});

window.addEventListener('hashchange', () => {
  closeSheet();
  if (route().name !== 'new') draft = null;
  render();
  window.scrollTo(0, 0);
});

render();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
