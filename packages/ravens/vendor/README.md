# Vendored model catalog

`models-dev.json` is a full snapshot of the [models.dev](https://models.dev)
catalog — provider definitions plus per-model metadata (context/output limits,
capabilities, pricing). It is committed on purpose so that **builds and
deployments never need to reach models.dev**.

## How it is used

At image build time `script/generate.ts` compiles this file into
`src/provider/models-snapshot.js`, which the runtime imports directly. Startup
resolves the catalog in this order:

1. cache file on disk (`~/.cache/ravens/models.json`) — written by a refresh
2. **this snapshot, baked into the build** — the offline path
3. a network fetch from models.dev
4. an empty catalog

Because the snapshot is checked before any network access, an image built from
this repo serves the complete catalog with no outbound traffic. `docker-compose`
sets `RAVENS_DISABLE_MODELS_FETCH=1` so the runtime does not even schedule the
hourly refresh.

Providers you define yourself in `config.json` work regardless — they don't come
from this catalog. What the catalog adds is metadata for known providers, most
importantly the context limits that drive automatic compaction.

## Updating it

This is a maintenance step, not part of a build. On a machine with network
access:

```bash
cd packages/ravens
MODELS_DEV_REFRESH=1 bun run script/generate.ts
```

That fetches a fresh catalog, rewrites `models-dev.json`, and regenerates the
snapshot. Commit the updated JSON.

To build against a catalog from somewhere else without touching this file:

```bash
MODELS_DEV_API_JSON=/path/to/api.json bun run script/generate.ts
```
