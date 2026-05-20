# SkiLuxe New Gudauri

Boutique ski-apartment rentals in New Gudauri, Georgia. Replaces the previous Wix site at `new-gudauri.com` with a static Eleventy frontend and a Cloudflare Worker backend for availability, dynamic pricing, promotions, two-way Booking.com iCal sync, and 24-hour booking holds.

## Repository structure

```
/                       static Eleventy site (deploys to GitHub Pages)
  src/                  page templates, i18n, partials, assets
  worker/               Cloudflare Worker (API + cron jobs)
```

## Local development

Prereqs: Node 20+, npm.

```bash
npm install
npm run dev          # static site at http://localhost:8080
```

For the API:

```bash
cd worker
npm install
cp .dev.vars.example .dev.vars     # fill in local secrets
npx wrangler d1 execute new-gudauri-db --local --file=migrations/0001_init.sql
npx wrangler d1 execute new-gudauri-db --local --file=migrations/0002_seed_apartments.sql
npx wrangler d1 execute new-gudauri-db --local --file=migrations/0003_seed_seasons.sql
npx wrangler dev --local
```

## Adding real photos

Drop image files (jpg/png/webp) into the matching apartment folder:

```
src/assets/apartments/loft-2-studio-balcony/
src/assets/apartments/loft-2-alpine-deluxe/
src/assets/apartments/f2-one-bedroom/
src/assets/apartments/f2-superior-studio/
```

Files are listed alphabetically; name them `01.jpg`, `02.jpg`, … to control order. Pages auto-rebuild on commit.

## Deployment

See `DEPLOYMENT.md` for the full first-time setup (Cloudflare zone, D1 + KV bindings, secrets, DNS, GitHub Pages).

## Stack

- Static site: Eleventy (Nunjucks templates)
- Languages: English, Russian, Georgian, Hebrew (RTL)
- Backend: Cloudflare Workers + D1 + Workers KV
- Email: MailChannels (via Worker)
- WhatsApp: CallMeBot
