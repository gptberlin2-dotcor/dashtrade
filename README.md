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

## Recent revisions

- Action values now use `Long` and `Short` (instead of Buy/Sell).
- Trade Journal action column is color-coded:
  - `Long` = green
  - `Short` = red
- Theme is configured as black chart-style background with geometric grid accents.


## Contribution note

Changes are delivered through fresh PRs when previous PR threads were updated outside Codex.
