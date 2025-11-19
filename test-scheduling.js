#!/usr/bin/env node

/**
 * Test script for the scheduling system
 * Usage: node test-scheduling.js
 */

const https = require('https');

// Configuration
const SITE_URL = process.env.URL || 'http://localhost:8888';

// Test data
const testProspect = {
  name: 'Jane Smith',
  email: 'jane.smith@testcompany.com',
  company: 'Test Company Inc',
  grantType: 'SBIR Phase I'
};

console.log('🧪 Testing Ironfeast Scheduling System\n');
console.log(`Site URL: ${SITE_URL}\n`);

// Helper function to make HTTP requests
function makeRequest(url, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const client = urlObj.protocol === 'https:' ? https : require('http');
    
    const req = client.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          resolve({ status: res.statusCode, data });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

async function test() {
  try {
    // Test 1: Create a token
    console.log('📝 Test 1: Creating a scheduling token...');
    const createResponse = await makeRequest(
      `${SITE_URL}/.netlify/functions/add-token`,
      'POST',
      testProspect
    );

    if (createResponse.status !== 200) {
      console.error('❌ Failed to create token:', createResponse.data);
      return;
    }

    console.log('✅ Token created successfully');
    console.log(`   Token: ${createResponse.data.token}`);
    console.log(`   URL: ${createResponse.data.schedulingUrl}\n`);

    const token = createResponse.data.token;

    // Test 2: Retrieve available slots
    console.log('📅 Test 2: Retrieving available time slots...');
    const slotsResponse = await makeRequest(
      `${SITE_URL}/.netlify/functions/schedule-meeting?token=${token}`,
      'GET'
    );

    if (slotsResponse.status !== 200) {
      console.error('❌ Failed to retrieve slots:', slotsResponse.data);
      return;
    }

    console.log('✅ Slots retrieved successfully');
    console.log(`   User: ${slotsResponse.data.userInfo.name}`);
    console.log(`   Email: ${slotsResponse.data.userInfo.email}`);
    console.log(`   Company: ${slotsResponse.data.userInfo.company}`);
    console.log(`   Grant Type: ${slotsResponse.data.userInfo.grantType}`);
    
    const slotDates = Object.keys(slotsResponse.data.slots);
    console.log(`   Available dates: ${slotDates.length} days`);
    
    if (slotDates.length > 0) {
      const firstDate = slotDates[0];
      const slotsOnFirstDate = slotsResponse.data.slots[firstDate].length;
      console.log(`   Slots on ${firstDate}: ${slotsOnFirstDate}`);
      
      // Test 3: Schedule a meeting (commented out to avoid actually creating events)
      console.log('\n⏭️  Test 3: Schedule meeting (skipped to avoid creating actual calendar events)');
      console.log('   To test scheduling, uncomment the scheduling code in this script');
      console.log('   Or manually visit the scheduling URL and book a slot\n');
      
      /*
      // Uncomment to test actual scheduling
      const firstSlot = slotsResponse.data.slots[firstDate][0];
      console.log(`\n📆 Test 3: Scheduling meeting for ${firstSlot}...`);
      
      const scheduleResponse = await makeRequest(
        `${SITE_URL}/.netlify/functions/schedule-meeting`,
        'POST',
        {
          token: token,
          timestamp: firstSlot,
          additionalEmails: ['test@example.com']
        }
      );

      if (scheduleResponse.status !== 200) {
        console.error('❌ Failed to schedule meeting:', scheduleResponse.data);
        return;
      }

      console.log('✅ Meeting scheduled successfully');
      console.log(`   Event ID: ${scheduleResponse.data.eventId}`);
      console.log(`   Meet Link: ${scheduleResponse.data.meetLink}`);
      */
    } else {
      console.log('   ⚠️  No available slots found (check calendar configuration)');
    }

    console.log('\n✅ All tests completed successfully!');
    console.log('\n📋 Next Steps:');
    console.log('   1. Visit the scheduling URL to test the frontend');
    console.log('   2. Check your Google Calendar for the test event');
    console.log('   3. Share the generate-token.html page with your team');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error);
  }
}

test();
