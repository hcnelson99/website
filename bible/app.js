// @ts-check
import { css, globalCss, div, span, h, h2 } from '../ui.js';

// ── Global styles ──────────────────────────────────────────

globalCss`
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { font-size: 18px; }
  body {
    font-family: Georgia, 'Times New Roman', serif;
    color: #1a1a1a;
    background: #faf8f4;
    line-height: 1.7;
  }
`;

// ── CSS classes ────────────────────────────────────────────

const layout = css`
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
`;

const topBar = css`
  position: sticky;
  top: 0;
  background: #f0ece4;
  border-bottom: 1px solid #d5cfc3;
  padding: 10px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  z-index: 10;
`;

const selectCls = css`
  font: inherit;
  font-size: 0.85rem;
  padding: 6px 8px;
  border: 1px solid #c5bfb0;
  border-radius: 4px;
  background: white;
  color: #3a3226;
  height: 34px;
  line-height: 20px;
`;

const mainPane = css`
  flex: 1;
  overflow-y: auto;
`;

const readingPane = css`
  max-width: 680px;
  margin: 0 auto;
  padding: 24px 20px 80px;
  width: 100%;
`;

const chapterHeading = css`
  font-size: 1.4rem;
  margin-bottom: 16px;
  color: #5a4f3e;
  font-family: system-ui, sans-serif;
  font-weight: 300;
`;

const paraCls = css`
  margin-bottom: 12px;
`;

const verseNum = css`
  font-size: 0.6em;
  vertical-align: super;
  color: #9a8e7a;
  font-family: system-ui, sans-serif;
  margin-right: 2px;
  font-weight: 600;
`;

const loadingCls = css`
  padding: 40px 20px;
  color: #8a7f6f;
  font-style: italic;
`;

const nextChapterBtn = css`
  display: block;
  margin: 32px auto 0;
  padding: 10px 24px;
  font: inherit;
  font-size: 0.9rem;
  background: #f0ece4;
  border: 1px solid #c5bfb0;
  border-radius: 4px;
  color: #3a3226;
  cursor: pointer;
`;

// ── State ──────────────────────────────────────────────────

/** @typedef {{ id: string, name: string, testament: string }} BookInfo */
/** @typedef {{ vs: number, text: string }} Verse */
/** @typedef {Record<number, Verse[][]>} ParsedBook */

/** @type {BookInfo[]} */
let books = [];
/** @type {BookInfo | null} */
let currentBook = null;
/** @type {number} */
let currentChapter = 1;
/** @type {ParsedBook | null} */
let parsed = null;
/** @type {number} */
let currentVerse = 1;
/** @type {'kjv' | 'niv'} */
let currentTranslation = 'kjv';
/** @type {Map<string, ParsedBook>} */
const cache = new Map();

// ── Place persistence ────────────────────────────────────

const PLACE_KEY = 'bible-place';

function savePlace() {
  if (!currentBook) return;
  localStorage.setItem(PLACE_KEY, JSON.stringify({
    bookId: currentBook.id,
    chapter: currentChapter,
    verse: currentVerse,
    translation: currentTranslation,
  }));
}

/** @returns {{ bookId: string, chapter: number, verse: number, translation?: string } | null} */
function loadPlace() {
  try {
    const raw = localStorage.getItem(PLACE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

/** @param {number} verse */
function scrollToVerse(verse) {
  const el = document.querySelector(`[data-verse="${verse}"]`);
  if (el) el.scrollIntoView({ block: 'start' });
}

/** @type {number} */
let scrollTimer = 0;

function onReadingScroll() {
  clearTimeout(scrollTimer);
  scrollTimer = window.setTimeout(() => {
    const pane = document.querySelector('.' + mainPane);
    if (!pane) return;
    const spans = Array.from(pane.querySelectorAll('[data-verse]'));
    const paneTop = pane.getBoundingClientRect().top;
    let best = 1;
    for (const s of spans) {
      if (s.getBoundingClientRect().top >= paneTop) {
        best = Number(s.getAttribute('data-verse'));
        break;
      }
    }
    currentVerse = best;
    savePlace();
  }, 300);
}

// ── Parsing ────────────────────────────────────────────────

/** @param {string} text @returns {ParsedBook} */
function parseBook(text) {
  /** @type {ParsedBook} */
  const chapters = {};

  for (const para of text.split(/\n\s*\n/)) {
    const flat = para.replace(/\n/g, ' ').trim();
    if (!flat) continue;

    // Find all verse markers (e.g. "10:1 ") and extract text between them
    const matches = [...flat.matchAll(/(\d+):(\d+) /g)];
    if (!matches.length) continue;

    const ch = +matches[0][1];
    const verses = matches.map((m, i) => {
      const start = /** @type {number} */ (m.index) + m[0].length;
      const end = i + 1 < matches.length ? matches[i + 1].index : flat.length;
      return { vs: +m[2], text: flat.slice(start, end).trim() };
    });

    if (!chapters[ch]) chapters[ch] = [];
    chapters[ch].push(verses);
  }
  return chapters;
}

// ── Data loading ───────────────────────────────────────────

async function loadBooks() {
  const res = await fetch('data/books.json');
  books = await res.json();
}

/** @param {BookInfo} book @param {{ chapter?: number, verse?: number }} [restore] */
async function selectBook(book, restore) {
  currentBook = book;
  currentChapter = restore?.chapter ?? 1;
  currentVerse = restore?.verse ?? 1;
  render();

  const cacheKey = `${currentTranslation}:${book.id}`;
  if (cache.has(cacheKey)) {
    parsed = /** @type {ParsedBook} */ (cache.get(cacheKey));
    render();
    if (restore?.verse) scrollToVerse(restore.verse);
    savePlace();
    return;
  }

  parsed = null;
  render();

  const res = await fetch(`data/${currentTranslation}/${book.id}.txt`);
  const text = await res.text();
  parsed = parseBook(text);
  cache.set(cacheKey, parsed);
  render();
  if (restore?.verse) scrollToVerse(restore.verse);
  savePlace();
}

/** @param {number} ch */
function selectChapter(ch) {
  currentChapter = ch;
  currentVerse = 1;
  render();
  const pane = document.querySelector('.' + mainPane);
  if (pane) pane.scrollTop = 0;
  savePlace();
}

function toggleTranslation() {
  currentTranslation = currentTranslation === 'kjv' ? 'niv' : 'kjv';
  parsed = null;
  if (currentBook) selectBook(currentBook, { chapter: currentChapter, verse: currentVerse });
}

// ── Rendering ──────────────────────────────────────────────

function render() {
  const root = document.getElementById('app') || (() => {
    const el = div({ id: 'app', class: layout });
    document.body.appendChild(el);
    return el;
  })();

  root.innerHTML = '';

  const chapterNums = parsed ? Object.keys(parsed).map(Number).sort((a, b) => a - b) : [];

  // Book select (with optgroups for OT/NT)
  const bookSelect = h('select', {
    class: selectCls,
    onchange: (/** @type {Event} */ e) => {
      const id = /** @type {HTMLSelectElement} */ (e.target).value;
      const book = books.find(b => b.id === id);
      if (book) selectBook(book);
    },
  },
    h('optgroup', { label: 'Old Testament' },
      ...books.filter(b => b.testament === 'OT').map(b =>
        h('option', { value: b.id, selected: currentBook?.id === b.id || undefined }, b.name)
      ),
    ),
    h('optgroup', { label: 'New Testament' },
      ...books.filter(b => b.testament === 'NT').map(b =>
        h('option', { value: b.id, selected: currentBook?.id === b.id || undefined }, b.name)
      ),
    ),
  );

  // Chapter select
  const chapterSelect = chapterNums.length > 0 ? h('select', {
    class: selectCls,
    onchange: (/** @type {Event} */ e) => {
      selectChapter(parseInt(/** @type {HTMLSelectElement} */ (e.target).value));
    },
  },
    ...chapterNums.map(ch =>
      h('option', { value: String(ch), selected: ch === currentChapter || undefined }, `Chapter ${ch}`)
    ),
  ) : null;

  const translationBtn = h('button', {
    class: selectCls,
    onclick: toggleTranslation,
  }, currentTranslation.toUpperCase());

  root.appendChild(div({ class: topBar }, bookSelect, chapterSelect, translationBtn));
  const pane = div({ class: mainPane }, renderReading());
  pane.addEventListener('scroll', onReadingScroll);
  root.appendChild(pane);
}

function renderReading() {
  if (!parsed) {
    return div({ class: readingPane },
      div({ class: loadingCls }, 'Loading...'),
    );
  }

  const paragraphs = parsed[currentChapter];
  if (!paragraphs) {
    return div({ class: readingPane },
      div({ class: loadingCls }, 'Chapter not found.'),
    );
  }

  const chapterNums = Object.keys(/** @type {ParsedBook} */ (parsed)).map(Number).sort((a, b) => a - b);
  const nextCh = chapterNums[chapterNums.indexOf(currentChapter) + 1];
  const nextBook = nextCh == null
    ? books[books.indexOf(/** @type {BookInfo} */ (currentBook)) + 1]
    : null;

  /** @type {HTMLElement | null} */
  let nextBtn = null;
  if (nextCh != null) {
    nextBtn = h('button', { class: nextChapterBtn, onclick: () => selectChapter(nextCh) },
      `Chapter ${nextCh} →`);
  } else if (nextBook) {
    nextBtn = h('button', { class: nextChapterBtn, onclick: () => selectBook(nextBook) },
      `${nextBook.name} →`);
  }

  return div({ class: readingPane },
    h2({ class: chapterHeading }, `${/** @type {BookInfo} */ (currentBook).name} ${currentChapter}`),
    ...paragraphs.map(verses =>
      h('p', { class: paraCls },
        ...verses.flatMap(v => [
          span({ class: verseNum, 'data-verse': String(v.vs) }, String(v.vs)),
          v.text + ' ',
        ]),
      )
    ),
    nextBtn,
  );
}

// ── Init ───────────────────────────────────────────────────

async function init() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js');
  }
  await loadBooks();
  const place = loadPlace();
  if (place?.translation === 'kjv' || place?.translation === 'niv') {
    currentTranslation = place.translation;
  }
  const saved = place && books.find(b => b.id === place.bookId);
  if (saved) {
    await selectBook(saved, { chapter: place.chapter, verse: place.verse });
  } else {
    await selectBook(books[0]);
  }
}

init();
