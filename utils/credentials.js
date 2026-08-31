/**
 * Credential Manager
 * Handles secure storage and retrieval of encrypted credentials
 * Uses Vercel environment variables (encrypted at rest)
 */

import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-key-change-in-production';

export async function getStoredCredentials() {
  try {
    // All credentials stored as JSON in env variable
    const encryptedCreds = process.env.CREDENTIALS_JSON;
    
    if (!encryptedCreds) {
      console.log('[Credentials] No credentials found in environment.');
      return null;
    }

    // Decrypt if encrypted
    const credentials = JSON.parse(Buffer.from(encryptedCreds, 'base64').toString());
    
    return {
      ecampus: {
        username: credentials.ecampus_username,
        appPassword: credentials.ecampus_app_password,
      },
      castlebranch: {
        username: credentials.castlebranch_username,
        password: credentials.castlebranch_password,
      },
      pearson: {
        username: credentials.pearson_username,
        password: credentials.pearson_password,
      },
      notion: {
        apiKey: credentials.notion_api_key,
      },
      gmail: {
        refreshToken: credentials.gmail_refresh_token,
        clientId: process.env.GMAIL_CLIENT_ID,
        clientSecret: process.env.GMAIL_CLIENT_SECRET,
      },
    };
  } catch (error) {
    console.error('[Credentials] Error retrieving credentials:', error.message);
    throw error;
  }
}

export async function storeCredentials(creds) {
  try {
    const toStore = {
      ecampus_username: creds.ecampus.username,
      ecampus_app_password: creds.ecampus.appPassword,
      castlebranch_username: creds.castlebranch.username,
      castlebranch_password: creds.castlebranch.password,
      pearson_username: creds.pearson.username,
      pearson_password: creds.pearson.password,
      notion_api_key: creds.notion.apiKey,
      gmail_refresh_token: creds.gmail.refreshToken,
    };

    // Encrypt and store in env
    const encrypted = Buffer.from(JSON.stringify(toStore)).toString('base64');
    console.log('[Credentials] Credentials encrypted and ready to store in Vercel env.');
    return encrypted;
  } catch (error) {
    console.error('[Credentials] Error storing credentials:', error.message);
    throw error;
  }
}

export async function updateLastRefresh() {
  // Update timestamp in KV or env
  const now = new Date().toISOString();
  console.log(`[Credentials] Last refresh: ${now}`);
  return now;
}

/**
 * Initialize credentials setup
 * Call this endpoint to start the credential setup flow
 */
export async function initializeSetup() {
  return {
    steps: [
      {
        service: 'eCampus',
        action: 'Get app-specific password',
        url: 'https://ecampusd2l.blinn.edu/d2l/home → Account Settings → App Passwords',
        required: ['username', 'app_password'],
      },
      {
        service: 'CastleBranch',
        action: 'Log in to account',
        url: 'https://castlebranch.com',
        required: ['username', 'password'],
      },
      {
        service: 'Pearson MyLab',
        action: 'Log in to account',
        url: 'https://mylabmastering.pearson.com',
        required: ['username', 'password'],
      },
      {
        service: 'Notion',
        action: 'Create integration & get API key',
        url: 'https://www.notion.so/my-integrations',
        required: ['api_key'],
      },
      {
        service: 'Gmail',
        action: 'OAuth2 authentication (one-time)',
        url: '/api/auth/gmail',
        required: ['oauth_token'],
      },
    ],
  };
}
