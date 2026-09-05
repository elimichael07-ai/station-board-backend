**
       * Station Board Master Refresh Endpoint
 * eCampus, CastleBranch, Notion, Gmail all run here (fit in 10s Hobby limit).
              * Pearson runs separately via /api/pearson-refresh and is read from Redis cache.
              *
              * Usage: GET /api/refresh?token=YOUR_SECRET_TOKEN
              */

             import { scrapECampus } from '../services/ecampus.js';
import { scrapCastleBranch } from '../services/castlebranch.js';
import { pullNotionNotes } from '../services/notion.js';
import { pullGmailTodos } from '../services/gmail.js';
import { getStoredCredentials, updateLastRefresh } from '../utils/credentials.js';
import { Redis } from '@upstash/redis';

const redis = new Redis({
        url: process.env.KV_REST_API_URL,
        token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
        res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).end();
        if (req.method !== 'GET' && req.method !== 'POST') {
                  return res.status(405).json({ error: 'Method not allowed' });
        }

  const { token } = req.query;
        if (!token || token !== process.env.REFRESH_TOKEN) {
                  return res.status(401).json({ error: 'Unauthorized: Invalid or missing token' });
        }

  try {
            let credentials;
            try {
                        credentials = await getStoredCredentials();
            } catch (e) {
                        console.log('[REFRESH] Could not load credentials:', e.message);
                        credentials = null;
            }

          if (!credentials) {
                      return res.status(503).json({
                                    error: 'Credentials not configured',
                                    message: 'No credentials found. Complete the setup endpoint first.',
                                    setup_url: '/api/setup',
                                    status: 'setup_required',
                      });
          }

          let ecampusData, castlebranchData, pearsonData, notionData, gmailData;

          try {
                      ecampusData = await scrapECampus(credentials.ecampus);
          } catch (err) {
                      console.error('[REFRESH] eCampus failed:', err.message);
                      ecampusData = { error: true, code: err.code || 'ERROR', message: err.message };
          }

          try {
                      castlebranchData = await scrapCastleBranch(credentials.castlebranch);
          } catch (err) {
                      console.error('[REFRESH] CastleBranch failed:', err.message);
                      castlebranchData = { error: true, message: err.message };
          }

          // Pearson runs via /api/pearson-refresh (separate endpoint) due to Vercel
          // Hobby 10s function limit. Read cached data from Redis instead.
          try {
                      const cached = await redis.get('pearson:last_data');
                      pearsonData = cached || { cached: false, message: 'No Pearson data yet. Call /api/pearson-refresh to scrape.' };
          } catch (err) {
                      pearsonData = { error: true, message: 'Could not read Pearson cache: ' + err.message };
          }

          try {
                      notionData = await pullNotionNotes(credentials.notion);
          } catch (err) {
                      console.error('[REFRESH] Notion failed:', err.message);
                      notionData = { error: true, message: err.message };
          }

          try {
                      gmailData = await pullGmailTodos(credentials.gmail);
          } catch (err) {
                      console.error('[REFRESH] Gmail failed:', err.message);
                      gmailData = { error: true, message: err.message };
          }

          await updateLastRefresh();

          return res.status(200).json({
                      success: true,
                      timestamp: new Date().toISOString(),
                      data: {
                                    ecampus: ecampusData,
                                    castlebranch: castlebranchData,
                                    pearson: pearsonData,
                                    notion: notionData,
                                    gmail: gmailData,
                      },
                      lastRefresh: new Date().toISOString(),
          });

  } catch (error) {
            console.error('[REFRESH] Error:', error);
            return res.status(500).json({
                        error: 'Refresh failed',
                        message: error.message,
                        timestamp: new Date().toISOString(),
            });
  }
}
