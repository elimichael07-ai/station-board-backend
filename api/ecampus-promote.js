/**
 * eCampus Promote Pending Session
 * Confirms a pending session is genuinely logged in and promotes it
 * to active without re-running the Duo flow. Used when the login
 * actually succeeded but the submit endpoint's check ran too early.
 *
 * Usage: GET /api/ecampus-promote?token=YOUR_SETUP_TOKEN
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
        const pending = await redis.get('ecampus:pending_session');
        if (!pending) {
                return res.status(400).json({ error: 'No pending session found.' });
        }

      const browser = await puppeteer.connect({ browserWSEndpoint: pending.connectUrl });
        const pages = await browser.pages();
        const mainPage = pages.find(p => p.url().includes('ecampusd2l.blinn.edu'));

      if (!mainPage) {
              return res.status(400).json({ error: 'Pending session is not on eCampus.', pages: pages.map(p => p.url()) });
      }

    const title = await mainPage.title();
          const isLoggedIn = title.toLowerCase().includes('homepage') || await mainPage.$('.d2l-navigation') !== null;
        if (!isLoggedIn) {
                return res.status(400).json({ error: 'Pending session page found but not logged in.', url: mainPage.url() });
        }

      await redis.set('ecampus:active_session', { sessionId: pending.sessionId, connectUrl: pending.connectUrl, storedAt: new Date().toISOString() });
        await redis.del('ecampus:pending_session');

      return res.status(200).json({ status: 'promoted', message: 'Pending session confirmed logged in and promoted to active.' });
  } catch (error) {
        return res.status(500).json({ error: error.message });
  }
}
