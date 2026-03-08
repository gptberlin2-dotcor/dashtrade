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


## Rekomendasi setup pribadi (private, tidak publik)

Agar data input + upload gambar benar-benar tersimpan online dan bisa diakses dari mana saja untuk penggunaan pribadi, pakai arsitektur ini:

- Frontend statis (GitHub Pages / Netlify / Vercel static)
- API server private (Railway/Render/Fly.io/VPS)
- Database PostgreSQL terkelola (Neon/Supabase/Render Postgres)
- Token rahasia unik (wajib)

### Eksekusi cepat (jika Supabase sudah siap)

Kalau `DATABASE_URL` Supabase dan token sudah ada, jalankan langsung:

> **Penting:** data di tab **API Keys** Supabase (Project URL, Publishable Key, anon key) **tidak bisa langsung dipakai** untuk backend ini.
> Backend DashTrade butuh **Postgres connection string (URI)** dari menu **Database -> Connection string** + `AUTH_TOKEN` khusus DashTrade.

```bash
export DATABASE_URL='postgres://...'     # atau SUPABASE_DB_URL
export AUTH_TOKEN='token-rahasia-anda' # atau DASHTRADE_AUTH_TOKEN
export PG_SSL='true'
./scripts/run-supabase.sh
```


Contoh sesuai project kamu:

```bash
export DATABASE_URL='postgresql://postgres:[YOUR-PASSWORD]@db.yoymlprueduoraherkzs.supabase.co:5432/postgres'
./scripts/run-supabase.sh
```

Jika `AUTH_TOKEN` belum diset, script akan pakai default `dashtrade-dev-token`.
User default frontend: `my-personal-account` (bisa override lewat `DASHTRADE_USER_ID`).

Script ini akan:
- apply `docs/database/runtime-schema.sql`
- start API dengan `STORAGE_BACKEND=postgres`
- cek `GET /api/health`


### Jika masih gagal konek ke Supabase

Cek cepat:

```bash
psql "$DATABASE_URL" -c 'select now();'
```

Kalau gagal, biasanya salah satu ini:
- password DB salah
- URL bukan dari menu `Database -> Connection string`
- IP/network server diblokir
- SSL belum aktif (`PG_SSL='true'`)

### Checklist implementasi (praktis)

1. Buat database Postgres online lalu jalankan:

```bash
psql "$DATABASE_URL" -f docs/database/runtime-schema.sql
```

2. Deploy API server ini dengan env berikut:

```bash
AUTH_TOKEN='ganti-dengan-token-random-panjang'
STORAGE_BACKEND='postgres'
DATABASE_URL='postgres://user:pass@host:5432/dbname'
PG_SSL='true'
```

3. Di browser/device pribadi, set koneksi frontend:

```js
localStorage.setItem('dashtrade.apiBase', 'https://api-anda.example.com');
localStorage.setItem('dashtrade.apiToken', 'ganti-dengan-token-random-panjang');
localStorage.setItem('dashtrade.userId', 'akun-pribadi-saya');
```

4. Verifikasi dari device kedua:
   - login browser/device kedua
   - isi 1 trade + upload screenshot
   - refresh di device pertama
   - data harus muncul sama (berarti sync server aktif)

### Hardening minimal (wajib untuk private)

- Jangan commit `AUTH_TOKEN` / `DATABASE_URL` ke repo.
- Gunakan token panjang (>= 32 chars) dan rotasi berkala.
- Batasi CORS hanya domain frontend Anda (jangan `*`) bila sudah production.
- Aktifkan backup database otomatis harian.
- Monitor endpoint `GET /api/health` dari uptime monitor.

> Penting: mode `memory` hanya simulasi lokal. Untuk data online permanen lintas device, gunakan `postgres` (disarankan) atau `github` backend.
