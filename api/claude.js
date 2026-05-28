export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const body = req.body;
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: body.messages,
        max_tokens: 1000,
      }),
    });
    const data = await response.json();
    if (!response.ok) return res.status(200).json({ content: [{ text: 'Groq error: ' + JSON.stringify(data) }] });
    const text = data.choices?.[0]?.message?.content || 'No content returned.';
    res.status(200).json({ content: [{ text }] });
  } catch (e) {
    res.status(200).json({ content: [{ text: 'Exception: ' + e.message }] });
  }
}