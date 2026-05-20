#!/usr/bin/env node
// Generate a PBKDF2 password hash compatible with the worker's auth.ts.
// Usage:  node scripts/hash-password.js <your-password>
// Output: pbkdf2$200000$<saltB64>$<hashB64>

const crypto = require("crypto");

const PBKDF2_ITER = 200_000;
const PBKDF2_KEYLEN = 32;

const pw = process.argv[2];
if (!pw) {
  console.error("Usage: node scripts/hash-password.js <password>");
  process.exit(1);
}

const salt = crypto.randomBytes(16);
const hash = crypto.pbkdf2Sync(pw, salt, PBKDF2_ITER, PBKDF2_KEYLEN, "sha256");
console.log(`pbkdf2$${PBKDF2_ITER}$${salt.toString("base64")}$${hash.toString("base64")}`);
