// @ts-check

/**
 * @typedef {"red" | "blue" | "green" | "orange"} Suit
 * @typedef {{rank: number, suit: Suit}} Card
 * @typedef {"play" | "result"} GamePhase
 */

/** @type {Suit[]} */
const SUITS = ["red", "blue", "green", "orange"];
const CARDS_PER_SUIT = 6;
const MIN_RANK = 1;
const MAX_RANK = CARDS_PER_SUIT;
const PLAYER_LABELS = ["You", "Left Opponent", "Partner", "Right Opponent"];
const HIDDEN_PLAYERS = [1, 2, 3];
const POSITIONS = ['bottom', 'left', 'top', 'right'];

/** @type {Card[][]} */
const hands = [[], [], [], []];

/** @type {Card[]} */
let currentTrick = [];
let leadPlayer = 0;
let tricksWon = 0;
/** @type {Suit | null} */
let trumpSuit = null;
let animationDelay = 1.0;
let lastTime = 0;

/** @type {GamePhase} */
let gamePhase = "play";
let dealNumber = 1;
/** @type {Set<number>} */
let scoredTricks = new Set();
let gameOver = false;
let gameWon = false;
let bonusTrickCount = -1;
let debugShowAll = false;

// --- utility ---

/**
 * @param {string} tag
 * @param {string} [className]
 * @param {string | number | null} [text]
 * @returns {HTMLElement}
 */
function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text != null) e.textContent = String(text);
  return e;
}

function clearRoot() {
  const root = document.getElementById('root');
  if (!root) return null;
  root.innerHTML = '';
  root.classList.remove('play-mode', 'result-mode');
  return root;
}

/**
 * @template T
 * @param {T[]} arr
 * @returns {T}
 */
function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * @template T
 * @param {T[]} arr
 */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/** @param {string} s */
function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * @param {string} word
 * @param {number} count
 */
function plural(word, count) {
  return count === 1 ? word : word + "s";
}

/** @param {number} rank */
function rankLabel(rank) {
  return String(rank);
}

/** @param {number} player */
function isHuman(player) {
  return player === 0 || player === 2;
}

/**
 * @param {Card[]} cards
 * @returns {Card[][]}
 */
function groupBySuit(cards) {
  /** @type {Map<Suit, Card[]>} */
  const bySuit = new Map();
  for (const c of cards) {
    const arr = bySuit.get(c.suit);
    if (arr) arr.push(c); else bySuit.set(c.suit, [c]);
  }
  return [...bySuit.values()];
}

function currentPlayer() {
  return (leadPlayer + currentTrick.length) % 4;
}

/**
 * @param {Card} card
 * @param {Card[]} hand
 */
function canPlay(card, hand) {
  if (currentTrick.length === 0) return true;
  const leadSuit = currentTrick[0].suit;
  if (hand.some(c => c.suit === leadSuit)) return card.suit === leadSuit;
  return true;
}

// --- dealing ---

function dealHands() {
  /** @type {Card[]} */
  const deck = [];
  for (const suit of SUITS) {
    for (let rank = MIN_RANK; rank <= MAX_RANK; rank++) {
      deck.push({ rank, suit });
    }
  }

  shuffle(deck);

  for (let i = 0; i < 4; i++) hands[i] = [];
  for (let i = 0; i < deck.length; i++) {
    hands[i % 4].push(deck[i]);
  }
}

// --- rendering ---

/**
 * @param {Card} card
 * @param {{hidden?: boolean, active?: boolean, onClick?: (() => void) | null}} opts
 */
function renderCard(card, opts = {}) {
  let classes = 'card';
  if (opts.hidden) classes += ' hidden';
  if (!opts.active) classes += ' inactive';
  if (opts.active) classes += ' active';
  const cardEl = el('div', classes);

  if (!opts.hidden) {
    cardEl.textContent = rankLabel(card.rank);
    cardEl.style.color = card.suit;
  }

  if (opts.onClick) {
    cardEl.addEventListener('click', opts.onClick);
  }

  return cardEl;
}

/**
 * @param {HTMLElement} root
 * @param {{ revealAll?: boolean, showPartner?: boolean, activePlayer?: number, onPlay?: ((player: number, card: Card) => void) | null }} opts
 */
function renderHands(root, { revealAll = false, showPartner = false, activePlayer = -1, onPlay = null } = {}) {
  const sortCmp = (/** @type {Card} */ a, /** @type {Card} */ b) => SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit) || b.rank - a.rank;
  for (let i = 0; i < 4; i++) {
    const handEl = el('div', 'hand hand-' + POSITIONS[i]);
    const handHidden = !revealAll && i !== 0 && !(showPartner && i === 2) && !debugShowAll;
    const isActive = i === activePlayer;
    const checkLegal = isActive && isHuman(i);

    const sorted = [...hands[i]];
    if (!handHidden) sorted.sort(sortCmp);

    for (const card of sorted) {
      const legal = checkLegal ? canPlay(card, hands[i]) : false;
      const active = isActive && (!checkLegal || legal);
      const onClick = (checkLegal && legal && onPlay) ? () => onPlay(i, card) : null;
      handEl.appendChild(renderCard(card, { hidden: handHidden, active, onClick }));
    }
    root.appendChild(handEl);
  }
}

/** @param {HTMLElement} container */
function renderChecklist(container) {
  const checklist = el('div', 'checklist');
  checklist.appendChild(el('div', 'checklist-title', 'Deal ' + dealNumber + '/' + (CARDS_PER_SUIT + 1)));
  for (let i = 0; i <= CARDS_PER_SUIT; i++) {
    const scored = scoredTricks.has(i);
    const isBonus = !scored && i === bonusTrickCount;
    let cls = 'checklist-item';
    if (scored) cls += ' scored';
    if (isBonus) cls += ' bonus';
    const label = i + ' ' + plural('trick', i) + (isBonus ? ' *BONUS*' : '');
    checklist.appendChild(el('div', cls, label));
  }
  container.appendChild(checklist);
}

function render() {
  if (gamePhase === "play") {
    renderPlay();
  } else if (gamePhase === "result") {
    renderResult();
  }
}

// --- play mode ---

function renderPlay() {
  const root = clearRoot();
  if (!root) return;
  root.classList.add('play-mode');

  // HUD left
  const hudLeft = el('div', 'hud-left');
  hudLeft.appendChild(el('div', 'score', 'Tricks: ' + tricksWon));
  const trumpEl = el('div', 'trump-indicator');
  if (trumpSuit) {
    const label = el('span', '', 'Trump: ');
    const suitName = el('span', '', capitalize(trumpSuit));
    suitName.style.color = trumpSuit;
    trumpEl.appendChild(label);
    trumpEl.appendChild(suitName);
  } else {
    trumpEl.textContent = 'No Trump';
  }
  hudLeft.appendChild(trumpEl);
  root.appendChild(hudLeft);

  // HUD right
  const hudRight = el('div', 'hud-right');
  renderChecklist(hudRight);
  root.appendChild(hudRight);

  const cp = currentPlayer();
  const trickComplete = currentTrick.length === 4;

  // Trick area (center)
  const trickEl = el('div', 'trick');
  const trickPositions = ['trick-bottom', 'trick-left', 'trick-top', 'trick-right'];
  for (let i = 0; i < 4; i++) {
    const slot = el('div', 'trick-slot ' + trickPositions[i]);
    const trickIndex = (i - leadPlayer + 4) % 4;
    if (trickIndex < currentTrick.length) {
      const card = currentTrick[trickIndex];
      slot.appendChild(renderCard(card, { active: true }));
    }
    trickEl.appendChild(slot);
  }
  root.appendChild(trickEl);

  const activePlayer = trickComplete ? -1 : cp;
  renderHands(root, { showPartner: true, activePlayer, onPlay: playCard });
}

// --- result mode ---

function renderResult() {
  const root = clearRoot();
  if (!root) return;

  const resultEl = el('div', 'result-screen');

  if (gameOver && gameWon) {
    resultEl.appendChild(el('div', 'result-title', 'You Win!'));
    resultEl.appendChild(el('div', '', 'Scored all ' + (CARDS_PER_SUIT + 1) + ' trick counts!'));
  } else if (gameOver) {
    resultEl.appendChild(el('div', 'result-title', 'Game Over'));
    resultEl.appendChild(el('div', '', 'Got ' + tricksWon + ' ' + plural('trick', tricksWon) + ' again!'));
  } else {
    resultEl.appendChild(el('div', 'result-title', 'Deal Complete'));
    resultEl.appendChild(el('div', '', 'Won ' + tricksWon + ' ' + plural('trick', tricksWon)));
  }

  renderChecklist(resultEl);

  if (gameOver) {
    resultEl.appendChild(el('div', 'result-continue', 'Click to start new game'));
    resultEl.addEventListener('click', startNewGame);
  } else {
    resultEl.appendChild(el('div', 'result-continue', 'Click to continue'));
    resultEl.addEventListener('click', startNewRound);
  }

  root.appendChild(resultEl);
  root.classList.add('result-mode');
  renderHands(root, { revealAll: true });
}

// --- round lifecycle ---

function startNewGame() {
  scoredTricks = new Set();
  dealNumber = 1;
  gameOver = false;
  gameWon = false;
  startNewRound();
}

function startNewRound() {
  dealHands();
  trumpSuit = pickRandom(SUITS);
  gamePhase = "play";
  tricksWon = 0;
  currentTrick = [];
  leadPlayer = 0;
  // Pick a random unscored trick count as the bonus
  const unscored = [];
  for (let i = 0; i <= CARDS_PER_SUIT; i++) {
    if (!scoredTricks.has(i)) unscored.push(i);
  }
  bonusTrickCount = pickRandom(unscored);
  render();
}

// --- card play ---

/**
 * @param {number} player
 * @param {Card} card
 */
function playCard(player, card) {
  if (currentPlayer() !== player) return;
  if (currentTrick.length >= 4) return;

  const hand = hands[player];
  const idx = hand.indexOf(card);
  if (idx === -1) return;
  if (!canPlay(card, hand)) return;

  hand.splice(idx, 1);
  currentTrick.push(card);
  animationDelay = 1.0;
  render();
}

/**
 * @param {Card} a
 * @param {Card} b
 */
function cardBeats(a, b) {
  if (a.suit === trumpSuit && b.suit !== trumpSuit) return true;
  if (b.suit === trumpSuit && a.suit !== trumpSuit) return false;
  if (a.suit === b.suit) return a.rank > b.rank;
  return false;
}

function resolveTrick() {
  let winIndex = 0;
  for (let i = 1; i < 4; i++) {
    if (cardBeats(currentTrick[i], currentTrick[winIndex])) {
      winIndex = i;
    }
  }
  const winner = (leadPlayer + winIndex) % 4;
  if (isHuman(winner)) tricksWon++;
  leadPlayer = winner;
  currentTrick = [];

  // Check if round is over
  const roundOver = hands.every(h => h.length === 0);
  if (roundOver) {
    if (scoredTricks.has(tricksWon)) {
      gameOver = true;
      gameWon = false;
    } else {
      scoredTricks.add(tricksWon);
      if (scoredTricks.size === CARDS_PER_SUIT + 1) {
        gameOver = true;
        gameWon = true;
      }
    }
    dealNumber++;
    gamePhase = "result";
  }
}

// --- AI ---

/**
 * @param {Card[]} hand
 * @returns {Card}
 */
function aiPickCard(hand) {
  if (currentTrick.length === 0) {
    const groups = groupBySuit(hand);
    const maxLen = Math.max(...groups.map(g => g.length));
    const minLen = Math.min(...groups.map(g => g.length));
    const longests = groups.filter(g => g.length === maxLen);
    const shortests = groups.filter(g => g.length === minLen);
    const longest = pickRandom(longests);
    const shortest = pickRandom(shortests);
    if (Math.random() < 0.7) {
      return longest.reduce((a, b) => a.rank > b.rank ? a : b);
    }
    return shortest.reduce((a, b) => a.rank < b.rank ? a : b);
  }

  let best = currentTrick[0];
  let winIndex = 0;
  for (let i = 1; i < currentTrick.length; i++) {
    if (cardBeats(currentTrick[i], best)) { best = currentTrick[i]; winIndex = i; }
  }
  const partnerWinning = winIndex % 2 === currentTrick.length % 2;

  const leadSuit = currentTrick[0].suit;
  const suitCards = hand.filter(c => c.suit === leadSuit);
  const mustFollow = suitCards.length > 0;

  if (!partnerWinning) {
    let winners;
    if (mustFollow) {
      winners = suitCards.filter(c => cardBeats(c, best));
    } else {
      winners = hand.filter(c => c.suit === trumpSuit && cardBeats(c, best));
    }

    if (winners.length > 0) {
      if (mustFollow) {
        return winners.reduce((a, b) => a.rank > b.rank ? a : b);
      }
      return winners.reduce((a, b) => a.rank < b.rank ? a : b);
    }
  }

  if (mustFollow) {
    return suitCards.reduce((a, b) => a.rank < b.rank ? a : b);
  }
  const nonTrump = hand.filter(c => c.suit !== trumpSuit);
  const pool = nonTrump.length > 0 ? nonTrump : hand;
  return pool.reduce((a, b) => a.rank < b.rank ? a : b);
}

// --- game loop ---

/** @param {number} timestamp */
function gameLoop(timestamp) {
  const dt = (timestamp - lastTime) / 1000;
  lastTime = timestamp;

  animationDelay -= dt;
  if (animationDelay < 0) animationDelay = 0;

  if (gamePhase === "play") {
    if (currentTrick.length === 4) {
      if (animationDelay == 0) {
        resolveTrick();
        animationDelay = 1.0;
        render();
      }
    } else {
      const cp = currentPlayer();
      if (!isHuman(cp)) {
        if (animationDelay == 0) {
          const hand = hands[cp];
          if (hand.length > 0) {
            const card = aiPickCard(hand);
            playCard(cp, card);
          }
        }
      }
    }
  }

  requestAnimationFrame(gameLoop);
}

document.addEventListener('keydown', (e) => {
  if (e.key === '`') {
    debugShowAll = !debugShowAll;
    render();
  }
});

// --- setup ---

startNewRound();
requestAnimationFrame((timestamp) => {
  lastTime = timestamp;
  gameLoop(timestamp);
});
