# Sales Call Scheduling System - Quick Reference

## 🚀 Deployment Checklist

### 1. Google Calendar Setup (One-time)

1. **Create/Access Google Cloud Project**
   - Go to https://console.cloud.google.com/
   - Create new project or select existing

2. **Enable Google Calendar API**
   - Navigate to "APIs & Services" → "Library"
   - Search for "Google Calendar API"
   - Click "Enable"

3. **Create Service Account**
   - Go to "IAM & Admin" → "Service Accounts"
   - Click "Create Service Account"
   - Name: "Ironfeast Scheduling" (or similar)
   - Role: Editor
   - Click "Create Key" → JSON
   - Download and save the JSON file securely

4. **Share Calendar with Service Account**
   - Open Google Calendar (calendar.google.com)
   - Click ⚙️ → Settings
   - Select the calendar to use for bookings
   - Scroll to "Share with specific people"
   - Add the service account email (from JSON: `client_email`)
   - Permission: "Make changes to events"
   - Save

5. **Get Calendar ID**
   - Still in Calendar Settings
   - Scroll to "Integrate calendar"
   - Copy "Calendar ID" (looks like: `abc123@group.calendar.google.com`)

### 2. Netlify Environment Variables

Go to Netlify Dashboard → Site Settings → Environment Variables and add:

```
GOOGLE_CALENDAR_CREDENTIALS
```
Paste the entire contents of the service account JSON file (one line, properly escaped)

```
GOOGLE_CALENDAR_ID
```
Paste your calendar ID

### 3. Deploy to Netlify

```bash
# Commit changes
git add .
git commit -m "Add sales call scheduling system"
git push

# Netlify will auto-deploy if connected
# Or manually deploy via Netlify CLI
netlify deploy --prod
```

### 4. Test the System

```bash
# Run test script
node test-scheduling.js

# Or manually test:
# 1. Visit: https://yoursite.com/generate-token.html
# 2. Fill in test prospect details
# 3. Copy the generated URL
# 4. Open in new tab and schedule a meeting
# 5. Check Google Calendar for the event
```

## 📋 Usage Workflow

### For Sales Team (Internal)

1. **Generate Token**
   - Visit: `https://yoursite.com/generate-token.html`
   - Enter prospect information:
     - Name
     - Email
     - Company
     - Discussion topic / Grant type
   - Click "Generate Scheduling Link"
   - Copy the unique URL

2. **Send to Prospect**
   - Email or message the URL to the prospect
   - URL format: `https://yoursite.com/schedule.html?token=abc123...`
   - Token expires in 5 days

### For Prospects (External)

1. **Receive Link**
   - Get unique scheduling link via email

2. **View Available Slots**
   - Click the link
   - See their information pre-filled
   - Browse available time slots (9 AM - 4 PM CT, Mon-Fri)
   - Navigate through next 7 days

3. **Schedule Meeting**
   - Select a time slot
   - (Optional) Add additional attendees
   - Click "Schedule Meeting"
   - Receive calendar invitation with Google Meet link

## 🔧 API Endpoints

### Add Token (Internal)
```bash
POST /.netlify/functions/add-token
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "company": "Example Corp",
  "grantType": "SBIR Phase I"
}

Response:
{
  "success": true,
  "token": "abc123...",
  "schedulingUrl": "https://yoursite.com/schedule.html?token=abc123...",
  "expiresIn": "5 days"
}
```

### Get Available Slots
```bash
GET /.netlify/functions/schedule-meeting?token=abc123...

Response:
{
  "userInfo": {
    "name": "John Doe",
    "email": "john@example.com",
    "company": "Example Corp",
    "grantType": "SBIR Phase I"
  },
  "slots": {
    "2025-11-20": ["2025-11-20T09:00:00-06:00", ...],
    "2025-11-21": [...]
  }
}
```

### Schedule Meeting
```bash
POST /.netlify/functions/schedule-meeting
Content-Type: application/json

{
  "token": "abc123...",
  "timestamp": "2025-11-20T09:00:00-06:00",
  "additionalEmails": ["colleague@example.com"]
}

Response:
{
  "success": true,
  "eventId": "...",
  "meetLink": "https://meet.google.com/xxx-yyyy-zzz"
}
```

## 🎯 Key Features

✅ **Token-based security** - Unique links for each prospect  
✅ **Auto-expiration** - Tokens expire after 5 days  
✅ **Conflict detection** - Only shows truly available slots  
✅ **Working hours only** - 9 AM - 4 PM Central Time, Mon-Fri  
✅ **15-minute slots** - Quick, focused sales calls  
✅ **Google Meet integration** - Auto-generated video links  
✅ **Additional attendees** - Prospects can invite colleagues  
✅ **Email notifications** - All attendees get calendar invites  
✅ **Responsive design** - Works on desktop and mobile  
✅ **No external database** - Uses Netlify Blobs (built-in)

## 📱 Pages

- **`/schedule.html?token=xxx`** - Prospect scheduling page (public with token)
- **`/generate-token.html`** - Token generator (internal use, consider protecting)
- **`/`** - Main website

## 🔒 Security Considerations

1. **Protect `/generate-token.html`**
   - Add authentication (Netlify Identity, password protection, etc.)
   - Or keep URL private and share only with team

2. **Service Account Security**
   - Store JSON credentials only in Netlify env vars
   - Never commit to Git
   - Limit calendar permissions

3. **Token Security**
   - 64-character random hex strings
   - Auto-expire after 5 days
   - One-time use recommended (delete after scheduling)

## 🛠️ Troubleshooting

**No slots showing:**
- Verify calendar is shared with service account email
- Check `GOOGLE_CALENDAR_ID` matches your calendar
- Ensure time zone is set correctly (America/Chicago)

**Can't create events:**
- Verify service account JSON is valid
- Check calendar sharing permissions
- Review Netlify function logs

**Token errors:**
- Ensure Netlify Blobs is enabled (automatic)
- Check token hasn't expired (5 days)
- Verify token in URL matches generated token

**Wrong timezone:**
- System uses Central Time (America/Chicago)
- Verify in `schedule-meeting.js` if needs changing

## 📞 Support

For issues or questions, check:
1. Netlify function logs
2. Browser console for frontend errors
3. Google Calendar API quotas and limits
4. [SCHEDULING_README.md](./SCHEDULING_README.md) for detailed documentation

## 🎨 Customization

To modify scheduling rules, edit `netlify/functions/schedule-meeting.js`:

```javascript
// Working hours (line ~60)
for (let hour = 9; hour < 16; hour++) {  // Change hours here
  for (let minute = 0; minute < 60; minute += 15) {  // Change slot duration
```

To change time window:
```javascript
// In handleGetRequest (line ~100)
const startTime = new Date(now.getTime() + 30 * 60 * 1000); // 30 min advance
const endTime = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days
```

To change timezone:
```javascript
// Search for 'America/Chicago' and replace with your timezone
```
