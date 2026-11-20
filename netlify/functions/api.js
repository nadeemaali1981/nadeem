/**
 * netlify/functions/api.js - Native Hono Serverless Function Adapter for Netlify
 * Dispatches incoming Netlify Lambda events directly into Hono's Web Standard `app.fetch()`.
 */
process.env.SKIP_SCHEMA_INIT = '1';

const { app } = require('../../server.js');

exports.handler = async (event) => {
  try {
    let urlPath;
    try {
      const u = new URL(event.rawUrl);
      urlPath = u.pathname + u.search;
    } catch (e) {
      urlPath = event.path + (event.rawQuery ? '?' + event.rawQuery : '');
    }
    urlPath = urlPath.replace('/.netlify/functions/api', '/api');
    if (!urlPath.startsWith('/api')) urlPath = '/api' + urlPath;

    const fullUrl = `https://netlify.local${urlPath}`;
    const method = (event.httpMethod || 'GET').toUpperCase();
    const hasBody = !['GET', 'HEAD'].includes(method) && event.body;

    const bodyBuffer = hasBody
      ? Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8')
      : undefined;

    const webReq = new Request(fullUrl, {
      method,
      headers: event.headers || {},
      body: bodyBuffer
    });

    const webRes = await app.fetch(webReq);
    const headersObj = {};
    webRes.headers.forEach((v, k) => { headersObj[k] = v; });

    const contentType = (headersObj['content-type'] || '').toLowerCase();
    const arrayBuf = await webRes.arrayBuffer();
    const buf = Buffer.from(arrayBuf);

    if (contentType.startsWith('image/') || contentType.startsWith('application/octet-stream')) {
      return {
        statusCode: webRes.status,
        headers: headersObj,
        body: buf.toString('base64'),
        isBase64Encoded: true
      };
    }

    return {
      statusCode: webRes.status,
      headers: headersObj,
      body: buf.toString('utf8')
    };
  } catch (err) {
    console.error('[Netlify Hono Function Error]:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ error: err.message || 'Server error' })
    };
  }
};
