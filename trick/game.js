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
/** @type {OracleCard[]} */
let lastOracles = [];
/** @type {(Suit | null)[]} */
let trumpChoices = [];
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
  { label: "Safe", tricksNeeded: 6, successPoints: 5, failurePoints: -3, tier: 0 },
  { label: "Standard", tricksNeeded: 7, successPoints: 10, failurePoints: -5, tier: 1 },
  { label: "Ambitious", tricksNeeded: 8, successPoints: 18, failurePoints: -8, tier: 2 },
  { label: "Bold", tricksNeeded: 9, successPoints: 28, failurePoints: -12, tier: 3 },
  { label: "Grand", tricksNeeded: 10, successPoints: 40, failurePoints: -18, tier: 4 },
];

const NOTRUMP_TIERS = [
  { label: "Safe Notrump", tricksNeeded: 6, successPoints: 8, failurePoints: -4, tier: 0 },
  { label: "Standard Notrump", tricksNeeded: 7, successPoints: 15, failurePoints: -8, tier: 1 },
  { label: "Ambitious Notrump", tricksNeeded: 8, successPoints: 25, failurePoints: -12, tier: 2 },
  { label: "Grand Notrump", tricksNeeded: 10, successPoints: 50, failurePoints: -25, tier: 4 },
];

function generateTrumpChoices() {
  /** @type {(Suit | null)[]} */
  const options = [...SUITS, null];
  shuffle(options);
  return options.slice(0, 2);
}

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

  const helpBtn = el('button', 'tutorial-btn', '?');
  helpBtn.addEventListener('click', () => { showTutorial = true; render(); });
  root.appendChild(helpBtn);

  if (showTutorial) renderTutorial(root);
}

/** @param {HTMLElement} root */
function renderTutorial(root) {
  const overlay = el('div', 'tutorial-overlay');
  const content = el('div', 'tutorial-content');

  content.appendChild(el('div', 'tutorial-title', 'How to Play'));

  const sections = [
    ['Overview', 'A "trick-taking" card game. You (bottom of screen) and your teammate (top) play against two opponents (left and right). You play cards for both yourself and your teammate, but your teammate\'s hand will only be revealed once play begins. Each round, you\'ll first use "oracle cards" to learn about your partner\'s and opponents\' hands, then pick a "contract" for how many "tricks" you need to win, then play out the tricks and see if you make your contract.'],
    ['Oracle Phase', 'Each round starts by selecting 3 oracle cards. Oracle cards tell you something about other players\' hands -- like how many cards of a suit they hold, or their longest suit.'],
    ['Contracts', 'After using all 3 oracles, you choose a contract in two steps. First, pick a "trump suit" (explained below) from 2 randomly offered choices (which may include "No Trump"). Then pick a contract tier -- each tier requires a different number of tricks and has a different point reward/penalty. Higher risk contracts pay more but cost more if you fail. Use your oracle information to choose a trump suit that favors your hand and a tier you\'re confident you can make.'],
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

function renderOracleMode() {
  const root = clearRoot();
  if (!root) return;

  root.appendChild(el('div', 'score', 'Total Score: ' + totalScore));

  const oracleSection = el('div', 'oracle-section');

  // Oracle cards (always rendered for stable layout)
  const oraclesActive = oraclesRemaining > 0;
  const titleEl = el('div', 'section-title', oraclesActive ? 'ORACLE CARDS (pick one)' : 'ORACLE CARDS');
  if (!oraclesActive) titleEl.style.visibility = 'hidden';
  oracleSection.appendChild(titleEl);

  const oracleRow = el('div', 'card-row');
  const oraclesToShow = oraclesActive ? currentOracles : lastOracles;
  for (let i = 0; i < oraclesToShow.length; i++) {
    const oracle = oraclesToShow[i];
    const oracleEl = el('div', 'oracle-card' + (oraclesActive && selectedOracleIndex === i ? ' selected' : ''));
    if (!oraclesActive) oracleEl.style.visibility = 'hidden';

    oracleEl.appendChild(el('div', 'oracle-label', oracle.label));
    oracleEl.appendChild(el('div', 'oracle-choice-type', oracle.choiceType === 'player' ? '[choose player]' : '[choose suit]'));

    if (oraclesActive) {
      const idx = i;
      oracleEl.addEventListener('click', () => {
        selectedOracleIndex = idx;
        render();
      });
    }
    oracleRow.appendChild(oracleEl);
  }
  oracleSection.appendChild(oracleRow);

  const remainingEl = el('div', 'oracle-remaining', 'Oracles remaining: ' + oraclesRemaining);
  if (!oraclesActive) remainingEl.style.visibility = 'hidden';
  oracleSection.appendChild(remainingEl);

  // Choice buttons (always rendered for stable layout)
  const hasSelection = oraclesActive && selectedOracleIndex >= 0 && selectedOracleIndex < currentOracles.length;
  const choiceRow = el('div', 'choice-row');
  if (!hasSelection) choiceRow.style.visibility = 'hidden';

  if (hasSelection) {
    const oracle = currentOracles[selectedOracleIndex];
    if (oracle.choiceType === 'player') {
      for (const p of HIDDEN_PLAYERS) {
        const btn = el('button', 'choice-btn', PLAYER_LABELS[p]);
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          resolveOracle(p);
        });
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
  } else {
    // Placeholder buttons to reserve space
    for (const suit of SUITS) {
      choiceRow.appendChild(el('button', 'choice-btn suit-btn', suit));
    }
  }
  oracleSection.appendChild(choiceRow);

  // Oracle results — always render 3 slots so contract section never moves
  const resultsEl = el('div', 'oracle-results');
  for (let i = 0; i < ORACLES_PER_ROUND; i++) {
    const line = el('div', '', oracleResults[i] || '\u00a0');
    if (!oracleResults[i]) line.style.visibility = 'hidden';
    resultsEl.appendChild(line);
  }
  oracleSection.appendChild(resultsEl);

  // Wrap oracle + contract in a flex column layout
  const layout = el('div', 'oracle-layout');
  layout.appendChild(oracleSection);

  // Trump / Contract selection (two-step)
  const contractSection = el('div', 'contract-section');
  const locked = oraclesRemaining > 0;

  if (chosenTrumpChoice === undefined) {
    // Step 1: pick trump
    contractSection.appendChild(el('div', 'section-title', locked ? 'CHOOSE TRUMP (use all oracles first)' : 'CHOOSE TRUMP'));
    const trumpRow = el('div', 'card-row');
    for (const choice of trumpChoices) {
      const cardEl = el('div', 'trump-card' + (locked ? ' contract-locked' : ''));
      if (choice !== null) {
        const suitEl = el('div', 'trump-card-suit', '\u25a0 ' + capitalize(choice));
        suitEl.style.color = choice;
        cardEl.appendChild(suitEl);
      } else {
        cardEl.appendChild(el('div', 'trump-card-suit', 'No Trump'));
      }
      if (!locked) {
        cardEl.addEventListener('click', () => selectTrump(choice));
      }
      trumpRow.appendChild(cardEl);
    }
    contractSection.appendChild(trumpRow);
  } else {
    // Step 2: pick tier
    const trumpLabel = chosenTrumpChoice !== null ? capitalize(chosenTrumpChoice) : 'No Trump';
    contractSection.appendChild(el('div', 'section-title', 'CHOOSE CONTRACT \u2014 ' + trumpLabel));
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
    contractSection.appendChild(tierRow);
  }

  layout.appendChild(contractSection);
  root.appendChild(layout);

  renderHands(root, false);
}

/** @param {number | Suit} choice */
function resolveOracle(choice) {
  if (selectedOracleIndex < 0) return;
  const oracle = currentOracles[selectedOracleIndex];
  const result = oracle.resolve(choice);
  oracleResults.push(result);
  oraclesRemaining--;
  selectedOracleIndex = -1;
  lastOracles = currentOracles;
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

  root.appendChild(el('div', 'score', 'Tricks won: ' + tricksWon + (chosenContract ? ' / ' + chosenContract.tricksNeeded + ' needed' : '')));

  const trumpEl = el('div', 'trump-indicator');
  if (trumpSuit) {
    trumpEl.textContent = 'Trump: ';
    const swatch = el('span', 'trump-swatch');
    swatch.style.background = trumpSuit;
    trumpEl.appendChild(swatch);
  } else {
    trumpEl.textContent = 'No Trump';
  }
  root.appendChild(trumpEl);

  if (chosenContract) {
    root.appendChild(el('div', 'contract-indicator', chosenContract.label + ' (' + contractPointsLabel(chosenContract) + ')'));
  }

  root.appendChild(el('div', 'total-score', 'Score: ' + totalScore));

  if (oracleResults.length > 0) {
    const resultsEl = el('div', 'oracle-results play-oracle-results');
    for (const result of oracleResults) {
      resultsEl.appendChild(el('div', '', result));
    }
    root.appendChild(resultsEl);
  }

  const cp = currentPlayer();
  const trickComplete = currentTrick.length === 4;

  for (let i = 0; i < 4; i++) {
    const handEl = el('div', 'hand hand-' + POSITIONS[i]);
    const active = !trickComplete && cp === i;
    const hidden = !isHuman(i) && !debugShowAll;

    for (const card of hands[i]) {
      const legal = canPlay(card, hands[i]);
      const cardActive = active && (!isHuman(i) || legal);
      const onClick = (active && isHuman(i) && legal) ? () => playCard(i, card) : null;
      handEl.appendChild(renderCard(card, { hidden, active: cardActive, onClick }));
    }
    root.appendChild(handEl);
  }

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
      const tricksLeft = hands[0].length;
      resultEl.appendChild(el('div', '', 'Won ' + tricksWon + ' with ' + tricksLeft + ' ' + plural('trick', tricksLeft) + ' left'));
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

  if (hands[0].length > 0) {
    renderHands(root, true);
  }
}

// --- round lifecycle ---

function startNewRound() {
  dealHands();
  gamePhase = "oracle";
  oraclesRemaining = ORACLES_PER_ROUND;
  currentOracles = drawOracles(ORACLES_PER_ROUND);
  lastOracles = currentOracles;
  trumpChoices = generateTrumpChoices();
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
lastOracles = currentOracles;
trumpChoices = generateTrumpChoices();
render();
requestAnimationFrame((timestamp) => {
  lastTime = timestamp;
  gameLoop(timestamp);
});
