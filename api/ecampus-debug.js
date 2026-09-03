/**
 * eCampus Debug
 * Dumps the current state of the active (or pending) session's pages
 * for troubleshooting. Temporary diagnostic endpoint.
 *
 * Usage: GET /api/ecampus-debug?token=YOUR_SETUP_TOKEN
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Redis } from '@upstash/redis';

puppeteer.use(StealthPlugin());

const redis = new Redis({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
    res.setHeader('Content-Type', 'application/json');

  const token = req.query.token;
    if (token !== process.env.SETUP_TOKEN) {
          return res.status(401).json({ error: 'Unauthorized' });
    }

  try {
        const active = await redis.get('ecampus:active_session');
        const pending = await redis.get('ecampus:pending_session');

      const target = active || pending;
        if (!target) {
                return res.status(200).json({ active, pending, pages: [] });
        }

      const browser = await puppeteer.connect({ browserWSEndpoint: target.connectUrl });
        const pages = await browser.pages();
        const pageInfo = [];
        for (const p of pages) {
                let title = 'ERROR';
                try { title = await p.title(); } catch (e) { title = 'title error: ' + e.message; }
                pageInfo.push({ url: p.url(), title });
        }

      return res.status(200).json({
              whichSession: active ? 'active' : 'pending',
              pages: pageInfo,
      });
  } catch (error) {
        return res.status(500).json({ error: error.message });
  }
}
