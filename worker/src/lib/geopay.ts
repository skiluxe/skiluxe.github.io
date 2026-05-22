import type { Env } from "../types";

/** GeoPay / UFC redirect gateway (payment.geopaysoft.com). */
const DEFAULT_REDIRECT_BASE = "https://payment.geopaysoft.com/redirecturl.php";
/** ISO 4217 numeric code for GEL. */
export const GEOPAY_CURRENCY_GEL = "981";

export interface GeopayRedirectParams {
  uniqid: string;
  merchant_id: string;
  user_id: string;
  desc: string;
  cur: string;
  langcode: string;
  amount: number;
  op: string;
  email: string;
  firstname: string;
  lastname: string;
  hash: string;
}

export function isGeopayConfigured(env: Env): boolean {
  return !!(env.GEOPAY_MERCHANT_ID && env.GEOPAY_USER_ID && env.GEOPAY_HASH_SECRET);
}

function redirectBase(env: Env): string {
  return env.GEOPAY_REDIRECT_BASE || DEFAULT_REDIRECT_BASE;
}

function md5Upper(input: string): string {
  return md5(input).toUpperCase();
}

/** Compact MD5 for GeoPay hash signatures (Workers-safe, no node:crypto). */
function md5(s: string): string {
  function cmn(q: number, a: number, b: number, x: number, s: number, t: number) {
    a = (a + q + x + t) | 0;
    return (((a << s) | (a >>> (32 - s))) + b) | 0;
  }
  function ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn((b & c) | (~b & d), a, b, x, s, t);
  }
  function gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn((b & d) | (c & ~d), a, b, x, s, t);
  }
  function hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn(b ^ c ^ d, a, b, x, s, t);
  }
  function ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn(c ^ (b | ~d), a, b, x, s, t);
  }
  const bytes = new TextEncoder().encode(s);
  const n = bytes.length;
  const words: number[] = [];
  for (let i = 0; i < n; i++) words[i >> 2] |= bytes[i] << ((i % 4) * 8);
  words[n >> 2] |= 0x80 << ((n % 4) * 8);
  words[(((n + 8) >>> 6) << 4) + 14] = n * 8;
  let a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
  for (let i = 0; i < words.length; i += 16) {
    const oa = a, ob = b, oc = c, od = d;
    a = ff(a, b, c, d, words[i], 7, -680876936);
    d = ff(d, a, b, c, words[i + 1], 12, -389564586);
    c = ff(c, d, a, b, words[i + 2], 17, 606105819);
    b = ff(b, c, d, a, words[i + 3], 22, -1044525330);
    a = ff(a, b, c, d, words[i + 4], 7, -176418897);
    d = ff(d, a, b, c, words[i + 5], 12, 1200080426);
    c = ff(c, d, a, b, words[i + 6], 17, -1473231341);
    b = ff(b, c, d, a, words[i + 7], 22, -45705983);
    a = ff(a, b, c, d, words[i + 8], 7, 1770035416);
    d = ff(d, a, b, c, words[i + 9], 12, -1958414417);
    c = ff(c, d, a, b, words[i + 10], 17, -42063);
    b = ff(b, c, d, a, words[i + 11], 22, -1990404162);
    a = ff(a, b, c, d, words[i + 12], 7, 1804603682);
    d = ff(d, a, b, c, words[i + 13], 12, -40341101);
    c = ff(c, d, a, b, words[i + 14], 17, -1502002290);
    b = ff(b, c, d, a, words[i + 15], 22, 1236535329);
    a = gg(a, b, c, d, words[i + 1], 5, -165796510);
    d = gg(d, a, b, c, words[i + 6], 9, -1069501632);
    c = gg(c, d, a, b, words[i + 11], 14, 643717713);
    b = gg(b, c, d, a, words[i], 20, -373897302);
    a = gg(a, b, c, d, words[i + 5], 5, -701558691);
    d = gg(d, a, b, c, words[i + 10], 9, 38016083);
    c = gg(c, d, a, b, words[i + 15], 14, -660478335);
    b = gg(b, c, d, a, words[i + 4], 20, -405537848);
    a = gg(a, b, c, d, words[i + 9], 5, 568446438);
    d = gg(d, a, b, c, words[i + 14], 9, -1019803690);
    c = gg(c, d, a, b, words[i + 3], 14, -187363961);
    b = gg(b, c, d, a, words[i + 8], 20, 1163531501);
    a = gg(a, b, c, d, words[i + 13], 5, -1444681467);
    d = gg(d, a, b, c, words[i + 2], 9, -51403784);
    c = gg(c, d, a, b, words[i + 7], 14, 1735328473);
    b = gg(b, c, d, a, words[i + 12], 20, -1926607734);
    a = hh(a, b, c, d, words[i + 5], 4, -378558);
    d = hh(d, a, b, c, words[i + 8], 11, -2022574463);
    c = hh(c, d, a, b, words[i + 11], 16, 1839030562);
    b = hh(b, c, d, a, words[i + 14], 23, -35309556);
    a = hh(a, b, c, d, words[i + 1], 4, -1530992060);
    d = hh(d, a, b, c, words[i + 4], 11, 1272893353);
    c = hh(c, d, a, b, words[i + 7], 16, -155497632);
    b = hh(b, c, d, a, words[i + 10], 23, -1094730640);
    a = hh(a, b, c, d, words[i + 13], 4, 681279174);
    d = hh(d, a, b, c, words[i], 11, -358537222);
    c = hh(c, d, a, b, words[i + 3], 16, -722521979);
    b = hh(b, c, d, a, words[i + 6], 23, 76029189);
    a = hh(a, b, c, d, words[i + 9], 4, -640364487);
    d = hh(d, a, b, c, words[i + 12], 11, -421815835);
    c = hh(c, d, a, b, words[i + 15], 16, 530742520);
    b = hh(b, c, d, a, words[i + 2], 23, -995338651);
    a = ii(a, b, c, d, words[i], 6, -198630844);
    d = ii(d, a, b, c, words[i + 7], 10, 1126891415);
    c = ii(c, d, a, b, words[i + 14], 15, -1416354905);
    b = ii(b, c, d, a, words[i + 5], 21, -57434055);
    a = ii(a, b, c, d, words[i + 12], 6, 1700485571);
    d = ii(d, a, b, c, words[i + 3], 10, -1894986606);
    c = ii(c, d, a, b, words[i + 10], 15, -1051523);
    b = ii(b, c, d, a, words[i + 1], 21, -2054922799);
    a = ii(a, b, c, d, words[i + 8], 6, 1873313359);
    d = ii(d, a, b, c, words[i + 15], 10, -30611744);
    c = ii(c, d, a, b, words[i + 6], 15, -1560198380);
    b = ii(b, c, d, a, words[i + 13], 21, 1309151649);
    a = ii(a, b, c, d, words[i + 4], 6, -145523070);
    d = ii(d, a, b, c, words[i + 11], 10, -1120210379);
    c = ii(c, d, a, b, words[i + 2], 15, 718787259);
    b = ii(b, c, d, a, words[i + 9], 21, -343485551);
    a = (a + oa) | 0;
    b = (b + ob) | 0;
    c = (c + oc) | 0;
    d = (d + od) | 0;
  }
  return [a, b, c, d].map((n) => {
    let out = "";
    for (let i = 0; i < 4; i++) out += ((n >> (i * 8)) & 255).toString(16).padStart(2, "0");
    return out;
  }).join("");
}

/** Build MD5 signature — confirm formula with GeoPay if payments fail hash check. */
export function geopayHash(
  fields: Omit<GeopayRedirectParams, "hash">,
  secret: string,
  mode: string = "v1"
): string {
  if (mode === "v2") {
    const qs = [
      `amount=${fields.amount}`,
      `cur=${fields.cur}`,
      `desc=${fields.desc}`,
      `email=${fields.email}`,
      `firstname=${fields.firstname}`,
      `langcode=${fields.langcode}`,
      `lastname=${fields.lastname}`,
      `merchant_id=${fields.merchant_id}`,
      `op=${fields.op}`,
      `uniqid=${fields.uniqid}`,
      `user_id=${fields.user_id}`,
    ].join("&");
    return md5Upper(qs + secret);
  }
  // Default: merchant_id + user_id + amount + cur + uniqid + secret
  return md5Upper(
    `${fields.merchant_id}${fields.user_id}${fields.amount}${fields.cur}${fields.uniqid}${secret}`
  );
}

export function geopayLanguage(lang?: string | null): string {
  return lang === "ka" ? "KA" : "EN";
}

export function splitGuestName(fullName: string): { firstname: string; lastname: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstname: "Guest", lastname: "-" };
  if (parts.length === 1) return { firstname: parts[0], lastname: "-" };
  return { firstname: parts[0], lastname: parts.slice(1).join(" ") };
}

export function newGeopayUniqid(bookingId: number): string {
  const hex = crypto.getRandomValues(new Uint8Array(16));
  const rand = [...hex].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${String(bookingId).padStart(8, "0")}${rand}`.slice(0, 32);
}

export function buildGeopayPaymentUrl(
  env: Env,
  opts: {
    bookingId: number;
    amountMinor: number;
    guestName: string;
    guestEmail: string;
    lang?: string | null;
    description?: string;
    uniqid?: string;
  }
): { url: string; uniqid: string; params: GeopayRedirectParams } {
  const uniqid = opts.uniqid || newGeopayUniqid(opts.bookingId);
  const { firstname, lastname } = splitGuestName(opts.guestName);
  const mode = env.GEOPAY_HASH_MODE || "v1";
  const base: Omit<GeopayRedirectParams, "hash"> = {
    uniqid,
    merchant_id: env.GEOPAY_MERCHANT_ID!,
    user_id: env.GEOPAY_USER_ID!,
    desc: (opts.description || `SL${opts.bookingId}`).slice(0, 25),
    cur: GEOPAY_CURRENCY_GEL,
    langcode: geopayLanguage(opts.lang),
    amount: Math.round(opts.amountMinor),
    op: env.GEOPAY_OP || "v",
    email: opts.guestEmail.slice(0, 180),
    firstname: firstname.slice(0, 60),
    lastname: lastname.slice(0, 60),
  };
  const hash = geopayHash(base, env.GEOPAY_HASH_SECRET!, mode);
  const params: GeopayRedirectParams = { ...base, hash };
  const url = `${redirectBase(env)}?${new URLSearchParams(
    Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))
  ).toString()}`;
  return { url, uniqid, params };
}

export function isGeopayUniqid(id: string): boolean {
  return /^[a-f0-9]{32}$/i.test(id);
}

/** Live check: valid hash should return UFC ClientHandler auto-form, not ?hash error redirect. */
export async function testGeopayCredentials(env: Env): Promise<{
  configured: boolean;
  redirectOk: boolean;
  hashMode?: string;
  error?: string;
}> {
  if (!isGeopayConfigured(env)) {
    return { configured: false, redirectOk: false, error: "GeoPay secrets not set" };
  }
  const modes = [env.GEOPAY_HASH_MODE || "v1", "v1", "v2"].filter((v, i, a) => a.indexOf(v) === i);
  for (const mode of modes) {
    const base = {
      uniqid: "00000000000000000000000000000001",
      merchant_id: env.GEOPAY_MERCHANT_ID!,
      user_id: env.GEOPAY_USER_ID!,
      desc: "TEST",
      cur: GEOPAY_CURRENCY_GEL,
      langcode: "EN",
      amount: 100,
      op: env.GEOPAY_OP || "v",
      email: "test@example.com",
      firstname: "Test",
      lastname: "User",
    };
    const hash = geopayHash(base, env.GEOPAY_HASH_SECRET!, mode);
    const testUrl = `${redirectBase(env)}?${new URLSearchParams({
      ...Object.fromEntries(Object.entries(base).map(([k, v]) => [k, String(v)])),
      hash,
    }).toString()}`;
    try {
      const res = await fetch(testUrl, { redirect: "manual" });
      const body = res.status === 200 ? await res.text() : "";
      const location = res.headers.get("location") || "";
      const ok =
        body.includes("ecommerce.ufc.ge/ecomm2/ClientHandler") ||
        body.includes("trans_id");
      const hashFail = location.includes("hash") || body.includes("hash");
      if (ok && !hashFail) {
        return { configured: true, redirectOk: true, hashMode: mode };
      }
    } catch (e) {
      return {
        configured: true,
        redirectOk: false,
        error: String((e as Error)?.message || e).slice(0, 200),
      };
    }
  }
  return {
    configured: true,
    redirectOk: false,
    error: "Hash rejected by GeoPay — ask GeoPay support for the correct GEOPAY_HASH_SECRET and formula",
  };
}
