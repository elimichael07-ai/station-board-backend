# Station Board Refresh Backend<!-- deployed -->

Automated backend API that maintains logins to eCampus, CastleBranch, Pearson, Notion, and Gmail to refresh your Station Board artifact with fresh data on demand.

## Architecture

```
Frontend Artifact (HTML)
  ↓ [Refresh button clicked]
  ↓
Backend API (Vercel)
  ↓ [Retrieves credentials from env]
  ↓
Logs into all services
  ↓ [Scrapes data in parallel]
  ↓
Returns unified JSON
  ↓
Artifact updates UI
```

## Prerequisites

- **Vercel account** (free tier sufficient): https://vercel.com
- **eCampus app-specific password** (not your main password)
- **Pearson username + password**
- **CastleBranch username + password**
- **Notion API key**
- **Gmail OAuth2 credentials** (Client ID + Secret)

## Setup Steps

### Step 1: Get eCampus App Password

1. Go to https://ecampusd2l.blinn.edu/d2l/home
2. Click your profile → **Account Settings** → **Security** (or similar)
3. Look for **App Passwords** or **Application-Specific Passwords**
4. Generate a new password for "Station Board Backend"
5. **Save this password** — you'll never see it again

If eCampus doesn't offer app passwords, email **Blinn IT Help**: ask for an "application-specific password for D2L API"

### Step 2: Get Notion API Key

1. Go to https://www.notion.so/my-integrations
2. Click **+ Create new integration**
3. Name it "Station Board"
4. Copy the **Internal Integration Token**
5. Save this secret key

### Step 3: Get Gmail OAuth Credentials

1. Go to https://console.cloud.google.com
2. Create a new project called "Station Board"
3. Enable **Gmail API**
4. Go to **Credentials** → **Create OAuth 2.0 Client ID**
5. Select **Desktop Application** (or Web)
6. Copy **Client ID** and **Client Secret**
7. Save these

### Step 4: Clone & Deploy Backend to Vercel

```bash
# Clone this repo (or copy the files)
git clone <your-repo> station-board-backend
cd station-board-backend

# Deploy to Vercel (requires Vercel CLI)
npm install -g vercel
vercel

# Follow prompts:
# - Link to your Vercel account
# - Confirm project name
# - It will deploy automatically
```

Vercel will give you a URL like: `https://station-board-backend-xxxxx.vercel.app`

### Step 5: Configure Environment Variables

In your Vercel project dashboard:

1. Go to **Settings** → **Environment Variables**
2. Add the following (use the values you gathered above):

```
ENCRYPTION_KEY = (auto-generated, leave blank)
REFRESH_TOKEN = your-super-secret-random-token-here
SETUP_TOKEN = setup-secret-token
GMAIL_CLIENT_ID = your-client-id
GMAIL_CLIENT_SECRET = your-client-secret
GMAIL_REDIRECT_URL = https://your-vercel-url.vercel.app/api/auth/gmail/callback
```

### Step 6: Store Credentials

Call the setup endpoint to encrypt and store your credentials:

```bash
curl -X POST https://your-vercel-url.vercel.app/api/setup \
  -H "Content-Type: application/json" \
  -d '{
    "setupToken": "setup-secret-token",
    "credentials": {
      "ecampus": {
        "username": "your-blinn-username",
        "appPassword": "your-app-specific-password"
      },
      "castlebranch": {
        "username": "your-castlebranch-email",
        "password": "your-castlebranch-password"
      },
      "pearson": {
        "username": "your-pearson-email",
        "password": "your-pearson-password"
      },
      "notion": {
        "apiKey": "notion_integration_token"
      },
      "gmail": {
        "refreshToken": "your-gmail-refresh-token"
      }
    }
  }'
```

**Response:**
```json
{
  "success": true,
  "instruction": "Add this to Vercel environment:\nCREDENTIALS_JSON=..."
}
```

Copy the `CREDENTIALS_JSON` value and add it as an environment variable in Vercel.

### Step 7: Update Your Artifact

Update your Station Board HTML artifact to call the refresh endpoint:

```javascript
const BACKEND_URL = 'https://your-vercel-url.vercel.app';
const REFRESH_TOKEN = 'your-super-secret-random-token';

async function refreshAllData() {
  try {
    const response = await fetch(
      `${BACKEND_URL}/api/refresh?token=${REFRESH_TOKEN}`
    );
    const data = await response.json();
    
    if (data.success) {
      updateArtifactUI(data.data);
    }
  } catch (error) {
    console.error('Refresh failed:', error);
  }
}
```

### Step 8: Set Auto-Refresh (Optional)

To auto-refresh every 6 hours, add this to your artifact:

```javascript
// Auto-refresh every 6 hours
setInterval(refreshAllData, 6 * 60 * 60 * 1000);
```

Or set up a Vercel Cron Job to trigger refresh automatically:

```json
// vercel.json
{
  "crons": [{
    "path": "/api/refresh?token=YOUR_TOKEN",
    "schedule": "0 */6 * * *"
  }]
}
```

## API Endpoints

### `GET /api/refresh`

Triggers full data pull from all services.

**Query Parameters:**
- `token` (required): Your REFRESH_TOKEN

**Response:**
```json
{
  "success": true,
  "timestamp": "2026-08-31T19:30:00Z",
  "data": {
    "ecampus": { ... },
    "castlebranch": { ... },
    "pearson": { ... },
    "notion": { ... },
    "gmail": { ... }
  }
}
```

### `GET /api/setup`

Shows setup instructions and required credentials.

### `POST /api/setup`

Stores encrypted credentials.

## Troubleshooting

**"Unauthorized: Invalid or missing token"**
- Check your REFRESH_TOKEN in the query string
- Make sure it matches the one in Vercel env variables

**"No credentials found"**
- Run the setup endpoint and store CREDENTIALS_JSON in Vercel env
- Restart your Vercel deployment

**eCampus login fails**
- Verify you're using the **app-specific password**, not your main password
- Check if the app password has expired (request new one from Blinn IT)

**Puppeteer timeout errors**
- These are normal on first run (Puppeteer downloads headless browser)
- Subsequent runs are faster
- Vercel may take 30-60 seconds first time

**Gmail not pulling emails**
- Verify Gmail OAuth token is stored in credentials
- Check that refresh token hasn't expired (requires re-auth if it has)

## Security Notes

- ✅ Credentials stored in Vercel environment variables (encrypted at rest)
- ✅ No credentials in code or git history
- ✅ Each request requires valid REFRESH_TOKEN
- ✅ API calls are HTTPS only
- ⚠️ Change SETUP_TOKEN after initial setup
- ⚠️ Rotate REFRESH_TOKEN periodically

## Local Development

```bash
npm install
vercel env pull  # Download env variables locally
npm run dev      # Runs on http://localhost:3000
```

Test endpoints:
```bash
curl http://localhost:3000/api/setup
curl "http://localhost:3000/api/refresh?token=your-token"
```

## File Structure

```
station-board-backend/
├── api/
│   ├── refresh.js       # Main endpoint
│   ├── setup.js         # Credential setup
│   └── auth/
│       └── gmail.js     # Gmail OAuth
├── services/
│   ├── ecampus.js       # eCampus scraper
│   ├── castlebranch.js  # Vaccine scraper
│   ├── pearson.js       # Pearson scraper
│   ├── notion.js        # Notion notes
│   └── gmail.js         # Gmail puller
├── utils/
│   └── credentials.js   # Credential management
├── package.json
├── vercel.json
└── README.md
```

## Next Steps

1. ✅ Deploy backend to Vercel
2. ✅ Configure environment variables
3. ✅ Run setup endpoint to store credentials
4. ✅ Update artifact to call `/api/refresh`
5. ✅ Test by clicking "Refresh" button in artifact
6. ✅ Optional: Enable auto-refresh

## Support

If you hit issues:
1. Check the Vercel logs: `vercel logs`
2. Enable verbose logging by setting `DEBUG=*`
3. Test endpoints directly with curl
4. Verify all credentials are correct

---

**You're now ready for true 1-click refresh!**
