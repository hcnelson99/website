// @ts-check

import { globalCss, css, div } from '../ui.js';

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
const CARDS_PER_SUIT = 7;
const MIN_RANK = 1;
const MAX_RANK = CARDS_PER_SUIT;
const TRICK_GOALS = [0, 1, 2, 3, 4, 5, 6, 7];
const BONUS_REWARD = 5;
const COST_TRUMP = 10;
const COST_REDEAL = 3;
const COST_DRAW_DISCARD = 2;

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
let debugShowAll = false;
/** @type {number | null} */
let bonusGoal = null;
let gotBonus = false;
let money = 0;
let showShop = true;
let boughtTrump = false;
/** @type {number | null} */
let discardTarget = null;
/** @type {number | null} */
let justScored = null;
/** @type {Card | null} */
let highlightedCard = null;

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
const cardHighlightStyle = css`background: #ffa; cursor: pointer;`;
const sideCardStyle = css`width: 84px; height: 60px;`;

/**
 * @param {Card} card
 * @param {{hidden?: boolean, active?: boolean, highlighted?: boolean, sideCard?: boolean, onClick?: (() => void) | null}} opts
 */
function renderCard(card, opts = {}) {
  return div({
    class: [cardStyle, opts.highlighted ? cardHighlightStyle : opts.active ? cardActiveStyle : cardInactiveStyle, opts.sideCard && sideCardStyle],
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

/** @type {(a: Card, b: Card) => number} */
const handSortCmp = (a, b) => SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit) || b.rank - a.rank;

/**
 * @param {HTMLElement} root
 * @param {{ revealAll?: boolean, showPartner?: boolean, activePlayer?: number, onPlay?: ((player: number, card: Card) => void) | null, allPlayable?: boolean }} opts
 */
function renderHands(root, { revealAll = false, showPartner = false, activePlayer = -1, onPlay = null, allPlayable = false } = {}) {
  for (let i = 0; i < 4; i++) {
    const isSide = i === 1 || i === 3;
    const handHidden = !revealAll && i !== 0 && !(showPartner && i === 2) && !debugShowAll;
    const isActive = i === activePlayer;
    const checkLegal = isActive && isHuman(i);

    const sorted = [...hands[i]];
    if (!handHidden) sorted.sort(handSortCmp);

    root.appendChild(
      div({ class: [handStyle, HAND_POS_STYLES[i]] },
        ...sorted.map(card => {
          const legal = checkLegal ? (allPlayable || canPlay(card, hands[i])) : false;
          const active = isActive && (!checkLegal || legal);
          const onClick = (checkLegal && legal && onPlay) ? () => onPlay(i, card) : null;
          const highlighted = card === highlightedCard;
          return renderCard(card, { hidden: handHidden, active, highlighted, onClick, sideCard: isSide });
        })
      )
    );
  }
}

// --- rendering: checklist ---

const checklistStyle = css`font-size: 18px; line-height: 1.8;`;
const checklistTitleStyle = css`font-size: 21px; color: #aaa; margin-bottom: 6px;`;
const checklistItemStyle = css`color: #888;`;
const checklistScoredStyle = css`color: #c44;`;
const checklistJustScoredStyle = css`color: #4a4;`;
const checklistBonusStyle = css`color: #ee2;`;

function renderChecklist() {
  const items = [];
  for (const goal of TRICK_GOALS) {
    const scored = scoredTricks.has(goal);
    const isJustScored = goal === justScored;
    const isBonus = !scored && goal === bonusGoal;
    let label, itemClass;
    if (isJustScored) {
      label = '✓ ' + goal + ' ' + plural('trick', goal);
      itemClass = [checklistItemStyle, checklistJustScoredStyle];
    } else if (scored) {
      label = '💀 ' + goal + ' ' + plural('trick', goal);
      itemClass = [checklistItemStyle, checklistScoredStyle];
    } else {
      label = goal + ' ' + plural('trick', goal) + (isBonus ? ' — $' + (goal + BONUS_REWARD) : ' — $' + goal);
      itemClass = [checklistItemStyle, isBonus && checklistBonusStyle];
    }
    items.push(div({ class: itemClass }, label));
  }
  return div({ class: checklistStyle },
    div({ class: checklistTitleStyle }, 'Deal ' + dealNumber + '/' + TRICK_GOALS.length),
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
  z-index: 1;
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

const bidStyle = css`
  grid-area: center;
  justify-self: center;
  align-self: center;
  text-align: center;
`;
const bidTitleStyle = css`font-size: 24px; margin-bottom: 15px;`;
const bidBtnStyle = css`
  display: inline-block;
  padding: 12px 24px;
  margin: 6px;
  background: #333;
  color: #eee;
  cursor: pointer;
  font-family: monospace;
  font-size: 24px;
`;
const bidBtnRowStyle = css`display: flex; gap: 12px; justify-content: center;`;


function renderPlay() {
  const root = clearRoot();
  if (!root) return;

  // HUD left
  root.appendChild(
    div({ class: hudLeftStyle },
      div({ class: scoreStyle }, 'Tricks: ' + tricksWon),
      div({ class: scoreStyle }, '$' + money),
      trumpSuit
        ? div({ class: trumpIndicatorStyle }, 'Trump: ', div({ style: { color: trumpSuit, fontWeight: 'bold' } }, capitalize(trumpSuit)))
        : div({ class: trumpIndicatorStyle }, 'Trump: None'),
    )
  );

  // HUD right
  root.appendChild(
    div({ class: hudRightStyle }, renderChecklist())
  );

  if (showShop) {
    if (discardTarget !== null) {
      // Discard mode: pick a card to give back
      root.appendChild(
        div({ class: bidStyle },
          div({ class: bidTitleStyle }, 'Pick a card to discard'),
        )
      );
      const dt = discardTarget;
      renderHands(root, { showPartner: true, activePlayer: 0, allPlayable: true, onPlay: (_player, card) => {
        const idx = hands[0].indexOf(card);
        if (idx === -1) return;
        hands[0].splice(idx, 1);
        hands[dt].push(card);
        discardTarget = null;
        highlightedCard = null;
        render();
      }});
      return;
    }

    // Shop
    const shopItems = [];

    // Trump purchase
    if (!boughtTrump) {
      shopItems.push(
        div({ class: bidTitleStyle }, 'Trump ($' + COST_TRUMP + ')'),
        div({ class: bidBtnRowStyle },
          ...SUITS.map(suit =>
            div({
              class: [bidBtnStyle, money < COST_TRUMP && css`opacity: 0.4; cursor: default;`],
              style: { color: suit },
              onclick: () => {
                if (money < COST_TRUMP) return;
                money -= COST_TRUMP;
                boughtTrump = true;
                trumpSuit = suit;
                render();
              },
            }, capitalize(suit))
          )
        )
      );
    } else {
      shopItems.push(
        div({ class: bidTitleStyle }, 'Trump'),
        div({ class: bidBtnRowStyle },
          ...SUITS.map(suit =>
            div({
              class: [bidBtnStyle, suit === trumpSuit && css`outline: 2px solid #fff;`],
              style: { color: suit },
              onclick: () => { trumpSuit = suit; render(); },
            }, capitalize(suit))
          )
        )
      );
    }

    // Redeal and Draw & Discard
    shopItems.push(
      div({ class: bidBtnRowStyle, style: { marginTop: '18px' } },
        div({
          class: [bidBtnStyle, money < COST_REDEAL && css`opacity: 0.4; cursor: default;`],
          onclick: () => {
            if (money < COST_REDEAL) return;
            money -= COST_REDEAL;
            dealHands();
            boughtTrump = false;
            trumpSuit = null;
            render();
          },
        }, 'Redeal ($' + COST_REDEAL + ')'),
        div({
          class: [bidBtnStyle, money < COST_DRAW_DISCARD && css`opacity: 0.4; cursor: default;`],
          onclick: () => {
            if (money < COST_DRAW_DISCARD) return;
            money -= COST_DRAW_DISCARD;
            const opponent = pickRandom([1, 3]);
            const card = pickRandom(hands[opponent]);
            hands[opponent].splice(hands[opponent].indexOf(card), 1);
            hands[0].push(card);
            highlightedCard = card;
            discardTarget = opponent;
            render();
          },
        }, 'Draw & Discard ($' + COST_DRAW_DISCARD + ')'),
        div({
          class: [bidBtnStyle, css`background: #484;`],
          onclick: () => { showShop = false; render(); },
        }, 'Play'),
      )
    );

    root.appendChild(
      div({ class: bidStyle }, ...shopItems)
    );
    renderHands(root, { showPartner: true });
    return;
  }

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

  let title, subtitle, moneyInfo = '';
  if (gameOver && gameWon) {
    title = 'You Win!';
    subtitle = 'Scored all ' + TRICK_GOALS.length + ' trick counts!';
  } else if (gameOver) {
    title = 'Game Over';
    subtitle = 'Got ' + tricksWon + ' ' + plural('trick', tricksWon) + ' again!';
  } else {
    title = 'Deal Complete';
    subtitle = 'Won ' + tricksWon + ' ' + plural('trick', tricksWon);
    moneyInfo = '+$' + tricksWon;
    if (gotBonus) moneyInfo += ' +$' + BONUS_REWARD + ' bonus';
  }

  const resultEl = div({
    class: resultScreenStyle,
    onclick: gameOver ? startNewGame : startNewRound,
  },
    div({ class: resultTitleStyle }, title),
    div({}, subtitle),
    moneyInfo ? div({ style: { color: '#4a4', fontSize: '24px' } }, moneyInfo) : null,
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
  money = 0;
  gameOver = false;
  gameWon = false;
  startNewRound();
}

function startNewRound() {
  dealHands();
  trumpSuit = null;
  tricksWon = 0;
  currentTrick = [];
  leadPlayer = 0;
  gotBonus = false;
  showShop = money > 0;
  boughtTrump = false;
  discardTarget = null;
  justScored = null;

  // Auto-pick random bonus goal (no bonus if only 1 goal left)
  const unscored = TRICK_GOALS.filter(g => !scoredTricks.has(g));
  bonusGoal = unscored.length > 1 ? pickRandom(unscored) : null;

  gamePhase = "play";
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
    money += tricksWon;
    if (!TRICK_GOALS.includes(tricksWon) || scoredTricks.has(tricksWon)) {
      gameOver = true;
      gameWon = false;
    } else {
      gotBonus = tricksWon === bonusGoal;
      if (gotBonus) money += BONUS_REWARD;
      justScored = tricksWon;
      scoredTricks.add(tricksWon);
      if (scoredTricks.size === TRICK_GOALS.length) {
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

  if (gamePhase === "play" && !showShop) {
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
      } else if (hands[cp].length === 1 && animationDelay == 0) {
        playCard(cp, hands[cp][0]);
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
