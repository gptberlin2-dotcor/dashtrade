# DashTrade API Contract (Current Runtime)

Base path: `/api`

## Authentication

Protected endpoints require headers:

- `Authorization: Bearer <AUTH_TOKEN>`
- `X-User-Id: <your-user-id>` (optional, defaults to `default`)

## Health

### `GET /health`

Response:

```json
{ "ok": true }
```

## Trades

### `GET /trades`

Returns all trades for the authenticated user.

Response:

```json
[
  {
    "id": "uuid",
    "no": 1,
    "date": "2026-03-06",
    "pair": "BTCUSDT"
  }
]
```

### `POST /trades`

Create/upsert one trade.

Request:

```json
{
  "trade": {
    "id": "uuid",
    "date": "2026-03-06",
    "pair": "BTCUSDT"
  }
}
```

Response:

```json
{ "ok": true, "id": "uuid" }
```

### `PUT /trades/:id`

Update one trade (id in body must match `:id`).

Request:

```json
{
  "trade": {
    "id": "uuid",
    "date": "2026-03-06",
    "pair": "BTCUSDT"
  }
}
```

Response:

```json
{ "ok": true, "id": "uuid" }
```

### `DELETE /trades/:id`

Delete one trade by id for current user.

Response:

```json
{ "ok": true, "id": "uuid" }
```

### `POST /trades/sync`

Backward-compatible bulk upsert endpoint.

Request:

```json
{
  "trades": [
    {
      "id": "uuid",
      "date": "2026-03-06",
      "pair": "BTCUSDT"
    }
  ]
}
```

Response:

```json
{ "ok": true, "count": 1 }
```
