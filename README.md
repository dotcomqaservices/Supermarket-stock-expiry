# AI Stock by dotcom.qa services

A multi-tenant supermarket inventory and expiry-management web application.

## Included

- Clerk sign-in and private store onboarding with the **Starter Plan** assigned by the server
- Store-scoped product batches, quantities, prices, expiry classifications, and inventory valuation
- Authorized staff registration, editing, active/inactive status, and removal
- Transactional staff audit events protected against update, deletion, and truncation in PostgreSQL
- Verified WhatsApp Business account/phone ownership, encrypted credential storage, signed webhooks, active-sender checks, security alerts, and duplicate-message protection
- Super-admin analytics, subscription-tier controls, user privileges, and persistent service settings
- Branded inventory valuation/expiry reports with browser printing/PDF support

## Stack and layout

Node.js 24+, pnpm, TypeScript, React/Vite, Tailwind CSS, Lucide, Express, PostgreSQL, Drizzle, and Clerk.

| Directory | Purpose |
| --- | --- |
| `artifacts/ai-stock` | Web frontend |
| `artifacts/api-server` | REST API and WhatsApp webhook |
| `lib/db` | Database schemas and audit guards |
| `lib/api-spec/openapi.yaml` | API contract |
| `lib/api-client-react` / `lib/api-zod` | Generated API clients and validators |

## Setup

1. Install dependencies with `pnpm install`.
2. Configure the environment variables documented in `.env.example`. In Replit, use Secrets; never commit actual credentials.
3. Initialize the development database:
   ```sh
   pnpm --filter @workspace/db run push
   ```
4. Start the configured Replit API and web workflows. For manually managed processes:
   ```sh
   PORT=8080 pnpm --filter @workspace/api-server run dev
   PORT=5000 BASE_PATH=/ pnpm --filter @workspace/ai-stock run dev
   ```
   The variables from `.env.example` must already be available to those processes. Replit injects configured Secrets automatically.

Replit routes `/api` to Express and `/` to the web application. Outside Replit, configure an equivalent reverse proxy: `/api` to the API service and all other routes to the frontend, including SPA fallback. For production, serve the built frontend rather than Vite's development server.

### Coolify single-resource deployment

The root package pins pnpm to the version used to generate and verify the lockfile. Coolify/Railpack can deploy the workspace as one service: the production API server also serves the built frontend and its SPA routes.

Configure the Coolify application with:

- Repository branch: `main`
- Base directory: `/`
- Build command: `pnpm run build`
- Start command: `pnpm start`
- Exposed container port: `8080`
- Health-check path: `/api/healthz`

Set the server variables from `.env.example` in Coolify. Make `VITE_CLERK_PUBLISHABLE_KEY` available during the build because it is embedded in the frontend bundle. Keep database, Clerk secret, session, and WhatsApp secrets available at runtime; never commit their values. The server defaults to port `8080`, and the frontend build defaults to the root URL path.

### First super admin

Sign up, then set `SUPER_ADMIN_USER_IDS` to the account's Clerk user ID or set `SUPER_ADMIN_EMAILS` to its verified primary email. Both accept comma-separated values. Restart the API after configuration changes. Do not automatically grant admin access to the first public registrant.

Super admins can manage plans, grant/remove platform-admin roles, pause new-store registration, and update the service notice/support contact at `/platform`.

## WhatsApp Business setup

The application uses Meta's official WhatsApp Cloud API; no unofficial WhatsApp automation is used.

1. Set the service-level `WHATSAPP_APP_SECRET` and a private `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.
2. Configure the Meta app's webhook callback to the application's HTTPS `/api/webhooks/whatsapp` endpoint and subscribe to messages.
3. During store onboarding or in store Settings, supply that store's official number, Meta phone-number ID, WhatsApp Business Account ID, and appropriately scoped access token.
4. The API checks the phone's ownership and displayed number against Meta, subscribes the app to the WABA, and encrypts the access token. The token is never returned to the browser.
5. Register the sending employee's international phone number as active staff for that store.

Supported messages:

```text
SET BATCH-001 20
STOCK BATCH-001 20
ADD BATCH-001 5
```

`SET` and `STOCK` replace the batch quantity; `ADD` increases it. Quantities are non-negative whole numbers. Unauthorized/inactive senders cannot change inventory. Replayed message IDs do not apply changes twice.

The connection remains pending until webhook configuration is present and a verified, authorized stock message is processed. Without Meta credentials, inventory/staff features still work, but live WhatsApp updates cannot be activated.

Keep `SESSION_SECRET` stable and private: it is used for encrypted WhatsApp credential storage.

## Verification

```sh
pnpm run typecheck
PORT=5000 BASE_PATH=/ pnpm --filter @workspace/ai-stock run build
pnpm --filter @workspace/api-server run build
node --test artifacts/api-server/tests/whatsapp-security.test.mjs
node --test lib/db/tests/audit-guards.test.mjs
```

The database guard test requires `DATABASE_URL` and a running API that has installed the audit triggers. It uses a transaction and rolls back its test records.

After changing the API contract:

```sh
pnpm --filter @workspace/api-spec run codegen
```

## Production checklist

- Use the production Clerk instance and configure its allowed domains.
- Provision and back up PostgreSQL; review schema changes before applying them to a live database.
- Configure real Meta credentials, a public HTTPS callback, and the `messages` webhook subscription.
- Set the initial trusted super-admin account.
- Use stable server secrets and HTTPS; keep secrets out of Git and client-side build variables.
- Review the inventory report and tenant/access regression checks before rollout.
