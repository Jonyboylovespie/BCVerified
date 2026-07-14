# Bracket Verified

A daily nested-clue game with account progress and immutable, server-verified share links.

## Run locally

```sh
npm install
cp .env.example .env
npm start
```

The server loads configuration from `.env`; existing environment variables take precedence. Open `http://localhost:3000`. Set a unique `SESSION_SECRET` before deploying, and set `PUBLIC_URL` to the public HTTPS origin so iMessage crawlers receive absolute preview URLs.

`NODE_ENV` may be `development` or `production`. Generate a secure session secret with:

```sh
openssl rand -hex 32
```

## Daily puzzles

The server imports Bracket City's public dated puzzle JSON at startup and once an hour. Beginning July 14, 2026, each puzzle is cached under the gitignored `data/puzzles/YYYY-MM-DD.json` directory. Earlier archive dates are neither fetched nor saved. Dates use the `America/New_York` calendar so a puzzle is never filed under the wrong UTC day.

Set `BRACKET_CITY_PUZZLE_URL` to override the upstream puzzle directory for mirrors, or `PUZZLE_START_DATE` to change the earliest allowed date. The importer validates the date and bracket/solution structure before atomically storing a file. Deployments need outbound HTTPS access and a persistent, writable `data/puzzles` directory if imported files must survive restarts.

## Verified sharing

Scores are calculated only in `server.js`. A completion creates an immutable random ID under `/share/:id`; that page supplies Open Graph title, description, URL, and image metadata for link previews. Production must be reachable over public HTTPS for Messages to crawl it.
