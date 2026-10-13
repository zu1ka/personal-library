import { useEffect, useState } from "react";

import "./App.css";
const name = "the lord of the rings";

const API_KEY = import.meta.env.VITE_GOOGLE_BOOKS_KEY;

function App() {
  const [result, setResult] = useState([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!query.trim()) {
      setResult([]);
      return;
    }
    const timer = setTimeout(async () => {
      const res = await fetch(
        `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&key=${API_KEY}`,
      );
      const data = await res.json();
      const books = (data.items || []).map((book) => ({
        id: book.id,
        title: book.volumeInfo.title,
        author: book.volumeInfo.authors?.join(", ") ?? "unknown author",
        genre: book.volumeInfo.categories?.join(", ") ?? "uncategorized",
        language: book.volumeInfo.language,
        pageCount: book.volumeInfo.pageCount ?? null,
        image:
          book.volumeInfo.imageLinks?.thumbnail?.replace(
            "http://",
            "https://",
          ) ?? null,
      }));

      setResult(books);
    }, 1000);

    //debounce: to not have the api be called every key stroke

    return () => {
      clearTimeout(timer);
    };
  }, [query]);
  //
  return (
    <div>
      <Input query={query} setQuery={setQuery} />
      <BookContainer result={result} />
    </div>
  );
}

const Input = ({ query, setQuery }) => {
  const submitForm = (e) => {
    e.preventDefault();
  };

  const inputMessage = (e) => {
    const message = e.target.value;
    setQuery(message);
  };

  return (
    <form onSubmit={submitForm}>
      <input value={query} onChange={inputMessage} type="text" />
    </form>
  );
};

const BookReview = () => {};

const BookContainer = ({ result }) => {
  return (
    <ul className="container">
      {result.map((book) => (
        <li key={book.id}>
          <span>
            {book.image ? (
              <img src={book.image} />
            ) : (
              <div className="no-cover">no cover</div>
            )}
          </span>
          <div className="book-info-container">
            <p>{book.title}</p>
            <p>{book.author}</p>
          </div>
          <ProgressBar book={book} />
        </li>
      ))}
    </ul>
  );
};

const ProgressBar = ({ book }) => {
  return (
    <div>
      <div>
        <p>progress</p> <span>{15}</span>
      </div>
      <progress value={15} max={100} />
    </div>
  );
};
export default App;

// add a book to a library with default values like status: "want to read", currentPage: 0 and favorites: false then edit based on what user does in library
