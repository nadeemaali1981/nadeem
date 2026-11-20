/**
 * api/index.js - Vercel Serverless Function Entry Point (Hono + Supabase PostgreSQL)
 */
process.env.SKIP_SCHEMA_INIT = '1';
const { handler } = require('../server.js');
module.exports = handler;
