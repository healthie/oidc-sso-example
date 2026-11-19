import { UserManager, WebStorageStateStore } from 'oidc-client-ts'
import './style.css'

const env = import.meta.env

const config = {
  authority: env.VITE_OIDC_AUTHORITY,
  client_id: env.VITE_OIDC_CLIENT_ID,
  redirect_uri: env.VITE_OIDC_REDIRECT_URI || `${window.location.origin}/`,
  post_logout_redirect_uri: env.VITE_OIDC_REDIRECT_URI || `${window.location.origin}/`,
  response_type: 'code', // authorization code + PKCE (oidc-client-ts always uses PKCE)
  scope: env.VITE_OIDC_SCOPE || 'openid profile email',
  // Optional extra authorize param, e.g. VITE_OIDC_ORGANIZATION=my-org
  ...(env.VITE_OIDC_ORGANIZATION && { extraQueryParams: { organization: env.VITE_OIDC_ORGANIZATION } }),
  // No silent renew: there is no silent_redirect_uri and no refresh token is requested.
  automaticSilentRenew: false,
  // RFC: keep tokens out of localStorage. userStore defaults to sessionStorage;
  // an in-memory store is stricter but loses the session on reload, fine for a POC.
  userStore: new WebStorageStateStore({ store: window.sessionStorage })
}

const app = document.getElementById('app')

// Refuse to talk to the provider or API (or send a token) over plain http,
// except for localhost during development.
function isSecureUrl(value) {
  try {
    const u = new URL(value)
    return u.protocol === 'https:' || (u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname))
  } catch {
    return false
  }
}

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

const json = (value) => escapeHtml(JSON.stringify(value, null, 2))

function decodeJwt(token) {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(decodeURIComponent(escape(atob(payload))))
  } catch {
    return null // opaque token
  }
}

function renderError(message, { append = false } = {}) {
  const html = `<p class="error">${escapeHtml(message)}</p>`
  if (append) app.insertAdjacentHTML('beforeend', html)
  else app.innerHTML = html
}

function renderLoggedOut(manager) {
  app.innerHTML = `
    <p>You are not signed in.</p>
    <button id="login">Log in</button>
    <p class="muted">Redirects to ${escapeHtml(config.authority)} (authorization code + PKCE).</p>
  `
  document.getElementById('login').onclick = () => manager.signinRedirect()
}

function renderLoggedIn(manager, user) {
  const apiUrl = env.VITE_API_URL
  const profile = user.profile
  const accessClaims = decodeJwt(user.access_token)

  app.innerHTML = `
    <p>Signed in as <strong>${escapeHtml(profile.name || profile.email || profile.sub)}</strong></p>
    <button id="logout">Log out</button>
    ${apiUrl ? '<button id="api">Call API</button>' : ''}

    <h2>User (ID token claims)</h2>
    <pre>${json(profile)}</pre>

    <h2>Access token claims</h2>
    <p class="muted">Decoded claims of the access token.</p>
    <pre>${accessClaims ? json(accessClaims) : 'Access token is opaque (not a JWT).'}</pre>

    <h2>Token details</h2>
    <pre>${json({
      token_type: user.token_type,
      scope: user.scope,
      expires_at: user.expires_at && new Date(user.expires_at * 1000).toISOString(),
      has_refresh_token: Boolean(user.refresh_token)
    })}</pre>
    ${apiUrl ? '<h2>API response</h2>\n    <pre id="api-result">Not called yet.</pre>' : ''}
  `

  document.getElementById('logout').onclick = () => {
    window.sessionStorage.setItem('just_logged_out', '1')
    return manager.signoutRedirect().catch(() => manager.removeUser().then(() => location.reload()))
  }

  if (apiUrl) {
    document.getElementById('api').onclick = async () => {
      const out = document.getElementById('api-result')
      out.textContent = 'Calling…'
      try {
        const res = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.access_token}` },
          body: JSON.stringify({ query: env.VITE_API_QUERY || '{ __typename }' })
        })
        out.textContent = `${res.status}\n${JSON.stringify(await res.json(), null, 2)}`
      } catch (e) {
        out.textContent = `Request failed: ${e.message}`
      }
    }
  }
}

async function main() {
  if (!config.authority || !config.client_id) {
    renderError('Missing VITE_OIDC_AUTHORITY or VITE_OIDC_CLIENT_ID. Copy .env.example to .env.local and fill it in.')
    return
  }

  if (!isSecureUrl(config.authority) || (env.VITE_API_URL && !isSecureUrl(env.VITE_API_URL))) {
    renderError('VITE_OIDC_AUTHORITY and VITE_API_URL must use https (http is only allowed for localhost).')
    return
  }

  const manager = new UserManager(config)

  try {
    // Returning from the authorize redirect: exchange the code for tokens.
    const params = new URLSearchParams(window.location.search)
    if (params.has('code') && params.has('state')) {
      try {
        await manager.signinRedirectCallback()
      } finally {
        // Never leave the single-use code / state in the address bar or history.
        window.history.replaceState({}, document.title, window.location.pathname)
      }
    }

    const user = await manager.getUser()
    if (user && !user.expired) {
      renderLoggedIn(manager, user)
      return
    }

    // Auto-redirect to the login page, unless the user just logged out
    // or the authorize redirect came back with an error (avoids loops).
    const justLoggedOut = window.sessionStorage.getItem('just_logged_out')
    window.sessionStorage.removeItem('just_logged_out')
    if (params.has('error')) {
      renderLoggedOut(manager)
      renderError(`Authorize error: ${params.get('error')} ${params.get('error_description') || ''}`, { append: true })
    } else if (justLoggedOut) {
      renderLoggedOut(manager)
    } else {
      await manager.signinRedirect()
    }
  } catch (e) {
    console.error(e)
    renderError(`Sign-in failed: ${e.message}`)
  }
}

main()
