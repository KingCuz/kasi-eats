# Kasi Eats

Kasi Eats is a Next.js restaurant menu and ordering site for Mabopane, Pretoria. The existing menu data and prices are in `lib/menu.js`; the original project labels those prices as placeholders, so the business must confirm them before accepting customer orders.

## Run locally

1. Use Node.js 18.17 or newer.
2. Copy `.env.example` to `.env.local`.
3. `NEXT_PUBLIC_WHATSAPP` is configured to the Kasi Eats business number `27659667312` (international format, digits only). Set the same value in the local or deployment environment if overriding the default.
4. Set delivery areas to a comma-separated list of verified neighbourhoods. Leave it blank until the business has defined its service area. Configure a confirmed `NEXT_PUBLIC_DELIVERY_FEE`; use `0` only if delivery is genuinely free.
5. Optionally set `NEXT_PUBLIC_DELIVERY_INSTRUCTIONS`, `NEXT_PUBLIC_COLLECTION_INSTRUCTIONS`, and a verified HTTPS Uber Eats store URL in `NEXT_PUBLIC_UBEREATS_URL`.
6. Install packages and start the development server:

   ```powershell
   npm install
   npm run dev
   ```

WhatsApp is an order-request link and does not confirm acceptance. No WhatsApp Business API or Uber Eats integration is included.

## Orders and PayFast

Order totals are recalculated from `lib/menu.js` on the server. PayFast checkout requires a persistent PostgreSQL database URL, sandbox merchant settings, the canonical public HTTPS `SITE_URL`, and PayFast's current published ITN source IP addresses/CIDRs in `PAYFAST_ITN_ALLOWED_IPS` (comma-separated). The serverless Node.js routes create the order table on first use and reuse a small PostgreSQL connection pool. Keep `DATABASE_URL` private.

PayFast remains in sandbox mode unless `PAYFAST_SANDBOX=false` is explicitly set. Sandbox checkout is unavailable until the database, site URL, merchant ID/key and ITN allowlist are configured. The integration uses a server-generated order reference, server-calculated prices, an MD5 signature following PayFast's field-ordering and encoding rules, source-IP checks, ITN signature and PayFast server-side validation, merchant identity and exact stored-amount checks. Payment notifications update only the existing order and repeated or out-of-order notifications cannot downgrade a paid order. A browser return URL never marks an order paid.

### Sandbox-first procedure

1. Create a PostgreSQL database and configure `DATABASE_URL` in `.env.local` and the Vercel project.
2. Obtain sandbox merchant credentials from PayFast and set `PAYFAST_MERCHANT_ID`, `PAYFAST_MERCHANT_KEY`, and (if enabled on the account) `PAYFAST_PASSPHRASE`. Do not use production credentials for this step.
3. Set `SITE_URL` to the exact public HTTPS URL reachable by PayFast. For local work, use a secure tunnel with a stable HTTPS URL; PayFast cannot notify a private localhost address.
4. Copy the official PayFast ITN source IP addresses/CIDRs into `PAYFAST_ITN_ALLOWED_IPS`. Recheck the list against PayFast's documentation before deployment. Vercel's `x-vercel-forwarded-for` request header is used for the source address; Vercel documents it as identical to its `x-forwarded-for` value.
5. Leave `PAYFAST_SANDBOX` blank or set it to `true`; leave `PAYFAST_LIVE_ENABLED` blank. Verify a successful sandbox payment, a failed/cancelled attempt, duplicate ITN handling, amount/merchant rejection, and the status shown after returning to the site. Inspect the order rows to verify only server-confirmed notifications result in `paid`.
6. Do not enable production payments until the sandbox flow has been verified and the business has approved production credentials. Only then set `PAYFAST_SANDBOX=false`, `PAYFAST_LIVE_ENABLED=true`, and `PAYFAST_LIVE_VERIFIED=true` alongside the production credentials in the Vercel environment. `PAYFAST_LIVE_VERIFIED` is an operator-controlled release flag, not an automatic credential check. Never put credentials in `NEXT_PUBLIC_*` variables.

The Chicken Wings with Chips photo is present, but the item is intentionally unavailable for checkout and order totals until the business confirms its price. Menu prices are not inferred from other products.

## Vercel deployment

1. Push the existing project to a Git provider and import that repository into Vercel.
2. Select the Next.js framework preset and add the environment variables above in the correct Vercel environment. Add all server-only credentials only as server-side project environment variables.
3. Set `SITE_URL` to the canonical HTTPS production origin. Configure the same verified service areas, delivery fee, WhatsApp number (`27659667312`), and optional external merchant URL used locally.
4. Deploy to a preview URL and test the page, menu images, WhatsApp request link, order validation, and PayFast sandbox callback end-to-end before promoting it.
5. Keep `PAYFAST_SANDBOX` enabled until sandbox verification is recorded. Production payment activation is a separate, explicit merchant decision.

The app does not have administrator authentication or a menu/order-management dashboard. Persistent payment orders require the configured PostgreSQL-compatible database. Delivery coverage, delivery pricing, WhatsApp contact, business pickup instructions, and any external ordering link require verified business details before they are advertised.

## Checks

The project uses the production build as its current automated framework check:

```powershell
npm run build
npm audit
```

There is no pre-existing lint or test script in this project.
