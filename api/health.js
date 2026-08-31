/**
 * Health Check Endpoint
 * Verifies the backend is running without requiring credentials
 * 
 * Usage: GET /api/health
   * Returns: { status: 'ok', timestamp, version }
 */

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Check environment variables
    const hasRefreshToken = !!process.env.REFRESH_TOKEN;
    const hasSetupToken = !!process.env.SETUP_TOKEN;
    const hasEncryptionKey = !!process.env.ENCRYPTION_KEY;
    const hasCredentials = !!process.env.CREDENTIALS_JSON;

    return res.status(200).json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            version: '1.0.0',
            environment: {
              hasRefreshToken,
              hasSetupToken,
              hasEncryptionKey,
              hasCredentials,
      },
            message: hasCredentials 
              ? 'Backend ready - credentials configured' 
              : 'Backend ready - awaiting credential setup',
      });
  } catch (error) {
    console.error('[HEALTH] Error:', error);
    return res.status(500).json({
            status: 'error',
            message: error.message,
            timestamp: new Date().toISOString(),
      });
  }
}
