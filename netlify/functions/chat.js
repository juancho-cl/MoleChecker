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
  let prompt = `Please provide a comprehensive medical analysis including:\n1. Describe its relevant characteristics using the ABCDE criteria: Asymmetry, Borders, Color, Diameter, Evolution\n2. Based on that description, estimate the probability that it is malignant (10%–90%, in 5% increments) and briefly explain which findings influenced that estimate.\n\nUse professional medical terminology and maintain a clinical, authoritative tone.`;
  if (changes && changes.length > 0) {
    prompt += `\n\nObserved clinical changes: ${changes.join(', ')}.`;
  }
  if (image) {
    prompt += `\n\nImage (base64, JPEG/PNG): [image data omitted for brevity]`;
  }
  // Add JSON instructions
  prompt += `\n\nPlease provide your analysis in the following JSON format (and nothing else):\n{\n  \"criteria\": {\n    \"Asymmetry\": \"...\",\n    \"Border\": \"...\",\n    \"Color\": \"...\",\n    \"Diameter\": \"...\",\n    \"Evolution\": \"...\"\n  },\n  \"risk\": {\n    \"percentage\": 0-100,\n    \"level\": \"Low|Medium|High\",\n    \"findings\": \"...\"\n  },\n  \"recommendation\": \"...\"\n}\nIf information is missing, use an empty string. Do not add any extra text or explanation outside the JSON.`;

  // Log prompt
  console.log('--- OpenAI Prompt Sent ---');
  console.log(prompt);

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
          { role: 'system', content: 'You are a medical AI assistant specialized in dermatology and skin health assessment. Analyze the provided skin lesion image using the ABCDE criteria (Asymmetry, Border irregularity, Color variation, Diameter, Evolution) to identify potential risk factors for skin cancer. Provide an estimated percentage risk of malignancy based on those criteria, briefly explain which findings support your evaluation, and suggest the next step.' },
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
    // Log OpenAI response
    console.log('--- OpenAI Response Received ---');
    console.log(JSON.stringify(openaiData, null, 2));
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