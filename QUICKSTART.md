# Quick Start Checklist

## Pre-Deployment (Get Your Credentials)

- [ ] **eCampus App Password**
  - Go to: https://ecampusd2l.blinn.edu/d2l/home
  - Settings → Security → App Passwords
  - Save: `your-app-password`

- [ ] **Pearson Credentials**
  - Username: `your-pearson-email`
  - Password: `your-pearson-password`

- [ ] **CastleBranch Credentials**
  - Username: `your-castlebranch-email`
  - Password: `your-castlebranch-password`

- [ ] **Notion API Key**
  - Go to: https://www.notion.so/my-integrations
  - Create integration, copy token
  - Save: `notion_xxxxx_key`

- [ ] **Gmail OAuth (Client ID & Secret)**
  - Go to: https://console.cloud.google.com
  - Create project, enable Gmail API
  - Create OAuth 2.0 credentials
  - Save: Client ID and Secret

## Deployment (5 minutes)

1. **Create Vercel Account** (if you don't have one)
   - Go to: https://vercel.com
   - Sign up with GitHub/Google

2. **Deploy Backend**
   ```bash
   npm install -g vercel
   vercel
   ```
   - Follow prompts, confirm deployment
   - **Note your Vercel URL**: `https://your-project.vercel.app`

3. **Add Environment Variables in Vercel**
   - Go to Vercel Dashboard → Project Settings → Environment Variables
   - Add these (leave ENCRYPTION_KEY blank):
   
   ```
   REFRESH_TOKEN = pick-a-random-secret-string
   SETUP_TOKEN = pick-another-random-string
   GMAIL_CLIENT_ID = your-google-client-id
   GMAIL_CLIENT_SECRET = your-google-client-secret
   GMAIL_REDIRECT_URL = https://your-project.vercel.app/api/auth/gmail/callback
   ```

4. **Store Your Credentials**
   ```bash
   curl -X POST https://your-vercel-url.vercel.app/api/setup \
     -H "Content-Type: application/json" \
     -d '{
       "setupToken": "your-setup-token",
       "credentials": {
         "ecampus": {
           "username": "your-blinn-id",
           "appPassword": "your-app-password"
         },
         "castlebranch": {
           "username": "your-cb-email",
           "password": "your-cb-password"
         },
         "pearson": {
           "username": "your-pearson-email",
           "password": "your-pearson-password"
         },
         "notion": {
           "apiKey": "notion_key"
         },
         "gmail": {
           "refreshToken": "gmail-refresh-token"
         }
       }
     }'
   ```
   
   - Copy the `CREDENTIALS_JSON` from response
   - Add as environment variable in Vercel

5. **Redeploy to Activate Env Vars**
   ```bash
   vercel redeploy
   ```

6. **Test It Works**
   ```bash
   curl "https://your-vercel-url.vercel.app/api/refresh?token=your-refresh-token"
   ```
   
   Should return fresh data from all services.

## Integration (Update Your Artifact)

In your Station Board HTML artifact, add a "Refresh" button with this function:

```javascript
const BACKEND_URL = 'https://your-vercel-url.vercel.app';
const REFRESH_TOKEN = 'your-refresh-token';

async function refreshStationBoard() {
  const btn = document.getElementById('refresh-btn');
  btn.disabled = true;
  btn.textContent = 'Refreshing...';
  
  try {
    const response = await fetch(
      `${BACKEND_URL}/api/refresh?token=${REFRESH_TOKEN}`
    );
    const data = await response.json();
    
    if (data.success) {
      // Update your artifact UI with data
      updateECampusTab(data.data.ecampus);
      updateNotesTab(data.data.notion);
      updateVaccinesTab(data.data.castlebranch);
      updateAssignmentsTab(data.data.pearson);
      updateTodoTab(data.data.gmail);
      
      alert('✅ Station Board refreshed!');
    }
  } catch (error) {
    alert('❌ Refresh failed: ' + error.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Refresh Now';
  }
}
```

Add button to artifact HTML:
```html
<button id="refresh-btn" onclick="refreshStationBoard()" style="padding:10px;font-weight:bold;">
  🔄 Refresh Now
</button>
```

## Done!

You now have:
- ✅ Vercel backend running 24/7
- ✅ Auto-login to all services maintained
- ✅ One-click data refresh in your artifact
- ✅ Auto-refresh every 6 hours (optional)
- ✅ Full credentials stored securely

**Total time: ~15 minutes**

---

## If Something Breaks

Check these in order:

1. **"Unauthorized" error?**
   - Verify REFRESH_TOKEN matches in Vercel and your code

2. **"No credentials found"?**
   - Make sure CREDENTIALS_JSON is in Vercel env variables

3. **Login timeouts?**
   - 2FA enabled? Use app passwords instead
   - Check if your password expired

4. **Gmail not working?**
   - Refresh token may have expired
   - Re-run setup to get new Gmail token

**Still stuck?** Check Vercel logs:
```bash
vercel logs
```

---

**You're live! Click the Refresh button and watch the magic happen.**
