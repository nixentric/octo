# Octo CMS

A lightweight Git-based CMS. Content lives in a GitHub repository as Markdown + frontmatter; every save is a commit. No database.

```
Browser (React) → Cloudflare Worker (/api, /auth) → GitHub API → your repository → static site build
```

## Running it

**Host your own** — the expected route. Fork this, register your own GitHub App, set your own
secrets, deploy your own Worker. Nothing of yours passes through anyone else's server, and the
whole setup is the five steps below.

**Use someone else's instance** — also possible without changing a line. Each visitor signs in with
their own GitHub account, and the repository list comes from *their* own installations of that
instance's GitHub App, so tenants never see each other. Running an instance for other people does
mean two things: their GitHub tokens are sealed with your `SESSION_SECRET` and therefore readable by
your Worker, and the GitHub App they install on their repositories is yours to keep working. Set the
app to **Any account** if you intend to offer this.

## Stack

React + TypeScript + Vite · Tailwind v4 + shadcn/ui · Hono on Cloudflare Workers · GitHub App (OAuth user flow) · Zod.

## Setup

### 1. Create a GitHub App

GitHub → Settings → Developer settings → GitHub Apps → **New GitHub App**

- **Callback URL**: `http://localhost:5173/auth/github/callback` (add your production URL later)
- **Request user authorization (OAuth) during installation**: off — installing grants repository
  access, and signing in is a separate, explicit step
- **Expire user authorization tokens**: your call. On is stricter (8-hour tokens, refreshed
  automatically); the Worker handles either setting
- **Webhook**: off
- **Repository permissions**: `Contents: Read and write`, `Metadata: Read-only`
- **Where can this app be installed**: Any account

Generate a client secret. Note the **Client ID** and the app **slug** (from the app URL).

### 2. Configure secrets

```bash
cp .dev.vars.example .dev.vars
```

Fill in `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and a random `SESSION_SECRET` (`openssl rand -hex 32`).
Set `GITHUB_APP_SLUG` in `wrangler.jsonc`.

### 3. Install the app on your site repository

Open `https://github.com/apps/<your-app-slug>/installations/new` and pick the repository.

### 4. Add `cms.config.yml` to the repository root

```yaml
adapter: hugo            # hugo | generic
media_dir: static/images
public_media_path: /images

collections:
  - name: posts
    label: Posts
    folder: content/posts
    fields:
      - { name: title, label: Title, type: text, required: true }
      - { name: description, label: Description, type: textarea }
      - { name: image, label: Featured Image, type: image }
      - { name: category, label: Category, type: select, options: [News, Promo, Article] }
      - { name: date, label: Publish Date, type: datetime }
      - { name: draft, label: Draft, type: boolean }
      - { name: body, label: Content, type: markdown }
```

Field types: `text` `textarea` `number` `boolean` `select` `multiselect` `datetime` `image` `markdown`.

### 5. Run

```bash
pnpm install
pnpm dev
```

## Deploy

```bash
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
wrangler secret put SESSION_SECRET
pnpm deploy
```

Add `https://<your-worker>.workers.dev/auth/github/callback` to the GitHub App callback URLs.

## Layout

```
src/
  app/          entry, global CSS
  components/   ui (shadcn), layout
  features/     auth, config, dashboard, collections, media, settings
  core/         config schema (zod), frontmatter, shared types — no React, no GitHub
  adapters/     site-generator specifics (hugo, generic)
  worker/       Hono app: routes/auth, routes/api, session (encrypted cookie), providers/git
```

The Worker never sends GitHub tokens to the browser: they live inside an AES-GCM encrypted, HttpOnly cookie.
`worker/providers/git/types.ts` defines the `GitProvider` interface; `github.ts` is the only GitHub-aware code.

## Licence

MIT — see [LICENSE](LICENSE).
