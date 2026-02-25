package server

import (
	"net/http"

	"github.com/postalsys/muti-metroo-manager/internal/proxy"
	"github.com/postalsys/muti-metroo-manager/internal/webui"
)

// New creates an HTTP server that serves the embedded frontend and proxies
// API requests to the Muti Metroo agent.
func New(addr, agentURL string) *http.Server {
	mux := http.NewServeMux()
	p := proxy.New(agentURL)

	// Proxy API routes to the agent
	mux.Handle("/api/proxy/", p)

	// Serve embedded frontend for everything else
	mux.Handle("/", webui.Handler())

	return &http.Server{
		Addr:    addr,
		Handler: corsMiddleware(mux),
	}
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Upgrade, Connection")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}
