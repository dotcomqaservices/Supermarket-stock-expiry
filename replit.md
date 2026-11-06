# AI Stock by dotcom.qa services

AI Stock helps supermarket teams manage store-scoped inventory, expiry risk, staff access, and WhatsApp stock updates.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/ai-stock` — React/Vite dashboard, onboarding, inventory, staff, audit, settings, and platform pages
- `artifacts/api-server` — Express API, Clerk middleware, tenant authorization, and WhatsApp webhook handling
- `lib/api-spec/openapi.yaml` — API source of truth; regenerate clients with the codegen command above
- `lib/db/src/schema/` — PostgreSQL schema for stores, memberships, products, staff, audit records, and WhatsApp events
- `.env.example` — local environment variable names; do not copy real credentials into this file

## Architecture decisions

- Clerk owns sign-in; store roles are enforced by the API against `store_memberships`, not by frontend visibility.
- Every store-owned record has a `store_id` foreign key; API queries scope by both resource ID and store ID.
- Audit records are append-only through the API. Staff changes and their audit entries are written in one transaction.
- WhatsApp access tokens are encrypted at rest using a key derived from `SESSION_SECRET`; credentials never appear in API responses.
- WhatsApp stock messages support `SET <batch> <quantity>`, `STOCK <batch> <quantity>`, and `ADD <batch> <quantity>`.

## Product

- Store onboarding assigns the Starter Plan and records the official WhatsApp business number.
- Inventory tracks product, category, batch, quantity, cost/selling prices, and expiry date.
- Staff authorization checks active registered phone numbers before accepting WhatsApp stock updates.
- Super admins are bootstrapped with `SUPER_ADMIN_EMAILS` or `SUPER_ADMIN_USER_IDS`; both are comma-separated.
- Live WhatsApp webhook verification requires `WHATSAPP_APP_SECRET` and `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.
- Platform settings manage new-store registration, the service notice, and support contact.
- Store inventory includes a branded printable valuation and expiry report.

## User preferences

- Never commit credentials; configure runtime values through Secrets.

## Gotchas

- The preview uses Clerk development keys. Production Clerk accounts are separate after publishing.
- A store's WhatsApp connection remains pending until app-level webhook secrets are configured and a verified staff message is received.
- Expiry status uses calendar dates in the Asia/Qatar time zone.
- Audit guards are installed before the API starts and reject database updates, deletions, and truncation of audit events.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
