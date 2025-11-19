const { getStore } = require('@netlify/blobs');
const crypto = require('crypto');

// Generate a unique token
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

exports.handler = async (event) => {
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }
  
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  // Basic auth check: expect an Authorization header with the token.
  const authHeader = (event.headers && (event.headers.authorization || event.headers.Authorization)) || '';
  const expectedToken = process.env.FN_AUTH_TOKEN || '';

  if (!expectedToken) {
    console.warn('FN_AUTH_TOKEN is not set - rejecting requests for security');
    return {
      statusCode: 401,
      headers: {
        ...headers,
        'Content-Type': 'application/json',
        'WWW-Authenticate': 'Basic realm="AddToken"'
      },
      body: JSON.stringify({ error: 'Unauthorized' })
    };
  }

  let presented = '';
  if (authHeader) {
    if (/^Basic\s+/i.test(authHeader)) {
      presented = authHeader.replace(/^[Bb]asic\s+/, '').trim();
    } else {
      presented = authHeader.trim();
    }
  }

  if (!presented || presented !== expectedToken) {
    return {
      statusCode: 401,
      headers: {
        ...headers,
        'Content-Type': 'application/json',
        'WWW-Authenticate': 'Basic realm="AddToken"'
      },
      body: JSON.stringify({ error: 'Unauthorized' })
    };
  }

  try {
    const body = JSON.parse(event.body);
    const { name, email, company, grantType, token } = body;
    
    // Validate required fields
    if (!name || !email || !company || !grantType) {
      return {
        statusCode: 400,
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          error: 'Missing required fields: name, email, company, and grantType are required' 
        })
      };
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return {
        statusCode: 400,
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'Invalid email format' })
      };
    }
    
    // Use provided token or generate a new one
    const finalToken = token || generateToken();
    
    // Store token data in Netlify Blobs
    const store = getStore('scheduling-tokens');
    
    const tokenData = {
      name,
      email,
      company,
      grantType,
      createdAt: new Date().toISOString()
    };
    
    await store.set(finalToken, JSON.stringify(tokenData));
    
    // Generate scheduling URL
    const siteUrl = process.env.URL || 'http://localhost:8888';
    const schedulingUrl = `${siteUrl}/schedule.html?token=${finalToken}`;
    
    return {
      statusCode: 200,
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: true,
        token: finalToken,
        schedulingUrl: schedulingUrl,
        expiresIn: '5 days'
      })
    };
  } catch (error) {
    console.error('Error adding token:', error);
    return {
      statusCode: 500,
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: 'Failed to create token' })
    };
  }
};
