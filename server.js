const express = require('express');
const cors = require('cors');

// Use native fetch (Node 18+) or fall back to node-fetch
const fetch = globalThis.fetch || require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// Allow all origins (tighten this in production)
app.use(cors());

// Simple request logger
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// Health check
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    usage: 'GET /proxy?url=https://api.example.com/data',
  });
});

// The proxy endpoint
// Usage: /proxy?url=https://api.example.com/data
app.get('/proxy', async (req, res) => {
  const targetUrl = req.query.url;

  if (!targetUrl) {
    return res.status(400).json({ error: 'Missing required query param: url' });
  }

  // Validate URL
  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return res.status(400).json({ error: 'Only http/https URLs are allowed' });
  }

  try {
    const upstream = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        // Some APIs require these
        'Accept': 'application/json',
        'User-Agent': 'CORS-Proxy/1.0',
      },
    });

    const contentType = upstream.headers.get('content-type') || '';

    // Read the body once
    const rawBody = await upstream.text();

    // Try to parse as JSON; if it fails, return as-is
    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      // Upstream didn't return JSON — pass it through
      res.status(upstream.status).type(contentType || 'text/plain').send(rawBody);
      return;
    }

    res.status(upstream.status).json(payload);
  } catch (err) {
    console.error('Proxy error:', err);
    res.status(502).json({
      error: 'Failed to fetch upstream resource',
      message: err.message,
    });
  }
});

// Fallback: proxy any path, e.g. /https://api.example.com/data
// (optional — remove if not needed)
app.get(/^\/(https?:\/\/.+)/, async (req, res) => {
  const targetUrl = req.params[0] + (req.url.includes('?') ? '' : '');
  const query = req.originalUrl.split('?')[1];
  const fullUrl = query ? `${targetUrl}?${query}` : targetUrl;

  try {
    const upstream = await fetch(fullUrl);
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`CORS JSON proxy running at http://localhost:${PORT}`);
  console.log(`Example: http://localhost:${PORT}/proxy?url=https://api.github.com/users/octocat`);
});
