import { createServer } from 'node:http';
import { URL } from 'node:url';

const PORT = Number(process.env.PORT || 8787);
const AUTH_TOKEN = String(process.env.AUTH_TOKEN || '').trim();
const STORAGE_BACKEND = String(process.env.STORAGE_BACKEND || 'memory').trim().toLowerCase();

const DATABASE_URL = process.env.DATABASE_URL;
const PG_SSL = process.env.PG_SSL;

const GITHUB_TOKEN = String(process.env.GITHUB_STORAGE_TOKEN || '').trim();
const GITHUB_REPO = String(process.env.GITHUB_STORAGE_REPO || '').trim();
const GITHUB_BRANCH = String(process.env.GITHUB_STORAGE_BRANCH || 'main').trim();
const GITHUB_PATH_PREFIX = String(process.env.GITHUB_STORAGE_PATH_PREFIX || 'storage').trim();

if (!AUTH_TOKEN) {
  console.error('Missing AUTH_TOKEN environment variable.');
  process.exit(1);
}

function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-User-Id',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  });
  res.end(body);
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

function auth(req) {
  const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!bearer || bearer !== AUTH_TOKEN) return null;
  return String(req.headers['x-user-id'] || 'default').trim() || 'default';
}

function validateTradePayload(payload) {
  if (!payload || typeof payload !== 'object') return 'Trade payload must be an object';
  if (!String(payload.id || '').trim()) return 'Trade payload must include a non-empty id';
  if (!String(payload.date || '').trim()) return 'Trade payload must include date';
  if (!String(payload.pair || '').trim()) return 'Trade payload must include pair';
  return null;
}

function normalizeTrades(items) {
  const list = Array.isArray(items) ? items : [];
  return [...list].sort((a, b) => Number(a?.no || 0) - Number(b?.no || 0));
}

function upsertInArray(items, trade) {
  const id = String(trade.id);
  const next = items.filter((item) => String(item.id) !== id);
  next.push(trade);
  return normalizeTrades(next);
}

// memory backend (for local simulation / no external dependency)
const memoryStore = new Map();

function userFilePath(userId) {
  return `${GITHUB_PATH_PREFIX}/${encodeURIComponent(userId)}.json`;
}

function githubApiUrl(path) {
  return `https://api.github.com/repos/${GITHUB_REPO}/contents/${path}`;
}

async function githubRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (response.status === 404) return { notFound: true, data: null };

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`GitHub storage error ${response.status}: ${data?.message || response.statusText}`);
  }
  return { notFound: false, data };
}

async function getTradesGithub(userId) {
  const path = userFilePath(userId);
  const { notFound, data } = await githubRequest(`${githubApiUrl(path)}?ref=${encodeURIComponent(GITHUB_BRANCH)}`);
  if (notFound) return { trades: [], sha: null };

  const contentBase64 = String(data?.content || '').replace(/\n/g, '');
  const decoded = Buffer.from(contentBase64, 'base64').toString('utf8');
  const parsed = JSON.parse(decoded || '[]');
  return { trades: normalizeTrades(parsed), sha: data?.sha || null };
}

async function putTradesGithub(userId, trades, sha = null) {
  const path = userFilePath(userId);
  const payload = {
    message: `sync trades for ${userId}`,
    branch: GITHUB_BRANCH,
    content: Buffer.from(JSON.stringify(normalizeTrades(trades), null, 2), 'utf8').toString('base64'),
  };
  if (sha) payload.sha = sha;

  await githubRequest(githubApiUrl(path), {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

let pgPool = null;

async function ensurePgPool() {
  if (pgPool) return pgPool;
  if (!DATABASE_URL) throw new Error('Missing DATABASE_URL environment variable for postgres backend.');
  const mod = await import('pg').catch(() => null);
  if (!mod?.default?.Pool && !mod?.Pool) {
    throw new Error('pg package is not installed. Run npm install in environment with npm registry access.');
  }
  const Pool = mod.Pool || mod.default.Pool;
  pgPool = new Pool({
    connectionString: DATABASE_URL,
    ssl: PG_SSL === 'false' ? false : { rejectUnauthorized: false },
  });
  return pgPool;
}

const storage = {
  async getTrades(userId) {
    if (STORAGE_BACKEND === 'memory') {
      return normalizeTrades(memoryStore.get(userId) || []);
    }

    if (STORAGE_BACKEND === 'github') {
      if (!GITHUB_TOKEN || !GITHUB_REPO) {
        throw new Error('Missing GITHUB_STORAGE_TOKEN / GITHUB_STORAGE_REPO for github backend.');
      }
      const { trades } = await getTradesGithub(userId);
      return trades;
    }

    const pool = await ensurePgPool();
    const { rows } = await pool.query(
      `SELECT payload
       FROM trade_records
       WHERE user_id = $1
       ORDER BY COALESCE((payload->>'no')::int, 0) ASC, updated_at ASC`,
      [userId],
    );
    return rows.map((row) => row.payload);
  },

  async createOrUpdateTrade(userId, trade) {
    if (STORAGE_BACKEND === 'memory') {
      memoryStore.set(userId, upsertInArray(memoryStore.get(userId) || [], trade));
      return;
    }

    if (STORAGE_BACKEND === 'github') {
      if (!GITHUB_TOKEN || !GITHUB_REPO) {
        throw new Error('Missing GITHUB_STORAGE_TOKEN / GITHUB_STORAGE_REPO for github backend.');
      }
      const { trades, sha } = await getTradesGithub(userId);
      const next = upsertInArray(trades, trade);
      await putTradesGithub(userId, next, sha);
      return;
    }

    const pool = await ensurePgPool();
    await pool.query(
      `INSERT INTO trade_records (user_id, id, payload, created_at, updated_at)
       VALUES ($1, $2, $3::jsonb, NOW(), NOW())
       ON CONFLICT (user_id, id)
       DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
      [userId, String(trade.id), JSON.stringify(trade)],
    );
  },

  async deleteTrade(userId, id) {
    if (STORAGE_BACKEND === 'memory') {
      const next = (memoryStore.get(userId) || []).filter((t) => String(t.id) !== String(id));
      memoryStore.set(userId, next);
      return;
    }

    if (STORAGE_BACKEND === 'github') {
      if (!GITHUB_TOKEN || !GITHUB_REPO) {
        throw new Error('Missing GITHUB_STORAGE_TOKEN / GITHUB_STORAGE_REPO for github backend.');
      }
      const { trades, sha } = await getTradesGithub(userId);
      const next = trades.filter((t) => String(t.id) !== String(id));
      await putTradesGithub(userId, next, sha);
      return;
    }

    const pool = await ensurePgPool();
    await pool.query('DELETE FROM trade_records WHERE user_id = $1 AND id = $2', [userId, id]);
  },

  async bulkUpsert(userId, trades) {
    if (STORAGE_BACKEND === 'memory') {
      let next = memoryStore.get(userId) || [];
      for (const trade of trades) next = upsertInArray(next, trade);
      memoryStore.set(userId, next);
      return;
    }

    if (STORAGE_BACKEND === 'github') {
      if (!GITHUB_TOKEN || !GITHUB_REPO) {
        throw new Error('Missing GITHUB_STORAGE_TOKEN / GITHUB_STORAGE_REPO for github backend.');
      }
      const { trades: current, sha } = await getTradesGithub(userId);
      let next = current;
      for (const trade of trades) next = upsertInArray(next, trade);
      await putTradesGithub(userId, next, sha);
      return;
    }

    const pool = await ensurePgPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const trade of trades) {
        await client.query(
          `INSERT INTO trade_records (user_id, id, payload, created_at, updated_at)
           VALUES ($1, $2, $3::jsonb, NOW(), NOW())
           ON CONFLICT (user_id, id)
           DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
          [userId, String(trade.id), JSON.stringify(trade)],
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },
};

const server = createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      return sendJson(res, 200, { ok: true });
    }

    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const path = url.pathname;

    if (req.method === 'GET' && path === '/api/health') {
      if (STORAGE_BACKEND === 'postgres') {
        const pool = await ensurePgPool();
        await pool.query('SELECT 1');
      }
      return sendJson(res, 200, { ok: true, storageBackend: STORAGE_BACKEND });
    }

    if (!path.startsWith('/api/')) {
      return sendJson(res, 404, { error: 'Not found' });
    }

    const userId = auth(req);
    if (!userId) return sendJson(res, 401, { error: 'Unauthorized' });

    if (req.method === 'GET' && path === '/api/trades') {
      const trades = await storage.getTrades(userId);
      return sendJson(res, 200, trades);
    }

    if (req.method === 'POST' && path === '/api/trades') {
      const body = await readJsonBody(req);
      const trade = body?.trade;
      const errorMessage = validateTradePayload(trade);
      if (errorMessage) return sendJson(res, 400, { error: errorMessage });
      await storage.createOrUpdateTrade(userId, trade);
      return sendJson(res, 201, { ok: true, id: trade.id });
    }

    if (req.method === 'PUT' && /^\/api\/trades\/[^/]+$/.test(path)) {
      const id = decodeURIComponent(path.split('/').pop() || '').trim();
      const body = await readJsonBody(req);
      const trade = body?.trade;
      const errorMessage = validateTradePayload(trade);
      if (errorMessage) return sendJson(res, 400, { error: errorMessage });
      if (String(trade.id) !== id) return sendJson(res, 400, { error: 'Trade id mismatch with URL parameter' });
      await storage.createOrUpdateTrade(userId, trade);
      return sendJson(res, 200, { ok: true, id: trade.id });
    }

    if (req.method === 'DELETE' && /^\/api\/trades\/[^/]+$/.test(path)) {
      const id = decodeURIComponent(path.split('/').pop() || '').trim();
      if (!id) return sendJson(res, 400, { error: 'Missing trade id' });
      await storage.deleteTrade(userId, id);
      return sendJson(res, 200, { ok: true, id });
    }

    if (req.method === 'POST' && path === '/api/trades/sync') {
      const body = await readJsonBody(req);
      const trades = Array.isArray(body?.trades) ? body.trades : null;
      if (!trades) return sendJson(res, 400, { error: 'Body must include trades array' });
      const validationError = trades.map((trade) => validateTradePayload(trade)).find(Boolean);
      if (validationError) return sendJson(res, 400, { error: validationError });
      await storage.bulkUpsert(userId, trades);
      return sendJson(res, 200, { ok: true, count: trades.length });
    }

    return sendJson(res, 404, { error: 'Not found' });
  } catch (error) {
    return sendJson(res, 500, { error: 'Server error', detail: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`DashTrade API listening on :${PORT} (storage=${STORAGE_BACKEND})`);
});
