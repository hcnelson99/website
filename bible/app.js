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
/** @type {Map<string, ParsedBook>} */
const cache = new Map();

// ── Parsing ────────────────────────────────────────────────

/** @param {string} text @returns {ParsedBook} */
function parseBook(text) {
  // Split into paragraphs (separated by blank lines), then parse verses within each
  const paragraphs = text.split(/\n\s*\n/);

  /** @type {ParsedBook} */
  const chapters = {};

  for (const para of paragraphs) {
    // Collapse newlines within a paragraph into spaces
    const flat = para.replace(/\n/g, ' ').trim();
    if (!flat) continue;

    // Split on verse refs, keeping delimiters
    const parts = flat.split(/(?=\d+:\d+\s)/);
    /** @type {Verse[]} */
    const verses = [];
    let ch = 0;
    for (const part of parts) {
      const m = part.match(/^(\d+):(\d+)\s([\s\S]*)/);
      if (!m) continue;
      ch = +m[1];
      verses.push({ vs: +m[2], text: m[3].trim() });
    }
    if (ch && verses.length) {
      if (!chapters[ch]) chapters[ch] = [];
      chapters[ch].push(verses);
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

  return div({ class: readingPane },
    h2({ class: chapterHeading }, `${currentBook.name} ${currentChapter}`),
    ...paragraphs.map(verses =>
      h('p', { class: paraCls },
        ...verses.flatMap(v => [
          span({ class: verseNum }, String(v.vs)),
          v.text + ' ',
        ]),
      )
    ),
  );
}

// ── Init ───────────────────────────────────────────────────

async function init() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js');
  }
  await loadBooks();
  await selectBook(books[0]);
}

init();
