# OIDC POC

This project is a small Vite app that demonstrates OIDC login against an OIDC provider.

## Prerequisites

- Node.js 18+
- npm
- A staging application configured for OIDC login at your identity provider

## 1) Install dependencies

```bash
npm install
```

## 2) Configure environment variables

Copy the example environment file and fill in your values:

```bash
cp .env.example .env.local
```

Update `.env.local` with your values:

- `VITE_OIDC_AUTHORITY`: the base URL (issuer) of your OIDC provider (for example `https://<your-staging-auth-url>`)
- `VITE_OIDC_CLIENT_ID`: the OAuth client ID for the app
- `VITE_OIDC_REDIRECT_URI`: usually `http://localhost:5173/`
- `VITE_OIDC_SCOPE`: optional scopes, default is `openid profile email`
- `VITE_API_URL`: optional GraphQL endpoint; when set, a "Call API" button sends the access token as a Bearer token
- `VITE_API_QUERY`: optional query for that call, default `{ __typename }`
- `VITE_OIDC_ORGANIZATION`: optional, sent as the `organization` query param on the authorize request

## 3) Run the app locally

Start the Vite development server:

```bash
npm run dev
```

Then open the URL printed in the terminal, usually:

```text
http://localhost:5173/
```

## 4) Production build

To create a production build:

```bash
npm run build
```

To preview the built app locally:

```bash
npm run preview
```

## Notes

- The app expects the redirect URI to be registered with the OIDC provider.
- The login flow uses authorization code + PKCE via `oidc-client-ts`.
- If `VITE_OIDC_AUTHORITY` or `VITE_OIDC_CLIENT_ID` are missing, the app will show an error and will not complete sign-in.

## Security notes

This is a demonstration of the login flow, not a template to deploy as-is.

**What the example does**

- Authorization code flow with PKCE. No client secret is used or needed, and tokens never appear in a URL.
- `oidc-client-ts` checks `state`, and validates the ID token issuer, audience and nonce.
- Tokens are kept in `sessionStorage` (per tab, cleared when the tab closes), never `localStorage`.
- The authorization code is removed from the address bar and history after the callback, success or failure.
- A strict Content-Security-Policy is injected by `vite.config.js`. Scripts load only from this origin, and network requests go only to this origin, the OIDC provider (`VITE_OIDC_AUTHORITY`) and the optional API (`VITE_API_URL`).
- The page uses `no-referrer`, so the callback URL is never sent to other sites.
- The provider and API URLs must use `https` (`http` is allowed only for `localhost`), so a token is never sent over plain http.
- Everything rendered from tokens or URL parameters is HTML-escaped.
- No silent renew and no `offline_access` scope, so no long-lived refresh token is requested.
- Dependencies are locked in `package-lock.json`. Install with `npm ci`.

**Known limitations**

- Any script running on the page can read `sessionStorage`, so an XSS bug would expose the tokens. For production use a backend-for-frontend that keeps tokens in `HttpOnly` cookies.
- The CSP is set with a `<meta>` tag, which cannot enforce `frame-ancestors`. When you host the app, also send `Content-Security-Policy: frame-ancestors 'none'` (or `X-Frame-Options: DENY`) as an HTTP header, plus `X-Content-Type-Options: nosniff` and `Strict-Transport-Security`.
- The access token is shown on the page only as decoded claims, but it is still sent to `VITE_API_URL` when you click "Call API". Only point that at an API you trust.
- Allow only the exact origins and redirect URIs you need with the provider. Use `localhost` entries in staging only, never in production.
- Never put a secret in a `VITE_` variable. Vite bundles those into the JavaScript that the browser downloads.
