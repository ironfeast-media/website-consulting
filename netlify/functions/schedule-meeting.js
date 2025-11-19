const { google } = require('googleapis');
const { getStore } = require('@netlify/blobs');
const { DateTime } = require('luxon');

// Initialize Google Calendar
function getCalendarClient() {
  const credentials = JSON.parse(process.env.GOOGLE_CALENDAR_CREDENTIALS || '{}');
  
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/calendar']
  });
  
  return google.calendar({ version: 'v3', auth });
}

// Get token data from Netlify Blobs
async function getTokenData(token) {
  const store = getStore('scheduling-tokens');
  const data = await store.get(token, { type: 'json' });
  
  if (!data) {
    return null;
  }
  
  // Check if token is expired (5 days = 432000000 ms)
  const createdAt = new Date(data.createdAt);
  const now = new Date();
  const fiveDaysInMs = 5 * 24 * 60 * 60 * 1000;
  
  if (now - createdAt > fiveDaysInMs) {
    // Token expired, delete it
    await store.delete(token);
    return null;
  }
  
  return data;
}

// Generate available time slots
function generateTimeSlots(startDate, endDate, existingEvents) {
  const slots = {};
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  
  // Convert to Central Time
  let currentDate = DateTime.fromJSDate(startDate, { zone: 'America/Chicago' });
  const endDateTime = DateTime.fromJSDate(endDate, { zone: 'America/Chicago' });
  
  while (currentDate < endDateTime) {
    const dateKey = currentDate.toISODate();
    const daySlots = [];
    
    // Skip weekends
    if (currentDate.weekday < 6) { // 1-5 is Monday-Friday
      // Working hours: 9 AM - 4 PM Central Time
      for (let hour = 9; hour < 16; hour++) {
        for (let minute = 0; minute < 60; minute += 15) {
          const slotStart = currentDate.set({ hour, minute, second: 0, millisecond: 0 });
          const slotEnd = slotStart.plus({ minutes: 15 });
          
          // Check if slot is in the past
          const now = DateTime.now().setZone('America/Chicago');
          if (slotStart <= now) {
            continue;
          }
          
          // Check if slot conflicts with existing events
          const hasConflict = existingEvents.some(event => {
            if (!event.start || !event.end) return false;
            
            const eventStart = DateTime.fromISO(event.start.dateTime || event.start.date, { zone: 'America/Chicago' });
            const eventEnd = DateTime.fromISO(event.end.dateTime || event.end.date, { zone: 'America/Chicago' });
            
            // Check for overlap
            return slotStart < eventEnd && slotEnd > eventStart;
          });
          
          if (!hasConflict) {
            daySlots.push(slotStart.toISO());
          }
        }
      }
    }
    
    if (daySlots.length > 0) {
      slots[dateKey] = daySlots;
    }
    
    currentDate = currentDate.plus({ days: 1 }).startOf('day');
  }
  
  return slots;
}

// Handler for GET requests - retrieve available slots
async function handleGetRequest(event) {
  const token = event.queryStringParameters?.token;
  
  if (!token) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Token is required' })
    };
  }
  
  // Get token data
  const tokenData = await getTokenData(token);
  
  if (!tokenData) {
    return {
      statusCode: 404,
      body: JSON.stringify({ error: 'Invalid or expired token' })
    };
  }
  
  // Get calendar client
  const calendar = getCalendarClient();
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  
  // Calculate time range (30 minutes from now to 7 days)
  const now = new Date();
  const startTime = new Date(now.getTime() + 30 * 60 * 1000); // 30 minutes from now
  const endTime = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days
  
  try {
    // Fetch existing events
    const response = await calendar.events.list({
      calendarId: calendarId,
      timeMin: startTime.toISOString(),
      timeMax: endTime.toISOString(),
      singleEvents: true,
      orderBy: 'startTime'
    });
    
    const existingEvents = response.data.items || [];
    
    // Generate available slots
    const slots = generateTimeSlots(startTime, endTime, existingEvents);
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        userInfo: {
          name: tokenData.name,
          email: tokenData.email,
          company: tokenData.company,
          grantType: tokenData.grantType
        },
        slots: slots
      })
    };
  } catch (error) {
    console.error('Error fetching calendar events:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to fetch available slots' })
    };
  }
}

// Handler for POST requests - schedule meeting
async function handlePostRequest(event) {
  try {
    const body = JSON.parse(event.body);
    const { token, timestamp, additionalEmails } = body;
    
    if (!token || !timestamp) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Token and timestamp are required' })
      };
    }
    
    // Get token data
    const tokenData = await getTokenData(token);
    
    if (!tokenData) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Invalid or expired token' })
      };
    }
    
    // Get calendar client
    const calendar = getCalendarClient();
    const calendarId = process.env.GOOGLE_CALENDAR_ID;
    
    // Parse timestamp
    const startTime = DateTime.fromISO(timestamp);
    const endTime = startTime.plus({ minutes: 15 });
    
    // Build attendee list
    const attendees = [
      { email: 'sales@ironfeast.org' },
      { email: tokenData.email }
    ];
    
    if (additionalEmails && Array.isArray(additionalEmails)) {
      additionalEmails.forEach(email => {
        if (email && email.trim()) {
          attendees.push({ email: email.trim() });
        }
      });
    }
    
    // Create event
    const event = {
      summary: `Meeting with ${tokenData.company} to discuss about ${tokenData.grantType}`,
      description: `Sales call scheduled with ${tokenData.name} from ${tokenData.company} to discuss ${tokenData.grantType}.`,
      start: {
        dateTime: startTime.toISO(),
        timeZone: 'America/Chicago'
      },
      end: {
        dateTime: endTime.toISO(),
        timeZone: 'America/Chicago'
      },
      attendees: attendees,
      conferenceData: {
        createRequest: {
          requestId: `${token}-${Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' }
        }
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 },
          { method: 'popup', minutes: 30 }
        ]
      }
    };
    
    try {
      const response = await calendar.events.insert({
        calendarId: calendarId,
        resource: event,
        conferenceDataVersion: 1,
        sendUpdates: 'all'
      });
      
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          eventId: response.data.id,
          meetLink: response.data.hangoutLink
        })
      };
    } catch (error) {
      console.error('Error creating calendar event:', error);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Failed to schedule meeting' })
      };
    }
  } catch (error) {
    console.error('Error in POST handler:', error);
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid request' })
    };
  }
}

// Main handler
exports.handler = async (event) => {
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };
  
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }
  
  let response;
  
  if (event.httpMethod === 'GET') {
    response = await handleGetRequest(event);
  } else if (event.httpMethod === 'POST') {
    response = await handlePostRequest(event);
  } else {
    response = {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }
  
  return {
    ...response,
    headers: {
      ...headers,
      'Content-Type': 'application/json'
    }
  };
};
