/**
 * Netlify Serverless Function — OpenAI API Proxy
 *
 * Architecture role:
 *   This function acts as a secure server-side proxy between the browser
 *   and the OpenAI API. The client never has direct access to the API key.
 *
 * Routing:
 *   Requests to /api/chat are rewritten to /.netlify/functions/chat
 *   via the redirect rule in netlify.toml.
 *
 * Security pattern:
 *   The OPENAI_API_KEY is stored as a Netlify environment variable and
 *   injected at runtime — it is never bundled into client-side code or
 *   committed to the repository.
 *
 * Request format (passed through as-is to OpenAI):
 *   POST /api/chat
 *   Body: OpenAI chat completions payload (model, messages, max_tokens, ...)
 */
const fetch = require('node-fetch');

exports.handler = async function(event, context) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'OpenAI API key not configured.' })
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid JSON' })
    };
  }

  try {
    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify(body)
    });
    const data = await openaiRes.json();
    return {
      statusCode: openaiRes.status,
      body: JSON.stringify(data)
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
}; 