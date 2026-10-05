const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 10000;

// CORS setup
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-XSRF-TOKEN'],
  credentials: false
}));

// Handle OPTIONS preflight BEFORE the proxy
app.options('/api/*', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-XSRF-TOKEN');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.status(204).end();
});

// Health check for uptime pingers
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

// Dynamic proxy with SonyLIV header injection
app.use('/api', (req, res, next) => {
  const fullUrl = req.url.slice(1);

  if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) {
    return res.status(400).json({ error: 'Invalid target URL' });
  }

  let targetOrigin, targetPath;
  try {
    const parsed = new URL(fullUrl);
    targetOrigin = parsed.origin;
    targetPath = parsed.pathname + parsed.search;
  } catch (e) {
    return res.status(400).json({ error: 'Malformed URL' });
  }

  // Build headers: SonyLIV specific + generic browser spoof
  const proxyHeaders = {
    'Referer': 'https://www.sonyliv.com/',
    'Origin': 'https://www.sonyliv.com',
    'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9'
  };

  // Add SonyLIV CSRF token if available via env var
  if (process.env.SONYLIV_TOKEN) {
    proxyHeaders['X-XSRF-TOKEN'] = process.env.SONYLIV_TOKEN;
  }

  // Add SonyLIV cookie if available via env var (contains XSRF-TOKEN cookie usually)
  if (process.env.SONYLIV_COOKIE) {
    proxyHeaders['Cookie'] = process.env.SONYLIV_COOKIE;
  }

  const proxy = createProxyMiddleware({
    target: targetOrigin,
    changeOrigin: true,
    secure: false,
    pathRewrite: () => targetPath,
    headers: proxyHeaders,
    on: {
      proxyReq: (proxyReq, req, res) => {
        // Log for debugging — check Render logs if something fails
        console.log(`[PROXY] ${req.method} ${targetOrigin}${targetPath}`);
      },
      proxyRes: (proxyRes, req, res) => {
        console.log(`[RESPONSE] Status: ${proxyRes.statusCode}`);
        // Ensure CORS headers even on proxied responses
        proxyRes.headers['access-control-allow-origin'] = '*';
      },
      error: (err, req, res) => {
        console.error('Proxy Error:', err.message);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Proxy failed', details: err.message });
        }
      }
    }
  });

  proxy(req, res, next);
});

app.listen(PORT, () => console.log(`Dynamic proxy on ${PORT}`));
