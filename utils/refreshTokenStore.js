import crypto from "crypto";
import { pubClient } from "./redis.js";

const localStore = new Map(); // hash → { userId, expiresAt }
const KEY_PREFIX = "rt:";

function hashToken(raw) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function parseTtlMs(str) {
  const m = /^(\d+)(d|h|m|s)$/i.exec(str ?? "");
  if (!m) return 30 * 86400_000;
  const n = Number(m[1]);
  const u = { d: 86400_000, h: 3600_000, m: 60_000, s: 1000 }[m[2].toLowerCase()];
  return n * (u ?? 1000);
}

export async function storeRefreshToken(userId, rawToken) {
  const hash = hashToken(rawToken);
  const ms = parseTtlMs(process.env.JWT_REFRESH_EXPIRES_IN || "30d");
  const ttlSec = Math.ceil(ms / 1000);

  if (pubClient) {
    await pubClient.set(`${KEY_PREFIX}${hash}`, String(userId), "EX", ttlSec);
  } else {
    localStore.set(hash, { userId: String(userId), expiresAt: Date.now() + ms });
  }
}

export async function isRefreshTokenValid(rawToken, userId) {
  const hash = hashToken(rawToken);

  if (pubClient) {
    const stored = await pubClient.get(`${KEY_PREFIX}${hash}`);
    return stored === String(userId);
  }

  const entry = localStore.get(hash);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    localStore.delete(hash);
    return false;
  }
  return entry.userId === String(userId);
}

export async function revokeRefreshToken(rawToken) {
  if (!rawToken) return;
  const hash = hashToken(rawToken);
  if (pubClient) {
    await pubClient.del(`${KEY_PREFIX}${hash}`);
  } else {
    localStore.delete(hash);
  }
}
