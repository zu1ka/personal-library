import { useEffect, useRef, useState } from "react";
import {
  ArrowUpDown,
  BookMarked,
  BookOpen,
  Bookmark,
  Check,
  Library,
  Plus,
  Search,
  Star,
  Trash2,
  X,
} from "lucide-react";
import "./App.css";

// ==================== Shelves, statuses, sorting ====================

// The three reading statuses. `value` is what gets saved on each book.
const STATUSES = [
  { value: "want to read", label: "Want to read" },
  { value: "reading", label: "Reading" },
  { value: "read", label: "Read" },
];

// Every shelf is just a filter over the same library array.
const shelves = {
  all: { label: "All Books", icon: Library, filter: () => true },
  reading: {
    label: "Currently Reading",
    icon: BookOpen,
    filter: (b) => b.status === "reading",
  },
  want: {
    label: "Want to Read",
    icon: Bookmark,
    filter: (b) => b.status === "want to read",
  },
  read: { label: "Read", icon: Check, filter: (b) => b.status === "read" },
  favorites: { label: "Favorites", icon: Star, filter: (b) => b.isFavorite },
};

const sorters = {
  recent: {
    label: "Recent",
    compare: (a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0),
  },
  title: { label: "Title", compare: (a, b) => a.title.localeCompare(b.title) },
  author: {
    label: "Author",
    compare: (a, b) => a.author.localeCompare(b.author),
  },
  progress: {
    label: "Progress",
    compare: (a, b) => getProgress(b) - getProgress(a),
  },
};

const emptyMessages = {
  all: "Your library is empty. Search for a book to add your first one.",
  reading: "Nothing in progress. Open a book and set it to Reading.",
  want: "No books saved for later yet.",
  read: "No finished books yet.",
  favorites: "Star a book to keep it here.",
};

function getProgress(book) {
  if (!book.pageCount) return 0;
  return Math.round((book.currentPage / book.pageCount) * 100);
}

// ==================== Google Books API ====================

const API_KEY = import.meta.env.VITE_GOOGLE_BOOKS_KEY;

async function searchBooks(query, signal) {
  const params = new URLSearchParams({ q: query, maxResults: "20" });
  if (API_KEY) params.set("key", API_KEY);

  const res = await fetch(
    `https://www.googleapis.com/books/v1/volumes?${params}`,
    { signal },
  );
  if (!res.ok) throw new Error(`Search failed (${res.status}). Try again.`);

  const data = await res.json();
  return (data.items || []).map(toBook);
}

// Turn Google's response into the shape the app uses.
function toBook(item) {
  const info = item.volumeInfo ?? {};
  const category = info.categories?.[0];

  return {
    id: item.id,
    title: info.title ?? "Untitled",
    author: info.authors?.join(", ") ?? "Unknown author",
    // "Fiction / Science Fiction / Hard" -> "Hard"
    genre: category ? category.split("/").pop().trim() : null,
    pageCount: info.pageCount > 0 ? info.pageCount : null,
    image: coverUrl(info.imageLinks),
  };
}

function coverUrl(links) {
  const url = links?.thumbnail ?? links?.smallThumbnail;
  if (!url) return null;
  return url.replace("http://", "https://").replace("&edge=curl", "");
}

// ==================== Hooks ====================

// useState that loads from and saves to localStorage.
function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved !== null ? JSON.parse(saved) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage full or blocked: the app keeps working, it just won't save.
    }
  }, [key, value]);

  return [value, setValue];
}

// Debounced search with loading/error states.
// Aborting the old request stops slow responses from overwriting new ones.
function useBookSearch(query) {
  const [state, setState] = useState({
    status: "idle",
    results: [],
    error: null,
  });

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setState({ status: "idle", results: [], error: null });
      return;
    }

    setState((s) => ({ ...s, status: "loading", error: null }));
    const controller = new AbortController();

    const timer = setTimeout(async () => {
      try {
        const results = await searchBooks(q, controller.signal);
        setState({ status: "done", results, error: null });
      } catch (err) {
        if (err.name === "AbortError") return;
        setState({ status: "error", results: [], error: err.message });
      }
    }, 400);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return state;
}

// ==================== Components ====================

const SPINES = [
  "#7b4a2a",
  "#38534f",
  "#5b4466",
  "#7a3b36",
  "#3e4f6b",
  "#6b5a2e",
];

function hash(str) {
  let h = 0;
  for (const ch of str) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h);
}

// Shows the cover image, or a generated cover if there isn't one
// (or if the image fails to load).
function Cover({ book, size = "md" }) {
  const [failed, setFailed] = useState(false);

  if (book.image && !failed) {
    return (
      <img
        className={`cover cover--${size}`}
        src={book.image}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div
      className={`cover cover--${size} cover--generated`}
      style={{ "--spine": SPINES[hash(book.id) % SPINES.length] }}
      aria-hidden="true"
    >
      <span className="cover-title">{book.title}</span>
      <span className="cover-author">{book.author}</span>
    </div>
  );
}

function formatDate(ms) {
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function CardFooter({ book }) {
  if (book.status === "read") {
    return (
      <p className="card-meta">
        Finished{book.finishedAt ? ` ${formatDate(book.finishedAt)}` : ""}
      </p>
    );
  }
  if (book.status === "want to read") {
    return <p className="card-meta">Not started</p>;
  }

  const progress = getProgress(book);
  return (
    <div className="card-progress">
      <div className="progress-row">
        <span>{book.pageCount ? "Progress" : `Page ${book.currentPage}`}</span>
        {book.pageCount > 0 && <strong>{progress}%</strong>}
      </div>
      <div className="bar">
        <span style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

function BookCard({ book, onOpen, onToggleFavorite }) {
  return (
    <li className="card">
      <button className="card-body" onClick={() => onOpen(book.id)}>
        <Cover book={book} />
        <div className="card-info">
          <h3 className="card-title">{book.title}</h3>
          <p className="card-author">{book.author}</p>
          {book.genre && <span className="tag">{book.genre}</span>}
          <CardFooter book={book} />
        </div>
      </button>

      <button
        className={`fav-btn ${book.isFavorite ? "is-on" : ""}`}
        aria-label={
          book.isFavorite
            ? `Remove ${book.title} from favorites`
            : `Add ${book.title} to favorites`
        }
        aria-pressed={book.isFavorite}
        onClick={() => onToggleFavorite(book.id)}
      >
        <Star size={18} />
      </button>
    </li>
  );
}

function ReadingGoal({ finished, goal, year, onGoalChange }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(goal));

  const percent =
    goal > 0 ? Math.min(100, Math.round((finished / goal) * 100)) : 0;
  const remaining = Math.max(goal - finished, 0);

  const save = (e) => {
    e.preventDefault();
    const value = Number(draft);
    if (Number.isInteger(value) && value > 0) {
      onGoalChange(value);
      setEditing(false);
    }
  };

  return (
    <section className="goal" aria-label="Reading goal">
      <div className="goal-header">
        <p className="nav-heading">Reading goal</p>
        <span className="goal-year">{year}</span>
      </div>

      {editing ? (
        <form className="goal-form" onSubmit={save}>
          <label>
            Books this year
            <input
              type="number"
              min={1}
              value={draft}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
            />
          </label>
          <button type="submit" className="btn btn-primary btn-small">
            Save
          </button>
        </form>
      ) : (
        <button
          className="goal-count"
          onClick={() => {
            setDraft(String(goal));
            setEditing(true);
          }}
          title="Change goal"
        >
          <span className="goal-number">{finished}</span> / {goal} books
        </button>
      )}

      <div
        className="bar"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span style={{ width: `${percent}%` }} />
      </div>
      <p className="goal-note">
        {remaining === 0
          ? "Goal reached. Nice work."
          : `${percent}% complete, ${remaining} ${remaining === 1 ? "book" : "books"} to go`}
      </p>
    </section>
  );
}

function Sidebar({
  view,
  onSelectView,
  counts,
  shelfQuery,
  onShelfQueryChange,
  finished,
  goal,
  year,
  onGoalChange,
}) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          <BookMarked size={20} />
        </span>
        <span className="brand-name">Bookshelf</span>
      </div>

      <label className="search-field search-field--small">
        <Search size={16} aria-hidden="true" />
        <input
          type="search"
          placeholder="Search shelves..."
          aria-label="Search your shelves"
          value={shelfQuery}
          onChange={(e) => onShelfQueryChange(e.target.value)}
        />
      </label>

      <nav className="shelf-nav" aria-label="Shelves">
        <p className="nav-heading">Library</p>
        <ul>
          {Object.entries(shelves).map(([key, shelf]) => {
            const Icon = shelf.icon;
            return (
              <li key={key}>
                <button
                  className={`nav-item ${view === key ? "is-active" : ""}`}
                  aria-current={view === key ? "page" : undefined}
                  onClick={() => onSelectView(key)}
                >
                  <Icon size={18} aria-hidden="true" />
                  <span className="nav-label">{shelf.label}</span>
                  <span className="nav-count">{counts[key]}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <ReadingGoal
        finished={finished}
        goal={goal}
        year={year}
        onGoalChange={onGoalChange}
      />
    </aside>
  );
}

function TopBar({ query, onQueryChange }) {
  return (
    <header className="topbar">
      <label className="search-field search-field--top">
        <Search size={18} aria-hidden="true" />
        <input
          type="search"
          placeholder="Search books..."
          aria-label="Search for books to add"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
        />
        {query && (
          <button
            className="icon-btn"
            aria-label="Clear search"
            onClick={() => onQueryChange("")}
          >
            <X size={16} />
          </button>
        )}
      </label>
    </header>
  );
}

function ShelfView({
  view,
  books,
  shelfQuery,
  sortBy,
  onSortChange,
  onOpen,
  onToggleFavorite,
  onFindBooks,
}) {
  const shelf = shelves[view];
  const filtering = shelfQuery.trim() !== "";

  return (
    <section>
      <div className="page-header">
        <div className="page-title">
          <h1>{shelf.label}</h1>
          <span className="page-count">
            {books.length} {books.length === 1 ? "book" : "books"}
          </span>
        </div>

        <label className="sort">
          <ArrowUpDown size={16} aria-hidden="true" />
          <span className="visually-hidden">Sort by</span>
          <select value={sortBy} onChange={(e) => onSortChange(e.target.value)}>
            {Object.entries(sorters).map(([key, s]) => (
              <option key={key} value={key}>
                Sort by: {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {books.length === 0 ? (
        <div className="empty">
          <p>
            {filtering
              ? `No books on this shelf match "${shelfQuery.trim()}".`
              : emptyMessages[view]}
          </p>
          {!filtering && (view === "all" || view === "want") && (
            <button className="btn btn-primary" onClick={onFindBooks}>
              Find books
            </button>
          )}
        </div>
      ) : (
        <ul className="grid">
          {books.map((book) => (
            <BookCard
              key={book.id}
              book={book}
              onOpen={onOpen}
              onToggleFavorite={onToggleFavorite}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function SearchResults({ query, search, libraryIds, onAdd, onOpen }) {
  const { status, results, error } = search;

  return (
    <section>
      <div className="page-header">
        <div className="page-title">
          <h1>
            {query.trim() ? `Results for "${query.trim()}"` : "Find a book"}
          </h1>
          {status === "done" && (
            <span className="page-count">
              {results.length} {results.length === 1 ? "result" : "results"}
            </span>
          )}
        </div>
      </div>

      {status === "idle" && (
        <div className="empty">
          <p>Search by title, author, or ISBN using the search bar above.</p>
        </div>
      )}

      {status === "loading" && (
        <ul className="grid" aria-busy="true" aria-label="Loading results">
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i} className="card card--skeleton">
              <div className="card-body">
                <div className="cover cover--md skeleton" />
                <div className="card-info">
                  <div className="skeleton line line--title" />
                  <div className="skeleton line" />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {status === "error" && (
        <div className="empty empty--error" role="alert">
          <p>{error}</p>
          <p className="empty-hint">
            Check your connection or API key, then search again.
          </p>
        </div>
      )}

      {status === "done" && results.length === 0 && (
        <div className="empty">
          <p>
            No books found for "{query.trim()}". Try a different title or the
            author's name.
          </p>
        </div>
      )}

      {status === "done" && results.length > 0 && (
        <ul className="grid">
          {results.map((book) => {
            const added = libraryIds.has(book.id);
            return (
              <li key={book.id} className="card">
                <div className="card-body card-body--static">
                  <Cover book={book} />
                  <div className="card-info">
                    <h3 className="card-title">{book.title}</h3>
                    <p className="card-author">{book.author}</p>
                    {book.genre && <span className="tag">{book.genre}</span>}
                    <div className="card-actions">
                      {added ? (
                        <button
                          className="btn btn-quiet"
                          onClick={() => onOpen(book.id)}
                        >
                          <Check size={16} aria-hidden="true" /> In library
                        </button>
                      ) : (
                        <button
                          className="btn btn-primary"
                          onClick={() => onAdd(book)}
                        >
                          <Plus size={16} aria-hidden="true" /> Add to library
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function PageEditor({ book, onSave }) {
  // Draft lives here until Save, so an empty box never gets saved as 0.
  const [draft, setDraft] = useState(String(book.currentPage));

  useEffect(() => setDraft(String(book.currentPage)), [book.currentPage]);

  const value = Number(draft);
  const valid =
    draft.trim() !== "" &&
    Number.isFinite(value) &&
    value >= 0 &&
    (!book.pageCount || value <= book.pageCount);
  const changed = valid && value !== book.currentPage;

  const submit = (e) => {
    e.preventDefault();
    if (changed) onSave(book.id, value);
  };

  return (
    <form className="page-editor" onSubmit={submit}>
      <label htmlFor="page-input">Current page</label>
      <div className="page-editor-row">
        <input
          id="page-input"
          type="number"
          inputMode="numeric"
          min={0}
          max={book.pageCount ?? undefined}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onWheel={(e) => e.currentTarget.blur()}
          aria-invalid={!valid}
        />
        {book.pageCount > 0 && (
          <span className="page-total">of {book.pageCount}</span>
        )}
        <button type="submit" className="btn btn-primary" disabled={!changed}>
          Save
        </button>
      </div>
      {!valid && draft.trim() !== "" && (
        <p className="field-error">
          Enter a page between 0 and {book.pageCount ?? "the last page"}.
        </p>
      )}
    </form>
  );
}

function BookModal({
  book,
  onClose,
  onStatusChange,
  onSavePage,
  onToggleFavorite,
  onRemove,
}) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const closeRef = useRef(null);
  const onCloseRef = useRef(onClose);

  // Keep the latest onClose without re-running the effect below on every render.
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Runs once when the modal opens: focus the close button, listen for Escape.
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && onCloseRef.current();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const progress = getProgress(book);

  return (
    <div
      className="overlay"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <button
          ref={closeRef}
          className="icon-btn modal-close"
          aria-label="Close"
          onClick={onClose}
        >
          <X size={20} />
        </button>

        <div className="modal-head">
          <Cover book={book} size="lg" />
          <div>
            <h2 id="modal-title">{book.title}</h2>
            <p className="modal-author">{book.author}</p>
            <div className="modal-tags">
              {book.genre && <span className="tag">{book.genre}</span>}
              {book.pageCount > 0 && (
                <span className="tag">{book.pageCount} pages</span>
              )}
            </div>
            <button
              className={`btn btn-quiet fav-toggle ${book.isFavorite ? "is-on" : ""}`}
              aria-pressed={book.isFavorite}
              onClick={() => onToggleFavorite(book.id)}
            >
              <Star size={16} aria-hidden="true" />
              {book.isFavorite ? "Favorite" : "Add to favorites"}
            </button>
          </div>
        </div>

        <fieldset className="status-picker">
          <legend>Status</legend>
          <div className="segmented">
            {STATUSES.map((s) => (
              <label
                key={s.value}
                className={book.status === s.value ? "is-active" : ""}
              >
                <input
                  type="radio"
                  name="status"
                  value={s.value}
                  checked={book.status === s.value}
                  onChange={() => onStatusChange(book.id, s.value)}
                />
                {s.label}
              </label>
            ))}
          </div>
        </fieldset>

        <PageEditor book={book} onSave={onSavePage} />

        {book.pageCount > 0 && (
          <div className="modal-progress">
            <div className="progress-row">
              <span>Progress</span>
              <strong>{progress}%</strong>
            </div>
            <div className="bar bar--thick">
              <span style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        <div className="modal-footer">
          {confirmRemove ? (
            <>
              <span>Remove this book and its progress?</span>
              <button
                className="btn btn-quiet"
                onClick={() => setConfirmRemove(false)}
              >
                Keep it
              </button>
              <button
                className="btn btn-danger"
                onClick={() => onRemove(book.id)}
              >
                Remove
              </button>
            </>
          ) : (
            <button
              className="btn btn-quiet btn-danger-text"
              onClick={() => setConfirmRemove(true)}
            >
              <Trash2 size={16} aria-hidden="true" /> Remove from library
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ==================== App ====================

// Apply a status change and keep the related fields consistent.
function withStatus(book, status) {
  const finished = status === "read";
  return {
    ...book,
    status,
    finishedAt: finished ? (book.finishedAt ?? Date.now()) : null,
    currentPage: finished && book.pageCount ? book.pageCount : book.currentPage,
  };
}

export default function App() {
  const [library, setLibrary] = useLocalStorage("library", []);
  const [goal, setGoal] = useLocalStorage("readingGoal", 24);

  const [view, setView] = useState("reading");
  const [query, setQuery] = useState("");
  const [shelfQuery, setShelfQuery] = useState("");
  const [sortBy, setSortBy] = useState("recent");
  const [selectedId, setSelectedId] = useState(null);

  const search = useBookSearch(query);

  // ---- library updates (every change goes through setLibrary) ----

  const updateBook = (id, update) =>
    setLibrary((lib) => lib.map((b) => (b.id === id ? update(b) : b)));

  const addToLibrary = (book) =>
    setLibrary((lib) =>
      lib.some((b) => b.id === book.id)
        ? lib
        : [
            ...lib,
            {
              ...book,
              currentPage: 0,
              status: "want to read",
              isFavorite: false,
              addedAt: Date.now(),
              finishedAt: null,
            },
          ],
    );

  const removeBook = (id) => {
    setLibrary((lib) => lib.filter((b) => b.id !== id));
    setSelectedId(null);
  };

  const toggleFavorite = (id) =>
    updateBook(id, (b) => ({ ...b, isFavorite: !b.isFavorite }));

  const changeStatus = (id, status) =>
    updateBook(id, (b) => withStatus(b, status));

  // Saving a page also moves the book along: started -> reading, last page -> read.
  const savePage = (id, page) =>
    updateBook(id, (b) => {
      const max = b.pageCount ?? Infinity;
      const currentPage = Math.min(Math.max(Math.round(page), 0), max);
      let status = b.status;
      if (b.pageCount && currentPage === b.pageCount) status = "read";
      else if (currentPage > 0) status = "reading";
      return withStatus({ ...b, currentPage }, status);
    });

  // ---- derived data (computed from library on every render) ----

  const counts = Object.fromEntries(
    Object.entries(shelves).map(([key, s]) => [
      key,
      library.filter(s.filter).length,
    ]),
  );

  const year = new Date().getFullYear();
  const finishedThisYear = library.filter(
    (b) => b.finishedAt && new Date(b.finishedAt).getFullYear() === year,
  ).length;

  const q = shelfQuery.trim().toLowerCase();
  const visibleBooks =
    view === "search"
      ? []
      : library
          .filter(shelves[view].filter)
          .filter(
            (b) =>
              !q ||
              b.title.toLowerCase().includes(q) ||
              b.author.toLowerCase().includes(q),
          )
          .sort(sorters[sortBy].compare);

  const libraryIds = new Set(library.map((b) => b.id));
  const selectedBook = library.find((b) => b.id === selectedId) ?? null;

  // ---- view switching ----

  const handleQueryChange = (value) => {
    setQuery(value);
    if (value.trim()) setView("search");
  };

  const handleShelfQueryChange = (value) => {
    setShelfQuery(value);
    if (view === "search") setView("all");
  };

  return (
    <div className="app">
      <Sidebar
        view={view}
        onSelectView={setView}
        counts={counts}
        shelfQuery={shelfQuery}
        onShelfQueryChange={handleShelfQueryChange}
        finished={finishedThisYear}
        goal={goal}
        year={year}
        onGoalChange={setGoal}
      />

      <div className="main-column">
        <TopBar query={query} onQueryChange={handleQueryChange} />

        <main className="content">
          {view === "search" ? (
            <SearchResults
              query={query}
              search={search}
              libraryIds={libraryIds}
              onAdd={addToLibrary}
              onOpen={setSelectedId}
            />
          ) : (
            <ShelfView
              view={view}
              books={visibleBooks}
              shelfQuery={shelfQuery}
              sortBy={sortBy}
              onSortChange={setSortBy}
              onOpen={setSelectedId}
              onToggleFavorite={toggleFavorite}
              onFindBooks={() => setView("search")}
            />
          )}
        </main>
      </div>

      {selectedBook && (
        <BookModal
          key={selectedBook.id}
          book={selectedBook}
          onClose={() => setSelectedId(null)}
          onStatusChange={changeStatus}
          onSavePage={savePage}
          onToggleFavorite={toggleFavorite}
          onRemove={removeBook}
        />
      )}
    </div>
  );
}
