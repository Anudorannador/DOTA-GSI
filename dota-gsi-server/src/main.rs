use std::{
    collections::BTreeMap,
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
    sync::{broadcast, mpsc, RwLock},
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

    #[arg(long, env = "GSI_AUTH_TOKEN", default_value = "CHANGE_ME_TO_A_RANDOM_SECRET")]
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
    redis_client: Option<redis::Client>,
}

fn now_ts_server_ms() -> i64 {
    (OffsetDateTime::now_utc().unix_timestamp_nanos() / 1_000_000) as i64
}

fn utc_date_dir(root: &Path) -> PathBuf {
    let date = OffsetDateTime::now_utc().date();
    root.join(format!("{:04}-{:02}-{:02}", date.year(), date.month() as u8, date.day()))
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

fn canonicalize_json(value: &Value) -> Value {
    match value {
        Value::Object(map) => {
            let obj = map
                .iter()
                .map(|(k, v)| (k.clone(), canonicalize_json(v)))
                .collect::<BTreeMap<String, Value>>()
                .into_iter()
                .collect::<serde_json::Map<String, Value>>();
            Value::Object(obj)
        }
        Value::Array(arr) => Value::Array(
            arr.iter().map(canonicalize_json).collect()
        ),
        _ => value.clone(),
    }
}

fn hash_payload(payload: &Value) -> anyhow::Result<[u8; 32]> {
    let canonical = canonicalize_json(payload);
    let bytes = serde_json::to_vec(&canonical).context("serialize canonical payload")?;
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

async fn redis_publish_payload(state: &AppState, payload_json: &str) {
    let Some(client) = &state.redis_client else {
        return;
    };

    match client.get_multiplexed_async_connection().await {
        Ok(conn) => {
            let mut conn: redis::aio::MultiplexedConnection = conn;
            let res: redis::RedisResult<i64> = conn
                .publish(&state.cfg.redis_channel, payload_json)
                .await;
            if let Err(e) = res {
                warn!("redis publish failed: {e}");
            }
        }
        Err(e) => {
            warn!("redis connect failed: {e}");
        }
    }
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

        loop {
            let Some(envelope) = rx.recv().await else {
                break;
            };

            // Ensure dir exists
            if let Some(parent) = current_path.parent() {
                if let Err(e) = tokio::fs::create_dir_all(parent).await {
                    error!("raw log mkdir failed: {e}");
                    continue;
                }
            }

            let line = match serde_json::to_string(&envelope) {
                Ok(s) => s,
                Err(e) => {
                    error!("raw log serialize failed: {e}");
                    continue;
                }
            };

            // Rotate before writing if needed (avoid overshoot too much)
            let projected = bytes_written.saturating_add(line.len() as u64 + 1);
            if bytes_written > 0 && projected >= max_bytes {
                part = part.saturating_add(1);
                current_path = with_part_suffix(&base_path, part);
                bytes_written = 0;
            }

            match tokio::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(&current_path)
                .await
            {
                Ok(mut f) => {
                    if let Err(e) = f.write_all(line.as_bytes()).await {
                        error!("raw log write failed: {e}");
                        continue;
                    }
                    if let Err(e) = f.write_all(b"\n").await {
                        error!("raw log write failed: {e}");
                        continue;
                    }
                    bytes_written = bytes_written.saturating_add(line.len() as u64 + 1);
                }
                Err(e) => {
                    error!("raw log open failed: {e}");
                    continue;
                }
            }
        }
    });

    Ok(tx)
}

async fn ingest(State(state): State<AppState>, Json(payload): Json<Value>) -> impl IntoResponse {
    // Inner returns Result so the outer layer can map errors to status codes uniformly.
    async fn process_payload(state: &AppState, payload: &Value) -> Result<&'static str, &'static str> {
        match extract_auth_token(payload) {
            Some(token) if token == state.cfg.gsi_auth_token => {}
            Some(token) => {
                warn!("invalid token: {token}");
                return Err("Unauthorized");
            }
            None => return Err("Unauthorized"),
        }

        let payload_hash = hash_payload(payload).map_err(|e| {
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
            inner.current_payload = Some(payload.clone());
        }

        let payload_json = serde_json::to_string(payload).map_err(|e| {
            error!("serialize payload failed: {e}");
            "Bad payload"
        })?;

        redis_publish_payload(state, &payload_json).await;

        if let Some(tx) = &state.raw_log_tx {
            let envelope = build_envelope(payload.clone(), &state.cfg.source);
            if let Err(e) = tx.try_send(envelope) {
                warn!("raw log queue full: {e}");
            }
        }

        // Broadcast the full snapshot, plus the added/previously delta when present.
        let _ = state.full_tx.send(payload_json);
        if let Some(delta) = extract_updates(payload) {
            if let Ok(delta_json) = serde_json::to_string(&delta) {
                let _ = state.updates_tx.send(delta_json);
            }
        }

        info!("GSI update processed");
        Ok("processed")
    }

    match process_payload(&state, &payload).await {
        Ok(_) => (StatusCode::OK, "processed"),
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
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info".into()),
        )
        .init();

    let cfg = Config::parse();

    let redis_client = cfg
        .redis_url
        .as_deref()
        .and_then(|url| match redis::Client::open(url) {
            Ok(c) => Some(c),
            Err(e) => {
                warn!("redis client init failed: {e}");
                None
            }
        });

    let raw_log_tx = if cfg.raw_log {
        Some(
            spawn_raw_logger(&cfg)
                .await
                .context("spawn raw logger")?,
        )
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
        redis_client,
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

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .context("bind")?;

    axum::serve(listener, app).await.context("serve")?;
    Ok(())
}
