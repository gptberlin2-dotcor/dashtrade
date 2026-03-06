# DashTrade

Trading Journal Dashboard frontend app (vanilla HTML/CSS/JS) with 4 sections:

- Dashboard
- Start Trade
- Trade Journal
- Tools

## Run

Open `index.html` directly in a browser, or run a static server:

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

## Database planning (execution docs)

Database design and migration artifacts are available in:

- `docs/database/schema.sql` (PostgreSQL schema)
- `docs/database/api-contract.md` (API payload/endpoint draft)
- `docs/database/migration-plan.md` (localStorage to DB migration steps)
