const fetch = require('node-fetch');

exports.handler = async function(event, context) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (err) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid request body' })
    };
  }

  const { image, changes } = body;
  if (!image && (!changes || changes.length === 0)) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'No image or clinical changes provided' })
    };
  }

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'OpenAI API key not configured' })
    };
  }

  // Compose prompt for OpenAI
  let prompt = `You are a medical AI assistant. Analyze the provided skin lesion image (base64) and/or clinical changes using the ABCDE method (Asymmetry, Border, Color, Diameter, Evolution). Provide a risk assessment (low/medium/high), a breakdown of ABCDE, and a clear recommendation. If image is missing, use only the clinical changes. If both are missing, return an error.`;
  if (changes && changes.length > 0) {
    prompt += `\n\nObserved clinical changes: ${changes.join(', ')}.`;
  }
  if (image) {
    prompt += `\n\nImage (base64, JPEG/PNG): [image data omitted for brevity]`;
  }

  try {
    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'You are a medical AI assistant for skin lesion analysis using the ABCDE method.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 500,
        temperature: 0.2
      })
    });
    const openaiData = await openaiRes.json();
    if (!openaiData.choices || !openaiData.choices[0] || !openaiData.choices[0].message) {
      throw new Error('No valid response from OpenAI');
    }
    // Try to parse ABCDE, risk, recommendation from the response
    const resultText = openaiData.choices[0].message.content;
    // Simple parsing (could be improved with more structure)
    const abcd = {};
    const abcdMatch = resultText.match(/ABCDE Breakdown:(.*?)(?:Risk|Recommendation|$)/is);
    if (abcdMatch) {
      const lines = abcdMatch[1].split('\n').map(l => l.trim()).filter(Boolean);
      lines.forEach(line => {
        if (/Asymmetry/i.test(line)) abcd.asymmetry = line.split(':')[1]?.trim();
        if (/Border/i.test(line)) abcd.border = line.split(':')[1]?.trim();
        if (/Color/i.test(line)) abcd.color = line.split(':')[1]?.trim();
        if (/Diameter/i.test(line)) abcd.diameter = line.split(':')[1]?.trim();
        if (/Evolution/i.test(line)) abcd.evolution = line.split(':')[1]?.trim();
      });
    }
    const riskMatch = resultText.match(/Risk Assessment:\s*(.*?)(?:Recommendation|$)/is);
    const recommendationMatch = resultText.match(/Recommendation:\s*(.*)/is);
    return {
      statusCode: 200,
      body: JSON.stringify({
        abcd,
        risk: riskMatch ? riskMatch[1].trim() : undefined,
        recommendation: recommendationMatch ? recommendationMatch[1].trim() : undefined,
        result: resultText
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Medical analysis service temporarily unavailable.' })
    };
  }
}; 