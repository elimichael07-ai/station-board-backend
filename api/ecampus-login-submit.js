/**
 * eCampus Login Submit
 * Takes the Duo passcode a human received by text and submits it to
 * the pending session started by /api/ecampus-login-init. On success,
 * promotes that session to the active one other scrapers will reuse.
 *
 * Usage: GET /api/ecampus-login-submit?token=YOUR_SETUP_TOKEN&code=1234567
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Redis } from '@upstash/redis';

puppeteer.use(StealthPlugin());

const redis = new Redis({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
});

const PENDING_KEY = 'ecampus:pending_session';
const ACTIVE_KEY = 'ecampus:active_session';

export default async function handler(req, res) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Type', 'application/json');

  const token = req.query.token;
      if (token !== process.env.SETUP_TOKEN) {
              return res.status(401).json({ error: 'Unauthorized: invalid or missing token' });
      }

  const code = req.query.code;
      if (!code) {
              return res.status(400).json({ error: 'Missing code query param' });
      }

  try {
          const pending = await redis.get(PENDING_KEY);
          if (!pending) {
                    return res.status(400).json({ error: 'No pending login. Call /api/ecampus-login-init first.' });
          }

        const browser = await puppeteer.connect({ browserWSEndpoint: pending.connectUrl });
          const pages = await browser.pages();
          const duoPage = pages.find(p => p.url().includes('duosecurity.com'));

        if (!duoPage) {
                  return res.status(400).json({ error: 'No Duo prompt found on pending session. It may have expired - try /api/ecampus-login-init again.' });
        }

        // Bring the tab to the foreground first - a background tab that has
        // been idle for a bit can have its JS execution context suspended,
        // which breaks waitForSelector/evaluate with a CDP "context not
        // found" error until the tab is made active again.
        await duoPage.bringToFront();
          await new Promise(r => setTimeout(r, 500));
          await duoPage.evaluate(() => document.readyState); // wake/validate context

        await duoPage.waitForSelector('#passcode-input', { timeout: 10000 });
          await duoPage.type('#passcode-input', code);

        await Promise.all([
                  duoPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {}),
                  duoPage.evaluate(() => {
                              const btns = Array.from(document.querySelectorAll('button'));
                              const btn = btns.find(b => /verify|log in|continue/i.test(b.textContent.trim()));
                              if (btn) btn.click();
                  }),
                ]);

        await new Promise(r => setTimeout(r, 2000));

        // Handle the "Is this your device?" remember-device prompt if it appears.
        let allPages = await browser.pages();
          let currentDuoPage = allPages.find(p => p.url().includes('duosecurity.com'));
          if (currentDuoPage) {
                    await currentDuoPage.bringToFront();
                    const hasRememberPrompt = await currentDuoPage.evaluate(() => {
                                const btns = Array.from(document.querySelectorAll('button'));
                                const btn = btns.find(b => b.textContent.trim() === 'Yes, this is my device');
                                if (btn) { btn.click(); return true; }
                                return false;
                    });
                    if (hasRememberPrompt) {
                                await new Promise(r => setTimeout(r, 2000));
                    }
          }

        allPages = await browser.pages();
          const mainPage = allPages.find(p => p.url().includes('ecampusd2l.blinn.edu')) || allPages[0];
          await mainPage.bringToFront();
          const isLoggedIn = await mainPage.$('.d2l-navigation') !== null;

        if (!isLoggedIn) {
                  return res.status(400).json({
                              error: 'Login did not complete',
                              currentUrl: mainPage.url(),
                              message: 'The code may have been wrong or expired. Try /api/ecampus-login-init again.',
                  });
        }

        // Success - promote to the active session and clear the pending one.
        await redis.set(ACTIVE_KEY, { sessionId: pending.sessionId, connectUrl: pending.connectUrl, storedAt: new Date().toISOString() });
          await redis.del(PENDING_KEY);

        return res.status(200).json({
                  status: 'success',
                  message: 'eCampus session is now active and will be reused by scrapers until it expires.',
        });

  } catch (error) {
          console.error('[ecampus-login-submit] Error:', error.message);
          return res.status(500).json({ error: 'Login submit failed', message: error.message });
  }
}
