package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/postalsys/muti-metroo-manager/internal/server"
)

var Version = "dev"

func main() {
	addr := flag.String("addr", ":3000", "listen address")
	agent := flag.String("agent", "http://127.0.0.1:8080", "Muti Metroo agent URL")
	agentToken := flag.String("agent-token", "", "bearer token for agent API authentication")
	version := flag.Bool("version", false, "print version and exit")
	flag.Parse()

	if *version {
		fmt.Println("metroo-manager", Version)
		os.Exit(0)
	}

	// Fall back to env var if flag not set
	token := *agentToken
	if token == "" {
		token = os.Getenv("MUTI_METROO_TOKEN")
	}

	srv := server.New(*addr, *agent, token)

	go func() {
		authInfo := ""
		if token != "" {
			authInfo = " (authenticated)"
		}
		log.Printf("metroo-manager %s listening on %s (agent: %s)%s", Version, *addr, *agent, authInfo)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("shutting down")
}
