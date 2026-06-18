# Nasazení do produkce (Qapi e-shop)

## Přehled

Aplikace je jeden Node proces: ve vývoji obsluhuje Vite middleware, v produkci servíruje statický build z `dist/` a REST API pod `/api/*`.

Doporučené nasazení: **reverse proxy s TLS** (nginx, Traefik, Caddy, Coolify) → `http://127.0.0.1:PORT` kde běží tento server.

## Build a start

```bash
npm ci
npm run build
npm run start:prod
```

Na Linuxu bez `cross-env` lze použít `NODE_ENV=production npm start`. Proměnné načtěte z `.env` (stejně jako ve vývoji) nebo je nastavte v orchestrátoru.

## Proměnné prostředí

Kompletní výčet je v [`.env.example`](./.env.example). Minimálně:

- `DATABASE_URL` — PostgreSQL (u managed služeb často `sslmode=require` v URL)
- `ADMIN_PASSWORD`, ideálně pevný `ADMIN_TOKEN`
- `CORS_ORIGIN` — přesná veřejná URL e-shopu
- `PORT` — pokud hostitel nedefinuje jinak

Volitelně: `ORDER_WEBHOOK_URL`, SMTP pro potvrzovací e-maily (`SMTP_*`, `MAIL_FROM`, `MAIL_TO_SHOP`).

## Zálohy PostgreSQL

Bez záloh hrozí ztráta objednávek. Zvolte jednu z variant:

1. **Automatické snapshoty** u poskytovatele DB (Neon, RDS, DigitalOcean Managed DB, …).
2. **Cron na VPS** — např. jednou denně:

   ```bash
   pg_dump "$DATABASE_URL" -Fc -f "backup-$(date +%Y%m%d).dump"
   ```

   Uložte soubory mimo stejný disk / do objektového úložiště s verzováním.

## Docker

V kořenu je [`Dockerfile`](./Dockerfile). Typický postup:

```bash
docker build -t qapi-shop .
docker run --env-file .env -p 3000:3000 qapi-shop
```

Pro produkci doplňte TLS a tajné údaje přes tajemství hostitele, ne přímo v obraze.

## Kontrola provozu

- `GET /api/health` — `status`, `environment`, stav připojení k DB (`db`: `connected` | `not_configured`).

## Právní stránky

Ve frontendu jsou šablony obchodních podmínek, GDPR, cookies a vzor odstoupení (`#/obchodni-podminky`, `#/ochrana-udaju`, `#/cookies`, `#/odstoupeni`). Před ostrým provozem je doplňte a nechte zkontrolovat právníkem.
