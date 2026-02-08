// @ts-check

/**
 * @typedef {"red" | "blue" | "green" | "orange"} Suit
 * @typedef {{rank: number, suit: Suit}} Card
 * @typedef {{
 *   label: string,
 *   choiceType: "none" | "suit" | "honor" | "opponent",
 *   resolve: (choice?: number | Suit) => string
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
/** @type {Card[]} */
let revealedHandCard = [];
/** @type {OracleCard[]} */
let oracleDeck = [];

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

/** @type {Record<string, number>} */
const HONOR_RANKS = { "Aces": 14, "Kings": 13, "Queens": 12, "Jacks": 11 };

/** @returns {OracleCard} */
function oraclePartnerLongest() {
  return {
    label: "Partner Longest Suit",
    choiceType: "none",
    resolve() {
      const counts = SUITS.map(s => ({ suit: s, count: hands[2].filter(c => c.suit === s).length }));
      const max = Math.max(...counts.map(c => c.count));
      const tied = counts.filter(c => c.count === max);
      const pick = pickRandom(tied);
      return `Partner's longest suit is ${pick.suit} (${pick.count} ${plural("card", pick.count)}).`;
    }
  };
}

/** @returns {OracleCard} */
function oraclePartnerHighCards() {
  return {
    label: "Partner High Cards",
    choiceType: "none",
    resolve() {
      const count = hands[2].filter(c => c.rank >= 11).length;
      return `Partner has ${count} ${plural("card", count)} ranked J or higher.`;
    }
  };
}

/** @returns {OracleCard} */
function oracleRevealHonors() {
  return {
    label: "Reveal Honors",
    choiceType: "honor",
    resolve(choice) {
      const rank = /** @type {number} */ (choice);
      const label = Object.keys(HONOR_RANKS).find(k => HONOR_RANKS[k] === rank) || "?";
      const cards = hands.flat().filter(c => c.rank === rank);
      for (const c of cards) revealedHandCard.push(c);
      return `All ${label} revealed! (${cards.length} cards)`;
    }
  };
}

/** @returns {OracleCard} */
function oracleReveal8() {
  return {
    label: "Reveal 8 Random",
    choiceType: "none",
    resolve() {
      const pool = [...hands[1], ...hands[2], ...hands[3]];
      shuffle(pool);
      const picked = pool.slice(0, 8);
      for (const c of picked) revealedHandCard.push(c);
      return `Revealed ${picked.length} random cards from other players.`;
    }
  };
}

/** @returns {OracleCard} */
function oracleRevealShortSuits() {
  return {
    label: "Reveal Short Suits",
    choiceType: "none",
    resolve() {
      const lines = [];
      for (const p of [1, 2, 3]) {
        const shortSuits = SUITS.filter(s => hands[p].filter(c => c.suit === s).length <= 1);
        if (shortSuits.length > 0) {
          lines.push(`${PLAYER_LABELS[p]}: short in ${shortSuits.join(", ")}`);
        } else {
          lines.push(`${PLAYER_LABELS[p]}: no short suits`);
        }
      }
      return lines.join(". ") + ".";
    }
  };
}

/** @returns {OracleCard} */
function oracleTakeCard() {
  return {
    label: "Take Card",
    choiceType: "suit",
    resolve(choice) {
      const suit = /** @type {Suit} */ (choice);
      // Find cards of that suit from other players
      /** @type {{player: number, card: Card}[]} */
      const candidates = [];
      for (const p of [1, 2, 3]) {
        for (const c of hands[p]) {
          if (c.suit === suit) candidates.push({ player: p, card: c });
        }
      }
      if (candidates.length === 0) return `No other player has a ${suit} card to take.`;
      const pick = pickRandom(candidates);
      // Remove from their hand
      hands[pick.player].splice(hands[pick.player].indexOf(pick.card), 1);
      // Give them a random card of a different suit from you
      const myOtherSuit = hands[0].filter(c => c.suit !== suit);
      if (myOtherSuit.length > 0) {
        const give = pickRandom(myOtherSuit);
        hands[0].splice(hands[0].indexOf(give), 1);
        hands[pick.player].push(give);
      }
      hands[0].push(pick.card);
      return `Took ${rankLabel(pick.card.rank)} of ${suit} from ${PLAYER_LABELS[pick.player]}.`;
    }
  };
}

/** @returns {OracleCard} */
function oracleCountSuit() {
  return {
    label: "Count Suit",
    choiceType: "suit",
    resolve(choice) {
      const suit = /** @type {Suit} */ (choice);
      const parts = [1, 2, 3].map(p => {
        const count = hands[p].filter(c => c.suit === suit).length;
        return `${PLAYER_LABELS[p]}: ${count}`;
      });
      return `${capitalize(suit)} count — ${parts.join(", ")}.`;
    }
  };
}

/** @returns {OracleCard} */
function oracleDiscardSuit() {
  return {
    label: "Discard Suit",
    choiceType: "suit",
    resolve(choice) {
      const suit = /** @type {Suit} */ (choice);
      const removed = hands[0].filter(c => c.suit === suit);
      if (removed.length === 0) return `You have no ${suit} cards to discard.`;
      // Remove from hand
      hands[0] = hands[0].filter(c => c.suit !== suit);
      // Distribute round-robin to players 1,2,3
      /** @type {Record<number, number>} */
      const given = { 1: 0, 2: 0, 3: 0 };
      for (let i = 0; i < removed.length; i++) {
        const target = 1 + (i % 3);
        hands[target].push(removed[i]);
        given[target]++;
      }
      // Take back same count from each
      for (const p of [1, 2, 3]) {
        for (let i = 0; i < given[p]; i++) {
          const pick = pickRandom(hands[p]);
          hands[p].splice(hands[p].indexOf(pick), 1);
          hands[0].push(pick);
        }
      }
      return `Discarded ${removed.length} ${suit} ${plural("card", removed.length)}, swapped with other players.`;
    }
  };
}

/** @returns {OracleCard} */
function oracleScoutOpponent() {
  return {
    label: "Scout Opponent",
    choiceType: "opponent",
    resolve(choice) {
      const player = /** @type {number} */ (choice);
      const counts = SUITS.map(s => {
        const count = hands[player].filter(c => c.suit === s).length;
        return `${count} ${s}`;
      });
      return `${PLAYER_LABELS[player]}: ${counts.join(", ")}.`;
    }
  };
}

function generateOracleDeck() {
  const deck = [
    oraclePartnerLongest(), oraclePartnerHighCards(),
    oracleRevealHonors(), oracleReveal8(),
    oracleRevealShortSuits(), oracleTakeCard(),
    oracleCountSuit(), oracleDiscardSuit(),
    oracleScoutOpponent()
  ];
  shuffle(deck);
  return deck;
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

    // Separate into visible and hidden, sort visible, concat
    /** @type {Card[]} */
    const visible = [];
    /** @type {Card[]} */
    const hidden = [];
    for (const card of hands[i]) {
      const revealed = revealedHandCard.some(c => c.rank === card.rank && c.suit === card.suit);
      if (!handHidden || revealed) visible.push(card);
      else hidden.push(card);
    }
    visible.sort(sortCmp);
    const ordered = [...visible, ...hidden];

    for (const card of ordered) {
      const isHiddenCard = hidden.includes(card);
      const legal = checkLegal ? canPlay(card, hands[i]) : false;
      const active = isActive && (!checkLegal || legal);
      const onClick = (checkLegal && legal && onPlay) ? () => onPlay(i, card) : null;
      handEl.appendChild(renderCard(card, { hidden: isHiddenCard, active, onClick }));
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
  const root = clearRoot();
  if (!root) return;

  const section = el('div', 'oracle-section');

  renderOracleResults(section);

  if (oraclesRemaining > 0) {
    renderOraclePicking(section);
  } else if (chosenTrumpChoice === undefined) {
    renderTrumpChoice(section);
  } else {
    renderContractChoice(section);
  }

  const layout = el('div', 'oracle-layout');
  layout.appendChild(section);

  root.appendChild(layout);
  renderHands(root, { activePlayer: 0 });
}

/** @param {HTMLElement} section */
function renderOraclePicking(section) {
  section.appendChild(el('div', 'section-title', 'ORACLE CARDS (pick one)'));

  const oracleRow = el('div', 'card-row');
  for (let i = 0; i < currentOracles.length; i++) {
    const oracle = currentOracles[i];
    const oracleEl = el('div', 'oracle-card' + (selectedOracleIndex === i ? ' selected' : ''));
    oracleEl.appendChild(el('div', 'oracle-label', oracle.label));
    const choiceLabel = oracle.choiceType === 'none' ? '[auto]'
      : oracle.choiceType === 'opponent' ? '[choose opponent]'
      : oracle.choiceType === 'honor' ? '[choose honor]'
      : '[choose suit]';
    oracleEl.appendChild(el('div', 'oracle-choice-type', choiceLabel));
    const idx = i;
    oracleEl.addEventListener('click', () => {
      selectedOracleIndex = idx;
      // "none" oracles resolve immediately
      if (oracle.choiceType === 'none') {
        resolveOracle();
      } else {
        render();
      }
    });
    oracleRow.appendChild(oracleEl);
  }
  section.appendChild(oracleRow);

  section.appendChild(el('div', 'oracle-remaining', 'Oracles remaining: ' + oraclesRemaining));

  // Choice buttons (always visible, but disabled if no selection)
  const hasSelection = selectedOracleIndex >= 0 && selectedOracleIndex < currentOracles.length;
  const oracle = hasSelection ? currentOracles[selectedOracleIndex] : null;
  const choiceRow = el('div', 'choice-row');

  if (oracle && oracle.choiceType === 'opponent') {
    for (const p of [1, 3]) {
      const btn = el('button', 'choice-btn', PLAYER_LABELS[p]);
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        resolveOracle(p);
      });
      choiceRow.appendChild(btn);
    }
  } else if (oracle && oracle.choiceType === 'honor') {
    for (const [label, rank] of Object.entries(HONOR_RANKS)) {
      const btn = el('button', 'choice-btn', label);
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        resolveOracle(rank);
      });
      choiceRow.appendChild(btn);
    }
  } else if (oracle && oracle.choiceType === 'suit') {
    for (const suit of SUITS) {
      const btn = el('button', 'choice-btn suit-btn', suit);
      btn.style.color = suit;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        resolveOracle(suit);
      });
      choiceRow.appendChild(btn);
    }
  } else {
    // Default: suit buttons (most common), disabled if no selection
    for (const suit of SUITS) {
      const btn = el('button', 'choice-btn suit-btn disabled', suit);
      btn.style.color = suit;
      choiceRow.appendChild(btn);
    }
  }
  section.appendChild(choiceRow);
}

/** @param {HTMLElement} section */
function renderTrumpChoice(section) {
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
}

/** @param {HTMLElement} section */
function renderContractChoice(section) {
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
}

/** @param {number | Suit} [choice] */
function resolveOracle(choice) {
  if (selectedOracleIndex < 0) return;
  const oracle = currentOracles[selectedOracleIndex];
  const result = oracle.resolve(choice);
  oracleResults.push(result);
  oraclesRemaining--;
  selectedOracleIndex = -1;
  if (oraclesRemaining > 0) {
    currentOracles = oracleDeck.splice(0, 3);
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

  root.classList.add('result-mode');
  renderHands(root, { revealAll: true });
}

// --- round lifecycle ---

function startNewRound() {
  dealHands();
  gamePhase = "oracle";
  oraclesRemaining = ORACLES_PER_ROUND;
  oracleDeck = generateOracleDeck();
  currentOracles = oracleDeck.splice(0, 3);
  chosenTrumpChoice = undefined;
  chosenContract = null;
  oracleResults = [];
  revealedHandCard = [];
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

dealHands();
oracleDeck = generateOracleDeck();
currentOracles = oracleDeck.splice(0, 3);
render();
requestAnimationFrame((timestamp) => {
  lastTime = timestamp;
  gameLoop(timestamp);
});
