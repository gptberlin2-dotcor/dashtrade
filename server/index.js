import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import pg from 'pg';

const { Pool } = pg;

const PORT = Number(process.env.PORT || 8787);
const DATABASE_URL = process.env.DATABASE_URL;
const AUTH_TOKEN = String(process.env.AUTH_TOKEN || '').trim();

if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL environment variable.');
  process.exit(1);
}

if (!AUTH_TOKEN) {
  console.error('Missing AUTH_TOKEN environment variable.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.PG_SSL === 'false' ? false : { rejectUnauthorized: false },
});

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

async function upsertTrade(client, userId, trade) {
  await client.query(
    `INSERT INTO trade_records (user_id, id, payload, created_at, updated_at)
     VALUES ($1, $2, $3::jsonb, NOW(), NOW())
     ON CONFLICT (user_id, id)
     DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
    [userId, String(trade.id), JSON.stringify(trade)],
  );
}

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/trades', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT payload
       FROM trade_records
       WHERE user_id = $1
       ORDER BY COALESCE((payload->>'no')::int, 0) ASC, updated_at ASC`,
      [req.userId],
    );
    res.json(rows.map((row) => row.payload));
  } catch (error) {
    res.status(500).json({ error: 'Failed to load trades', detail: error.message });
  }
});

app.post('/api/trades', authMiddleware, async (req, res) => {
  const trade = req.body?.trade;
  const errorMessage = validateTradePayload(trade);
  if (errorMessage) return res.status(400).json({ error: errorMessage });

  const client = await pool.connect();
  try {
    await upsertTrade(client, req.userId, trade);
    return res.status(201).json({ ok: true, id: trade.id });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to save trade', detail: error.message });
  } finally {
    client.release();
  }
});

app.put('/api/trades/:id', authMiddleware, async (req, res) => {
  const trade = req.body?.trade;
  const paramId = String(req.params.id || '').trim();
  const errorMessage = validateTradePayload(trade);
  if (errorMessage) return res.status(400).json({ error: errorMessage });
  if (String(trade.id) !== paramId) return res.status(400).json({ error: 'Trade id mismatch with URL parameter' });

  const client = await pool.connect();
  try {
    await upsertTrade(client, req.userId, trade);
    return res.json({ ok: true, id: trade.id });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to update trade', detail: error.message });
  } finally {
    client.release();
  }
});

app.delete('/api/trades/:id', authMiddleware, async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ error: 'Missing trade id' });

  try {
    await pool.query('DELETE FROM trade_records WHERE user_id = $1 AND id = $2', [req.userId, id]);
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

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const trade of trades) {
      await upsertTrade(client, req.userId, trade);
    }
    await client.query('COMMIT');
    return res.json({ ok: true, count: trades.length });
  } catch (error) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: 'Failed to sync trades', detail: error.message });
  } finally {
    client.release();
  }
});

app.listen(PORT, () => {
  console.log(`DashTrade API listening on :${PORT}`);
});
