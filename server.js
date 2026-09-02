const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Helper to build the full target URL from the path
app.get('/proxy/*', async (req, res) => {
  // Extract the target URL from everything after /proxy/
  const targetUrl = req.params[0]; // because we used /proxy/*
  if (!targetUrl) {
    return res.status(400).send('Missing target URL');
  }

  // Basic URL validation (must start with http:// or https://)
  if (!/^https?:\/\//i.test(targetUrl)) {
    return res.status(400).send('Invalid URL, must start with http:// or https://');
  }

  try {
    // Make the request to the target URL
    const upstreamResponse = await axios.get(targetUrl, {
      // Forward optional headers (like User-Agent) if you want
      headers: {
        'User-Agent': req.headers['user-agent'] || 'Render-Proxy/1.0',
        // You can forward other headers as needed, but be careful with security
      },
      // Allow to receive binary data (e.g., for .m3u8 or .ts)
      responseType: 'arraybuffer',
      // Do not automatically follow redirects; we want to relay them as-is
      maxRedirects: 0,
      validateStatus: () => true, // Accept any status code (including 450)
    });

    // Relay status code
    res.status(upstreamResponse.status);

    // Copy all Set-Cookie headers from upstream to client
    const setCookies = upstreamResponse.headers['set-cookie'];
    if (setCookies) {
      // set-cookie can be an array or string
      const cookiesArray = Array.isArray(setCookies) ? setCookies : [setCookies];
      cookiesArray.forEach(cookie => {
        res.append('Set-Cookie', cookie);
      });
    }

    // Optionally copy other relevant headers (Content-Type, etc.)
    if (upstreamResponse.headers['content-type']) {
      res.setHeader('Content-Type', upstreamResponse.headers['content-type']);
    }

    // Send the response body (binary safe)
    res.send(Buffer.from(upstreamResponse.data, 'binary'));
  } catch (error) {
    // Handle network errors, DNS failures, etc.
    console.error('Proxy error:', error.message);
    res.status(502).send('Proxy error: ' + error.message);
  }
});

// Simple health check
app.get('/', (req, res) => res.send('Render Video Proxy is running'));

app.listen(PORT, () => {
  console.log(`Proxy listening on port ${PORT}`);
});
