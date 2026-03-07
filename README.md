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
DATABASE_URL='postgres://user:pass@host:5432/dbname' npm start
```

Server jalan di `http://localhost:8787`.

### 3) Hubungkan frontend ke API

Set global URL sebelum `app.js` atau lewat console/browser storage:

```js
localStorage.setItem('dashtrade.apiBase', 'https://your-api-domain.com');
```

Lalu refresh halaman. App akan:
- load data dari `GET /api/trades`
- autosync saat data berubah ke `POST /api/trades/sync`

> Catatan: screenshot yang diupload tetap tersimpan karena ikut terserialisasi di payload trade.
