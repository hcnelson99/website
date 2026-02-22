// @ts-check

/**
 * @typedef {"red" | "blue" | "green" | "orange"} Suit
 * @typedef {{rank: number, suit: Suit}} Card
 * @typedef {"play" | "result"} GamePhase
 */

// --- global styles ---

globalCss`
  html, body { margin: 0; height: 100%; overflow: hidden; }
  body { background: #1a1a2e; color: #eee; font-family: monospace; font-size: 24px; }
`;

const rootStyle = css`
  position: relative;
  display: grid;
  grid-template-rows: auto 1fr auto;
  grid-template-columns: 1fr auto 1fr;
  grid-template-areas:
    "left top right"
    "left center right"
    "left bottom right";
  width: 100%;
  height: 100vh;
  overflow: hidden;
`;

// --- constants ---

/** @type {Suit[]} */
const SUITS = ["red", "blue", "green", "orange"];
const CARDS_PER_SUIT = 6;
const MIN_RANK = 1;
const MAX_RANK = CARDS_PER_SUIT;

// --- state ---

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

function clearRoot() {
  const root = document.getElementById('root');
  if (!root) return null;
  root.innerHTML = '';
  root.className = rootStyle;
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

// --- rendering: cards ---

const cardStyle = css`
  width: 60px;
  height: 84px;
  border: none;
  background: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 27px;
  font-weight: bold;
  box-sizing: border-box;
  outline: none;
`;
const cardInactiveStyle = css`background: #AAA;`;
const cardActiveStyle = css`background: white; cursor: pointer;`;
const sideCardStyle = css`width: 84px; height: 60px;`;

/**
 * @param {Card} card
 * @param {{hidden?: boolean, active?: boolean, sideCard?: boolean, onClick?: (() => void) | null}} opts
 */
function renderCard(card, opts = {}) {
  return div({
    class: [cardStyle, opts.active ? cardActiveStyle : cardInactiveStyle, opts.sideCard && sideCardStyle],
    style: opts.hidden ? undefined : { color: card.suit },
    onclick: opts.onClick,
  }, opts.hidden ? null : rankLabel(card.rank));
}

// --- rendering: hands ---

const handStyle = css`
  display: flex;
  gap: 6px;
  justify-content: center;
  flex-wrap: wrap;
  padding: 15px;
`;
const handBottomStyle = css`grid-area: bottom;`;
const handTopStyle = css`grid-area: top;`;
const handLeftStyle = css`grid-area: left; flex-direction: column;`;
const handRightStyle = css`grid-area: right; flex-direction: column; justify-self: end;`;
const HAND_POS_STYLES = [handBottomStyle, handLeftStyle, handTopStyle, handRightStyle];

/**
 * @param {HTMLElement} root
 * @param {{ revealAll?: boolean, showPartner?: boolean, activePlayer?: number, onPlay?: ((player: number, card: Card) => void) | null }} opts
 */
function renderHands(root, { revealAll = false, showPartner = false, activePlayer = -1, onPlay = null } = {}) {
  const sortCmp = (/** @type {Card} */ a, /** @type {Card} */ b) => SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit) || b.rank - a.rank;
  for (let i = 0; i < 4; i++) {
    const isSide = i === 1 || i === 3;
    const handHidden = !revealAll && i !== 0 && !(showPartner && i === 2) && !debugShowAll;
    const isActive = i === activePlayer;
    const checkLegal = isActive && isHuman(i);

    const sorted = [...hands[i]];
    if (!handHidden) sorted.sort(sortCmp);

    root.appendChild(
      div({ class: [handStyle, HAND_POS_STYLES[i]] },
        ...sorted.map(card => {
          const legal = checkLegal ? canPlay(card, hands[i]) : false;
          const active = isActive && (!checkLegal || legal);
          const onClick = (checkLegal && legal && onPlay) ? () => onPlay(i, card) : null;
          return renderCard(card, { hidden: handHidden, active, onClick, sideCard: isSide });
        })
      )
    );
  }
}

// --- rendering: checklist ---

const checklistStyle = css`font-size: 18px; line-height: 1.8;`;
const checklistTitleStyle = css`font-size: 21px; color: #aaa; margin-bottom: 6px;`;
const checklistItemStyle = css`color: #888;`;
const checklistScoredStyle = css`text-decoration: line-through; color: #4a4;`;
const checklistBonusStyle = css`color: #ee2;`;

function renderChecklist() {
  const items = [];
  for (let i = 0; i <= CARDS_PER_SUIT; i++) {
    const scored = scoredTricks.has(i);
    const isBonus = !scored && i === bonusTrickCount;
    items.push(div(
      { class: [checklistItemStyle, scored && checklistScoredStyle, isBonus && checklistBonusStyle] },
      i + ' ' + plural('trick', i) + (isBonus ? ' *BONUS*' : '')
    ));
  }
  return div({ class: checklistStyle },
    div({ class: checklistTitleStyle }, 'Deal ' + dealNumber + '/' + (CARDS_PER_SUIT + 1)),
    ...items
  );
}

// --- rendering: play mode ---

const hudLeftStyle = css`
  grid-area: left;
  padding: 15px;
  display: flex;
  flex-direction: column;
  gap: 6px;
`;
const hudRightStyle = css`
  grid-area: right;
  padding: 15px;
  text-align: right;
  justify-self: end;
`;
const scoreStyle = css`font-size: 24px;`;
const trumpIndicatorStyle = css`
  font-size: 24px;
  display: flex;
  align-items: center;
  gap: 9px;
`;

const trickStyle = css`
  grid-area: center;
  justify-self: center;
  align-self: center;
  position: relative;
  width: 240px;
  height: 270px;
`;
const trickSlotStyle = css`position: absolute;`;
const trickBottomStyle = css`bottom: 0; left: 50%; transform: translateX(-50%);`;
const trickTopStyle = css`top: 0; left: 50%; transform: translateX(-50%);`;
const trickLeftStyle = css`left: 0; top: 50%; transform: translateY(-50%);`;
const trickRightStyle = css`right: 0; top: 50%; transform: translateY(-50%);`;
const TRICK_POS_STYLES = [trickBottomStyle, trickLeftStyle, trickTopStyle, trickRightStyle];

function render() {
  if (gamePhase === "play") {
    renderPlay();
  } else if (gamePhase === "result") {
    renderResult();
  }
}

function renderPlay() {
  const root = clearRoot();
  if (!root) return;

  // HUD left
  root.appendChild(
    div({ class: hudLeftStyle },
      div({ class: scoreStyle }, 'Tricks: ' + tricksWon),
      trumpSuit
        ? div({ class: trumpIndicatorStyle },
            span({}, 'Trump: '),
            span({ style: { color: trumpSuit } }, capitalize(trumpSuit))
          )
        : div({ class: trumpIndicatorStyle }, 'No Trump')
    )
  );

  // HUD right
  root.appendChild(
    div({ class: hudRightStyle }, renderChecklist())
  );

  // Trick area (center)
  const trickEl = div({ class: trickStyle });
  for (let i = 0; i < 4; i++) {
    const trickIndex = (i - leadPlayer + 4) % 4;
    trickEl.appendChild(
      div({ class: [trickSlotStyle, TRICK_POS_STYLES[i]] },
        trickIndex < currentTrick.length
          ? renderCard(currentTrick[trickIndex], { active: true })
          : null
      )
    );
  }
  root.appendChild(trickEl);

  const cp = currentPlayer();
  const activePlayer = currentTrick.length === 4 ? -1 : cp;
  renderHands(root, { showPartner: true, activePlayer, onPlay: playCard });
}

// --- rendering: result mode ---

const resultScreenStyle = css`
  grid-area: center;
  justify-self: center;
  align-self: center;
  text-align: center;
  cursor: pointer;
  line-height: 2;
  padding: 15px;
`;
const resultTitleStyle = css`font-size: 42px; font-weight: bold;`;
const resultContinueStyle = css`margin-top: 30px; color: #888; font-size: 21px;`;

function renderResult() {
  const root = clearRoot();
  if (!root) return;

  let title, subtitle;
  if (gameOver && gameWon) {
    title = 'You Win!';
    subtitle = 'Scored all ' + (CARDS_PER_SUIT + 1) + ' trick counts!';
  } else if (gameOver) {
    title = 'Game Over';
    subtitle = 'Got ' + tricksWon + ' ' + plural('trick', tricksWon) + ' again!';
  } else {
    title = 'Deal Complete';
    subtitle = 'Won ' + tricksWon + ' ' + plural('trick', tricksWon);
  }

  const resultEl = div({
    class: resultScreenStyle,
    onclick: gameOver ? startNewGame : startNewRound,
  },
    div({ class: resultTitleStyle }, title),
    div({}, subtitle),
    renderChecklist(),
    div({ class: resultContinueStyle }, gameOver ? 'Click to start new game' : 'Click to continue'),
  );

  root.appendChild(resultEl);
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
  const roundOver = hands.every(hand => hand.length === 0);
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
