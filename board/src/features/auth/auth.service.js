/**
 * Session auth against ravens.
 *
 * Ravens issues an HttpOnly cookie on successful login. The browser attaches
 * it to every request automatically — including EventSource, which cannot
 * carry an Authorization header — so streaming keeps working under auth.
 */
import { runtimeConfig } from '@/config/runtime'

async function post(path, body) {
  const res = await fetch(`${runtimeConfig.apiBaseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body ?? {}),
  })
  const data = await res.json().catch(() => null)
  return { ok: res.ok, status: res.status, data }
}

/**
 * Whether this deployment requires a password, and whether the current
 * cookie already satisfies it. Answered without provoking a 401.
 */
export async function getAuthStatus() {
  try {
    const res = await fetch(`${runtimeConfig.apiBaseUrl}/auth/status`, {
      credentials: 'same-origin',
    })
    if (!res.ok) return { required: false, authenticated: true }
    return await res.json()
  } catch (_) {
    // Server unreachable — let the app render and surface its own error.
    return { required: false, authenticated: true }
  }
}

export async function login(password, username) {
  const { ok, status, data } = await post('/auth/login', { password, username })
  if (ok) return { ok: true }
  return {
    ok: false,
    status,
    error: data?.error === 'invalid_credentials' ? 'invalid_credentials' : 'request_failed',
  }
}

export async function logout() {
  await post('/auth/logout')
}
