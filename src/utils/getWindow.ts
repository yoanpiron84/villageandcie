export function getWindow(): Window {
  return (typeof window !== 'undefined' ? window : {}) as Window;
}
