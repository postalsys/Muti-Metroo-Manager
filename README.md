# Muti Metroo Manager

Web-based management UI for Muti Metroo mesh networks. Provides a real-time SVG metro-map topology view, monitoring, remote shell access, file transfer, route management, mesh testing, and sleep/wake cluster control.

## Features

- **Topology Map** — Interactive SVG metro-style network visualization with role indicators, path highlighting, and reachability coloring
- **Monitoring** — Dashboard stats (peers, streams, routes, exit nodes, SOCKS5, exit handler) with 5s polling
- **Remote Shell** — xterm.js terminal to any agent via WebSocket binary protocol
- **File Transfer** — Upload/download files to/from agents
- **Route Management** — View, add, and remove dynamic routes; view static routes
- **Mesh Test** — On-demand or auto-polling (60s) reachability test across all agents
- **Sleep/Wake** — Cluster-wide sleep and wake control (when enabled)
- **Agent Panel** — Slide-in detail panel per agent: info, routes, shell, files tabs

## Quick Start

**Prerequisites:** Go 1.25+, Node.js 18+, npm

```bash
make build
./build/metroo-manager -agent http://<agent-host>:8080
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Configuration

| Flag | Default | Description |
|------|---------|-------------|
| `-addr` | `:3000` | HTTP listen address |
| `-agent` | `http://127.0.0.1:8080` | Muti Metroo agent URL to proxy to |
| `-version` | — | Print version and exit |

## Development

Run the Go backend and Vite dev server in separate terminals:

```bash
# Terminal 1 — Go backend
go run ./cmd/manager -addr :3000 -agent http://<agent-host>:8080

# Terminal 2 — Vite dev server (hot reload)
cd frontend && npm install && npm run dev
```

The Vite dev server runs on [http://localhost:5173](http://localhost:5173) and proxies `/api/proxy/*` requests to the Go backend at `localhost:3000`.

## Project Structure

```
cmd/manager/            Go entrypoint, CLI flag parsing, graceful shutdown
internal/
  server/               HTTP server, routing, CORS middleware
  proxy/                Reverse proxy to agent (HTTP + WebSocket relay)
  webui/                Embedded SPA (go:embed), content-type mapping, SPA fallback
frontend/
  src/
    api/                API client functions, TypeScript types
    components/
      MetroMap/         SVG topology: layout algorithm, stations, connections, tooltips
      AgentPanel/       Slide-in panel: info, routes, shell, files tabs
      Header.tsx        Brand, mesh test trigger, sleep/wake controls
      Footer.tsx        Footer bar
      StatsPanel.tsx    Dashboard stat cards
      RouteTable.tsx    Route table with path highlighting
      ForwardRouteTable.tsx  Port-forward route table
    styles/             CSS files (global, metro, components, panel)
  vite.config.ts        Build output → internal/webui/dist, dev proxy config
Makefile                build, build-frontend, build-go, dev, clean targets
```

## Architecture

**Go backend** — Minimal reverse proxy that sits between the browser and a Muti Metroo agent. All `/api/proxy/*` requests are stripped of the prefix and forwarded to the agent (HTTP and WebSocket). The Vite-built frontend is embedded into the binary via `go:embed` and served with SPA fallback. Single external dependency: `gorilla/websocket`.

**React frontend** — Single-page app built with React 19, TypeScript, and Vite. No routing library — the UI is a single view with a metro map, stats panel, route tables, and a slide-in agent detail panel. State is managed with React hooks (`useState`, `useRef`, `useEffect` polling). The shell tab uses xterm.js with a custom binary WebSocket protocol for PTY communication.
