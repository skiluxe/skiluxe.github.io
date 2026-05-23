import { webcrypto } from "node:crypto";
import { execSync } from "node:child_process";

const pw = process.argv[2] || "SkiluxeTest99!";
const nodeHash = execSync(`node scripts/hash-password.js ${JSON.stringify(pw)}`, { cwd: new URL("..", import.meta.url) })
  .toString()
  .trim();

// Mirror worker auth.ts helpers
function b64ToBuf(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function decodeStored(stored) {
  const trimmed = stored.trim();
  if (trimmed.startsWith("pbkdf2$")) return trimmed;
  return new TextDecoder().decode(b64ToBuf(trimmed));
}
async function verify(password, stored) {
  const trimmed = decodeStored(stored);
  const parts = trimmed.split("$");
  const iter = parseInt(parts[1], 10);
  const salt = b64ToBuf(parts[2]);
  const expected = b64ToBuf(parts[3]);
  const key = await webcrypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await webcrypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" },
    key,
    expected.length * 8
  );
  const got = new Uint8Array(bits);
  let ok = got.length === expected.length;
  for (let i = 0; i < got.length; i++) ok &&= got[i] === expected[i];
  return ok;
}

const b64 = Buffer.from(nodeHash, "utf8").toString("base64");
console.log("node hash verify:", await verify(pw, nodeHash));
console.log("node hash b64 verify:", await verify(pw, b64));
