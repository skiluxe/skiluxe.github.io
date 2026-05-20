// Password hashing with PBKDF2 (Workers WebCrypto-native; no bcrypt dep).
// Session cookies are HMAC-SHA256 signed; sessions are tracked in KV by token id.
import type { Env } from "../types";

// Cloudflare Workers Web Crypto caps PBKDF2 at 100k iterations (not 200k like Node local dev).
const PBKDF2_ITER = 100_000;
const PBKDF2_KEYLEN = 32;
const SESSION_TTL = 30 * 24 * 60 * 60; // 30 days seconds

function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function bufToB64(buf: ArrayBuffer): string {
  return bytesToB64(new Uint8Array(buf));
}
function b64ToBuf(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function bytesEq(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a[i] ^ b[i];
  return r === 0;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITER, hash: "SHA-256" },
    key,
    PBKDF2_KEYLEN * 8
  );
  return `pbkdf2$${PBKDF2_ITER}$${bytesToB64(salt)}$${bytesToB64(new Uint8Array(bits))}`;
}

/** Secrets may be stored raw (pbkdf2$…) or base64-encoded to avoid $ corruption in shells/dashboards. */
export function decodeStoredPasswordHash(stored: string): string {
  const trimmed = stored.trim().replace(/^["']|["']$/g, "");
  if (trimmed.startsWith("pbkdf2$")) return trimmed;
  try {
    return new TextDecoder().decode(b64ToBuf(trimmed));
  } catch {
    return trimmed;
  }
}

export function isPasswordHashFormat(stored: string): boolean {
  const trimmed = decodeStoredPasswordHash(stored);
  const parts = trimmed.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iter = parseInt(parts[1], 10);
  if (!Number.isFinite(iter) || iter < 1) return false;
  try {
    b64ToBuf(parts[2]);
    b64ToBuf(parts[3]);
    return true;
  } catch {
    return false;
  }
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    if (!isPasswordHashFormat(stored)) return false;
    const trimmed = decodeStoredPasswordHash(stored);
    const parts = trimmed.split("$");
    const iter = parseInt(parts[1], 10);
    const salt = b64ToBuf(parts[2]);
    const expected = b64ToBuf(parts[3]);
    const saltBuf = salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength);
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      "PBKDF2",
      false,
      ["deriveBits"]
    );
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt: saltBuf, iterations: iter, hash: "SHA-256" },
      key,
      expected.length * 8
    );
    return bytesEq(new Uint8Array(bits), expected);
  } catch {
    return false;
  }
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return bufToB64(sig).replace(/=+$/, "").replace(/\//g, "_").replace(/\+/g, "-");
}

function randomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return bufToB64(bytes.buffer).replace(/=+$/, "").replace(/\//g, "_").replace(/\+/g, "-");
}

export async function createSession(env: Env): Promise<{ token: string; cookie: string }> {
  const id = randomId();
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL;
  const payload = `${id}.${exp}`;
  const sig = await hmac(env.SESSION_SECRET, payload);
  const token = `${payload}.${sig}`;
  await env.KV.put(`session:${id}`, JSON.stringify({ created_at: Date.now() }), { expirationTtl: SESSION_TTL });
  // SameSite=None: admin UI is on www.new-gudauri.com, API may be on workers.dev or api.new-gudauri.com
  const cookie = `sl_session=${token}; Path=/; Max-Age=${SESSION_TTL}; Secure; HttpOnly; SameSite=None`;
  return { token, cookie };
}

export async function verifySession(env: Env, cookieHeader: string | null): Promise<boolean> {
  if (!cookieHeader) return false;
  const match = cookieHeader.split(/;\s*/).find((c) => c.startsWith("sl_session="));
  if (!match) return false;
  const token = match.slice("sl_session=".length);
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [id, expStr, sig] = parts;
  const exp = parseInt(expStr, 10);
  if (!Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000)) return false;
  const expected = await hmac(env.SESSION_SECRET, `${id}.${expStr}`);
  if (expected !== sig) return false;
  const kv = await env.KV.get(`session:${id}`);
  return !!kv;
}

export function clearSessionCookie(): string {
  return `sl_session=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=None`;
}

export async function signToken(env: Env, payload: string): Promise<string> {
  return await hmac(env.SESSION_SECRET, payload);
}

export async function verifyToken(env: Env, payload: string, token: string): Promise<boolean> {
  const expected = await hmac(env.SESSION_SECRET, payload);
  return expected === token;
}

export { hex };
