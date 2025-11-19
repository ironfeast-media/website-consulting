# Sales Call Scheduling System

This system allows prospects to schedule sales calls with the Ironfeast team using a token-based scheduling system integrated with Google Calendar.

## Features

- Token-based scheduling with 5-day expiration
- Google Calendar integration with Google Meet links
- 15-minute time slots during working hours (9 AM - 4 PM CT)
- Automatic conflict detection
- Support for additional attendees
- Responsive design matching the main website

## Setup

### 1. Google Calendar API Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google Calendar API
4. Create a service account:
   - Go to "IAM & Admin" > "Service Accounts"
   - Click "Create Service Account"
   - Give it a name (e.g., "Ironfeast Scheduling")
   - Grant it the "Editor" role
   - Create a JSON key and download it
5. Share your Google Calendar with the service account email
   - Open Google Calendar
   - Go to calendar settings
   - Share with the service account email (found in the JSON key)
   - Give it "Make changes to events" permission

### 2. Environment Variables

Add these environment variables to your Netlify site:

```bash
# Google Calendar Configuration
GOOGLE_CALENDAR_CREDENTIALS='{"type": "service_account", "project_id": "...", ...}'
GOOGLE_CALENDAR_ID='your-calendar-id@group.calendar.google.com'

# Site URL (automatically set by Netlify, but you can override)
URL='https://yourdomain.com'
```

To get your calendar ID:
1. Open Google Calendar
2. Click the three dots next to your calendar
3. Select "Settings and sharing"
4. Scroll to "Integrate calendar"
5. Copy the "Calendar ID"

### 3. Database (Netlify Blobs)

The system uses Netlify Blobs for token storage. This is automatically available in your Netlify account and requires no additional setup.

Tokens are stored with the following data:
- `name`: Person's name
- `email`: Person's email
- `company`: Company name
- `grantType`: Type of grant/discussion topic
- `createdAt`: Timestamp for expiration tracking

Tokens automatically expire after 5 days.

## API Endpoints

### 1. Add Token
**Endpoint:** `/.netlify/functions/add-token`  
**Method:** POST  
**Purpose:** Create a new scheduling token

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "company": "Example Corp",
  "grantType": "SBIR Phase I",
  "token": "optional-custom-token"
}
```

**Response:**
```json
{
  "success": true,
  "token": "abc123...",
  "schedulingUrl": "https://yourdomain.com/schedule.html?token=abc123...",
  "expiresIn": "5 days"
}
```

**Example Usage:**
```bash
curl -X POST https://yourdomain.com/.netlify/functions/add-token \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "company": "Example Corp",
    "grantType": "SBIR Phase I"
  }'
```

### 2. Get Available Slots
**Endpoint:** `/.netlify/functions/schedule-meeting?token=TOKEN`  
**Method:** GET  
**Purpose:** Retrieve user info and available time slots

**Response:**
```json
{
  "userInfo": {
    "name": "John Doe",
    "email": "john@example.com",
    "company": "Example Corp",
    "grantType": "SBIR Phase I"
  },
  "slots": {
    "2025-11-20": [
      "2025-11-20T09:00:00-06:00",
      "2025-11-20T09:15:00-06:00",
      "2025-11-20T09:30:00-06:00"
    ],
    "2025-11-21": [
      "2025-11-21T10:00:00-06:00"
    ]
  }
}
```

### 3. Schedule Meeting
**Endpoint:** `/.netlify/functions/schedule-meeting`  
**Method:** POST  
**Purpose:** Create a calendar event

**Request Body:**
```json
{
  "token": "abc123...",
  "timestamp": "2025-11-20T09:00:00-06:00",
  "additionalEmails": ["colleague@example.com"]
}
```

**Response:**
```json
{
  "success": true,
  "eventId": "calendar-event-id",
  "meetLink": "https://meet.google.com/xxx-yyyy-zzz"
}
```

## Usage Flow

1. **Generate Token:** Use the add-token endpoint to create a scheduling link for a prospect
2. **Send Link:** Send the generated URL to the prospect via email
3. **Schedule:** Prospect visits the link, sees available slots, and schedules a meeting
4. **Calendar Event:** System creates a Google Calendar event with Google Meet link
5. **Notifications:** All attendees receive calendar invitations

## Scheduling Rules

- **Working Hours:** 9:00 AM - 4:00 PM Central Time
- **Days:** Monday - Friday only
- **Slot Duration:** 15 minutes
- **Advance Notice:** Minimum 30 minutes from current time
- **Booking Window:** Up to 7 days in advance
- **Token Expiration:** 5 days from creation

## Frontend Integration

The scheduling page is available at `/schedule.html` and requires a `token` query parameter:

```
https://yourdomain.com/schedule.html?token=abc123...
```

The page automatically:
- Validates the token
- Displays user information
- Shows available time slots
- Handles meeting scheduling
- Shows confirmation

## Error Handling

The system handles various error cases:
- Invalid or expired tokens
- Past time slots
- Calendar conflicts
- Invalid email addresses
- Network failures

All errors are displayed to users with clear messages.

## Meeting Details

Created calendar events include:
- **Title:** "Meeting with {company} to discuss about {grantType}"
- **Duration:** 15 minutes
- **Attendees:** sales@ironfeast.org, prospect email, additional emails
- **Conference:** Google Meet link automatically generated
- **Reminders:** 
  - Email reminder 24 hours before
  - Popup reminder 30 minutes before

## Maintenance

### Cleanup Expired Tokens

Tokens automatically expire after 5 days and are deleted when accessed. No manual cleanup is required.

### Monitor Calendar

Check the Google Calendar regularly to ensure events are being created correctly.

### Test the System

```bash
# Create a test token
curl -X POST https://yourdomain.com/.netlify/functions/add-token \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@ironfeast.org",
    "company": "Test Company",
    "grantType": "Test Grant"
  }'

# Visit the returned URL to test scheduling
```

## Security Considerations

- Tokens are randomly generated 64-character hexadecimal strings
- Tokens expire after 5 days
- Service account has limited calendar access
- CORS is configured for your domain
- Input validation on all endpoints
- Email format validation

## Troubleshooting

**No slots available:**
- Check calendar is shared with service account
- Verify GOOGLE_CALENDAR_ID is correct
- Check timezone settings

**Calendar events not creating:**
- Verify GOOGLE_CALENDAR_CREDENTIALS is valid
- Check service account permissions
- Review Netlify function logs

**Token errors:**
- Ensure Netlify Blobs is enabled
- Check token hasn't expired
- Verify token format in URL
