export const MIN_PASSWORD_LENGTH = 8;

export function passwordProblem(password: string, email?: string | null): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Password minimal ${MIN_PASSWORD_LENGTH} karakter`;
  if (password.length > 72) return "Password maksimal 72 karakter";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "Password harus mengandung huruf dan angka";
  if (email && password.toLowerCase() === email.toLowerCase()) return "Password tidak boleh sama dengan email";
  return null;
}

// Slows down guessing of the current password: 5 wrong tries per 15 minutes per user, per server instance.
const attempts = new Map<string, { count: number; first: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export function tooManyAttempts(key: string) {
  const a = attempts.get(key);
  if (!a) return false;
  if (Date.now() - a.first > WINDOW_MS) {
    attempts.delete(key);
    return false;
  }
  return a.count >= MAX_ATTEMPTS;
}

export function recordFailedAttempt(key: string) {
  const a = attempts.get(key);
  if (!a || Date.now() - a.first > WINDOW_MS) attempts.set(key, { count: 1, first: Date.now() });
  else a.count++;
}

export function clearAttempts(key: string) {
  attempts.delete(key);
}
