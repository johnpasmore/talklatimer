import { setCORS } from '../_cors';

export default async function handler(req, res) {
  setCORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

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
  } catch {
    res.status(500).json({ error: 'Failed to create HeyGen token' });
  }
}
