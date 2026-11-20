// Netlify Function: runs the same API routes as server.js (all /api/* requests)
// The database schema already exists in Supabase, so skip re-initialising it on each cold start.
process.env.SKIP_SCHEMA_INIT = '1';

const { Writable, Readable } = require('stream');
const { handler: appHandler } = require('../../server.js');

class FakeRes extends Writable {
  constructor(done) {
    super();
    this.statusCode = 200;
    this.headers = {};
    this.chunks = [];
    this.done = done;
    this.on('finish', () => {
      this.done({
        statusCode: this.statusCode,
        headers: this.headers,
        body: Buffer.concat(this.chunks).toString('utf8')
      });
    });
  }
  setHeader(k, v) { this.headers[k] = v; }
  getHeader(k) { return this.headers[k]; }
  writeHead(code, headers) { this.statusCode = code; Object.assign(this.headers, headers || {}); return this; }
  _write(chunk, _enc, cb) { this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)); cb(); }
}

exports.handler = async (event) => {
  let urlPath;
  try {
    const u = new URL(event.rawUrl);
    urlPath = u.pathname + u.search;
  } catch (e) {
    urlPath = event.path + (event.rawQuery ? '?' + event.rawQuery : '');
  }
  urlPath = urlPath.replace('/.netlify/functions/api', '/api');
  if (!urlPath.startsWith('/api')) urlPath = '/api' + urlPath;

  const bodyBuf = event.body
    ? Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8')
    : null;
  const req = Readable.from(bodyBuf ? [bodyBuf] : []);
  req.url = urlPath;
  req.method = event.httpMethod;
  req.headers = event.headers || {};

  return new Promise((resolve) => {
    const res = new FakeRes(resolve);
    Promise.resolve(appHandler(req, res)).catch((err) => {
      console.error('Function error:', err);
      resolve({ statusCode: 500, body: JSON.stringify({ error: err.message || 'Server error' }) });
    });
  });
};
