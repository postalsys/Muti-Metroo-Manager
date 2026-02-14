package webui

import (
	"io"
	"io/fs"
	"net/http"
	"path"
	"strings"
)

// Handler returns an http.Handler that serves the embedded Vite build output.
// It falls back to index.html for SPA client-side routing.
func Handler() http.Handler {
	content, err := fs.Sub(distFS, "dist")
	if err != nil {
		panic("failed to access embedded dist files: " + err.Error())
	}
	return &fileHandler{fs: content}
}

type fileHandler struct {
	fs fs.FS
}

func (h *fileHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	urlPath := path.Clean(r.URL.Path)
	if urlPath == "" || urlPath == "/" {
		urlPath = "index.html"
	} else {
		urlPath = strings.TrimPrefix(urlPath, "/")
	}

	f, err := h.fs.Open(urlPath)
	if err != nil {
		// SPA fallback: serve index.html for any path not found
		h.serveIndex(w, r)
		return
	}
	defer f.Close()

	stat, err := f.Stat()
	if err != nil {
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	if stat.IsDir() {
		indexPath := path.Join(urlPath, "index.html")
		indexFile, err := h.fs.Open(indexPath)
		if err != nil {
			h.serveIndex(w, r)
			return
		}
		defer indexFile.Close()
		f = indexFile
	}

	if ct := contentType(urlPath); ct != "" {
		w.Header().Set("Content-Type", ct)
	}

	content, err := io.ReadAll(f)
	if err != nil {
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	w.Write(content)
}

func (h *fileHandler) serveIndex(w http.ResponseWriter, r *http.Request) {
	f, err := h.fs.Open("index.html")
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer f.Close()

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	content, _ := io.ReadAll(f)
	w.WriteHeader(http.StatusOK)
	w.Write(content)
}

func contentType(filePath string) string {
	switch {
	case strings.HasSuffix(filePath, ".html"):
		return "text/html; charset=utf-8"
	case strings.HasSuffix(filePath, ".css"):
		return "text/css; charset=utf-8"
	case strings.HasSuffix(filePath, ".js"):
		return "application/javascript; charset=utf-8"
	case strings.HasSuffix(filePath, ".json"):
		return "application/json; charset=utf-8"
	case strings.HasSuffix(filePath, ".svg"):
		return "image/svg+xml"
	case strings.HasSuffix(filePath, ".png"):
		return "image/png"
	case strings.HasSuffix(filePath, ".ico"):
		return "image/x-icon"
	case strings.HasSuffix(filePath, ".woff2"):
		return "font/woff2"
	case strings.HasSuffix(filePath, ".woff"):
		return "font/woff"
	default:
		return ""
	}
}
