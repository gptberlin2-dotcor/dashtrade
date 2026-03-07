# DashTrade

Trading journal dashboard (vanilla HTML/CSS/JS) with Dashboard, Start Trade, Trade Journal, and Tools.

## Run frontend only (localStorage)

```bash
python3 -m http.server 4173
```

Open `http://localhost:4173`.

## Cloud database sync (akses dari mana saja)

App sekarang bisa sync ke API + PostgreSQL agar data trade & upload gambar tetap ada lintas device.

### 1) Siapkan database PostgreSQL

Jalankan schema runtime:

```bash
psql "$DATABASE_URL" -f docs/database/runtime-schema.sql
```

### 2) Jalankan API server

```bash
npm install
DATABASE_URL='postgres://user:pass@host:5432/dbname' AUTH_TOKEN='super-secret-token' npm start
```

Server jalan di `http://localhost:8787`.

### 3) Hubungkan frontend ke API

Set global URL sebelum `app.js` atau lewat console/browser storage:

```js
localStorage.setItem('dashtrade.apiBase', 'https://your-api-domain.com');
localStorage.setItem('dashtrade.apiToken', 'super-secret-token');
localStorage.setItem('dashtrade.userId', 'my-personal-account');
```

Lalu refresh halaman. App akan:
- load data dari `GET /api/trades` (auth Bearer token)
- autosync upsert saat data berubah ke `POST /api/trades/sync`
- data dipisahkan per `userId` via header `X-User-Id`

> Catatan: screenshot yang diupload tetap tersimpan karena ikut terserialisasi di payload trade.
