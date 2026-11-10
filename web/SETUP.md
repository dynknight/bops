# Bops Web setup

Personal, non-commercial prototype for the GitHub account `dynknight`. It runs in the browser on Vercel Hobby. The Vercel project root is `web/`.

This directory is a derivative of [OrgoAI/bops](https://github.com/OrgoAI/bops). Copyright 2026 Nick Vasilescu and Organic Intelligence, Inc. The license is FSL-1.1-ALv2 (`LICENSE` in this directory). Keep that file and `NOTICE` with any copy. The name "Bops Web" is a placeholder. Do not use the Bops logo or present this as a Bops product.

There is no Mac app, Electron shell, Keychain, Orgo computer, phone, voice, SMS, or shell execution in this app.

## 1. Supabase

1. Open [https://supabase.com/dashboard](https://supabase.com/dashboard) and create a project on the free plan. Pick a region near you and set a database password.
2. Wait until the project status is healthy.
3. Open **Project Settings → API**.
4. Copy **Project URL**. That is `NEXT_PUBLIC_SUPABASE_URL`.
5. Copy the **anon public** key. That is `NEXT_PUBLIC_SUPABASE_ANON_KEY`. It is safe in the browser. Row level security limits it to your rows.
6. Copy the **service_role** key. That is `SUPABASE_SERVICE_ROLE_KEY`. Put it only in Vercel, never in client code and never in git.
7. Open **SQL Editor → New query**.
8. Paste each file in `supabase/migrations/` into the editor, in name order, and run it. Start with `0001_bops_web.sql`. If that file is already applied, run `0002_routine_idempotency.sql` only. You should see success and no error.
9. The migration inserts one allowlist row, `dynknight`, and rejects every other GitHub login at the table check.

## 2. Owner

There is no sign-in screen and no GitHub OAuth. The app is single-tenant.

On each server instance, the service role key (server only) finds the existing `dynknight` profile and opens a Supabase session for that user. Queries from the app use the anon key with that user's access token, so row level security and approval decisions still see `auth.uid()`. The browser never receives the service role key.

The profile id is the `owner_id` on agents, chats, routines, and usage. The server reuses that row. It does not create a second owner when the profile is already there.

A brand-new database with no profile and no dynknight auth user gets one user, one profile, and the four agents. If either lookup fails, the server stops instead of inventing another owner.

## 3. Google AI Studio key

1. Open [https://aistudio.google.com/apikey](https://aistudio.google.com/apikey).
2. Create an API key on the free tier.
3. That value is `GOOGLE_GENERATIVE_AI_API_KEY`.
4. The default model for every agent and use case is `google` / `gemini-2.5-flash`.
5. If this key is missing, a chat fails with a clear error. The app does not switch to OpenAI, Anthropic, xAI, or OpenRouter.

## 4. Optional providers

Leave these blank unless you want that adapter. An adapter is off until its own key is set.

| Provider | Env var | Where to create the key |
| --- | --- | --- |
| OpenAI | `OPENAI_API_KEY` | [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| Anthropic | `ANTHROPIC_API_KEY` | [https://console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) |
| xAI | `XAI_API_KEY` | [https://console.x.ai](https://console.x.ai) |
| OpenRouter | `OPENROUTER_API_KEY` | [https://openrouter.ai/keys](https://openrouter.ai/keys) |

On the Team page, a provider shows up in the menu only after its key is set. OpenRouter also needs the model id you type (for example `google/gemini-2.5-flash`). The app will not pick a paid model for you.

## 5. Composio

1. Create an account at [https://composio.dev](https://composio.dev).
2. Create an API key. That is `COMPOSIO_API_KEY`.
3. Connect the apps you want in the Composio dashboard, for the user id `dynknight` (or set `COMPOSIO_USER_ID` to the id you used).
4. Agents can call read-only tools immediately. A tool runs only when Composio marks it read-only and its name is not a send, post, create, update, or delete. Anything else has to go through `composio_write`, which waits for your approval of the exact arguments.
5. Optional webhooks: point Composio at `https://<your-app>.vercel.app/api/webhooks/composio`. Set `COMPOSIO_WEBHOOK_SECRET` to the signing secret. The route checks an HMAC-SHA256 of the raw body (`x-webhook-signature: sha256=<hex>` or `x-composio-signature`) or a Svix signature (`svix-id`, `svix-timestamp`, `svix-signature`). The same event id is stored once.

## 6. Zernio (optional)

1. Create an account at [https://zernio.com](https://zernio.com).
2. Create an API key. That is `ZERNIO_API_KEY`.
3. Connect the social accounts you want. Copy each account id. The social specialist has to pass that id.
4. Every post and every reply stores the exact text, hashes it, and waits. Allow once publishes that stored text and no other. Deny does nothing. A second delivery of the same approval does not post again. Zernio is called with the approval id as `Idempotency-Key`.
5. Optional webhooks: `https://<your-app>.vercel.app/api/webhooks/zernio` and `ZERNIO_WEBHOOK_SECRET`, same signature rules as Composio.

## 7. Cron secret

Generate one:

```bash
openssl rand -hex 32
```

That value is `CRON_SECRET`. The dispatcher refuses every request when it is unset.

## 8. Import into Vercel

1. Open [https://vercel.com/new](https://vercel.com/new).
2. Import the GitHub repo `dynknight/bops`.
3. Set **Root Directory** to `web`.
4. Framework preset: Next.js. Leave the build command as the package script (`next build --webpack`). Webpack is required here because this app lives in `web/` beside the desktop app's lockfile, and a Turbopack production build does not finish trace collection in that layout.
5. Add every variable from the list below. Leave optional keys empty.
6. Deploy.
7. Copy the deployment hostname (`https://<name>.vercel.app`).
8. Open the site. It lands on Chat with no sign-in. Existing agents, chats, routines, and usage stay on the dynknight profile. A new database gets Chief, Research, Inbox, and Social on first open.

### Hobby cron is once a day

Vercel Hobby rejects a cron expression that runs more than once a day, so `vercel.json` schedules `/api/cron/dispatch` at `0 16 * * *` (16:00 UTC, which is 08:00 or 09:00 in America/Los_Angeles depending on daylight saving). That deploy succeeds on Hobby.

To claim routines every 15 minutes without leaving Hobby:

1. In the GitHub repo, open **Settings → Secrets and variables → Actions**.
2. Add `BOPS_WEB_CRON_URL` = `https://<name>.vercel.app/api/cron/dispatch`.
3. Add `CRON_SECRET` with the same value as on Vercel.
4. `.github/workflows/bops-web-dispatch.yml` POSTs to that URL every 15 minutes. If the secrets are missing, the action exits without calling the app.

The route claims due rows with `FOR UPDATE SKIP LOCKED` and a unique `(routine_id, slot_at)` dispatch. A second caller in the same slot inserts nothing and starts no second run. Missed slots are skipped so a quiet period does not burst a backlog of model calls.

Workflows keep running after you close the browser. Approval waits use a Workflow hook. The server opens the dynknight session before it decides an approval. The database still refuses the service role and anyone who is not that profile.

## 9. Local check

```bash
cd web
cp .env.example .env.local
# fill the values, then:
npm install
npm test
npm run typecheck
npm run lint
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment variables

| Name | Where | Required | Purpose |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | browser and server | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser and server | yes | Supabase anon key, limited by RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | yes | Opens the dynknight session, plus workflows, cron, and approval execution |
| `CRON_SECRET` | server only | yes | Bearer token for the dispatcher |
| `GOOGLE_GENERATIVE_AI_API_KEY` | server only | yes for chat | Gemini free-tier default |
| `OPENAI_API_KEY` | server only | no | Enables the OpenAI adapter |
| `ANTHROPIC_API_KEY` | server only | no | Enables the Anthropic adapter |
| `XAI_API_KEY` | server only | no | Enables the xAI adapter |
| `OPENROUTER_API_KEY` | server only | no | Enables the OpenRouter adapter |
| `COMPOSIO_API_KEY` | server only | no | Read-only tools, plus writes after approval |
| `COMPOSIO_WEBHOOK_SECRET` | server only | no | Verifies Composio webhooks |
| `COMPOSIO_USER_ID` | server only | no | Defaults to `dynknight` |
| `ZERNIO_API_KEY` | server only | no | Social posts and replies after exact approval |
| `ZERNIO_WEBHOOK_SECRET` | server only | no | Verifies Zernio webhooks |

No provider key uses a `NEXT_PUBLIC_` name. The health route reports which providers are on, as booleans only.

## What you can do

- Chat with the chief of staff or a specialist. Messages, runs, steps, and token counts are stored.
- Edit a name, a role, the "How I work" persona, and the model for chat, tools, and routines.
- The chief can delegate to Research, Inbox, or Social. A specialist cannot delegate, and the chief can delegate at most 3 times in one run.
- A run stops at 8 steps, 24,000 tokens, or 2 model retries.
- Allow once or deny an exact action. The decision is bound to the content hash, expires after 60 minutes, and a repeat of the same decision does not run the action twice.
- Cancel a run.
- Add a routine. It is claimed while the browser is closed.
- Read the usage page.

## Limits of this prototype

Live model calls, Composio, Zernio, and the Workflow runtime need the keys and a Vercel (or `next dev`) environment. The automated tests cover the allowlist, row level security, approval replay, and duplicate dispatch against an in-process Postgres. They do not call Google, Composio, or Zernio.
