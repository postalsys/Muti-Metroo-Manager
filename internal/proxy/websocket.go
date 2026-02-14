package proxy

import (
	"net/http"
	"strings"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

// handleWebSocket upgrades the client connection and dials the agent WebSocket,
// then relays binary/text frames bidirectionally.
func (p *Proxy) handleWebSocket(w http.ResponseWriter, r *http.Request, agentPath string) {
	// Build agent ws:// URL
	agentWS := strings.Replace(p.agentURL, "http://", "ws://", 1)
	agentWS = strings.Replace(agentWS, "https://", "wss://", 1)
	targetURL := agentWS + agentPath
	if r.URL.RawQuery != "" {
		targetURL += "?" + r.URL.RawQuery
	}

	// Dial agent
	dialer := websocket.Dialer{
		TLSClientConfig: p.client.Transport.(*http.Transport).TLSClientConfig,
	}
	agentConn, _, err := dialer.Dial(targetURL, nil)
	if err != nil {
		http.Error(w, "failed to connect to agent websocket: "+err.Error(), http.StatusBadGateway)
		return
	}
	defer agentConn.Close()

	// Upgrade client connection
	clientConn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer clientConn.Close()

	done := make(chan struct{})

	// Agent → Client
	go func() {
		defer close(done)
		for {
			msgType, msg, err := agentConn.ReadMessage()
			if err != nil {
				return
			}
			if err := clientConn.WriteMessage(msgType, msg); err != nil {
				return
			}
		}
	}()

	// Client → Agent
	for {
		msgType, msg, err := clientConn.ReadMessage()
		if err != nil {
			break
		}
		if err := agentConn.WriteMessage(msgType, msg); err != nil {
			break
		}
	}

	<-done
}
