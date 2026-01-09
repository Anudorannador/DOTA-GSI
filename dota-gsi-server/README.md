# dota-gsi-server (Rust)

Lightweight Dota 2 Game State Integration (GSI) HTTP receiver.

It accepts `POST /` payloads from Dota 2, performs auth + dedup, broadcasts to WebSocket clients, and optionally publishes the raw payload JSON to Redis Pub/Sub.

## Endpoints

- `POST /` ingest Dota 2 GSI payload (auth token check + dedup)
- `GET /state` returns the latest payload (if any)
- `GET /health` health check
- WebSocket:
  - `GET /ws/full` streams full payload JSON
  - `GET /ws/updates` streams `{added, previously}` deltas when present

## Quick Start

From this folder:

```bash
cargo run -- \
  --http-host 0.0.0.0 --http-port 3005 \
  --gsi-auth-token CHANGE_ME_TO_A_RANDOM_SECRET
```

Environment variables are supported as defaults (loaded from `.env` via `dotenvy`).

## Redis Publish (Optional)

Redis publish is OFF by default.

To enable it, provide `REDIS_URL` (supports username/password):

```bash
# Enable via env
REDIS_URL="redis://user:pass@localhost:6379" cargo run --

# Enable via CLI
cargo run -- --redis-url "redis://user:pass@localhost:6379"
```

By default the server publishes the raw payload JSON to `REDIS_CHANNEL` (default: `dota2:gsi:live`).

## Raw JSONL Logging (Optional)

Raw logging is OFF by default.

```bash
# Enable raw JSONL logging (rotates by size)
cargo run -- --raw-log
```

The output directory and rotation size can be configured via:

- `RAW_DATA_DIR` (default: `./raw`)
- `RAW_MAX_MB` (default: `100`)

## Configuration

All options can be provided via CLI flags or environment variables.

- `HTTP_HOST` (default: `0.0.0.0`)
- `HTTP_PORT` (default: `3005`)
- `GSI_AUTH_TOKEN` (default: `CHANGE_ME_TO_A_RANDOM_SECRET`)
- `SOURCE` (default: `win-gaming-pc`)
- `REDIS_URL` (optional; enables publish)
- `REDIS_CHANNEL` (default: `dota2:gsi:live`)
- `RAW_DATA_DIR` (default: `./raw`)
- `RAW_MAX_MB` (default: `100`)

If you use `.env`, see `.env` in this folder for a template.
