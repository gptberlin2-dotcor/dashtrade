# DashTrade API Contract (Draft)

This contract mirrors the current frontend data shape and enables migrating from localStorage to backend persistence.

## Base
- `/api/v1`

## Trades

### `GET /trades`
Query params:
- `limit` (default: 20)
- `offset` (default: 0)
- `pair` (optional)
- `fromDate`, `toDate` (optional)

Response:
```json
{
  "items": [
    {
      "id": "uuid",
      "no": 1,
      "date": "2026-03-06",
      "pair": "BTC/USDT",
      "action": "Buy",
      "tf": "H1",
      "setupType": "Breakout",
      "marketContext": "...",
      "entry": 100,
      "sl": 95,
      "tp": 110,
      "rr": 2,
      "leverage": 5,
      "result": "Hit TP",
      "pnl": 10,
      "winLoss": "WIN",
      "screenshot": "https://...",
      "notes": "...",
      "psychology": {
        "emotion": "Calm",
        "confidence": 8,
        "discipline": "Follow plan"
      },
      "checklist": {
        "rsi": true,
        "macd": true,
        "structure": true,
        "supportResistance": true,
        "liquidity": false,
        "volume": true,
        "score": 5,
        "rating": "Strong setup"
      },
      "createdAt": "2026-03-06T10:00:00.000Z",
      "updatedAt": "2026-03-06T10:00:00.000Z"
    }
  ],
  "total": 1
}
```

### `POST /trades`
Create a trade with nested psychology/checklist payload.

### `PUT /trades/:id`
Update existing trade.

### `DELETE /trades/:id`
Delete trade and cascade related checklist/psychology/images.

## Trade Images

### `POST /trades/:id/images/presign`
Generate presigned upload target.

Request:
```json
{
  "filename": "btc-trade.png",
  "mimeType": "image/png"
}
```

Response:
```json
{
  "uploadUrl": "https://...",
  "storageKey": "trade-images/<trade-id>/btc-trade.png",
  "publicUrl": "https://cdn.example.com/trade-images/..."
}
```

### `POST /trades/:id/images/confirm`
Persist uploaded image metadata to `trade_images`.

Request:
```json
{
  "storageProvider": "s3",
  "storageBucket": "dashtrade-prod",
  "storageKey": "trade-images/<trade-id>/btc-trade.png",
  "publicUrl": "https://cdn.example.com/trade-images/...",
  "mimeType": "image/png",
  "sizeBytes": 243001
}
```

## Migration endpoint

### `POST /trades/import-local`
Bulk-import localStorage data (`dashtrade.trades.v1`) one time.
