use std::{
    net::SocketAddr,
    path::{Path, PathBuf},
    sync::Arc,
};

use anyhow::Context;
use axum::{
    extract::{ws::WebSocket, ws::WebSocketUpgrade, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use clap::Parser;
use redis::AsyncCommands;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};
use tokio::{
    io::AsyncWriteExt,
    sync::{broadcast, mpsc, Mutex, RwLock},
};
use tower_http::trace::TraceLayer;
use tracing::{debug, error, info, warn};

#[derive(Parser, Debug, Clone)]
#[command(name = "dota-gsi-server")]
struct Config {
    #[arg(long, env = "HTTP_HOST", default_value = "0.0.0.0")]
    http_host: String,

    #[arg(long, env = "HTTP_PORT", default_value_t = 3005)]
    http_port: u16,

    /// Must match gamestate_integration_*.cfg. The old public default is refused.
    #[arg(long, env = "GSI_AUTH_TOKEN")]
    gsi_auth_token: String,

    #[arg(long, env = "SOURCE", default_value = "win-gaming-pc")]
    source: String,

    // Redis publish is OFF by default. To enable, provide a Redis URL.
    // Examples:
    //   redis://localhost:6379
    //   redis://user:pass@localhost:6379
    //   rediss://user:pass@host:6380
    #[arg(long = "redis-url", alias = "REDIS_URL", env = "REDIS_URL")]
    redis_url: Option<String>,

    #[arg(long, env = "REDIS_CHANNEL", default_value = "dota2:gsi:live")]
    redis_channel: String,

    // Raw logging is OFF by default.
    #[arg(long)]
    raw_log: bool,

    #[arg(long, env = "RAW_DATA_DIR", default_value = "./raw")]
    raw_dir: PathBuf,

    #[arg(long)]
    raw_path: Option<PathBuf>,

    #[arg(long, env = "RAW_MAX_MB", default_value_t = 100)]
    raw_max_mb: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Envelope {
    ts_server_ms: i64,
    source: String,
    payload: Value,
}

#[derive(Debug, Default)]
struct AppStateInner {
    current_payload: Option<Value>,
    last_payload_hash: Option<[u8; 32]>,
}

#[derive(Clone)]
struct AppState {
    cfg: Config,
    inner: Arc<RwLock<AppStateInner>>,
    full_tx: broadcast::Sender<String>,
    updates_tx: broadcast::Sender<String>,
    raw_log_tx: Option<mpsc::Sender<Envelope>>,
    redis: Option<Arc<RedisPublisher>>,
}

fn now_ts_server_ms() -> i64 {
    (OffsetDateTime::now_utc().unix_timestamp_nanos() / 1_000_000) as i64
}

fn utc_date_dir(root: &Path) -> PathBuf {
    let date = OffsetDateTime::now_utc().date();
    root.join(format!(
        "{:04}-{:02}-{:02}",
        date.year(),
        date.month() as u8,
        date.day()
    ))
}

fn default_raw_base_path(raw_dir: &Path) -> anyhow::Result<PathBuf> {
    let ts = OffsetDateTime::now_utc().format(&Rfc3339)?;
    // Make filename FS-friendly: replace ':' with '-'
    let ts_fs = ts.replace(':', "-");
    let dir = utc_date_dir(raw_dir);
    Ok(dir.join(format!("dota2_gsi_{ts_fs}.jsonl")))
}

fn with_part_suffix(base_path: &Path, part: u32) -> PathBuf {
    let file_name = base_path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("dota2_gsi.jsonl");

    let (stem, ext) = file_name
        .rsplit_once('.')
        .map(|(s, e)| (s.to_string(), format!(".{e}")))
        .unwrap_or_else(|| (file_name.to_string(), ".jsonl".to_string()));

    let new_name = format!("{stem}_part{part:04}{ext}");
    base_path.with_file_name(new_name)
}

const PUBLIC_DEFAULT_TOKEN: &str = "CHANGE_ME_TO_A_RANDOM_SECRET";

fn token_is_refused(token: &str) -> bool {
    token.is_empty() || token == PUBLIC_DEFAULT_TOKEN || token == "YOUR_PRIVATE_TOKEN"
}

fn without_auth(payload: &Value) -> Value {
    let mut emit = payload.clone();
    if let Some(obj) = emit.as_object_mut() {
        obj.remove("auth");
    }
    emit
}

// shortcut: hash ignores provider.timestamp, added, and previously. Those three
// change on every Dota tick even when the snapshot did not. Clock and cooldowns
// stay in the hash, so the HUD still moves. A change that exists only inside
// the delta blocks is not forwarded.
fn hash_payload(payload: &Value) -> anyhow::Result<[u8; 32]> {
    let mut scrubbed = payload.clone();
    if let Some(obj) = scrubbed.as_object_mut() {
        obj.remove("added");
        obj.remove("previously");
        if let Some(provider) = obj.get_mut("provider").and_then(|v| v.as_object_mut()) {
            provider.remove("timestamp");
        }
    }
    // serde_json::Map is a BTreeMap unless preserve_order is on, so key order is stable.
    let bytes = serde_json::to_vec(&scrubbed).context("serialize payload")?;
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    let digest = hasher.finalize();
    let mut out = [0u8; 32];
    out.copy_from_slice(&digest);
    Ok(out)
}

fn build_envelope(payload: Value, source: &str) -> Envelope {
    Envelope {
        ts_server_ms: now_ts_server_ms(),
        source: source.to_string(),
        payload,
    }
}

fn extract_auth_token(payload: &Value) -> Option<&str> {
    payload
        .get("auth")
        .and_then(|v| v.get("token"))
        .and_then(|v| v.as_str())
}

fn extract_updates(payload: &Value) -> Option<Value> {
    let added = payload.get("added");
    let previously = payload.get("previously");
    if added.is_none() && previously.is_none() {
        return None;
    }

    let mut obj = serde_json::Map::new();
    if let Some(a) = added {
        obj.insert("added".to_string(), a.clone());
    }
    if let Some(p) = previously {
        obj.insert("previously".to_string(), p.clone());
    }
    Some(Value::Object(obj))
}

struct RedisPublisher {
    client: redis::Client,
    conn: Mutex<Option<redis::aio::MultiplexedConnection>>,
}

impl RedisPublisher {
    async fn publish(&self, channel: &str, payload: &str) {
        let mut guard = self.conn.lock().await;
        if guard.is_none() {
            match self.client.get_multiplexed_async_connection().await {
                Ok(conn) => *guard = Some(conn),
                Err(e) => {
                    warn!("redis connect failed: {e}");
                    return;
                }
            }
        }
        let Some(conn) = guard.as_mut() else {
            return;
        };
        let res: redis::RedisResult<i64> = conn.publish(channel, payload).await;
        if let Err(e) = res {
            warn!("redis publish failed: {e}");
            *guard = None;
        }
    }
}

async fn redis_publish_payload(state: &AppState, payload_json: &str) {
    let Some(redis) = &state.redis else {
        return;
    };
    redis.publish(&state.cfg.redis_channel, payload_json).await;
}

async fn spawn_raw_logger(cfg: &Config) -> anyhow::Result<mpsc::Sender<Envelope>> {
    let (tx, mut rx) = mpsc::channel::<Envelope>(1024);

    let max_bytes = cfg.raw_max_mb * 1024 * 1024;
    let base_path = if let Some(p) = &cfg.raw_path {
        p.clone()
    } else {
        default_raw_base_path(&cfg.raw_dir)?
    };

    tokio::spawn(async move {
        let mut part: u32 = 1;
        let mut current_path = with_part_suffix(&base_path, part);
        let mut bytes_written: u64 = 0;
        let mut file: Option<tokio::fs::File> = None;

        loop {
            let Some(envelope) = rx.recv().await else {
                break;
            };

            let line = match serde_json::to_string(&envelope) {
                Ok(s) => s,
                Err(e) => {
                    error!("raw log serialize failed: {e}");
                    continue;
                }
            };

            let projected = bytes_written.saturating_add(line.len() as u64 + 1);
            if bytes_written > 0 && projected >= max_bytes {
                part = part.saturating_add(1);
                current_path = with_part_suffix(&base_path, part);
                bytes_written = 0;
                file = None;
            }

            if file.is_none() {
                if let Some(parent) = current_path.parent() {
                    if let Err(e) = tokio::fs::create_dir_all(parent).await {
                        error!("raw log mkdir failed: {e}");
                        continue;
                    }
                }
                match tokio::fs::OpenOptions::new()
                    .create(true)
                    .append(true)
                    .open(&current_path)
                    .await
                {
                    Ok(opened) => file = Some(opened),
                    Err(e) => {
                        error!("raw log open failed: {e}");
                        continue;
                    }
                }
            }

            let Some(f) = file.as_mut() else {
                continue;
            };
            if let Err(e) = f.write_all(line.as_bytes()).await {
                error!("raw log write failed: {e}");
                file = None;
                continue;
            }
            if let Err(e) = f.write_all(b"\n").await {
                error!("raw log write failed: {e}");
                file = None;
                continue;
            }
            if let Err(e) = f.flush().await {
                error!("raw log flush failed: {e}");
                file = None;
                continue;
            }
            bytes_written = bytes_written.saturating_add(line.len() as u64 + 1);
        }
    });

    Ok(tx)
}

async fn ingest(State(state): State<AppState>, Json(payload): Json<Value>) -> impl IntoResponse {
    // Inner returns Result so the outer layer can map errors to status codes uniformly.
    async fn process_payload(
        state: &AppState,
        payload: &Value,
    ) -> Result<&'static str, &'static str> {
        match extract_auth_token(payload) {
            Some(token) if token == state.cfg.gsi_auth_token => {}
            Some(_) => {
                warn!("rejected gsi auth token");
                return Err("Unauthorized");
            }
            None => return Err("Unauthorized"),
        }

        // Readers of /state and the websockets never need the shared secret.
        let emit = without_auth(payload);
        let payload_hash = hash_payload(&emit).map_err(|e| {
            error!("hash failed: {e}");
            "Bad payload"
        })?;

        // Drop consecutive duplicates so consumers only see real state changes.
        {
            let mut inner = state.inner.write().await;
            if inner.last_payload_hash == Some(payload_hash) {
                debug!("duplicate payload");
                return Ok("duplicate");
            }
            inner.last_payload_hash = Some(payload_hash);
            inner.current_payload = Some(emit.clone());
        }

        let payload_json = serde_json::to_string(&emit).map_err(|e| {
            error!("serialize payload failed: {e}");
            "Bad payload"
        })?;

        redis_publish_payload(state, &payload_json).await;

        if let Some(tx) = &state.raw_log_tx {
            let envelope = build_envelope(emit.clone(), &state.cfg.source);
            if let Err(e) = tx.try_send(envelope) {
                warn!("raw log queue full: {e}");
            }
        }

        // Broadcast the full snapshot, plus the added/previously delta when present.
        let _ = state.full_tx.send(payload_json);
        if let Some(delta) = extract_updates(&emit) {
            if let Ok(delta_json) = serde_json::to_string(&delta) {
                let _ = state.updates_tx.send(delta_json);
            }
        }

        info!("GSI update processed");
        Ok("processed")
    }

    match process_payload(&state, &payload).await {
        Ok(msg) => (StatusCode::OK, msg),
        Err(msg) => {
            let code = if msg == "Unauthorized" {
                StatusCode::UNAUTHORIZED
            } else {
                StatusCode::BAD_REQUEST
            };
            (code, msg)
        }
    }
}

async fn health() -> impl IntoResponse {
    Json(serde_json::json!({"status":"ok","listener":"dota2-gsi"}))
}

async fn state_handler(State(state): State<AppState>) -> impl IntoResponse {
    let inner = state.inner.read().await;
    match &inner.current_payload {
        Some(p) => (StatusCode::OK, Json(p.clone())).into_response(),
        None => (StatusCode::NOT_FOUND, "No data yet").into_response(),
    }
}

async fn ws_full(ws: WebSocketUpgrade, State(state): State<AppState>) -> impl IntoResponse {
    ws.on_upgrade(move |socket| ws_full_task(socket, state))
}

async fn ws_full_task(mut socket: WebSocket, state: AppState) {
    // Send snapshot first if present
    if let Some(snapshot) = state.inner.read().await.current_payload.clone() {
        if let Ok(s) = serde_json::to_string(&snapshot) {
            if socket
                .send(axum::extract::ws::Message::Text(s.into()))
                .await
                .is_err()
            {
                return;
            }
        }
    }

    let mut rx = state.full_tx.subscribe();
    loop {
        match rx.recv().await {
            Ok(msg) => {
                if socket
                    .send(axum::extract::ws::Message::Text(msg.into()))
                    .await
                    .is_err()
                {
                    break;
                }
            }
            // shortcut: a client more than 1024 messages behind skips ahead with no resync.
            // At 10 posts/sec that is about 100s of stall; one local dashboard does not hit it.
            Err(broadcast::error::RecvError::Lagged(_)) => continue,
            Err(_) => break,
        }
    }
}

async fn ws_updates(ws: WebSocketUpgrade, State(state): State<AppState>) -> impl IntoResponse {
    ws.on_upgrade(move |socket| ws_updates_task(socket, state))
}

async fn ws_updates_task(mut socket: WebSocket, state: AppState) {
    let mut rx = state.updates_tx.subscribe();
    loop {
        match rx.recv().await {
            Ok(msg) => {
                if socket
                    .send(axum::extract::ws::Message::Text(msg.into()))
                    .await
                    .is_err()
                {
                    break;
                }
            }
            // shortcut: a client more than 1024 messages behind skips ahead with no resync.
            // At 10 posts/sec that is about 100s of stall; one local dashboard does not hit it.
            Err(broadcast::error::RecvError::Lagged(_)) => continue,
            Err(_) => break,
        }
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .init();

    let cfg = Config::parse();
    if token_is_refused(&cfg.gsi_auth_token) {
        anyhow::bail!(
            "Set GSI_AUTH_TOKEN to a private random string. The public default is refused."
        );
    }

    let redis = match cfg.redis_url.as_deref() {
        Some(url) => match redis::Client::open(url) {
            Ok(client) => Some(Arc::new(RedisPublisher {
                client,
                conn: Mutex::new(None),
            })),
            Err(e) => {
                warn!("redis client init failed: {e}");
                None
            }
        },
        None => None,
    };

    let raw_log_tx = if cfg.raw_log {
        Some(spawn_raw_logger(&cfg).await.context("spawn raw logger")?)
    } else {
        None
    };

    let (full_tx, _) = broadcast::channel::<String>(1024);
    let (updates_tx, _) = broadcast::channel::<String>(1024);

    let state = AppState {
        cfg: cfg.clone(),
        inner: Arc::new(RwLock::new(AppStateInner::default())),
        full_tx,
        updates_tx,
        raw_log_tx,
        redis,
    };

    let app = Router::new()
        .route("/", post(ingest))
        .route("/health", get(health))
        .route("/state", get(state_handler))
        .route("/ws/full", get(ws_full))
        .route("/ws/updates", get(ws_updates))
        .with_state(state)
        .layer(TraceLayer::new_for_http());

    let addr: SocketAddr = format!("{}:{}", cfg.http_host, cfg.http_port)
        .parse()
        .context("parse listen address")?;

    info!("Starting dota-gsi-server on {addr}");

    let listener = tokio::net::TcpListener::bind(addr).await.context("bind")?;

    axum::serve(listener, app).await.context("serve")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{hash_payload, without_auth};

    #[test]
    fn hash_ignores_timestamp_and_deltas() {
        let a = serde_json::json!({
            "provider": {"name": "Dota 2", "timestamp": 1},
            "previously": {"map": {"clock_time": 0}},
            "added": {"map": {"clock_time": 1}},
            "hero": {"health": 500},
            "map": {"clock_time": 10}
        });
        let b = serde_json::json!({
            "map": {"clock_time": 10},
            "hero": {"health": 500},
            "provider": {"timestamp": 99, "name": "Dota 2"},
            "previously": {"hero": {"health": 400}},
            "added": {}
        });
        assert_eq!(hash_payload(&a).unwrap(), hash_payload(&b).unwrap());

        let changed = serde_json::json!({
            "provider": {"name": "Dota 2", "timestamp": 1},
            "hero": {"health": 499},
            "map": {"clock_time": 10}
        });
        assert_ne!(hash_payload(&a).unwrap(), hash_payload(&changed).unwrap());
    }

    #[test]
    fn public_payload_drops_auth() {
        let value = serde_json::json!({
            "auth": {"token": "secret"},
            "map": {"clock_time": 1}
        });
        let public = without_auth(&value);
        assert!(public.get("auth").is_none());
        assert_eq!(public["map"]["clock_time"], 1);
    }
}
