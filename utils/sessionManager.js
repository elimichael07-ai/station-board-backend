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
import puppeteer from 'puppeteer-extra';

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
 * Checks liveness by actually trying to connect, rather than trusting
 * Browserbase's REST status field (which can lag right after activity
 * on a session). Disconnects immediately after checking - does not
 * hold the connection open.
 */
export async function isSessionAlive(connectUrl) {
      let browser;
      try {
              browser = await puppeteer.connect({ browserWSEndpoint: connectUrl });
              const pages = await browser.pages();
              const stillHasEcampus = pages.some(p => p.url().includes('ecampusd2l.blinn.edu'));
              browser.disconnect();
              return stillHasEcampus;
      } catch (err) {
              if (browser) browser.disconnect();
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

  const alive = await isSessionAlive(stored.connectUrl);
      if (!alive) {
              await clearSession();
              const err = new Error('Stored eCampus session has expired. Call /api/ecampus-login-init to start a new one.');
              err.code = 'NEEDS_LOGIN';
              throw err;
      }

  return stored.connectUrl;
}
