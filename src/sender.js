'use strict';

const https = require('https');
const { URL } = require('url');

/**
 * Sends a payload to a Supabase REST API table (default: trust_events).
 * Resolves with { ok, dryRun?, status?, error? } - never rejects, so callers
 * never need a try/catch around a failed network call.
 */
function sendToSupabase(config, payload, table = 'trust_events') {
  return new Promise((resolve) => {
    if (!config || !config.supabaseUrl) {
      resolve({ ok: false, dryRun: true });
      return;
    }

    let url;
    try {
      url = new URL(config.supabaseUrl.replace(/\/+$/, '') + `/rest/v1/${table}`);
    } catch (e) {
      resolve({ ok: false, error: 'invalid_supabase_url' });
      return;
    }

    const body = JSON.stringify(payload);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      port: url.port || 443,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        apikey: config.supabaseAnonKey || '',
        Authorization: `Bearer ${config.supabaseAnonKey || ''}`,
        Prefer: 'return=minimal',
      },
    };

    const req = https.request(options, (res) => {
      res.on('data', () => {});
      res.on('end', () => {
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode });
      });
    });

    req.on('error', (err) => resolve({ ok: false, error: err.message }));
    req.setTimeout(5000, () => {
      req.destroy();
      resolve({ ok: false, error: 'timeout' });
    });

    req.write(body);
    req.end();
  });
}

module.exports = { sendToSupabase };
