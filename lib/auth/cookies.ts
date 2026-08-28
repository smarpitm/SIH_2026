export const REFRESH_COOKIE = "pm_refresh"; // book MA1 item 4

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}

const flag = () => (process.env.NODE_ENV === "production" ? "; Secure" : "");

// httpOnly SameSite=Lax pm_refresh per book MA1 item 4. `Secure` is added in
// production; the dev server runs plain http where a Secure cookie would never
// round-trip and the MA1 manual check (refresh rotation + replay) would fail.
export function refreshCookie(token: string): string {
  return `${REFRESH_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax${flag()}; Max-Age=${7 * 24 * 60 * 60}`;
}

export function clearRefreshCookie(): string {
  return `${REFRESH_COOKIE}=; Path=/; HttpOnly; SameSite=Lax${flag()}; Max-Age=0`;
}
