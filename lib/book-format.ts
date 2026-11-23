// Ratings and bylines for the reading pages. Kept apart from lib/books.ts,
// which reads files, so the page component can use these in the browser.

interface BookFacts {
  author?: string;
  date?: string;
  rating: number | string | null;
}

/** The rating as a number, or null for a book that has none. */
export function ratingOf(book: Pick<BookFacts, "rating">): number | null {
  const { rating } = book;
  if (rating === null || rating === undefined || rating === "") return null;
  const value = Number(rating);
  return Number.isFinite(value) ? value : null;
}

/**
 * "By: X - Read: Y - Rating: Z/10", leaving out what a book does not have, so
 * an unrated book never shows "null/10". Mirrored in scripts/lib/site-content.mjs.
 */
export function bookByline(book: BookFacts): string {
  const rating = ratingOf(book);
  return [
    book.author && `By: ${book.author}`,
    book.date && `Read: ${book.date}`,
    rating !== null && `Rating: ${rating}/10`,
  ]
    .filter(Boolean)
    .join(" - ");
}

/** The shorter line on the reading list: "Read: Y • Rating: Z/10". Mirrored too. */
export function bookListLine(book: BookFacts): string {
  const rating = ratingOf(book);
  return [book.date && `Read: ${book.date}`, rating !== null && `Rating: ${rating}/10`]
    .filter(Boolean)
    .join(" • ");
}

/** Highest rated first; unrated books last, in their existing order. Mirrored too. */
export function compareByRating(a: Pick<BookFacts, "rating">, b: Pick<BookFacts, "rating">): number {
  const ra = ratingOf(a);
  const rb = ratingOf(b);
  if (ra === null && rb === null) return 0;
  if (ra === null) return 1;
  if (rb === null) return -1;
  return rb - ra;
}

