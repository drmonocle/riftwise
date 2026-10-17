package main

import (
	"encoding/base64"
	"encoding/json"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"
)

const (
	maxSubs      = 50000
	maxTeams     = 200
	apiPrefix    = "/riftwise/api/push/"
	perIPPerMin  = 30
	testInterval = 20 * time.Second
)

// Push services browsers actually use. Anything else is refused, so the server can't be pointed at
// arbitrary addresses.
var pushHosts = []string{
	"fcm.googleapis.com",                // Chrome, Edge on Android, Samsung Internet
	"updates.push.services.mozilla.com", // Firefox
	".push.services.mozilla.com",
	".notify.windows.com", // Edge on Windows
	"web.push.apple.com",  // Safari, iPhone home-screen apps
	".push.apple.com",
}

func allowedEndpoint(raw string) bool {
	if len(raw) > 1024 {
		return false
	}
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.User != nil || u.Port() != "" {
		return false
	}
	host := strings.ToLower(u.Hostname())
	for _, h := range pushHosts {
		if host == strings.TrimPrefix(h, ".") || (strings.HasPrefix(h, ".") && strings.HasSuffix(host, h)) {
			return true
		}
	}
	return false
}

func b64len(s string) int {
	s = strings.TrimRight(s, "=")
	if b, err := base64.RawURLEncoding.DecodeString(s); err == nil {
		return len(b)
	}
	if b, err := base64.RawStdEncoding.DecodeString(s); err == nil {
		return len(b)
	}
	return -1
}

var teamCode = regexp.MustCompile(`^[A-Z0-9][A-Z0-9 .\-]{0,11}$`)

type subRequest struct {
	Endpoint string `json:"endpoint"`
	Keys     struct {
		P256dh string `json:"p256dh"`
		Auth   string `json:"auth"`
	} `json:"keys"`
	Teams   []string `json:"teams"`
	Lang    string   `json:"lang"`
	Kickoff *bool    `json:"kickoff"`
	Pregame *bool    `json:"pregame"`
	Banger  *bool    `json:"banger"`
}

type limiter struct {
	mu    sync.Mutex
	hits  map[string][]time.Time
	tests map[string]time.Time
}

func (l *limiter) allow(ip string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	keep := l.hits[ip][:0]
	for _, t := range l.hits[ip] {
		if now.Sub(t) < time.Minute {
			keep = append(keep, t)
		}
	}
	if len(keep) >= perIPPerMin {
		l.hits[ip] = keep
		return false
	}
	l.hits[ip] = append(keep, now)
	if len(l.hits) > 10000 { // forget everyone now and then
		l.hits = map[string][]time.Time{}
	}
	return true
}

func (l *limiter) allowTest(endpoint string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	if t, ok := l.tests[endpoint]; ok && time.Since(t) < testInterval {
		return false
	}
	l.tests[endpoint] = time.Now()
	return true
}

func clientIP(r *http.Request) string {
	if ip := r.Header.Get("CF-Connecting-IP"); ip != "" {
		return ip
	}
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		return strings.TrimSpace(strings.Split(xff, ",")[0])
	}
	host, _, _ := net.SplitHostPort(r.RemoteAddr)
	return host
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func (a *App) serveHTTP(addr string) error {
	lim := &limiter{hits: map[string][]time.Time{}, tests: map[string]time.Time{}}
	mux := http.NewServeMux()

	mux.HandleFunc(apiPrefix+"key", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, 200, map[string]string{"publicKey": a.vapid.Public})
	})

	mux.HandleFunc(apiPrefix+"health", func(w http.ResponseWriter, r *http.Request) {
		a.mu.Lock()
		defer a.mu.Unlock()
		writeJSON(w, 200, map[string]any{
			"ok": a.lastErr == "" && time.Since(a.lastPoll) < 5*time.Minute, "version": version,
			"subscriptions": a.store.count(), "lastPoll": a.lastPoll.UTC().Format(time.RFC3339), "lastError": a.lastErr,
		})
	})

	// read decodes a small JSON body after the per-address limit.
	read := func(w http.ResponseWriter, r *http.Request, v any) bool {
		if r.Method != http.MethodPost {
			writeJSON(w, 405, map[string]string{"error": "POST only"})
			return false
		}
		if !lim.allow(clientIP(r)) {
			writeJSON(w, 429, map[string]string{"error": "too many requests"})
			return false
		}
		r.Body = http.MaxBytesReader(w, r.Body, 32<<10)
		if err := json.NewDecoder(r.Body).Decode(v); err != nil {
			writeJSON(w, 400, map[string]string{"error": "bad request"})
			return false
		}
		return true
	}

	mux.HandleFunc(apiPrefix+"subscribe", func(w http.ResponseWriter, r *http.Request) {
		var req subRequest
		if !read(w, r, &req) {
			return
		}
		if !allowedEndpoint(req.Endpoint) || b64len(req.Keys.P256dh) != 65 || b64len(req.Keys.Auth) != 16 {
			writeJSON(w, 400, map[string]string{"error": "not a browser push subscription"})
			return
		}
		if a.store.get(req.Endpoint) == nil && a.store.count() >= maxSubs {
			writeJSON(w, 503, map[string]string{"error": "full"})
			return
		}
		seen := map[string]bool{}
		teams := []string{}
		for _, t := range req.Teams {
			t = strings.ToUpper(strings.TrimSpace(t))
			if teamCode.MatchString(t) && !seen[t] && len(teams) < maxTeams {
				seen[t] = true
				teams = append(teams, t)
			}
		}
		lang := req.Lang
		if !langs[lang] {
			lang = "en"
		}
		on := func(b *bool) bool { return b == nil || *b }
		s := &Sub{Endpoint: req.Endpoint, P256dh: req.Keys.P256dh, Auth: req.Keys.Auth, Teams: teams, Lang: lang,
			Kickoff: on(req.Kickoff), Pregame: on(req.Pregame), Banger: on(req.Banger)}
		if err := a.store.upsert(s); err != nil {
			writeJSON(w, 500, map[string]string{"error": "could not save"})
			return
		}
		writeJSON(w, 200, map[string]any{"ok": true, "teams": len(teams)})
	})

	mux.HandleFunc(apiPrefix+"unsubscribe", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Endpoint string `json:"endpoint"`
		}
		if !read(w, r, &req) {
			return
		}
		writeJSON(w, 200, map[string]bool{"ok": true, "removed": a.store.remove(req.Endpoint)})
	})

	mux.HandleFunc(apiPrefix+"test", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Endpoint string `json:"endpoint"`
		}
		if !read(w, r, &req) {
			return
		}
		s := a.store.get(req.Endpoint)
		if s == nil {
			writeJSON(w, 404, map[string]string{"error": "not subscribed"})
			return
		}
		if !lim.allowTest(req.Endpoint) {
			writeJSON(w, 429, map[string]string{"error": "wait a moment"})
			return
		}
		sent := a.sendTo([]Sub{*s}, 300, a.testPayload)
		writeJSON(w, 200, map[string]bool{"ok": sent == 1})
	})

	srv := &http.Server{
		Addr: addr, Handler: mux,
		ReadHeaderTimeout: 10 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 30 * time.Second,
	}
	return srv.ListenAndServe()
}
