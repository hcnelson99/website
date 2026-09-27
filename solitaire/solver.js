'use strict';
// Klondike solvers, shared by the page (inside a Web Worker) and bench.js (Node).
//
// Everything lives inside solverModule() so the page can turn it into a Worker with
// `(${solverModule})()` — that works even when index.html is opened from file://.
//
// Solver state:
//   tab:   7 columns of card codes, bottom → top. The first down[i] cards are face down.
//   down:  number of face-down cards in each column.
//   found: rank on the foundation of each suit (0 = empty), indexed by suit.
//   talon: stock + waste as one array in deal order; talon[p-1] is the waste top.
//   p:     number of cards currently in the waste.
//   draw:  1 or 3.
// Card code = suit * 13 + (rank - 1), suits ordered S, H, D, C. UNK (52) is a face-down card
// whose identity the heuristic player is not allowed to know.
//
// The talon is handled as a macro: with unlimited redeals, any card that can be brought to the
// waste top by dealing/recycling is playable, so "deal until X is on top, then play X" is one move.

function solverModule() {
  const UNK = 52;
  const suitOf = c => (c / 13) | 0;
  const rankOf = c => c % 13 + 1;
  const isRed = c => { const s = suitOf(c); return s === 1 || s === 2; };

  function clone(s) {
    return { tab: s.tab.map(c => c.slice()), down: s.down.slice(), found: s.found.slice(), talon: s.talon.slice(), p: s.p, draw: s.draw, rev: 0 };
  }

  const isWon = s => s.found[0] + s.found[1] + s.found[2] + s.found[3] === 52;

  function mask(s) {
    const m = clone(s);
    m.tab.forEach((col, i) => { for (let j = 0; j < m.down[i]; j++) col[j] = UNK; });
    return m;
  }

  function key(s) {
    const cols = new Array(7);
    for (let i = 0; i < 7; i++) cols[i] = String.fromCharCode(65 + s.down[i], ...s.tab[i].map(c => c + 48));
    cols.sort();
    return cols.join('|') + '#' + String.fromCharCode(...s.talon.map(c => c + 48)) + '#' + s.p;
  }

  // Waste positions q (1-based) that can be brought to the top of the waste.
  function talonTops(s) {
    const L = s.talon.length, out = [];
    const seen = new Uint8Array(L + 1);
    const add = q => { if (q > 0 && !seen[q]) { seen[q] = 1; out.push(q); } };
    add(s.p);
    for (let q = s.p; q < L;) { q = Math.min(q + s.draw, L); add(q); }
    for (let q = 0; q < L;) { q = Math.min(q + s.draw, L); add(q); }
    return out;
  }

  const canFound = (s, c) => c !== UNK && s.found[suitOf(c)] === rankOf(c) - 1;
  // Safe to auto-play: nothing could ever need to be placed on it (every ace and 2, or any card
  // whose rank is at most one above both opposite-colour foundations).
  function isSafe(s, c) {
    const r = rankOf(c);
    if (r <= 2) return true;
    const red = isRed(c), f = s.found;
    return red ? f[0] >= r - 1 && f[3] >= r - 1 : f[1] >= r - 1 && f[2] >= r - 1;
  }
  // Shared with the game: may tableau card c go to the foundation automatically?
  // found = rank on each suit's foundation (S, H, D, C).
  const isSafeToFoundation = (found, c) => found[suitOf(c)] === rankOf(c) - 1 && isSafe({ found }, c);
  const fitsOn = (c, u) => u !== UNK && rankOf(u) === rankOf(c) + 1 && isRed(u) !== isRed(c);

  function fix(s, i) {
    if (s.down[i] > 0 && s.tab[i].length === s.down[i]) { s.down[i]--; s.rev++; }
  }

  function apply(s, m) {
    switch (m.k) {
      case 'tf': { const c = s.tab[m.i].pop(); s.found[suitOf(c)]++; fix(s, m.i); break; }
      case 'tt': { const run = s.tab[m.from].splice(m.j); for (const c of run) s.tab[m.to].push(c); fix(s, m.from); break; }
      case 'wf': { const c = s.talon.splice(m.q - 1, 1)[0]; s.p = m.q - 1; s.found[suitOf(c)]++; break; }
      case 'wt': { const c = s.talon.splice(m.q - 1, 1)[0]; s.p = m.q - 1; s.tab[m.to].push(c); break; }
      case 'ft': { s.found[m.s]--; s.tab[m.to].push(m.s * 13 + s.found[m.s]); break; }
    }
    return s;
  }

  // Play every safe foundation move from the tableau. Returns the moves made when `rec` is given.
  // Deck cards are never auto-played: taking one out shifts every later deck card down a place,
  // which changes which cards line up in future passes and can cost a win.
  function autoplay(s, rec) {
    for (let moved = true; moved;) {
      moved = false;
      for (let i = 0; i < 7; i++) {
        const col = s.tab[i], c = col[col.length - 1];
        if (col.length && c !== UNK && isSafeToFoundation(s.found, c)) {
          const m = { k: 'tf', i };
          apply(s, m); if (rec) rec.push(m); moved = true;
        }
      }
    }
  }

  // Candidate moves, best-first. Stack moves are only generated when they achieve something:
  // turning over a face-down card, emptying a column, or freeing a card for the foundation.
  function genMoves(s) {
    const tf = [], rev = [], tal = [], empt = [], part = [], ft = [];
    const { tab, down, found } = s;
    let firstEmpty = -1;
    for (let i = 0; i < 7; i++) if (!tab[i].length) { firstEmpty = i; break; }
    const targets = (c, from, out, make) => {
      for (let t = 0; t < 7; t++) {
        if (t === from) continue;
        const tc = tab[t];
        if (!tc.length) { if (t !== firstEmpty || rankOf(c) !== 13) continue; }
        else if (!fitsOn(c, tc[tc.length - 1])) continue;
        out.push(make(t));
      }
    };
    for (let i = 0; i < 7; i++) {
      const col = tab[i], n = col.length;
      if (!n) continue;
      if (canFound(s, col[n - 1])) tf.push({ k: 'tf', i });
      for (let j = down[i]; j < n; j++) {
        const c = col[j];
        if (c === UNK) continue;
        let out;
        if (j === down[i]) out = down[i] > 0 ? rev : empt;
        else if (canFound(s, col[j - 1])) out = part;
        else continue;
        const before = out.length;
        targets(c, i, out, t => ({ k: 'tt', from: i, j, to: t }));
        // Moving a whole column onto an empty one changes nothing.
        if (out === empt) for (let k = out.length - 1; k >= before; k--) if (!tab[out[k].to].length) out.splice(k, 1);
      }
    }
    for (const q of talonTops(s)) {
      const c = s.talon[q - 1];
      if (canFound(s, c)) tal.push({ k: 'wf', q });
      targets(c, -1, tal, t => ({ k: 'wt', q, to: t }));
    }
    for (let su = 0; su < 4; su++) {
      const r = found[su];
      if (r < 2) continue;
      const c = su * 13 + r - 1;
      for (let t = 0; t < 7; t++) if (tab[t].length && fitsOn(c, tab[t][tab[t].length - 1])) ft.push({ k: 'ft', s: su, to: t });
    }
    rev.sort((a, b) => down[b.from] - down[a.from]);
    return tf.concat(rev, tal, empt, part, ft);
  }

  // ---------- Perfect-information solver ----------
  // Depth-first search over the full (unmasked) state with a transposition table.
  // 'lose' means the search space was exhausted. Because genMoves prunes rarely-useful moves
  // (e.g. partial stack moves that don't free a foundation card), that's near-certain, not a proof.
  // Returns { status: 'win' | 'lose' | 'unknown', move, moves, nodes }.
  function solvePerfect(s0, opts = {}) {
    const maxNodes = opts.maxNodes || 2e6, deadline = Date.now() + (opts.maxMs || 1e9);
    const root = clone(s0);
    const rec = [];
    autoplay(root, rec);
    const seen = new Set();
    let nodes = 0, aborted = false;
    const path = [];

    function dfs(s) {
      if (isWon(s)) return true;
      if (++nodes > maxNodes || ((nodes & 4095) === 0 && Date.now() > deadline)) { aborted = true; return false; }
      const k = key(s);
      if (seen.has(k)) return false;
      seen.add(k);
      for (const m of genMoves(s)) {
        const ns = apply(clone(s), m);
        const auto = [];
        autoplay(ns, auto);
        path.push(m, ...auto);
        if (dfs(ns)) return true;
        path.length -= 1 + auto.length;
        if (aborted) return false;
      }
      return false;
    }

    const won = dfs(root);
    const status = won ? 'win' : aborted ? 'unknown' : 'lose';
    const moves = won ? rec.concat(path) : rec;
    return { status, move: won ? moves[0] || null : (rec[0] || null), moves: won ? moves.length : 0, nodes, path: opts.path && won ? moves : undefined };
  }

  // ---------- Following a plan ----------
  // A fresh search from each position can pick a different winning line every time, so hints
  // that re-solve after every move can loop (suggest a move, then its reverse). Instead the game
  // keeps the whole winning line and, while the position is still on it, hints its next step.
  // Positions are matched ignoring the waste size, so dealing towards a card keeps the plan.
  const planKey = s => { const k = key(s); return k.slice(0, k.lastIndexOf('#')); };

  function makePlan(s0, path) {
    const s = clone(s0), steps = [];
    for (const m of path) { steps.push({ key: planKey(s), move: m }); apply(s, m); }
    return steps;
  }

  // Next move of the plan from position s, or null if s isn't on the plan (then re-solve).
  function planMove(plan, s) {
    if (!plan) return null;
    const k = planKey(s);
    let i = -1;
    for (let j = plan.length - 1; j >= 0; j--) if (plan[j].key === k) { i = j; break; }
    if (i < 0) return null;
    const m = plan[i].move;
    if ((m.k === 'wf' || m.k === 'wt') && !talonTops(s).includes(m.q)) return null; // dealt past it
    return { move: m, remaining: plan.length - i };
  }

  // ---------- Heuristic player ----------
  // Only ever sees a masked state: face-down tableau cards are UNK. (It does know the stock
  // order, as a player who has cycled through it once and remembers it would — cycling is free.)
  //
  // Main strategy (heuristicMove): sample possible worlds. Deal the unseen cards randomly into the
  // face-down slots many times, solve each world with the perfect solver on a small budget, and
  // play the move that wins in the most worlds. greedyMove is a cheaper fallback: search the known
  // cards for the best line that ends by turning over a card, scored by evaluate().
  const WEIGHTS = { found: 10, down: 25, down2: 3, empty: 8, talon: 0 };
  function evaluate(s, w = WEIGHTS) {
    let v = 0;
    for (let i = 0; i < 4; i++) v += w.found * s.found[i];
    for (let i = 0; i < 7; i++) {
      const d = s.down[i];
      v -= w.down * d + w.down2 * d * d;
      if (!s.tab[i].length) v += w.empty;
    }
    v -= w.talon * s.talon.length;
    return v;
  }

  function greedyMove(masked, opts = {}) {
    const history = opts.history || new Set();
    const maxNodes = opts.maxNodes || 20000, w = opts.weights || WEIGHTS;
    const ev = s => evaluate(s, w);
    const root = clone(masked);
    const rec = [];
    autoplay(root, rec);
    if (rec.length) return rec[0];
    // Nothing left face down: the player now knows everything, so play exactly.
    if (root.down.every(d => d === 0)) return solvePerfect(root, { maxNodes: maxNodes * 10 }).move;

    // Otherwise search for the best line that ends by turning over a card (or winning).
    let bestMove = null, bestV = -Infinity, nodes = 0;
    const seen = new Set([key(root)]);
    (function dfs(s, first, len) {
      for (const m of genMoves(s)) {
        if (++nodes > maxNodes) return;
        const ns = apply(clone(s), m);
        autoplay(ns);
        const f = first || m;
        if (isWon(ns) || ns.rev) {
          const v = isWon(ns) ? 1e9 : ev(ns) - len;
          if (v > bestV) { bestV = v; bestMove = f; }
          continue;
        }
        const k = key(ns);
        if (seen.has(k) || history.has(k)) continue;
        seen.add(k);
        dfs(ns, f, len + 1);
      }
    })(root, null, 0);
    return bestMove;
  }

  // Fills the face-down slots of a masked state with a random arrangement of the unseen cards.
  function determinize(masked, random) {
    const s = clone(masked);
    const known = new Uint8Array(52);
    for (let su = 0; su < 4; su++) for (let r = 0; r < s.found[su]; r++) known[su * 13 + r] = 1;
    for (const c of s.talon) known[c] = 1;
    for (const col of s.tab) for (const c of col) if (c !== UNK) known[c] = 1;
    const unseen = [];
    for (let c = 0; c < 52; c++) if (!known[c]) unseen.push(c);
    for (let i = unseen.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [unseen[i], unseen[j]] = [unseen[j], unseen[i]]; }
    let k = 0;
    for (const col of s.tab) for (let j = 0; j < col.length; j++) if (col[j] === UNK) col[j] = unseen[k++];
    return s;
  }

  const moveId = m => JSON.stringify(m);

  // opts.cache (optional, any object) lets a caller that plays a whole game reuse the sampled
  // worlds and their solutions from one decision to the next. They stay valid until a card is
  // turned over; most moves just follow a solution already found, so this makes play much cheaper.
  function heuristicMove(masked, opts = {}) {
    const history = opts.history || new Set();
    const random = opts.random || Math.random;
    // 48 worlds x 60k-node solves: tuned on 100 draw-3 deals (24 x 20k won 37%, 48 x 60k won 47%).
    const samples = opts.samples || 48, budget = opts.budget || 60000, maxCandidates = opts.candidates || 4;
    const cache = opts.cache;
    const root = clone(masked);
    const rec = [];
    autoplay(root, rec);
    if (rec.length) return rec[0];
    // Nothing hidden (everything turned over, or the game is showing face-down cards): play exactly.
    if (!root.tab.some(col => col.includes(UNK))) {
      const r = solvePerfect(root, { maxNodes: 1e6 });
      if (r.status === 'win') return r.move;
      return greedyMove(masked, opts);
    }

    // Moves worth considering: anything that doesn't return to a position we've already been in.
    const moves = genMoves(root).filter(m => {
      const ns = apply(clone(root), m);
      autoplay(ns);
      return !history.has(key(ns));
    });
    if (!moves.length) return null;
    const allowed = new Map(moves.map(m => [moveId(m), m]));

    // A world is { s: full state, path: winning line from s (or null if not solved yet), dead }.
    let worlds;
    if (cache && cache.sig === key(root)) worlds = cache.worlds;
    else {
      worlds = [];
      for (let i = 0; i < samples; i++) worlds.push({ s: determinize(root, random), path: null, dead: false });
    }

    const commit = m => {
      if (cache && m) {
        const id = moveId(m);
        cache.worlds = worlds.filter(w => !w.dead).map(w => {
          const ns = apply(clone(w.s), m), auto = [];
          autoplay(ns, auto);
          const line = w.path && w.path.length && moveId(w.path[0]) === id ? w.path : w.alt && w.alt.get(id);
          return { s: ns, path: line ? line.slice(1 + auto.length) : null, dead: false };
        });
        const next = apply(clone(root), m);
        autoplay(next);
        cache.sig = key(next);
      }
      return m;
    };
    if (moves.length === 1) return commit(moves[0]);

    // Stage 1: solve each world (at most once until the next reveal; a lost world stays lost).
    // The first move of each solution is a vote.
    const votes = new Map();
    for (const w of worlds) {
      if (w.dead) continue;
      if (!w.path) {
        const r = solvePerfect(w.s, { maxNodes: budget, path: true });
        if (r.status !== 'win') { w.dead = true; continue; }
        w.path = r.path;
      }
      if (!w.path.length) continue;
      const id = moveId(w.path[0]);
      if (allowed.has(id)) votes.set(id, (votes.get(id) || 0) + 1);
    }
    if (!votes.size) return commit(greedyMove(masked, opts));

    // Stage 2: the vote favours whichever move the solver tries first, so score the leading
    // candidates properly: in how many worlds does playing that move still lead to a win?
    const cands = [...votes.entries()].sort((a, b) => b[1] - a[1]).slice(0, maxCandidates);
    let best = null, bestScore = -1;
    for (const [id, v] of cands) {
      const m = allowed.get(id);
      let wins = 0;
      for (const w of worlds) {
        if (w.dead) continue;
        if ((w.path.length && moveId(w.path[0]) === id) || (w.alt && w.alt.has(id))) { wins++; continue; }
        if (cands.length === 1) continue;
        const ns = apply(clone(w.s), m), auto = [];
        autoplay(ns, auto);
        const r = solvePerfect(ns, { maxNodes: budget, path: true });
        if (r.status === 'win') {
          wins++;
          (w.alt = w.alt || new Map()).set(id, [m, ...auto, ...r.path]);
        }
      }
      const score = wins + v / 1000; // votes only break ties
      if (score > bestScore) { bestScore = score; best = m; }
    }
    return commit(best);
  }

  // Plays a full game with the heuristic player, revealing cards from the real state.
  function playHeuristic(s0, opts = {}) {
    const s = clone(s0);
    autoplay(s);
    const history = new Set([key(mask(s))]);
    const move = opts.greedy ? greedyMove : heuristicMove;
    const cache = {};
    for (let n = 0; n < 1000 && !isWon(s); n++) {
      const m = move(mask(s), { ...opts, history, cache });
      if (!m) break;
      apply(s, m);
      autoplay(s);
      history.add(key(mask(s)));
    }
    return isWon(s);
  }

  function shuffledDeck(random) {
    const deck = [];
    for (let c = 0; c < 52; c++) deck.push(c);
    for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
    return deck;
  }

  // Deals a game the same way index.html does, from a random() source.
  const deal = (random, draw) => dealFromDeck(shuffledDeck(random), draw);

  // Deals from a deck order (card codes; the last card is dealt first), exactly like index.html.
  function dealFromDeck(order, draw) {
    const deck = order.slice();
    const tab = [[], [], [], [], [], [], []];
    for (let i = 0; i < 7; i++) for (let j = i; j < 7; j++) tab[j].push(deck.pop());
    // index.html deals from the end of the stock array, so the deal order is the reverse.
    return { tab, down: tab.map(c => c.length - 1), found: [0, 0, 0, 0], talon: deck.reverse(), p: 0, draw, rev: 0 };
  }

  // Finds a deck order the perfect solver can win. Each candidate gets a small search budget:
  // most winnable deals are solved within a few hundred positions, while proving a deal
  // unwinnable can take millions, so it's much cheaper to give up early and try another.
  function winnableDeck(random, draw, opts = {}) {
    const budget = opts.budget || 100000, maxTries = opts.maxTries || 200;
    for (let t = 1; t <= maxTries; t++) {
      const deck = shuffledDeck(random);
      const r = solvePerfect(dealFromDeck(deck, draw), { maxNodes: budget });
      if (r.status === 'win') return { deck, tries: t, moves: r.moves };
    }
    return null;
  }

  return { UNK, WEIGHTS, isSafeToFoundation, solvePerfect, makePlan, planMove, key, winnableDeck, dealFromDeck, shuffledDeck, heuristicMove, greedyMove, determinize, playHeuristic, deal, mask, clone, isWon, apply, autoplay };
}

if (typeof module !== 'undefined') module.exports = solverModule();
