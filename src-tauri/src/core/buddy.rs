use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::os::windows::process::CommandExt;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, Runtime, command};
use tiny_http::{Method, Response, Server};

// ─── Data structures ─────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BuddyConfig {
    pub network_name: String,
    pub network_secret: String,
    pub peer_uri: String,
    pub nickname: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TodayStats {
    pub key_presses: u64,
    pub mouse_clicks: u64,
    pub active_sec: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PeerInfo {
    pub nickname: String,
    pub virtual_ip: String,
    pub online: bool,
    pub today: TodayStats,
    pub first_seen_at: u64,
    pub last_seen_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BuddyStatus {
    pub connected: bool,
    pub virtual_ip: Option<String>,
    pub nickname: String,
    pub peers: Vec<PeerInfo>,
}

// ─── Internal state ──────────────────────────────────────────────

pub(crate) struct InnerState {
    config: Option<BuddyConfig>,
    easytier_child: Option<Child>,
    http_shutdown: Arc<AtomicBool>,
    http_running: bool,
    virtual_ip: Option<String>,
    peers: HashMap<String, PeerInfo>,
    own_stats: TodayStats,
}

pub struct BuddyState(pub Arc<Mutex<InnerState>>);

impl BuddyState {
    pub fn new() -> Self {
        Self(Arc::new(Mutex::new(InnerState {
            config: None,
            easytier_child: None,
            http_shutdown: Arc::new(AtomicBool::new(false)),
            http_running: false,
            virtual_ip: None,
            peers: HashMap::new(),
            own_stats: TodayStats {
                key_presses: 0,
                mouse_clicks: 0,
                active_sec: 0,
            },
        })))
    }
}

// ─── Constants ───────────────────────────────────────────────────

const HTTP_PORT: u16 = 3722;
const RPC_DISCOVERY_RETRIES: u32 = 10;
const RPC_DISCOVERY_DELAY_MS: u64 = 1000;
// A peer is considered offline if we haven't heard from it in this many seconds.
const ONLINE_TIMEOUT_SECS: u64 = 15;

// ─── Helper: current unix timestamp in seconds ────────────────────

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

// ─── Helper: write EasyTier TOML config ─────────────────────────

fn write_easytier_config(config: &BuddyConfig, config_path: &str) -> String {
    let toml = format!(
        r#"hostname = "{}"
instance_name = "bongocat"
dhcp = true
listeners = []
rpc_portal = "127.0.0.1:15888"

[network_identity]
network_name = "{}"
network_secret = "{}"

[[peer]]
uri = "{}"
"#,
        config.nickname, config.network_name, config.network_secret, config.peer_uri
    );
    fs::write(config_path, &toml).expect("Failed to write EasyTier config");
    toml
}

// ─── Helper: kill only easytier-core processes launched with our config file ───

fn kill_easytier_by_config_path(config_path: &str) {
    let safe_path = config_path.replace("'", "''");
    let ps = format!(
        "Get-CimInstance Win32_Process -Filter \"Name='easytier-core.exe'\" | Where-Object {{ $_.CommandLine -like '*{}*' }} | ForEach-Object {{ Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }}",
        safe_path
    );
    let _ = Command::new("powershell.exe")
        .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &ps])
        .creation_flags(0x08000000) // CREATE_NO_WINDOW
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .output();
}

// ─── Helper: get easytier binary path ────────────────────────────

fn get_easytier_path() -> String {
    find_binary("easytier-core.exe")
}

fn get_easytier_cli_path() -> String {
    find_binary("easytier-cli.exe")
}

fn find_binary(name: &str) -> String {
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_default();

    let candidates = [
        exe_dir.join(name),
        exe_dir.join("resources").join(name),
        std::path::PathBuf::from(name),
    ];

    for path in &candidates {
        if path.exists() {
            return path.to_string_lossy().to_string();
        }
    }

    name.to_string()
}

// ─── Helper: run easytier-cli with JSON output ────────────────────

fn run_cli(args: &[&str]) -> Result<serde_json::Value, String> {
    let cli_path = get_easytier_cli_path();
    let output = Command::new(&cli_path)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .creation_flags(0x08000000) // CREATE_NO_WINDOW
        .output()
        .map_err(|e| format!("Failed to run easytier-cli ({}): {}", cli_path, e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("easytier-cli failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    serde_json::from_str(&stdout).map_err(|e| {
        format!(
            "CLI parse failed: {} — raw: {}",
            e,
            &stdout.chars().take(200).collect::<String>()
        )
    })
}

// ─── Helper: discover own virtual IP via CLI ──────────────────────

fn discover_own_virtual_ip() -> Result<String, String> {
    for _ in 0..RPC_DISCOVERY_RETRIES {
        if let Ok(val) = run_cli(&["-o", "json", "node"]) {
            if let Some(ip) = val.get("ipv4_addr").and_then(|v| v.as_str()) {
                let ip = ip.split('/').next().unwrap_or(ip);
                return Ok(ip.to_string());
            }
        }
        thread::sleep(Duration::from_millis(RPC_DISCOVERY_DELAY_MS));
    }
    Err("Failed to discover virtual IP".into())
}

// ─── Helper: discover peers via CLI ───────────────────────────────

fn discover_peers_via_cli() -> Result<Vec<(String, String)>, String> {
    let val = run_cli(&["-o", "json", "peer"])?;
    let peers = val
        .as_array()
        .ok_or("CLI peer output is not an array")?;

    let mut seen_hostnames = std::collections::HashSet::new();
    let mut result = Vec::new();
    for peer in peers {
        let cost = peer.get("cost").and_then(|v| v.as_str()).unwrap_or("");
        // Skip self
        if cost == "Local" {
            continue;
        }
        let ip = peer.get("ipv4").and_then(|v| v.as_str()).unwrap_or("");
        if ip.is_empty() {
            continue;
        }
        let hostname = peer
            .get("hostname")
            .and_then(|v| v.as_str())
            .unwrap_or(ip)
            .to_string();
        // Deduplicate by hostname; a peer may appear with both virtual and relay IPs.
        if !seen_hostnames.insert(hostname.clone()) {
            continue;
        }
        result.push((ip.to_string(), hostname));
    }
    Ok(result)
}

// ─── HTTP server ─────────────────────────────────────────────────

fn start_http_server<R: Runtime>(
    app_handle: AppHandle<R>,
    shutdown: Arc<AtomicBool>,
    state: Arc<Mutex<InnerState>>,
) {
    thread::spawn(move || {
        let addr = format!("0.0.0.0:{}", HTTP_PORT);
        let server = {
            let mut server = None;
            for i in 0..10 {
                match Server::http(&addr) {
                    Ok(s) => {
                        server = Some(s);
                        break;
                    }
                    Err(e) if i < 9 => {
                        eprintln!("HTTP server bind retry {}: {}", i + 1, e);
                        thread::sleep(Duration::from_secs(2));
                    }
                    Err(e) => {
                        let _ = app_handle.emit("buddy:error", format!("HTTP server failed: {}", e));
                        return;
                    }
                }
            }
            server.unwrap()
        };

        if let Ok(mut inner) = state.lock() {
            inner.http_running = true;
        }

        loop {
            if shutdown.load(Ordering::SeqCst) {
                break;
            }

            match server.recv_timeout(Duration::from_secs(1)) {
                Ok(Some(mut request)) => {
                    match (request.method(), request.url()) {
                        (&Method::Post, "/api/push") => {
                            let mut body = String::new();
                            if request.as_reader().read_to_string(&mut body).is_ok() {
                                if let Ok(push_data) =
                                    serde_json::from_str::<serde_json::Value>(&body)
                                {
                                    let sender_ip = push_data.get("virtual_ip").and_then(|v| v.as_str()).map(|s| s.to_string());
                                    if let Ok(mut inner) = state.lock() {
                                        if let (Some(ip), Some(nick), Some(today)) = (
                                            push_data.get("virtual_ip").and_then(|v| v.as_str()),
                                            push_data.get("nickname").and_then(|v| v.as_str()),
                                            push_data.get("today"),
                                        ) {
                                            let stats = TodayStats {
                                                key_presses: today.get("key_presses").and_then(|v| v.as_u64()).unwrap_or(0),
                                                mouse_clicks: today.get("mouse_clicks").and_then(|v| v.as_u64()).unwrap_or(0),
                                                active_sec: today.get("active_sec").and_then(|v| v.as_u64()).unwrap_or(0),
                                            };
                                            let now = now_secs();
                                            let entry = inner.peers.entry(ip.to_string()).or_insert_with(|| PeerInfo {
                                                nickname: nick.to_string(),
                                                virtual_ip: ip.to_string(),
                                                online: true,
                                                today: stats.clone(),
                                                first_seen_at: now,
                                                last_seen_at: now,
                                            });
                                            entry.nickname = nick.to_string();
                                            entry.online = true;
                                            entry.last_seen_at = now;
                                            entry.today = stats;
                                        }
                                    }
                                    let _ = app_handle.emit("buddy:peer-push", push_data);

                                    // ── Reply with our own stats so the sender updates immediately ──
                                    if let Some(ip) = sender_ip {
                                        let (nickname, virtual_ip, own_stats) = {
                                            if let Ok(inner) = state.lock() {
                                                (
                                                    inner.config.as_ref().map(|c| c.nickname.clone()).unwrap_or_default(),
                                                    inner.virtual_ip.clone().unwrap_or_default(),
                                                    inner.own_stats.clone(),
                                                )
                                            } else {
                                                (String::new(), String::new(), TodayStats { key_presses: 0, mouse_clicks: 0, active_sec: 0 })
                                            }
                                        };
                                        if !virtual_ip.is_empty() {
                                            let reply = serde_json::json!({
                                                "nickname": nickname,
                                                "virtual_ip": virtual_ip,
                                                "today": {
                                                    "key_presses": own_stats.key_presses,
                                                    "mouse_clicks": own_stats.mouse_clicks,
                                                    "active_sec": own_stats.active_sec,
                                                }
                                            });
                                            let url = format!("http://{}:{}/api/push", ip, HTTP_PORT);
                                            let _ = ureq::post(&url)
                                                .timeout(Duration::from_secs(3))
                                                .set("Content-Type", "application/json")
                                                .send_string(&reply.to_string());
                                        }
                                    }
                                }
                            }
                            let _ = request.respond(Response::from_string("ok"));
                        }
                        (&Method::Get, "/api/hello") => {
                            let nickname = state.lock()
                                .ok()
                                .and_then(|inner| inner.config.as_ref().map(|c| c.nickname.clone()))
                                .unwrap_or_default();
                            let resp = serde_json::json!({
                                "nickname": nickname,
                                "service": "bongocat",
                            });
                            let _ = request.respond(Response::from_string(
                                serde_json::to_string(&resp).unwrap_or_default(),
                            ));
                        }
                        _ => {
                            let _ =
                                request.respond(Response::from_string("not found").with_status_code(404));
                        }
                    }
                }
                Ok(None) => continue,
                Err(_) => break,
            }
        }

        if let Ok(mut inner) = state.lock() {
            inner.http_running = false;
        }
    });
}

// ─── Tauri commands ──────────────────────────────────────────────

#[command]
pub async fn start_buddy<R: Runtime>(
    app_handle: AppHandle<R>,
    state: tauri::State<'_, BuddyState>,
    config: BuddyConfig,
) -> Result<(), String> {
    let mut inner = state.0.lock().map_err(|e| e.to_string())?;

    if config.network_name.is_empty()
        || config.network_secret.is_empty()
        || config.peer_uri.is_empty()
        || config.nickname.is_empty()
    {
        return Err("All config fields are required".into());
    }

    let config_dir = app_handle
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?;
    fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    let config_path = config_dir.join("easytier.toml");

    write_easytier_config(&config, &config_path.to_string_lossy());

    kill_easytier_by_config_path(&config_path.to_string_lossy());

    let easytier_path = get_easytier_path();
    let child = Command::new(&easytier_path)
        .args(["-c", &config_path.to_string_lossy(), "-r", "127.0.0.1:15888"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(0x08000000) // CREATE_NO_WINDOW
        .spawn()
        .map_err(|e| format!("Failed to start EasyTier: {} (path: {})", e, easytier_path))?;

    inner.easytier_child = Some(child);
    inner.config = Some(config.clone());

    let virtual_ip = discover_own_virtual_ip()?;
    inner.virtual_ip = Some(virtual_ip.clone());

    // Start HTTP server once per app session. It keeps listening across reconnects
    // so the port is never released and rebound.
    if !inner.http_running {
        let shutdown = inner.http_shutdown.clone();
        shutdown.store(false, Ordering::SeqCst);
        start_http_server(app_handle.clone(), shutdown, state.0.clone());
    }

    let status = make_status(&inner);
    let _ = app_handle.emit("buddy:status-changed", status);

    Ok(())
}

#[command]
pub async fn stop_buddy<R: Runtime>(
    app_handle: AppHandle<R>,
    state: tauri::State<'_, BuddyState>,
) -> Result<(), String> {
    let mut inner = state.0.lock().map_err(|e| e.to_string())?;

    // Do NOT stop the HTTP server; keep the port bound across reconnects.

    if let Some(ref mut child) = inner.easytier_child {
        let _ = child.kill();
        let _ = child.wait();
    }

    inner.easytier_child = None;
    inner.config = None;
    inner.virtual_ip = None;
    inner.own_stats = TodayStats {
        key_presses: 0,
        mouse_clicks: 0,
        active_sec: 0,
    };
    // Keep peers so they remain in the friend list when reconnecting.

    let status = make_status(&inner);
    let _ = app_handle.emit("buddy:status-changed", status);

    Ok(())
}

#[command]
pub async fn push_stats<R: Runtime>(
    app_handle: AppHandle<R>,
    state: tauri::State<'_, BuddyState>,
    stats: TodayStats,
) -> Result<(), String> {
    // ── 1. Update own stats and build a short-lived snapshot for outbound pushes ──
    let (virtual_ip, nickname, peer_targets) = {
        let mut inner = state.0.lock().map_err(|e| e.to_string())?;

        inner.own_stats = stats.clone();

        let virtual_ip = match &inner.virtual_ip {
            Some(ip) => ip.clone(),
            None => return Err("Not connected".into()),
        };

        let nickname = match &inner.config {
            Some(c) => c.nickname.clone(),
            None => return Err("Not connected".into()),
        };

        let now = now_secs();

        // Mark known peers offline if we haven't heard from them recently.
        for peer in inner.peers.values_mut() {
            if now.saturating_sub(peer.last_seen_at) > ONLINE_TIMEOUT_SECS {
                peer.online = false;
            }
        }

        let peers_found = discover_peers_via_cli().unwrap_or_default();
        let peer_targets: Vec<String> = peers_found
            .into_iter()
            .filter(|(ip, _)| ip != &virtual_ip)
            .map(|(ip, _)| ip)
            .collect();

        (virtual_ip, nickname, peer_targets)
    }; // lock released here before any network I/O

    // ── 2. Push to peers without holding the lock (prevents deadlock with inbound replies) ──
    let push_body = serde_json::json!({
        "nickname": nickname,
        "virtual_ip": virtual_ip,
        "today": {
            "key_presses": stats.key_presses,
            "mouse_clicks": stats.mouse_clicks,
            "active_sec": stats.active_sec,
        }
    });
    let body_str = push_body.to_string();

    let mut reachable: Vec<String> = Vec::new();
    for peer_ip in &peer_targets {
        let url = format!("http://{}:{}/api/push", peer_ip, HTTP_PORT);
        if ureq::post(&url)
            .timeout(Duration::from_secs(3))
            .set("Content-Type", "application/json")
            .send_string(&body_str)
            .is_ok()
        {
            reachable.push(peer_ip.clone());
        }
    }

    // ── 3. Update online status for known peers that were reachable ──
    let mut inner = state.0.lock().map_err(|e| e.to_string())?;
    let now = now_secs();
    for peer_ip in reachable {
        if let Some(existing) = inner.peers.get_mut(&peer_ip) {
            existing.online = true;
            existing.last_seen_at = now;
        }
    }

    let status = make_status(&inner);
    let _ = app_handle.emit("buddy:peers-updated", status.peers.clone());

    Ok(())
}

#[command]
pub async fn get_buddy_status(
    state: tauri::State<'_, BuddyState>,
) -> Result<BuddyStatus, String> {
    let mut inner = state.0.lock().map_err(|e| e.to_string())?;
    // Refresh online flags before returning.
    let now = now_secs();
    for peer in inner.peers.values_mut() {
        if now.saturating_sub(peer.last_seen_at) > ONLINE_TIMEOUT_SECS {
            peer.online = false;
        }
    }
    Ok(make_status(&inner))
}

#[command]
pub async fn remove_buddy_peer<R: Runtime>(
    app_handle: AppHandle<R>,
    state: tauri::State<'_, BuddyState>,
    virtual_ip: String,
) -> Result<(), String> {
    let mut inner = state.0.lock().map_err(|e| e.to_string())?;
    inner.peers.remove(&virtual_ip);
    let status = make_status(&inner);
    let _ = app_handle.emit("buddy:peers-updated", status.peers.clone());
    Ok(())
}

// ─── Helper: build status snapshot ────────────────────────────────

fn make_status(inner: &InnerState) -> BuddyStatus {
    let mut peers: Vec<PeerInfo> = inner.peers.values().cloned().collect();
    // Most recently seen first, then by first seen.
    peers.sort_by(|a, b| b.last_seen_at.cmp(&a.last_seen_at).then_with(|| a.first_seen_at.cmp(&b.first_seen_at)));
    BuddyStatus {
        connected: inner.virtual_ip.is_some(),
        virtual_ip: inner.virtual_ip.clone(),
        nickname: inner
            .config
            .as_ref()
            .map(|c| c.nickname.clone())
            .unwrap_or_default(),
        peers,
    }
}
