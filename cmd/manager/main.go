package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/coinstash/muti-metroo-manager/internal/server"
)

var Version = "dev"

func main() {
	addr := flag.String("addr", ":3000", "listen address")
	agent := flag.String("agent", "http://127.0.0.1:8080", "Muti Metroo agent URL")
	version := flag.Bool("version", false, "print version and exit")
	flag.Parse()

	if *version {
		fmt.Println("metroo-manager", Version)
		os.Exit(0)
	}

	srv := server.New(*addr, *agent)

	go func() {
		log.Printf("metroo-manager %s listening on %s (agent: %s)", Version, *addr, *agent)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("shutting down")
}
