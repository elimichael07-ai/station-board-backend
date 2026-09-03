/**
 * Session Manager
 * Persists a long-lived, already-authenticated Browserbase session
 * (connectUrl) in Redis so multiple refresh calls can reuse the same
 * logged-in eCampus session instead of hitting Duo 2FA every time.
 *
 * A session is only created fresh via the /api/ecampus-login-init and
 * /api/ecampus-login-submit endpoints, where a human supplies the Duo
 * passcode once. Regular scraper calls just read the stored session.
 */

import { Redis } from '@upstash/redis';
import axios from 'axios';

const redis = new Redis({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
});

const SESSION_KEY = 'ecampus:active_session';

export async function getStoredSession() {
    const data = await redis.get(SESSION_KEY);
    return data || null;
}

export async function storeSession(sessionId, connectUrl) {
    await redis.set(SESSION_KEY, { sessionId, connectUrl, storedAt: new Date().toISOString() });
}

export async function clearSession() {
    await redis.del(SESSION_KEY);
}

/**
 * Checks Browserbase directly to confirm a stored session is still
 * actually alive (not just present in Redis - Redis could have a stale
 * entry for a session that already expired or was closed).
 */
export async function isSessionAlive(sessionId) {
    try {
          const res = await axios.get(`https://api.browserbase.com/v1/sessions/${sessionId}`, {
                  headers: { 'X-BB-API-Key': process.env.BROWSERBASE_API_KEY },
          });
          return res.data.status === 'RUNNING';
    } catch {
          return false;
    }
}

/**
 * Returns a connectUrl for an already-authenticated eCampus session,
 * or throws a clear NEEDS_LOGIN error if none is available so the
 * caller (refresh.js) can surface a helpful message instead of a
 * generic failure.
 */
export async function getActiveEcampusConnectUrl() {
    const stored = await getStoredSession();
    if (!stored) {
          const err = new Error('No active eCampus session. Call /api/ecampus-login-init to start one.');
          err.code = 'NEEDS_LOGIN';
          throw err;
    }

  const alive = await isSessionAlive(stored.sessionId);
    if (!alive) {
          await clearSession();
          const err = new Error('Stored eCampus session has expired. Call /api/ecampus-login-init to start a new one.');
          err.code = 'NEEDS_LOGIN';
          throw err;
    }

  return stored.connectUrl;
}
