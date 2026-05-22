# SkiLuxe deployment guide

Going from this branch to a live site at `new-gudauri.com`. One-time setup, ~45 minutes.

## 1. Land the code on `Golbstein/skiluxe`

You created `https://github.com/Golbstein/skiluxe` already. Run locally:

```bash
git clone -b claude/gudauri-rental-website-xyc0U https://github.com/Golbstein/Golbstein.github.io.git tmp-skiluxe
cd tmp-skiluxe
git checkout --orphan main
git add -A
git commit -m "Initial commit: SkiLuxe New Gudauri site + worker"
git remote set-url origin https://github.com/Golbstein/skiluxe.git
git push -u origin main
```

That copies the entire build (frontend + worker + migrations + admin) onto `Golbstein/skiluxe`'s `main` branch with a clean history.

## 2. GitHub Pages

On `Golbstein/skiluxe`:

1. Settings → Pages → Source = **GitHub Actions**.
2. Push triggers `.github/workflows/pages.yml`, which builds Eleventy and deploys `_site/`.
3. After the first run, the site is live on a temporary `*.github.io` URL — verify it works before pointing DNS.
4. Custom domain (after step 5): set `www.new-gudauri.com` in the Pages settings; GitHub will regenerate the `CNAME` file.

## 3. Cloudflare account + zone

1. Sign up at cloudflare.com (free).
2. Add `new-gudauri.com` as a zone.
3. Update your registrar's nameservers to Cloudflare's two NS records.
4. Wait for the zone to go active (usually under 10 min).

## 4. D1 database + KV namespace

Install wrangler locally: `npm install -g wrangler` (or use `npx wrangler` everywhere).

```bash
cd worker
wrangler login
wrangler d1 create skiluxe-db
# → copy the "database_id" UUID into wrangler.toml (replace REPLACE_WITH_D1_ID)

wrangler kv namespace create NG_KV
# → copy the "id" into wrangler.toml (replace REPLACE_WITH_KV_ID)
```

Apply schema + seeds:

```bash
wrangler d1 migrations apply skiluxe-db --remote
wrangler d1 execute skiluxe-db --remote --file=migrations/0002_seed_apartments.sql
wrangler d1 execute skiluxe-db --remote --file=migrations/0003_seed_seasons.sql
```

## 5. Worker secrets

Generate an admin password hash. From the repo root, run:

```bash
node -e "
const PBKDF2_ITER = 100000;  # Cloudflare Workers max; do not use 200000
const crypto = require('crypto');
const pw = process.argv[1];
const salt = crypto.randomBytes(16);
const hash = crypto.pbkdf2Sync(pw, salt, PBKDF2_ITER, 32, 'sha256');
console.log('pbkdf2$' + PBKDF2_ITER + '$' + salt.toString('base64') + '$' + hash.toString('base64'));
" 'YOUR_PASSWORD_HERE'
```

Copy the output and set the secrets:

```bash
cd worker
wrangler secret put ADMIN_PASSWORD_HASH    # paste the pbkdf2$… string
wrangler secret put SESSION_SECRET         # 32 random bytes hex: openssl rand -hex 32
wrangler secret put OWNER_EMAIL            # where booking notifications land
wrangler secret put OWNER_WHATSAPP_PHONE   # e.g. +9725...
wrangler secret put CALLMEBOT_API_KEY      # see callmebot.com/blog/free-api-whatsapp-messages/
wrangler secret put MAIL_FROM              # noreply@new-gudauri.com
wrangler secret put MAIL_DKIM_DOMAIN       # new-gudauri.com
wrangler secret put MAIL_DKIM_SELECTOR     # mailchannels
wrangler secret put MAIL_DKIM_PRIVATE_KEY  # RSA DER base64 — run: ./scripts/fix-dkim-secret.sh
```

Deploy:

```bash
wrangler deploy
```

The Worker is now reachable at `https://skiluxe-api.<your-subdomain>.workers.dev`.

## 6. Custom domains

1. **API**: Cloudflare dashboard → Workers & Pages → `skiluxe-api` → Triggers → Add Custom Domain → `api.new-gudauri.com`. Cloudflare auto-creates the DNS record.
2. **Site**: In Cloudflare DNS, add these records (proxy **off**, GitHub Pages requires it):
   - `A    @       185.199.108.153`
   - `A    @       185.199.109.153`
   - `A    @       185.199.110.153`
   - `A    @       185.199.111.153`
   - `CNAME www    golbstein.github.io`
3. GitHub Pages → set Custom Domain to `www.new-gudauri.com`. Enable "Enforce HTTPS" once SSL provisions (a few minutes).

## 7. MailChannels email (SPF + DKIM + Domain Lockdown + API key)

The free “send from Workers with no account” tier ended in 2024. You need a **MailChannels Email API** account (free plan: 100 emails/day): https://www.mailchannels.com/email-api/

### 7a. DNS (Cloudflare → `new-gudauri.com` → DNS)

1. **SPF** on `@` (merge with existing, only one SPF TXT):
   ```
   v=spf1 include:spf.efwd.registrar-servers.com include:relay.mailchannels.net ~all
   ```
2. **DKIM** on `mailchannels._domainkey` (selector must match `MAIL_DKIM_SELECTOR` secret, usually `mailchannels`):
   ```
   v=DKIM1; k=rsa; p=<your-public-key-without-pem-headers>
   ```
3. **Domain Lockdown** on `_mailchannels` (required — without this, sends fail silently):
   ```
   v=mc1 auth=<YOUR_MAILCHANNELS_ACCOUNT_ID>
   ```
   Find **Account ID** in [MailChannels Console](https://console.mailchannels.net/settings/accountSettings) (upper right).  
   Do **not** use `cfid=…workers.dev` — that method was retired Aug 2024.

Verify:
```bash
dig @1.1.1.1 new-gudauri.com TXT +short
dig @1.1.1.1 mailchannels._domainkey.new-gudauri.com TXT +short
dig @1.1.1.1 _mailchannels.new-gudauri.com TXT +short
```

### 7b. Worker secrets

```bash
cd worker
wrangler secret put MAILCHANNELS_API_KEY   # API key from MailChannels Console (api scope)
# MAIL_FROM, MAIL_DKIM_*, OWNER_EMAIL should already be set from step 5
wrangler deploy
```

After a test booking, check logs if mail fails:
```bash
cd worker && npx wrangler tail
```

## 8. TBC E-Commerce online payments (optional)

Booking uses [TBC Checkout](https://developers.tbcbank.ge/docs/checkout-create-checkout-payment) when three secrets are set. Without them, the site keeps the offline 24h hold flow.

You need **two** credential sets:

1. **Developer app** — [developers.tbcbank.ge](https://developers.tbcbank.ge/docs/get-apikey-and-secret): register an app and copy the **API key** (sent as the `apikey` header on every request).
2. **Merchant account** — register at [ecom.tbcpayments.ge](https://ecom.tbcpayments.ge/), wait for activation, then copy **client_id** and **client_secret** from the merchant dashboard.

Apply the DB migration (adds payment columns):

```bash
cd worker
wrangler d1 migrations apply skiluxe-db --remote
```

Set secrets:

```bash
wrangler secret put TBC_API_KEY
wrangler secret put TBC_CLIENT_ID
wrangler secret put TBC_CLIENT_SECRET
wrangler deploy
```

In the TBC merchant dashboard, add a **callback URL**:

```
https://api.new-gudauri.com/api/payments/tbc/callback
```

TBC sends POST requests from IPs `193.104.20.44`, `193.104.20.45`, `185.52.80.44`, `185.52.80.45` — Cloudflare Workers accepts these by default.

**Flow:** guest submits booking → redirected to TBC payment page → on success the callback auto-confirms the booking and sends owner/guest emails.

**Currency:** apartments are priced in GEL (Georgian Lari). GEL is the default for TBC Checkout.

## 9. Verify end-to-end

1. Browse `https://www.new-gudauri.com/en/` → homepage loads, all 4 languages switch correctly, Hebrew flips to RTL.
2. Open an apartment detail → availability calendar renders (Nov–Apr ski season, 3×2 grid).
3. Submit a test booking with your own email → you receive owner email + WhatsApp + guest email.
4. Sign in at `/admin/` → confirm the test booking; status flips to confirmed.
5. Subscribe `https://api.new-gudauri.com/api/ical/f2-one-bedroom.ics` from Google Calendar → confirmed dates show up.
6. In `/admin/ical/`, paste your Booking.com iCal export URL for each apartment → "Sync now" → dates appear blocked.

## 10. Wix cutover

Once everything above checks out, change DNS at the registrar:

1. Lower TTL on the existing Wix DNS records to 5 minutes a day in advance.
2. Switch nameservers to Cloudflare (or update A/CNAME if you keep registrar DNS).
3. Keep Wix paid for one billing cycle as a rollback option.

## 11. Drop the real photos

Owner flow:

1. Open `https://github.com/Golbstein/skiluxe` in browser.
2. Navigate to `src/assets/apartments/<apartment-slug>/`.
3. "Add file" → "Upload files" → drag in `01.jpg`, `02.jpg`, …
4. Commit. GitHub Actions rebuilds the site; photos appear within ~2 minutes.

File order is alphabetical — name them `01.jpg`, `02.jpg`, etc. for a deterministic gallery order.
