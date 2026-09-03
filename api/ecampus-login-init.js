/**
 * eCampus Login Init
 * Starts a fresh Browserbase session, logs into eCampus with the stored
 * username/password, and (if Duo challenges) clicks "Send a passcode".
 * The session is stored in Redis as PENDING - not yet the active
 * session other scrapers will use - until /api/ecampus-login-submit
 * confirms the passcode and promotes it.
 *
 * Usage: GET /api/ecampus-login-init?token=YOUR_SETUP_TOKEN
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import axios from 'axios';
import { Redis } from '@upstash/redis';
import { getStoredCredentials } from '../utils/credentials.js';

puppeteer.use(StealthPlugin());

const redis = new Redis({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
});

const PENDING_KEY = 'ecampus:pending_session';
const BASE_URL = 'https://ecampusd2l.blinn.edu';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

  const token = req.query.token;
    if (token !== process.env.SETUP_TOKEN) {
          return res.status(401).json({ error: 'Unauthorized: invalid or missing token' });
    }

  let browser;
    try {
          const credentials = await getStoredCredentials();
          if (!credentials) {
                  return res.status(503).json({ error: 'No credentials configured.' });
          }

      const sessionRes = await axios.post(
              'https://api.browserbase.com/v1/sessions',
        {
                  projectId: process.env.BROWSERBASE_PROJECT_ID,
                  keepAlive: true,
                  timeout: 3600,
        },
        { headers: { 'X-BB-API-Key': process.env.BROWSERBASE_API_KEY, 'Content-Type': 'application/json' } }
            );
          const sessionId = sessionRes.data.id;
          const connectUrl = sessionRes.data.connectUrl;

      browser = await puppeteer.connect({ browserWSEndpoint: connectUrl });
          const page = await browser.newPage();

      await page.goto(`${BASE_URL}/d2l/home`, { waitUntil: 'networkidle2', timeout: 30000 });

      const isLoggedIn = await page.$('.d2l-navigation') !== null;
          if (isLoggedIn) {
                  // No Duo challenge at all (unlikely, but handle it) - promote immediately.
            await redis.set('ecampus:active_session', { sessionId, connectUrl, storedAt: new Date().toISOString() });
                  return res.status(200).json({ status: 'already_logged_in', message: 'Session is ready to use immediately.' });
          }

      await page.type('input[name="usernameUserInput"]', credentials.ecampus.username);
          await page.type('input[name="password"]', credentials.ecampus.appPassword);
          await Promise.all([
                  page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
                  page.click('button[type="submit"]'),
                ]);

      await new Promise(r => setTimeout(r, 1500));

      const pages = await browser.pages();
          const duoPage = pages.find(p => p.url().includes('duosecurity.com'));

      if (!duoPage) {
              // Logged in without any Duo prompt at all.
            await redis.set('ecampus:active_session', { sessionId, connectUrl, storedAt: new Date().toISOString() });
              return res.status(200).json({ status: 'already_logged_in', message: 'Session is ready to use immediately.' });
      }

      await duoPage.evaluate(() => {
              const els = Array.from(document.querySelectorAll('button, a'));
              const btn = els.find(e => e.textContent.trim() === 'Send a passcode');
              if (btn) btn.click();
      });

      // Store as PENDING - waiting for the passcode via the submit endpoint.
          await redis.set(PENDING_KEY, { sessionId, connectUrl, storedAt: new Date().toISOString() }, { ex: 900 });

      return res.status(200).json({
              status: 'passcode_sent',
              message: 'A Duo passcode text was sent. Call /api/ecampus-login-submit?token=YOUR_SETUP_TOKEN&code=XXXXXXX within 5 minutes.',
      });

    } catch (error) {
          console.error('[ecampus-login-init] Error:', error.message);
          if (browser) await browser.close().catch(() => {});
          return res.status(500).json({ error: 'Login init failed', message: error.message });
    }
}
