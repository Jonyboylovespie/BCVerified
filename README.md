# Bracket Verified

A daily nested-clue game with account progress and immutable, server-verified share links.

## Run locally

```sh
npm install
npm start
```

Open `http://localhost:3000`. Set `SESSION_SECRET` before deploying, and set `PUBLIC_URL` to the public HTTPS origin so iMessage crawlers receive absolute preview URLs.

## Daily puzzles

Original puzzle templates live in `data/puzzles.json` and rotate automatically, so a dated puzzle is available each day. Add licensed/original templates using the same recursive shape. The app intentionally does not scrape or republish The Atlantic's copyrighted puzzle feed.

## Verified sharing

Scores are calculated only in `server.js`. A completion creates an immutable random ID under `/share/:id`; that page supplies Open Graph title, description, URL, and image metadata for link previews. Production must be reachable over public HTTPS for Messages to crawl it.
