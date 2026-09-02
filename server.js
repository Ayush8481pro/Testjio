const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/proxy/*', async (req, res) => {
  const targetUrl = req.params[0];
  if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
    return res.status(400).json({ error: 'Invalid or missing target URL' });
  }

  try {
    // Use HEAD first to avoid downloading body (faster)
    let response;
    try {
      response = await axios.head(targetUrl, {
        headers: { 'User-Agent': req.headers['user-agent'] || 'Render-Proxy/1.0' },
        validateStatus: () => true, // Accept any status (including 450)
        maxRedirects: 0
      });
    } catch (headError) {
      // Some servers don't support HEAD, fallback to GET but don't download body
      response = await axios.get(targetUrl, {
        headers: { 'User-Agent': req.headers['user-agent'] || 'Render-Proxy/1.0' },
        validateStatus: () => true,
        maxRedirects: 0,
        responseType: 'stream', // So we can destroy the stream immediately
        timeout: 10000
      });
      // Destroy the stream right away to avoid downloading body
      if (response.data && typeof response.data.destroy === 'function') {
        response.data.destroy();
      }
    }

    // Extract headers (especially set-cookie)
    const headers = response.headers;
    const setCookies = headers['set-cookie'] || [];

    // Return JSON with status and cookies
    res.status(200).json({
      status: response.status,
      statusText: response.statusText,
      cookies: Array.isArray(setCookies) ? setCookies : [setCookies],
      headers: headers // optional: include all headers if needed
    });
  } catch (error) {
    res.status(502).json({ error: 'Proxy error: ' + error.message });
  }
});

app.get('/', (req, res) => res.send('Status & Cookie Proxy is running'));

app.listen(PORT, () => console.log(`Proxy listening on port ${PORT}`));
