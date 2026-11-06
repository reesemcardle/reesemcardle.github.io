// Shared navigation order: dated items newest first, undated items last.
export function newestFirst(items, dateFor) {
  const timestamp = item => {
    const date = dateFor(item);
    if (date == null || date === '') return -Infinity;
    const value = date instanceof Date ? date.getTime() : Date.parse(date);
    return Number.isFinite(value) ? value : -Infinity;
  };
  return [...items].sort((a, b) => {
    const left = timestamp(a), right = timestamp(b);
    return left === right ? 0 : left > right ? -1 : 1;
  });
}
