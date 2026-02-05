// @ts-check

/**
 * @typedef {"red" | "blue" | "green" | "orange"} Suit
 * @typedef {{rank: number, suit: Suit}} Card
 * @typedef {{
 *   label: string,
 *   choiceType: "player" | "suit",
 *   resolve: (choice: number | Suit) => string
 * }} OracleCard
 * @typedef {{
 *   label: string,
 *   trumpSuit: Suit | null,
 *   tricksNeeded: number,
 *   successPoints: number,
 *   failurePoints: number,
 * }} Contract
 * @typedef {"oracle" | "play" | "result"} GamePhase
 */

/** @type {Suit[]} */
const SUITS = ["red", "blue", "green", "orange"];
const MIN_RANK = 2;
const MAX_RANK = 14;
const PLAYER_LABELS = ["You", "Left Opponent", "Partner", "Right Opponent"];
const HIDDEN_PLAYERS = [1, 2, 3];
const POSITIONS = ['bottom', 'left', 'top', 'right'];
const ORACLES_PER_ROUND = 3;

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

// Oracle & Contract state
/** @type {GamePhase} */
let gamePhase = "oracle";
let oraclesRemaining = ORACLES_PER_ROUND;
/** @type {OracleCard[]} */
let currentOracles = [];
/** @type {Suit | null | undefined} */
let chosenTrumpChoice = undefined;
/** @type {Contract | null} */
let chosenContract = null;
/** @type {string[]} */
let oracleResults = [];
let totalScore = 0;
let selectedOracleIndex = -1;
let debugShowAll = false;
let showTutorial = true;

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
  if (rank === 14) return "A";
  if (rank === 13) return "K";
  if (rank === 12) return "Q";
  if (rank === 11) return "J";
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

/** @param {Contract} contract */
function contractPointsLabel(contract) {
  return '+' + contract.successPoints + ' / ' + contract.failurePoints;
}

/**
 * Returns { made, points } for the current round's contract.
 * @param {Contract} contract
 */
function contractResult(contract) {
  const made = tricksWon >= contract.tricksNeeded;
  const points = made ? contract.successPoints : contract.failurePoints;
  return { made, points };
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

// --- oracle templates ---

/** @returns {OracleCard} */
function oracleSuitCount() {
  const suit = pickRandom(SUITS);
  return {
    label: capitalize(suit) + " Count",
    choiceType: "player",
    resolve(choice) {
      const player = /** @type {number} */ (choice);
      const count = hands[player].filter(c => c.suit === suit).length;
      return `${PLAYER_LABELS[player]} has ${count} ${suit} ${plural("card", count)}.`;
    }
  };
}

/** @returns {OracleCard} */
function oraclePlayerCount() {
  const player = pickRandom(HIDDEN_PLAYERS);
  return {
    label: PLAYER_LABELS[player] + " Count",
    choiceType: "suit",
    resolve(choice) {
      const suit = /** @type {Suit} */ (choice);
      const count = hands[player].filter(c => c.suit === suit).length;
      return `${PLAYER_LABELS[player]} has ${count} ${suit} ${plural("card", count)}.`;
    }
  };
}

/**
 * @param {"longest" | "shortest"} which
 * @returns {OracleCard}
 */
function oracleExtremeSuit(which) {
  return {
    label: capitalize(which) + " Suit",
    choiceType: "player",
    resolve(choice) {
      const player = /** @type {number} */ (choice);
      const counts = SUITS.map(s => ({ suit: s, count: hands[player].filter(c => c.suit === s).length }));
      counts.sort((a, b) => which === "longest" ? b.count - a.count : a.count - b.count);
      return `${PLAYER_LABELS[player]}'s ${which} suit is ${counts[0].suit} (${counts[0].count} ${plural("card", counts[0].count)}).`;
    }
  };
}

/** @returns {OracleCard} */
function oracleHighCardCount() {
  return {
    label: "High Card Count",
    choiceType: "player",
    resolve(choice) {
      const player = /** @type {number} */ (choice);
      const count = hands[player].filter(c => c.rank >= 11).length;
      return `${PLAYER_LABELS[player]} has ${count} ${plural("card", count)} ranked J or higher.`;
    }
  };
}

const ORACLE_TEMPLATES = [oracleSuitCount, oraclePlayerCount, () => oracleExtremeSuit("longest"), () => oracleExtremeSuit("shortest"), oracleHighCardCount];

/** @param {number} n */
function drawOracles(n) {
  const templates = [...ORACLE_TEMPLATES];
  shuffle(templates);
  return templates.slice(0, n).map(fn => fn());
}

// --- contract generation ---

const CONTRACT_TIERS = [
  { label: "Safe", tricksNeeded: 6, successPoints: 5, failurePoints: -3 },
  { label: "Standard", tricksNeeded: 7, successPoints: 10, failurePoints: -5 },
  { label: "Ambitious", tricksNeeded: 8, successPoints: 18, failurePoints: -8 },
  { label: "Bold", tricksNeeded: 9, successPoints: 28, failurePoints: -12 },
  { label: "Grand", tricksNeeded: 10, successPoints: 40, failurePoints: -18 },
];

const NOTRUMP_TIERS = [
  { label: "Safe Notrump", tricksNeeded: 6, successPoints: 8, failurePoints: -4 },
  { label: "Standard Notrump", tricksNeeded: 7, successPoints: 15, failurePoints: -8 },
  { label: "Ambitious Notrump", tricksNeeded: 8, successPoints: 25, failurePoints: -12 },
  { label: "Grand Notrump", tricksNeeded: 10, successPoints: 50, failurePoints: -25 },
];

/** @param {Suit | null} choice */
function selectTrump(choice) {
  chosenTrumpChoice = choice;
  render();
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

  for (const hand of hands) {
    hand.sort((a, b) => SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit) || b.rank - a.rank);
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
  if (opts.active && !opts.hidden) classes += ' active';
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
 * @param {boolean} revealAll
 */
function renderHands(root, revealAll) {
  for (let i = 0; i < 4; i++) {
    const handEl = el('div', 'hand hand-' + POSITIONS[i]);
    const hidden = !revealAll && i !== 0 && !debugShowAll;
    for (const card of hands[i]) {
      handEl.appendChild(renderCard(card, { hidden, active: false }));
    }
    root.appendChild(handEl);
  }
}

function render() {
  if (gamePhase === "oracle") {
    renderOracleMode();
  } else if (gamePhase === "play") {
    renderPlay();
  } else if (gamePhase === "result") {
    renderResult();
  }

  const root = document.getElementById('root');
  if (!root) return;

  if (showTutorial) renderTutorial(root);
}

/** @param {HTMLElement} root */
function renderTutorial(root) {
  const overlay = el('div', 'tutorial-overlay');
  const content = el('div', 'tutorial-content');

  // Version from script tag query param
  const scriptEl = document.querySelector('script[src^="game.js"]');
  const version = scriptEl ? new URL(/** @type {HTMLScriptElement} */ (scriptEl).src, location.href).searchParams.get('v') : null;
  if (version) {
    const versionEl = el('div', 'tutorial-version', 'v' + version);
    content.appendChild(versionEl);
  }

  content.appendChild(el('div', 'tutorial-title', 'How to Play'));

  const sections = [
    ['Overview', 'A "trick-taking" card game. You (bottom of screen) and your teammate (top) play against two opponents (left and right). You play cards for both yourself and your teammate, but your teammate\'s hand will only be revealed once play begins. Each round, you\'ll first use "oracle cards" to learn about your partner\'s and opponents\' hands, then pick a "contract" for how many "tricks" you need to win, then play out the tricks and see if you make your contract.'],
    ['Oracle Phase', 'Each round starts by selecting 3 oracle cards. Oracle cards tell you something about other players\' hands -- like how many cards of a suit they hold, or their longest suit.'],
    ['Contracts', 'After using all 3 oracles, you choose a contract in two steps. First, pick a trump suit from the 5 available choices (4 suits + No Trump). Then pick a contract tier -- each tier requires a different number of tricks and has a different point reward/penalty. Higher risk contracts pay more but cost more if you fail. Use your oracle information to choose a trump suit that favors your hand and a tier you\'re confident you can make.'],
    ['Playing Tricks', 'A trick consists of each player playing one card. You will start by playing the first card; then play proceeds to the left. Each play must follow the "lead suit": the suit that the trick was started with. If you can\'t follow suit, you may play any card. The highest card of the lead suit wins, unless a trump card is played -- then the highest trump wins. The next trick will be led by the winner of the previous trick.'],
    ['Winning', 'Tricks won by you or your teammate count toward your contract. If you win enough tricks you score the points; if not, you take the penalty.'],
  ];

  for (const [heading, body] of sections) {
    content.appendChild(el('div', 'tutorial-heading', heading));
    content.appendChild(el('div', 'tutorial-body', body));
  }

  const closeBtn = el('button', 'tutorial-close', 'Got it');
  closeBtn.addEventListener('click', () => { showTutorial = false; render(); });
  content.appendChild(closeBtn);

  overlay.appendChild(content);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) { showTutorial = false; render(); }
  });
  root.appendChild(overlay);
}

// --- oracle mode ---

/** @param {HTMLElement} container */
function renderOracleResults(container) {
  if (oracleResults.length > 0) {
    const resultsEl = el('div', 'oracle-results');
    for (const result of oracleResults) {
      resultsEl.appendChild(el('div', '', result));
    }
    container.appendChild(resultsEl);
  }
}

function renderOracleMode() {
  // Stage detection:
  // Stage 1: oraclesRemaining > 0
  // Stage 2: oraclesRemaining === 0 && chosenTrumpChoice === undefined
  // Stage 3: chosenTrumpChoice !== undefined

  if (oraclesRemaining > 0) {
    renderOracleStage1();
  } else if (chosenTrumpChoice === undefined) {
    renderOracleStage2();
  } else {
    renderOracleStage3();
  }
}

/** Stage 1: Pick oracle cards */
function renderOracleStage1() {
  const root = clearRoot();
  if (!root) return;

  const oracleSection = el('div', 'oracle-section');

  oracleSection.appendChild(el('div', 'section-title', 'ORACLE CARDS (pick one)'));

  const oracleRow = el('div', 'card-row');
  for (let i = 0; i < currentOracles.length; i++) {
    const oracle = currentOracles[i];
    const oracleEl = el('div', 'oracle-card' + (selectedOracleIndex === i ? ' selected' : ''));
    oracleEl.appendChild(el('div', 'oracle-label', oracle.label));
    oracleEl.appendChild(el('div', 'oracle-choice-type', oracle.choiceType === 'player' ? '[choose player]' : '[choose suit]'));
    const idx = i;
    oracleEl.addEventListener('click', () => {
      selectedOracleIndex = idx;
      render();
    });
    oracleRow.appendChild(oracleEl);
  }
  oracleSection.appendChild(oracleRow);

  oracleSection.appendChild(el('div', 'oracle-remaining', 'Oracles remaining: ' + oraclesRemaining));

  // Choice buttons (always visible, but disabled if no selection)
  const hasSelection = selectedOracleIndex >= 0 && selectedOracleIndex < currentOracles.length;
  const oracle = hasSelection ? currentOracles[selectedOracleIndex] : null;
  const choiceRow = el('div', 'choice-row');

  if (!oracle || oracle.choiceType === 'player') {
    for (const p of HIDDEN_PLAYERS) {
      const btn = el('button', 'choice-btn' + (hasSelection ? '' : ' disabled'), PLAYER_LABELS[p]);
      if (hasSelection) {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          resolveOracle(p);
        });
      }
      choiceRow.appendChild(btn);
    }
  } else {
    for (const suit of SUITS) {
      const btn = el('button', 'choice-btn suit-btn', suit);
      btn.style.color = suit;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        resolveOracle(suit);
      });
      choiceRow.appendChild(btn);
    }
  }
  oracleSection.appendChild(choiceRow);

  renderOracleResults(oracleSection);

  const layout = el('div', 'oracle-layout');
  layout.appendChild(oracleSection);

  // Empty top area placeholder
  root.appendChild(el('div', 'hand hand-top'));

  // Center content
  root.appendChild(layout);

  // Bottom hand
  const handEl = el('div', 'hand hand-bottom');
  for (const card of hands[0]) {
    handEl.appendChild(renderCard(card, { hidden: false, active: false }));
  }
  root.appendChild(handEl);
}

/** Stage 2: Choose trump suit (all 5 options) */
function renderOracleStage2() {
  const root = clearRoot();
  if (!root) return;

  const section = el('div', 'oracle-section');

  renderOracleResults(section);

  section.appendChild(el('div', 'section-title', 'CHOOSE TRUMP'));
  const trumpRow = el('div', 'card-row');

  /** @type {(Suit | null)[]} */
  const allTrumpOptions = [...SUITS, null];

  for (const choice of allTrumpOptions) {
    const cardEl = el('div', 'trump-card');
    if (choice !== null) {
      const suitEl = el('div', 'trump-card-suit', capitalize(choice));
      suitEl.style.color = choice;
      cardEl.appendChild(suitEl);
    } else {
      cardEl.appendChild(el('div', 'trump-card-suit', 'No Trump'));
    }
    cardEl.addEventListener('click', () => selectTrump(choice));
    trumpRow.appendChild(cardEl);
  }
  section.appendChild(trumpRow);

  const layout = el('div', 'oracle-layout');
  layout.appendChild(section);

  // Empty top area placeholder
  root.appendChild(el('div', 'hand hand-top'));

  // Center content
  root.appendChild(layout);

  // Bottom hand
  const handEl = el('div', 'hand hand-bottom');
  for (const card of hands[0]) {
    handEl.appendChild(renderCard(card, { hidden: false, active: false }));
  }
  root.appendChild(handEl);
}

/** Stage 3: Choose contract tier */
function renderOracleStage3() {
  const root = clearRoot();
  if (!root) return;

  const section = el('div', 'oracle-section');

  renderOracleResults(section);

  const trumpLabel = chosenTrumpChoice !== null ? capitalize(/** @type {Suit} */ (chosenTrumpChoice)) : 'No Trump';
  section.appendChild(el('div', 'section-title', 'CHOOSE CONTRACT — ' + trumpLabel));

  const tierRow = el('div', 'card-row');
  const tiers = chosenTrumpChoice === null ? NOTRUMP_TIERS : CONTRACT_TIERS;
  for (const tier of tiers) {
    const cardEl = el('div', 'contract-card');
    cardEl.appendChild(el('div', 'contract-name', tier.label));
    cardEl.appendChild(el('div', '', tier.tricksNeeded + ' tricks'));
    cardEl.appendChild(el('div', 'contract-points', '+' + tier.successPoints + ' / ' + tier.failurePoints));
    cardEl.addEventListener('click', () => {
      const label = chosenTrumpChoice !== null
        ? tier.label + ' ' + capitalize(/** @type {Suit} */ (chosenTrumpChoice))
        : tier.label;
      selectContract({
        label,
        trumpSuit: /** @type {Suit | null} */ (chosenTrumpChoice),
        tricksNeeded: tier.tricksNeeded,
        successPoints: tier.successPoints,
        failurePoints: tier.failurePoints,
      });
    });
    tierRow.appendChild(cardEl);
  }
  section.appendChild(tierRow);

  const layout = el('div', 'oracle-layout');
  layout.appendChild(section);

  // Empty top area placeholder
  root.appendChild(el('div', 'hand hand-top'));

  // Center content
  root.appendChild(layout);

  // Bottom hand
  const handEl = el('div', 'hand hand-bottom');
  for (const card of hands[0]) {
    handEl.appendChild(renderCard(card, { hidden: false, active: false }));
  }
  root.appendChild(handEl);
}

/** @param {number | Suit} choice */
function resolveOracle(choice) {
  if (selectedOracleIndex < 0) return;
  const oracle = currentOracles[selectedOracleIndex];
  const result = oracle.resolve(choice);
  oracleResults.push(result);
  oraclesRemaining--;
  selectedOracleIndex = -1;
  if (oraclesRemaining > 0) {
    currentOracles = drawOracles(ORACLES_PER_ROUND);
  } else {
    currentOracles = [];
  }
  render();
}

/** @param {Contract} contract */
function selectContract(contract) {
  chosenContract = contract;
  trumpSuit = contract.trumpSuit;
  gamePhase = "play";
  selectedOracleIndex = -1;
  render();
}

// --- play mode ---

function renderPlay() {
  const root = clearRoot();
  if (!root) return;
  root.classList.add('play-mode');

  // HUD left (desktop)
  const hudLeft = el('div', 'hud-left');
  hudLeft.appendChild(el('div', 'score', 'Tricks: ' + tricksWon + '/' + (chosenContract ? chosenContract.tricksNeeded : '?')));
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
  if (chosenContract) {
    hudLeft.appendChild(el('div', 'contract-indicator', contractPointsLabel(chosenContract)));
  }
  root.appendChild(hudLeft);

  // HUD right (desktop)
  const hudRight = el('div', 'hud-right');
  hudRight.appendChild(el('div', 'total-score', 'Score: ' + totalScore));
  if (oracleResults.length > 0) {
    const resultsEl = el('div', 'oracle-results');
    for (const result of oracleResults) {
      resultsEl.appendChild(el('div', '', result));
    }
    hudRight.appendChild(resultsEl);
  }
  root.appendChild(hudRight);

  // HUD top (mobile) - same info, laid out horizontally
  const hudTop = el('div', 'hud-top');
  hudTop.appendChild(el('div', 'score', 'Tricks: ' + tricksWon + '/' + (chosenContract ? chosenContract.tricksNeeded : '?')));
  const trumpEl2 = el('div', 'trump-indicator');
  if (trumpSuit) {
    const label = el('span', '', 'Trump: ');
    const suitName = el('span', '', capitalize(trumpSuit));
    suitName.style.color = trumpSuit;
    trumpEl2.appendChild(label);
    trumpEl2.appendChild(suitName);
  } else {
    trumpEl2.textContent = 'No Trump';
  }
  hudTop.appendChild(trumpEl2);
  hudTop.appendChild(el('div', 'total-score', 'Score: ' + totalScore));
  root.appendChild(hudTop);

  const cp = currentPlayer();
  const trickComplete = currentTrick.length === 4;

  // Top hand (partner)
  const topHand = el('div', 'hand hand-top');
  const topActive = !trickComplete && cp === 2;
  for (const card of hands[2]) {
    const legal = canPlay(card, hands[2]);
    const cardActive = topActive && legal;
    const onClick = (topActive && legal) ? () => playCard(2, card) : null;
    topHand.appendChild(renderCard(card, { hidden: false, active: cardActive, onClick }));
  }
  root.appendChild(topHand);

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

  // Bottom hand (player)
  const bottomHand = el('div', 'hand hand-bottom');
  const bottomActive = !trickComplete && cp === 0;
  for (const card of hands[0]) {
    const legal = canPlay(card, hands[0]);
    const cardActive = bottomActive && legal;
    const onClick = (bottomActive && legal) ? () => playCard(0, card) : null;
    bottomHand.appendChild(renderCard(card, { hidden: false, active: cardActive, onClick }));
  }
  root.appendChild(bottomHand);
}

// --- result mode ---

function renderResult() {
  const root = clearRoot();
  if (!root) return;

  const resultEl = el('div', 'result-screen');

  if (chosenContract) {
    const { made, points } = contractResult(chosenContract);
    const earlyEnd = hands[0].length > 0;

    resultEl.appendChild(el('div', 'result-title', made ? 'Contract Made!' : 'Contract Failed'));
    if (earlyEnd && made) {
      resultEl.appendChild(el('div', '', 'Won ' + tricksWon + ' of ' + chosenContract.tricksNeeded + ' needed — contract secured'));
    } else if (earlyEnd) {
      const handsLeft = hands[0].length;
      resultEl.appendChild(el('div', '', 'Won ' + tricksWon + ' ' + plural('trick', tricksWon) + ' with ' + handsLeft + ' ' + plural('hand', handsLeft) + ' left'));
      resultEl.appendChild(el('div', '', 'Needed ' + chosenContract.tricksNeeded + ' — not enough tricks remaining'));
    } else {
      resultEl.appendChild(el('div', '', chosenContract.label + ': Won ' + tricksWon + ' of ' + chosenContract.tricksNeeded + ' needed'));
    }
    resultEl.appendChild(el('div', 'result-points', (points > 0 ? '+' : '') + points + ' points'));
    resultEl.appendChild(el('div', '', 'Total Score: ' + totalScore));
  }

  resultEl.appendChild(el('div', 'result-continue', 'Click to continue'));

  resultEl.addEventListener('click', startNewRound);
  root.appendChild(resultEl);

  // Only show hands on desktop (> 600px)
  if (hands[0].length > 0 && window.innerWidth > 600) {
    root.classList.add('result-mode');
    renderHands(root, true);
  }
}

// --- round lifecycle ---

function startNewRound() {
  dealHands();
  gamePhase = "oracle";
  oraclesRemaining = ORACLES_PER_ROUND;
  currentOracles = drawOracles(ORACLES_PER_ROUND);
  chosenTrumpChoice = undefined;
  chosenContract = null;
  oracleResults = [];
  selectedOracleIndex = -1;
  tricksWon = 0;
  currentTrick = [];
  leadPlayer = 0;
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
  const hopeless = chosenContract && tricksWon + hands[0].length < chosenContract.tricksNeeded;
  const alreadyWon = chosenContract && tricksWon >= chosenContract.tricksNeeded;
  if (roundOver || hopeless || alreadyWon) {
    if (chosenContract) {
      totalScore += contractResult(chosenContract).points;
    }
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
  for (let i = 1; i < currentTrick.length; i++) {
    if (cardBeats(currentTrick[i], best)) best = currentTrick[i];
  }

  const leadSuit = currentTrick[0].suit;
  const suitCards = hand.filter(c => c.suit === leadSuit);
  const mustFollow = suitCards.length > 0;

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

  if (mustFollow) {
    return suitCards.reduce((a, b) => a.rank < b.rank ? a : b);
  }
  const nonTrump = hand.filter(c => c.suit !== trumpSuit);
  const pool = nonTrump.length > 0 ? nonTrump : hand;
  const groups = groupBySuit(pool);
  const minLen = Math.min(...groups.map(g => g.length));
  const shortests = groups.filter(g => g.length === minLen);
  const shortest = pickRandom(shortests);
  return shortest.reduce((a, b) => a.rank < b.rank ? a : b);
}

// --- game loop ---

/** @param {number} timestamp */
function gameLoop(timestamp) {
  const dt = (timestamp - lastTime) / 1000;
  lastTime = timestamp;

  if (gamePhase === "play") {
    if (currentTrick.length === 4) {
      animationDelay -= dt;
      if (animationDelay <= 0) {
        resolveTrick();
        animationDelay = 1.0;
        render();
      }
    } else {
      const cp = currentPlayer();
      if (!isHuman(cp)) {
        animationDelay -= dt;
        if (animationDelay <= 0) {
          const hand = hands[cp];
          if (hand.length > 0) {
            const card = aiPickCard(hand);
            hand.splice(hand.indexOf(card), 1);
            currentTrick.push(card);
            animationDelay = 1.0;
            render();
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

dealHands();
currentOracles = drawOracles(ORACLES_PER_ROUND);
render();
requestAnimationFrame((timestamp) => {
  lastTime = timestamp;
  gameLoop(timestamp);
});
