# Muti Metroo Manager — Claude Code Instructions

## Muti Metroo (the agent)

**Source:** `../Muti-Metroo` (`github.com/postalsys/muti-metroo`)

Userspace mesh networking agent. Creates encrypted TCP tunnels over QUIC/HTTP2/WebSocket transports. Multi-hop routing with SOCKS5 ingress and CIDR-based exit routing. E2E encryption (X25519 + ChaCha20-Poly1305) — transit nodes can't decrypt payload.

### Agent Roles

- **Ingress** — SOCKS5 proxy entry point, looks up routes, opens streams to exit
- **Transit** — Relays frames between peers, can't decrypt payload
- **Exit** — Opens real TCP connections, advertises CIDR routes, handles DNS

### Key Concepts

- **Peers:** Long-lived connections via QUIC/H2/WS, auto-reconnect with backoff
- **Streams:** Multiplexed virtual connections (state machine: Opening→Open→HalfClosed→Closed)
- **Routes:** CIDR LPM + domain pattern matching, flood-propagated with hop-count TTL
- **Port forwarding:** ngrok-style endpoint (exit) + listener (ingress) keyed by routing key

### Agent HTTP API

The Manager proxies all of these via `/api/proxy/*`:

| Category | Endpoints |
|----------|-----------|
| Health | `/healthz`, `/ready` |
| Dashboard | `/api/topology`, `/api/dashboard`, `/api/mesh-test` |
| Remote | `/agents/{id}`, `/agents/{id}/shell` (WS), `/agents/{id}/file/upload`, `/agents/{id}/file/download`, `/agents/{id}/routes/manage` |
| Control | `/routes/advertise`, `/sleep`, `/wake`, `/sleep/status` |

### Agent Config (relevant to Manager)

| Config key | Notes |
|------------|-------|
| `http.address` (default `:8080`) | The URL the Manager's `-agent` flag points to |
| `shell.enabled` + `shell.whitelist` | Must be enabled for ShellTab |
| `file_transfer.enabled` + `file_transfer.allowed_paths` | Must be enabled for FilesTab |
| `exit.enabled` + `exit.routes` | Controls route advertisements |
| `socks5.enabled` + `socks5.address` | Shown in InfoTab |

## Build & Run

```bash
# Full build (frontend + Go binary)
make build

# Frontend only (outputs to internal/webui/dist/)
make build-frontend

# Go binary only (outputs to build/metroo-manager)
make build-go

# Dev mode — two terminals:
go run ./cmd/manager -addr :3000 -agent http://<agent>:8080
cd frontend && npm run dev   # Vite on :5173, proxies /api/proxy/* to :3000

# Clean all build artifacts
make clean
```

IMPORTANT: After frontend changes, you must rebuild **both** the frontend and the Go binary. The Go binary embeds `internal/webui/dist/` via `go:embed` — stale dist means stale UI.

## Project Structure

```
cmd/manager/main.go          Entrypoint: flags (-addr, -agent, -version), graceful shutdown
internal/server/server.go    HTTP server, routing (/api/proxy/* → proxy, /* → SPA)
internal/proxy/proxy.go      Reverse proxy: strips /api/proxy prefix, forwards to agent
internal/proxy/websocket.go  WebSocket relay (gorilla/websocket), bidirectional binary frames
internal/webui/embed.go      go:embed all:dist
internal/webui/webui.go      Static file server with SPA fallback (index.html for unknown paths)
frontend/src/App.tsx          Root component, polling state, agent panel management
frontend/src/api/client.ts    All API functions (getDashboard, getTopology, shell WS URL, etc.)
frontend/src/api/types.ts     TypeScript types + shell message constants
frontend/src/components/MetroMap/   SVG topology: BFS layout, stations, connections, tooltips
frontend/src/components/AgentPanel/ Slide-in panel: InfoTab, RoutesTab, ShellTab, FilesTab
frontend/vite.config.ts       Build → ../internal/webui/dist, dev proxy to :3000
```

## Key Conventions

### Proxy Pattern
All frontend API calls go to `/api/proxy/*`. The Go server strips the `/api/proxy` prefix and forwards to the agent URL. Two HTTP client timeouts: 30s (normal) and 30min (file upload/download paths).

### Polling Intervals
- Dashboard + topology: 5000ms (`POLL_INTERVAL`)
- Mesh test: 60000ms (`MESH_TEST_INTERVAL`)
- Sleep status: 10000ms (`SLEEP_POLL_INTERVAL`)

### State Management
Pure React hooks — no external state library. Agent capabilities are cached in a `useRef<Map>` to persist across re-renders without triggering them. Topology layout is memoized via content hash (`hashTopology()`).

### WebSocket Shell Protocol
Binary frames with 1-byte message type prefix:

| Type | Value | Direction | Payload |
|------|-------|-----------|---------|
| META | 0x01 | Client→Agent | JSON: `{"command":"sh","tty":{"rows":N,"cols":N,"term":"xterm-256color"}}` |
| ACK | 0x02 | Agent→Client | Shell ready |
| STDIN | 0x03 | Client→Agent | UTF-8 keystrokes |
| STDOUT | 0x04 | Agent→Client | Shell output |
| STDERR | 0x05 | Agent→Client | Shell output (stderr) |
| RESIZE | 0x06 | Client→Agent | 4 bytes: uint16 BE rows + uint16 BE cols |
| EXIT | 0x08 | Agent→Client | Shell process exited |
| ERROR | 0x09 | Agent→Client | JSON: `{"code":N,"message":"..."}` |

Error codes: `ERR_SHELL_DISABLED = 20`, `ERR_FILE_TRANSFER_DENIED = 12`.

## Shell Tab Gotchas

1. **xterm.css is required** — Without `import '@xterm/xterm/css/xterm.css'`, the DOM renderer shows garbage (`xterm-char-measure-element` visible). Always import it.
2. **Do NOT use CanvasAddon** — `@xterm/addon-canvas` v0.7.0 breaks cursor rendering with xterm v6.0.0. The DOM renderer works correctly.
3. **Echo loop prevention** — BusyBox PTYs echo terminal query responses back. Suppressed via CSI parser handlers for DSR (`n`), DA1 (`c`), DA2 (`>c`), and CPR (`R`). DSR responses are proxied back via `sendStdin()` for vi/ash cursor positioning. Belt-and-suspenders regex on `onData`: `/^\x1b\[[\?>]?[\d;]*[Rcn]$/`.

## Common Tasks

### Add a new API endpoint
1. Add the function in `frontend/src/api/client.ts`
2. Add any new types in `frontend/src/api/types.ts`
3. Call from the appropriate component — the Go proxy forwards everything under `/api/proxy/*` automatically

### Add a new AgentPanel tab
1. Create `frontend/src/components/AgentPanel/NewTab.tsx`
2. Add the tab button and content switch in `AgentPanel.tsx` (follows `info | routes | shell | files` pattern)
3. If the tab requires a capability check, add to `AgentCapabilities` type and check in the tab button's `disabled` prop

### Add a new stat card
1. Add the field to the `Stats` type in `types.ts`
2. Add a `<div className="stat-card">` in `StatsPanel.tsx`

### Modify the shell binary protocol
1. Update constants in `frontend/src/api/types.ts` (must match agent's `internal/shell/messages.go`)
2. Update handler logic in `ShellTab.tsx`
