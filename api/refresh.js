/**
 * Station Board Master Refresh Endpoint
 * Coordinates all service scrapes and returns unified JSON
 * 
 * Usage: GET /api/refresh?token=YOUR_SECRET_TOKEN
 * Returns: { ecampus, castlebranch, pearson, notion, gmail, lastRefresh }
 */

import { scrapECampus } from '../services/ecampus.js';
import { scrapCastleBranch } from '../services/castlebranch.js';
import { scrapPearson } from '../services/pearson.js';
import { pullNotionNotes } from '../services/notion.js';
import { pullGmailTodos } from '../services/gmail.js';
import { getStoredCredentials, updateLastRefresh } from '../utils/credentials.js';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
  res.setHeader('Content-Type', 'application/json');

  // Validate request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { token } = req.query;
  const validToken = process.env.REFRESH_TOKEN;

  if (!token || token !== validToken) {
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
    
        if (!credentials) {return res.status(503).json({ 
        error: 'Credentials not configured',
        message: 'No credentials found. Complete the setup endpoint first.',
        setup_url: '/api/setup',
        status: 'setup_required'
      });
                          }

          // Run scrapers sequentially to avoid Chromium binary spawn race conditions
          let ecampusData, castlebranchData, pearsonData, notionData, gmailData;
          try {
                    ecampusData = await scrapECampus(credentials.ecampus);
                    castlebranchData = await scrapCastleBranch(credentials.castlebranch);
                    pearsonData = await scrapPearson(credentials.pearson);
                    notionData = await pullNotionNotes(credentials.notion);
                    gmailData = await pullGmailTodos(credentials.gmail);
          } catch (err) {
                    console.error('[REFRESH] Error during sequential scrape:', err.message);
                    throw err;
          }
    
    // Update last refresh time
    await updateLastRefresh();

    const response = {
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
    };

    console.log('[REFRESH] Complete. Returning data.');
    return res.status(200).json(response);

  } catch (error) {
    console.error('[REFRESH] Error:', error);
    return res.status(500).json({
      error: 'Refresh failed',
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
}
