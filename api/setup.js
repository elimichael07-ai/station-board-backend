/**
 * Setup Endpoint
 * GET /api/setup - Shows setup instructions
 * POST /api/setup - Stores credentials
 */

import { storeCredentials, initializeSetup } from '../utils/credentials.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    const setup = await initializeSetup();
    return res.status(200).json(setup);
  }

  if (req.method === 'POST') {
    try {
      const { credentials, setupToken } = req.body;

      // Validate setup token (should be sent only during initial setup)
      if (setupToken !== process.env.SETUP_TOKEN) {
        return res.status(401).json({ error: 'Invalid setup token' });
      }

      if (!credentials) {
        return res.status(400).json({ error: 'No credentials provided' });
      }

      // Validate all required fields
      const required = {
        ecampus: ['username', 'appPassword'],
        castlebranch: ['username', 'password'],
        pearson: ['username', 'password'],
        notion: ['apiKey'],
        gmail: ['refreshToken'],
      };

      for (const [service, fields] of Object.entries(required)) {
        if (!credentials[service]) {
          return res.status(400).json({ error: `Missing ${service} credentials` });
        }
        for (const field of fields) {
          if (!credentials[service][field]) {
            return res.status(400).json({ error: `Missing ${service}.${field}` });
          }
        }
      }

      // Store encrypted credentials
      const encrypted = await storeCredentials(credentials);

      return res.status(200).json({
        success: true,
        message: 'Credentials stored successfully',
        instruction: 'Add this to your Vercel environment variables:\n\nCREDENTIALS_JSON=' + encrypted,
      });

    } catch (error) {
      console.error('[Setup] Error:', error.message);
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
