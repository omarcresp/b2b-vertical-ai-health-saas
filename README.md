# Welcome to your Convex + React (Vite) + WorkOS AuthKit app

This is a [Convex](https://convex.dev/) project created with [`bun create convex`](https://www.npmjs.com/package/create-convex).

After the initial setup (<2 minutes) you'll have a working full-stack app using:

- Convex as your backend (database, server logic)
- [React](https://react.dev/) as your frontend (web page interactivity)
- [Vite](https://vitest.dev/) for optimized web hosting
- [Tailwind](https://tailwindcss.com/) for building great looking accessible UI
- [WorkOS AuthKit](https://workos.com/docs/authkit) for authentication

## Get started

If you just cloned this codebase and didn't use `bun create convex`, run:

```sh
bun install
bun run dev
```

If you're reading this README on GitHub and want to use this template, run:

```sh
bunx create-convex@latest -t react-vite-workos-authkit
```

Then:

1. Sign up for [WorkOS](https://workos.com/) and create an application
2. Copy `.env.local.example` to `.env.local` and configure:
   - `VITE_WORKOS_CLIENT_ID`: Your WorkOS client ID
   - `VITE_WORKOS_REDIRECT_URI`: Your redirect URI (default: http://localhost:5173/callback)
   - `VITE_CONVEX_URL`: Your Convex deployment URL
3. Configure your WorkOS client ID as `WORKOS_CLIENT_ID` in your Convex dashboard environment variables

For user management and webhook integration with WorkOS, check out the [WorkOS documentation](https://workos.com/docs/user-management).

## CI recipe

```sh
bun ci
bun run typecheck
bun run lint
bun run build
```

Optional hardening checks:

```sh
bun run typecheck:compat
bun run lint:changed
```

## Deploy on Netlify with Convex

This repo uses file-based Netlify config in `netlify.toml`. Netlify build/publish
settings should come from the repo config.

Build commands used by Netlify:

- Production: `bun ci && VITE_WORKOS_REDIRECT_URI="$URL/callback" bunx convex deploy --cmd 'bun run build'`
- Deploy Preview: `bun ci && VITE_WORKOS_REDIRECT_URI="$DEPLOY_PRIME_URL/callback" bunx convex deploy --cmd 'bun run build'`

### 1) Convex dashboard setup

1. Open your Convex project settings and create a **Production Deploy Key**.
2. Create a **Preview Deploy Key**.
3. Confirm `WORKOS_CLIENT_ID` exists in the production deployment environment.
4. Add project default environment variable `WORKOS_CLIENT_ID` so preview deployments can load `convex/auth.config.ts`.

### 2) Netlify site setup

1. Import this repository into Netlify.
2. Set production branch to `main`.
3. Ensure Netlify uses `netlify.toml` from the repo and publishes `dist`.
4. Add `CONVEX_DEPLOY_KEY` with context-specific values:
   - Production context: production deploy key.
   - Deploy Preview context: preview deploy key.
5. Add `VITE_WORKOS_CLIENT_ID` for all contexts (same value in production and previews).
6. Trigger the first deploy from `main`.

### 3) WorkOS validation

1. After production deploy, verify WorkOS callback/homepage include:
   - `https://<site>.netlify.app/callback`
   - `https://<site>.netlify.app`
2. Open a PR and wait for Deploy Preview.
3. Verify callback/homepage use:
   - `https://deploy-preview-<id>--<site>.netlify.app/callback`
   - `https://deploy-preview-<id>--<site>.netlify.app`

### Optional manual preview command

Use Convex preview run mode when needed:

```sh
bunx convex deploy --preview-run --cmd "bun run build"
```

## Learn more

To learn more about developing your project with Convex, check out:

- The [Tour of Convex](https://docs.convex.dev/get-started) for a thorough introduction to Convex principles.
- The rest of [Convex docs](https://docs.convex.dev/) to learn about all Convex features.
- [Stack](https://stack.convex.dev/) for in-depth articles on advanced topics.

## Join the community

Join thousands of developers building full-stack apps with Convex:

- Join the [Convex Discord community](https://convex.dev/community) to get help in real-time.
- Follow [Convex on GitHub](https://github.com/get-convex/), star and contribute to the open-source implementation of Convex.
