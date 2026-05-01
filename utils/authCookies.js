/** Cookie names shared by Express and Socket.IO auth. */
export const COOKIE_ACCESS = "accessToken";
export const COOKIE_REFRESH = "refreshToken";

const MULT_MS = {
  s: 1000,
  m: 60_000,
  h: 3600_000,
  d: 86400_000,
  w: 604800_000,
  y: 31536000_000,
};

/** Parse `15m`, `7d`, etc. (same style as jsonwebtoken) into milliseconds for Set-Cookie maxAge. */
export function maxAgeMsFromExpiresIn(expiresIn) {
  if (!expiresIn || typeof expiresIn !== "string") return undefined;
  const m = /^(\d+)(s|m|h|d|w|y)$/i.exec(expiresIn.trim());
  if (!m) return undefined;
  const n = Number(m[1]);
  const u = m[2].toLowerCase();
  const factor = MULT_MS[u];
  if (!factor || !Number.isFinite(n)) return undefined;
  return n * factor;
}

export function cookieBaseOptions() {
  const secure =
    process.env.COOKIE_SECURE === "true" || process.env.NODE_ENV === "production";
  let sameSite = (process.env.COOKIE_SAME_SITE || "strict").toLowerCase();
  if (sameSite === "none" && !secure) {
    sameSite = "lax";
  }
  const sameSiteValue = sameSite === "lax" ? "lax" : sameSite === "none" ? "none" : "strict";
  return {
    httpOnly: true,
    secure,
    sameSite: sameSiteValue,
    path: "/",
  };
}

export function setAuthCookies(res, accessToken, refreshToken) {
  const base = cookieBaseOptions();
  const accessMs =
    maxAgeMsFromExpiresIn(process.env.JWT_EXPIRES_IN) ?? 15 * 60 * 1000;
  const refreshMs =
    maxAgeMsFromExpiresIn(process.env.JWT_REFRESH_EXPIRES_IN || "30d") ??
    30 * 86400_000;
  res.cookie(COOKIE_ACCESS, accessToken, { ...base, maxAge: accessMs });
  res.cookie(COOKIE_REFRESH, refreshToken, { ...base, maxAge: refreshMs });
}

export function setAccessCookie(res, accessToken) {
  const base = cookieBaseOptions();
  const accessMs =
    maxAgeMsFromExpiresIn(process.env.JWT_EXPIRES_IN) ?? 15 * 60 * 1000;
  res.cookie(COOKIE_ACCESS, accessToken, { ...base, maxAge: accessMs });
}

export function clearAuthCookies(res) {
  const base = cookieBaseOptions();
  res.clearCookie(COOKIE_ACCESS, { ...base });
  res.clearCookie(COOKIE_REFRESH, { ...base });
}

/** Minimal cookie header parser (no dependency on `cookie` package in this file). */
export function parseCookieHeader(header) {
  const out = {};
  if (!header || typeof header !== "string") return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    let v = part.slice(idx + 1).trim();
    try {
      v = decodeURIComponent(v);
    } catch {
      // keep raw
    }
    if (k) out[k] = v;
  }
  return out;
}

export function getAccessTokenFromCookieHeader(header) {
  const cookies = parseCookieHeader(header);
  const t = cookies[COOKIE_ACCESS];
  return t && String(t).length ? t : null;
}
