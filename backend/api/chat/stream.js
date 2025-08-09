import { setCORS } from '../_cors';

export const config = { runtime: 'nodejs18.x' };

export default async function handler(req, res) {
  setCORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  const userPrompt = String(req.query.q || 'Say hello from Latimer.');
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');

  try {
    const payload = {
      apiKey: process.env.LATIMER_API_KEY,
      message: userPrompt,
      model: process.env.LATIMER_MODEL || 'gpt-4o-mini'
    };

    const r = await fetch('https://api.latimer.ai/getCompletion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await r.json();
    if (!r.ok) {
      res.write(`event: error\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
      return res.end();
    }

    const full = data?.message?.content || '';
    const parts = full.split(/(?<=[.!?;\n])\s+/).filter(Boolean);
    for (const p of parts) {
      res.write(`data: ${JSON.stringify(p)}\n\n`);
      await new Promise(r => setTimeout(r, 50));
    }
    res.write('event: done\n');
    res.write('data: done\n\n');
    res.end();
  } catch {
    res.end();
  }
}
