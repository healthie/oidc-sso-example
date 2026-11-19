import { defineConfig, loadEnv } from 'vite'

const originOf = (url) => {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

// Injects a strict Content-Security-Policy. The only network destinations allowed
// are this origin, the OIDC provider and (if configured) the API.
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const dev = command === 'serve'

  const connectSrc = ["'self'", originOf(env.VITE_OIDC_AUTHORITY), originOf(env.VITE_API_URL)].filter(Boolean)
  if (dev) connectSrc.push('ws://localhost:*', 'ws://127.0.0.1:*') // Vite HMR

  const csp = [
    "default-src 'none'",
    "script-src 'self'",
    // The dev server injects CSS through <style> tags; production CSS is a separate file.
    `style-src 'self'${dev ? " 'unsafe-inline'" : ''}`,
    "img-src 'self' data:",
    `connect-src ${connectSrc.join(' ')}`,
    "base-uri 'none'",
    "form-action 'none'",
    "object-src 'none'"
  ].join('; ')

  return {
    build: { sourcemap: false },
    plugins: [
      {
        name: 'inject-csp',
        transformIndexHtml: () => [
          { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: csp }, injectTo: 'head-prepend' }
        ]
      }
    ]
  }
})
