import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import pg from 'pg';

const { Pool } = pg;

const PORT = Number(process.env.PORT || 8787);
const DATABASE_URL = process.env.DATABASE_URL;
const AUTH_TOKEN = String(process.env.AUTH_TOKEN || '').trim();
const STORAGE_BACKEND = String(process.env.STORAGE_BACKEND || 'postgres').trim().toLowerCase();

const GITHUB_TOKEN = String(process.env.GITHUB_STORAGE_TOKEN || '').trim();
const GITHUB_REPO = String(process.env.GITHUB_STORAGE_REPO || '').trim(); // owner/repo
const GITHUB_BRANCH = String(process.env.GITHUB_STORAGE_BRANCH || 'main').trim();
const GITHUB_PATH_PREFIX = String(process.env.GITHUB_STORAGE_PATH_PREFIX || 'storage').trim();

if (!AUTH_TOKEN) {
  console.error('Missing AUTH_TOKEN environment variable.');
  process.exit(1);
}

if (STORAGE_BACKEND === 'postgres' && !DATABASE_URL) {
  console.error('Missing DATABASE_URL environment variable for postgres backend.');
  process.exit(1);
}

if (STORAGE_BACKEND === 'github') {
  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    console.error('Missing GITHUB_STORAGE_TOKEN / GITHUB_STORAGE_REPO for github backend.');
    process.exit(1);
  }
}

const pool = STORAGE_BACKEND === 'postgres'
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: process.env.PG_SSL === 'false' ? false : { rejectUnauthorized: false },
    })
  : null;

const app = express();
app.use(cors());
app.use(express.json({ limit: '25mb' }));

function authMiddleware(req, res, next) {
  const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!bearer || bearer !== AUTH_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  req.userId = String(req.headers['x-user-id'] || 'default').trim() || 'default';
  return next();
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

async function upsertTradePostgres(client, userId, trade) {
  await client.query(
    `INSERT INTO trade_records (user_id, id, payload, created_at, updated_at)
     VALUES ($1, $2, $3::jsonb, NOW(), NOW())
     ON CONFLICT (user_id, id)
     DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
    [userId, String(trade.id), JSON.stringify(trade)],
  );
}

async function getTradesPostgres(userId) {
  const { rows } = await pool.query(
    `SELECT payload
     FROM trade_records
     WHERE user_id = $1
     ORDER BY COALESCE((payload->>'no')::int, 0) ASC, updated_at ASC`,
    [userId],
  );
  return rows.map((row) => row.payload);
}

async function deleteTradePostgres(userId, id) {
  await pool.query('DELETE FROM trade_records WHERE user_id = $1 AND id = $2', [userId, id]);
}

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

const storage = {
  async getTrades(userId) {
    if (STORAGE_BACKEND === 'github') {
      const { trades } = await getTradesGithub(userId);
      return trades;
    }
    return getTradesPostgres(userId);
  },

  async createOrUpdateTrade(userId, trade) {
    if (STORAGE_BACKEND === 'github') {
      const { trades, sha } = await getTradesGithub(userId);
      const next = upsertInArray(trades, trade);
      await putTradesGithub(userId, next, sha);
      return;
    }

    const client = await pool.connect();
    try {
      await upsertTradePostgres(client, userId, trade);
    } finally {
      client.release();
    }
  },

  async deleteTrade(userId, id) {
    if (STORAGE_BACKEND === 'github') {
      const { trades, sha } = await getTradesGithub(userId);
      const next = trades.filter((t) => String(t.id) !== String(id));
      await putTradesGithub(userId, next, sha);
      return;
    }

    await deleteTradePostgres(userId, id);
  },

  async bulkUpsert(userId, trades) {
    if (STORAGE_BACKEND === 'github') {
      const { trades: current, sha } = await getTradesGithub(userId);
      let next = current;
      for (const trade of trades) next = upsertInArray(next, trade);
      await putTradesGithub(userId, next, sha);
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const trade of trades) {
        await upsertTradePostgres(client, userId, trade);
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

app.get('/api/health', async (_req, res) => {
  try {
    if (STORAGE_BACKEND === 'postgres') await pool.query('SELECT 1');
    res.json({ ok: true, storageBackend: STORAGE_BACKEND });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/trades', authMiddleware, async (req, res) => {
  try {
    const trades = await storage.getTrades(req.userId);
    res.json(trades);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load trades', detail: error.message });
  }
});

app.post('/api/trades', authMiddleware, async (req, res) => {
  const trade = req.body?.trade;
  const errorMessage = validateTradePayload(trade);
  if (errorMessage) return res.status(400).json({ error: errorMessage });

  try {
    await storage.createOrUpdateTrade(req.userId, trade);
    return res.status(201).json({ ok: true, id: trade.id });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to save trade', detail: error.message });
  }
});

app.put('/api/trades/:id', authMiddleware, async (req, res) => {
  const trade = req.body?.trade;
  const paramId = String(req.params.id || '').trim();
  const errorMessage = validateTradePayload(trade);
  if (errorMessage) return res.status(400).json({ error: errorMessage });
  if (String(trade.id) !== paramId) return res.status(400).json({ error: 'Trade id mismatch with URL parameter' });

  try {
    await storage.createOrUpdateTrade(req.userId, trade);
    return res.json({ ok: true, id: trade.id });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to update trade', detail: error.message });
  }
});

app.delete('/api/trades/:id', authMiddleware, async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ error: 'Missing trade id' });

  try {
    await storage.deleteTrade(req.userId, id);
    return res.json({ ok: true, id });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to delete trade', detail: error.message });
  }
});

// Backward compatibility endpoint for bulk sync/import.
app.post('/api/trades/sync', authMiddleware, async (req, res) => {
  const trades = Array.isArray(req.body?.trades) ? req.body.trades : null;
  if (!trades) {
    return res.status(400).json({ error: 'Body must include trades array' });
  }

  const validationError = trades
    .map((trade) => validateTradePayload(trade))
    .find((errorMessage) => errorMessage);
  if (validationError) return res.status(400).json({ error: validationError });

  try {
    await storage.bulkUpsert(req.userId, trades);
    return res.json({ ok: true, count: trades.length });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to sync trades', detail: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`DashTrade API listening on :${PORT} (storage=${STORAGE_BACKEND})`);
});
