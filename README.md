# DashTrade

Trading journal dashboard (vanilla HTML/CSS/JS) with Dashboard, Start Trade, Trade Journal, and Tools.

## Run frontend only (localStorage)

```bash
python3 -m http.server 4173
```

Open `http://localhost:4173`.

## Cloud sync (akses dari mana saja)

Agar data trade + file upload tidak hilang saat buka dari device lain, **jangan hanya pakai localStorage**. Jalankan API server dan hubungkan frontend ke API yang sama.

### 1) Jalankan API server (mode simulasi lokal cepat)

Tidak perlu install dependency tambahan:

```bash
AUTH_TOKEN='super-secret-token' STORAGE_BACKEND='memory' npm start
```

Server jalan di `http://localhost:8787`.

> Catatan: mode `memory` hanya untuk simulasi/dev. Data hilang jika server restart.

### 2) Mode produksi (persisten lintas restart/device)

Gunakan salah satu backend persisten di bawah:

- `STORAGE_BACKEND=postgres` (disarankan)
- `STORAGE_BACKEND=github` (simpan JSON ke repo GitHub)

#### Opsi PostgreSQL

Jalankan schema runtime:

```bash
psql "$DATABASE_URL" -f docs/database/runtime-schema.sql
```

Lalu start server:

```bash
npm install
AUTH_TOKEN='super-secret-token' STORAGE_BACKEND='postgres' DATABASE_URL='postgres://user:pass@host:5432/dbname' npm start
```

### 3) Hubungkan frontend ke API

Set global URL sebelum `app.js` atau lewat console/browser storage:

```js
localStorage.setItem('dashtrade.apiBase', 'https://your-api-domain.com');
localStorage.setItem('dashtrade.apiToken', 'super-secret-token');
localStorage.setItem('dashtrade.userId', 'my-personal-account');
```

Lalu refresh halaman. App akan:
- load data dari `GET /api/trades` (auth Bearer token)
- sync incremental per-trade (`POST/PUT/DELETE /api/trades`)
- bulk upsert fallback via `POST /api/trades/sync`
- data dipisahkan per `userId` via header `X-User-Id`

> Catatan: screenshot yang diupload tetap tersimpan karena ikut terserialisasi di payload trade.


### Opsi storage: simpan ke folder di GitHub repo (tanpa local DB)

Jika Anda ingin data masuk ke folder `storage/` di GitHub repo (bukan PostgreSQL), jalankan API dengan mode `github`.

```bash
AUTH_TOKEN='super-secret-token' STORAGE_BACKEND='github' GITHUB_STORAGE_TOKEN='ghp_xxx' GITHUB_STORAGE_REPO='username/repo' GITHUB_STORAGE_BRANCH='main' GITHUB_STORAGE_PATH_PREFIX='storage' npm start
```

Setiap user akan disimpan sebagai file JSON:
- `storage/<userId>.json`

Ini membuat data trade + screenshot payload bisa diakses lintas device selama frontend mengarah ke API yang sama.
