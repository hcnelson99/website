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

const verseLine = css`
  margin-bottom: 4px;
  text-indent: -0.5em;
  padding-left: 0.5em;
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

// ── State ──────────────────────────────────────────────────

/** @typedef {{ id: string, name: string, testament: string }} BookInfo */
/** @typedef {Record<number, Record<number, string>>} ParsedBook */

/** @type {BookInfo[]} */
let books = [];
/** @type {BookInfo | null} */
let currentBook = null;
/** @type {number} */
let currentChapter = 1;
/** @type {ParsedBook | null} */
let parsed = null;
/** @type {Map<string, ParsedBook>} */
const cache = new Map();

// ── Parsing ────────────────────────────────────────────────

/** @param {string} text @returns {ParsedBook} */
function parseBook(text) {
  /** @type {ParsedBook} */
  const chapters = {};
  let currentCh = 0;
  let currentVs = 0;

  for (const line of text.split('\n')) {
    const m = line.match(/^(\d+):(\d+)\s/);
    if (m) {
      currentCh = parseInt(m[1]);
      currentVs = parseInt(m[2]);
      if (!chapters[currentCh]) chapters[currentCh] = {};
      chapters[currentCh][currentVs] = line.slice(m[0].length);

      // Handle inline verses (e.g. "1:2 text 1:3 more text")
      let rest = chapters[currentCh][currentVs];
      const inlineRe = /\s(\d+):(\d+)\s/g;
      let im;
      while ((im = inlineRe.exec(rest)) !== null) {
        const inCh = parseInt(im[1]);
        const inVs = parseInt(im[2]);
        if (inCh === currentCh && inVs > currentVs) {
          chapters[currentCh][currentVs] = rest.slice(0, im.index);
          currentVs = inVs;
          chapters[currentCh][currentVs] = rest.slice(im.index + im[0].length);
          rest = chapters[currentCh][currentVs];
          inlineRe.lastIndex = 0;
        }
      }
    } else if (currentCh && currentVs && line.trim()) {
      chapters[currentCh][currentVs] += ' ' + line.trim();
    }
  }
  return chapters;
}

// ── Data loading ───────────────────────────────────────────

async function loadBooks() {
  const res = await fetch('data/books.json');
  books = await res.json();
}

/** @param {BookInfo} book */
async function selectBook(book) {
  currentBook = book;
  currentChapter = 1;
  render();

  if (cache.has(book.id)) {
    parsed = /** @type {ParsedBook} */ (cache.get(book.id));
    render();
    return;
  }

  parsed = null;
  render();

  const res = await fetch(`data/${book.id}.txt`);
  const text = await res.text();
  parsed = parseBook(text);
  cache.set(book.id, parsed);
  render();
}

/** @param {number} ch */
function selectChapter(ch) {
  currentChapter = ch;
  render();
  const pane = document.querySelector('.' + mainPane);
  if (pane) pane.scrollTop = 0;
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
    h('option', { value: '' }, '-- Book --'),
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

  root.appendChild(div({ class: topBar }, bookSelect, chapterSelect));
  root.appendChild(div({ class: mainPane }, renderReading()));
}

function renderReading() {
  if (!currentBook) {
    return div({ class: readingPane },
      div({ class: loadingCls }, 'Select a book to begin reading.'),
    );
  }

  if (!parsed) {
    return div({ class: readingPane },
      div({ class: loadingCls }, 'Loading...'),
    );
  }

  const chapter = parsed[currentChapter];
  if (!chapter) {
    return div({ class: readingPane },
      div({ class: loadingCls }, 'Chapter not found.'),
    );
  }

  const verses = Object.keys(chapter).map(Number).sort((a, b) => a - b);

  return div({ class: readingPane },
    h2({ class: chapterHeading }, `${currentBook.name} ${currentChapter}`),
    ...verses.map(v => div({ class: verseLine },
      span({ class: verseNum }, String(v)),
      chapter[v],
    )),
  );
}

// ── Init ───────────────────────────────────────────────────

async function init() {
  await loadBooks();
  render();
}

init();
