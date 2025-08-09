import 'dotenv/config';
import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json());

const PORT = process.env.PORT || 3001;

/** Health check */
app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'talklatimer-backend' }));

/** HeyGen: short-lived streaming token (keep your HeyGen key on the server) */
app.post('/api/heygen/token', async (_req, res) => {
  try {
    const r = await fetch('https://api.heygen.com/v1/streaming.create_token', {
      method: 'POST',
      headers: { 'x-api-key': process.env.HEYGEN_API_KEY }
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data?.message || 'HeyGen token error', raw: data });
    const token = data?.data?.token;
    if (!token) return res.status(500).json({ error: 'No token returned by HeyGen' });
    res.json({ token });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to create HeyGen token' });
  }
});

/** Latimer (non-stream MVP): matches your API schema (apiKey in BODY, message field) */
app.post('/api/chat', async (req, res) => {
  try {
    const userText =
      req.body?.message ??
      req.body?.messages?.map(m => m.content).join('\n') ??
      'Say hello from Latimer.';

    const payload = {
      apiKey: process.env.LATIMER_API_KEY,
      message: String(userText),
      model: process.env.LATIMER_MODEL || 'gpt-4o-mini'
      // chatId, modelTemperature, additionalMessages, additionalInstructions are optional
    };

    const r = await fetch('https://api.latimer.ai/getCompletion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: 'Latimer chat failed', raw: data });

    const text = data?.message?.content || '';
    res.json({ text, chatId: data?.chatId });
  } catch (e) {
    console.error('Latimer non-stream error:', e);
    res.status(500).json({ error: 'Latimer chat failed (exception)' });
  }
});

/** Latimer “pseudo-stream”: fetch once, then send SSE chunks for smooth avatar speech */
app.get('/api/chat/stream', async (req, res) => {
  const userPrompt = String(req.query.q || 'Say hello from Latimer.');

  // SSE headers
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

    const fullText = data?.message?.content || '';
    const parts = fullText.split(/(?<=[.!?;\n])\s+/).filter(Boolean);

    for (const p of parts) {
      res.write(`data: ${JSON.stringify(p)}\n\n`);
      await new Promise(r => setTimeout(r, 60)); // tiny delay to mimic streaming
    }

    res.write('event: done\n');
    res.write('data: done\n\n');
    res.end();
  } catch (e) {
    console.error('Latimer pseudo-stream error:', e);
    res.end();
  }
});

app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));

