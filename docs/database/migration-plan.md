# Migration Plan: localStorage -> PostgreSQL + Object Storage

Current app stores trades in browser localStorage (`dashtrade.trades.v1`).

## Goals
1. Keep existing UX unchanged.
2. Move data source from localStorage to API-backed DB.
3. Move screenshot storage from URL/base64 field to object storage + metadata table.

## Step-by-step

1. **Introduce backend read path**
   - Frontend tries `GET /api/v1/trades` first.
   - If API unavailable, fallback to localStorage for backward compatibility.

2. **Add one-time import flow**
   - Read local data from `dashtrade.trades.v1`.
   - Send batch to `POST /api/v1/trades/import-local`.
   - Backend maps payload into `trades`, `trade_psychology`, `trade_checklists`.

3. **Screenshot migration handling**
   - If screenshot is URL: store as `trade_images.public_url` directly.
   - If screenshot is base64: decode then upload to object storage; save metadata in `trade_images`.

4. **Switch writes to API**
   - Save/edit/delete now use incremental API endpoints (`POST/PUT/DELETE /api/trades`).
   - Keep `POST /api/trades/sync` as fallback bulk upsert path.
   - localStorage only as temporary cache/offline fallback.

5. **Finalize cutover**
   - Add flag `dashtrade.migration.done=true` in localStorage after successful import.
   - Optional cleanup script to remove old local key after X days.

## Data mapping

- `trade.id` -> `trades.id`
- `trade.no` -> `trades.trade_no`
- `trade.date` -> `trades.trade_date`
- `trade.pair` -> `trades.pair`
- `trade.action` -> `trades.action`
- `trade.tf` -> `trades.tf`
- `trade.setupType` -> `trades.setup_type`
- `trade.marketContext` -> `trades.market_context`
- `trade.entry/sl/tp/rr/leverage` -> numeric cols
- `trade.result/pnl/winLoss/notes` -> `trades`
- `trade.psychology.*` -> `trade_psychology`
- `trade.checklist.*` -> `trade_checklists`
- `trade.screenshot` -> `trade_images` rows

## Operational notes
- Keep DB transactions per trade to avoid partial inserts.
- Enforce validation on API to prevent malformed imports.
- Add monitoring for image upload failures.
