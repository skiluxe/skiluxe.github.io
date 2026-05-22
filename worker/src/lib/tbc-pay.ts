import type { Env } from "../types";

const TBC_API = "https://api.tbcbank.ge";
const TOKEN_CACHE_KEY = "tbc:access_token";

export interface TbcPaymentLink {
  uri: string;
  method: string;
  rel: string;
}

export interface TbcCreatePaymentResult {
  payId: string;
  status: string;
  currency: string;
  amount: number;
  links: TbcPaymentLink[];
}

export interface TbcPaymentDetails {
  payId: string;
  status: string;
  currency: string;
  amount: number;
  resultCode?: string;
}

export function isTbcConfigured(env: Env): boolean {
  return !!(env.TBC_API_KEY && env.TBC_CLIENT_ID && env.TBC_CLIENT_SECRET);
}

function tbcLanguage(lang?: string | null): "EN" | "KA" {
  return lang === "ka" ? "KA" : "EN";
}

/** Minor units (cents) → decimal amount for TBC API. */
export function minorToTbcAmount(minor: number): number {
  return Math.round(minor) / 100;
}

export async function getTbcAccessToken(env: Env): Promise<string> {
  const cached = await env.KV.get(TOKEN_CACHE_KEY);
  if (cached) return cached;

  const body = new URLSearchParams({
    client_id: env.TBC_CLIENT_ID!,
    client_secret: env.TBC_CLIENT_SECRET!,
  });

  const res = await fetch(`${TBC_API}/v1/tpay/access-token`, {
    method: "POST",
    headers: {
      apikey: env.TBC_API_KEY!,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`TBC access-token ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in?: number | string };
  const ttl = Math.max(300, (Number(data.expires_in) || 86400) - 300);
  await env.KV.put(TOKEN_CACHE_KEY, data.access_token, { expirationTtl: ttl });
  return data.access_token;
}

export async function createTbcPayment(
  env: Env,
  opts: {
    amountMinor: number;
    currency: string;
    merchantPaymentId: string;
    description: string;
    returnUrl: string;
    callbackUrl: string;
    userIp?: string;
    lang?: string | null;
  }
): Promise<TbcCreatePaymentResult> {
  const token = await getTbcAccessToken(env);
  const payload = {
    amount: {
      currency: opts.currency,
      total: minorToTbcAmount(opts.amountMinor),
    },
    returnurl: opts.returnUrl,
    callbackUrl: opts.callbackUrl,
    preAuth: false,
    language: tbcLanguage(opts.lang),
    merchantPaymentId: opts.merchantPaymentId,
    description: opts.description.slice(0, 30),
    expirationMinutes: 12,
    userIpAddress: opts.userIp || "127.0.0.1",
  };

  const res = await fetch(`${TBC_API}/v1/tpay/payments`, {
    method: "POST",
    headers: {
      apikey: env.TBC_API_KEY!,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`TBC create payment ${res.status}: ${JSON.stringify(data).slice(0, 400)}`);
  }

  return data as TbcCreatePaymentResult;
}

export async function getTbcPayment(env: Env, payId: string): Promise<TbcPaymentDetails> {
  const token = await getTbcAccessToken(env);
  const res = await fetch(`${TBC_API}/v1/tpay/payments/${encodeURIComponent(payId)}`, {
    headers: {
      apikey: env.TBC_API_KEY!,
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`TBC get payment ${res.status}: ${JSON.stringify(data).slice(0, 400)}`);
  }

  return data as TbcPaymentDetails;
}

export function tbcApprovalUrl(payment: TbcCreatePaymentResult): string | null {
  const link = payment.links?.find((l) => l.rel === "approval_url" && l.method === "REDIRECT");
  return link?.uri || null;
}

export function isTbcPaymentSucceeded(status: string): boolean {
  return status === "Succeeded";
}

export function isTbcPaymentFailed(status: string): boolean {
  return status === "Failed" || status === "Expired";
}
