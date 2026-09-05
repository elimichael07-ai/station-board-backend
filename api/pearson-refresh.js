/**
 * Pearson Standalone Refresh Endpoint
 * Runs separately because Pearson's LTI launch exceeds Vercel Hobby 10s limit.
 * Caches result in Redis; main refresh reads from cache.
 *
 * GET /api/pearson-refresh?token=YOUR_REFRESH_TOKEN
 */
import { scrapPearson } from '../services/pearson.js';
import { getStoredCredentials } from '../utils/credentials.js';
import { Redis } from '@upstash/redis';

const redis = new Redis({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    const { token } = req.query;
    if (!token || token !== process.env.REFRESH_TOKEN) {
          return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
          const credentials = await getStoredCredentials();
          if (!credentials) return res.status(503).json({ error: 'No credentials.' });
          const pearsonData = await scrapPearson(credentials.pearson);
          await redis.set('pearson:last_data', { ...pearsonData, cachedAt: new Date().toISOString() });
          return res.status(200).json({ success: true, data: pearsonData, timestamp: new Date().toISOString() });
    } catch (err) {
          console.error('[pearson-refresh] Error:', err.message);
          return res.status(500).json({ error: true, code: err.code || 'ERROR', message: err.message });
    }
}
