# Life Capital

Life Capital turns one week — 168 hours — into a simple personal dashboard.

## What it does

- Edit the same data from weekly totals or seven daily cards
- Keep both input views synchronized
- Judge investment rate of 20% or more
- Judge waste rate of 5% or less
- Judge sleep of 49 hours or more
- Show missing or excess time against 168 hours
- Save automatically in the current browser with localStorage
- Work on desktop and mobile without external services

Investment and waste rates always use 168 hours as the denominator.

## Run locally

Serve the dist directory with any static server. For example:

    python3 -m http.server 4173 -d dist

Then open http://localhost:4173.

## Verify

Node.js 22 or later is required.

    npm run verify

The verification suite covers threshold boundaries, weekly redistribution, daily editing, fixed-denominator rates, input normalization, hosting metadata, local asset references, local storage integration, and responsive CSS.

## Hosting

The existing ChatGPT Site project is bound in .openai/hosting.json. Keep its project_id unchanged so future updates reuse the same Life Capital Site.
