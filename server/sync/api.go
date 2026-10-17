package main

import (
	"crypto/subtle"
	"encoding/json"
	"errors"
	"log"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

const apiPrefix = "/riftwise/api/sync/"

// Pages that may call the API from a browser: the website (and its local test server) and the Windows app.
var allowedOrigins = map[string]bool{
	"https://lolworlds.com": true, "https://www.lolworlds.com": true,
	"http://tauri.localhost": true, "https://tauri.localhost": true, "tauri://localhost": true,
	"http://localhost:4173": true, "http://localhost:4174": true, "http://localhost:1420": true,
}

type Server struct {
	st    *Store
	oauth *OAuth
	lim   *limiter
	links *links
}

func newServer(st *Store, o *OAuth) *Server {
	return &Server{st: st, oauth: o, lim: &limiter{hits: map[string][]time.Time{}}, links: &links{m: map[string]linkEntry{}}}
}

// links are one-time sign-in links (the QR code a signed-in device shows): each works once, for linkTTL, and only
// lives in memory (a restart just means making a new one).
const linkTTL = 10 * time.Minute

type linkEntry struct {
	account string
	created time.Time
}

type links struct {
	mu sync.Mutex
	m  map[string]linkEntry
}

func (l *links) add(account string) (string, bool) {
	l.mu.Lock()
	defer l.mu.Unlock()
	for k, e := range l.m {
		if time.Since(e.created) > linkTTL {
			delete(l.m, k)
		}
	}
	if len(l.m) > 20000 {
		return "", false
	}
	tok := randomToken(24)
	l.m[tokenHash(tok)] = linkEntry{account: account, created: time.Now()}
	return tok, true
}

// take hands a link's account over once (empty if unknown, used or too old).
func (l *links) take(tok string) string {
	l.mu.Lock()
	defer l.mu.Unlock()
	h := tokenHash(tok)
	e, ok := l.m[h]
	delete(l.m, h)
	if !ok || time.Since(e.created) > linkTTL {
		return ""
	}
	return e.account
}

// limiter counts attempts per key (an address, a username, an account) in a sliding window, in memory only.
type limiter struct {
	mu   sync.Mutex
	hits map[string][]time.Time
}

func (l *limiter) allow(key string, n int, window time.Duration) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	keep := l.hits[key][:0]
	for _, t := range l.hits[key] {
		if now.Sub(t) < window {
			keep = append(keep, t)
		}
	}
	if len(keep) >= n {
		l.hits[key] = keep
		return false
	}
	l.hits[key] = append(keep, now)
	if len(l.hits) > 50000 { // forget everyone now and then
		l.hits = map[string][]time.Time{}
	}
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

func reply(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func fail(w http.ResponseWriter, code int, why string) { reply(w, code, map[string]string{"error": why}) }

func bearer(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if strings.HasPrefix(h, "Bearer ") {
		return strings.TrimSpace(h[7:])
	}
	return ""
}

// summary is what the app shows about an account (never hashes).
func summary(a *Account) map[string]any {
	return map[string]any{
		"username": a.Username, "hasPassword": a.PassHash != "", "hasRecovery": a.Recovery != "", "hasCode": a.CodeHash != "",
		"discord": a.DiscordName, "hasDiscord": a.Discord != "", "twitch": a.TwitchName, "hasTwitch": a.Twitch != "",
		"created": a.Created.Format(time.RFC3339),
	}
}

// ways counts how an account can be signed into (removing the last one would lock the person out).
func ways(a *Account) int {
	n := 0
	for _, ok := range []bool{a.PassHash != "", a.CodeHash != "", a.Discord != "", a.Twitch != ""} {
		if ok {
			n++
		}
	}
	return n
}

func recoveryHash(code string) string { return codeHash("recovery:" + code) }

func (s *Server) listen(addr string) error {
	srv := &http.Server{
		Addr: addr, Handler: s.routes(),
		ReadHeaderTimeout: 10 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 30 * time.Second,
	}
	return srv.ListenAndServe()
}

func (s *Server) routes() http.Handler {
	mux := http.NewServeMux()
	p := apiPrefix

	// read checks the method, a per-address limit for the endpoint, and decodes a small JSON body.
	read := func(w http.ResponseWriter, r *http.Request, limitKey string, n int, window time.Duration, v any) bool {
		if r.Method != http.MethodPost {
			fail(w, 405, "post_only")
			return false
		}
		if !s.lim.allow(limitKey+"|"+clientIP(r), n, window) {
			fail(w, 429, "too_many")
			return false
		}
		r.Body = http.MaxBytesReader(w, r.Body, 128<<10)
		if v != nil {
			if err := json.NewDecoder(r.Body).Decode(v); err != nil {
				fail(w, 400, "bad_request")
				return false
			}
		}
		return true
	}
	// signedIn returns the account of the request's token, or answers 401.
	signedIn := func(w http.ResponseWriter, r *http.Request) *Account {
		a := s.st.session(bearer(r))
		if a == nil {
			fail(w, 401, "not_signed_in")
			return nil
		}
		if !s.lim.allow("acct|"+a.ID, 120, time.Minute) {
			fail(w, 429, "too_many")
			return nil
		}
		return a
	}
	signIn := func(w http.ResponseWriter, a *Account, extra map[string]any) {
		tok, err := s.st.newSession(a.ID)
		if err != nil {
			fail(w, 500, "failed")
			return
		}
		out := map[string]any{"token": tok, "account": summary(s.st.get(a.ID))}
		for k, v := range extra {
			out[k] = v
		}
		reply(w, 200, out)
	}
	newRecovery := func() (string, string) {
		c := newCode(5, 4)
		return c, recoveryHash(c)
	}

	mux.HandleFunc(p+"health", func(w http.ResponseWriter, r *http.Request) {
		reply(w, 200, map[string]any{"ok": true, "version": version, "accounts": s.st.count()})
	})

	mux.HandleFunc(p+"config", func(w http.ResponseWriter, r *http.Request) {
		reply(w, 200, map[string]any{"discord": s.oauth.enabled("discord"), "twitch": s.oauth.enabled("twitch"), "minPassword": 10})
	})

	mux.HandleFunc(p+"register", func(w http.ResponseWriter, r *http.Request) {
		var req struct{ Username, Password string }
		if !read(w, r, "register", 6, time.Hour, &req) {
			return
		}
		req.Username = strings.TrimSpace(req.Username)
		if err := checkUsername(req.Username); err != nil {
			fail(w, 400, err.Error())
			return
		}
		if err := checkNewPassword(req.Password, req.Username); err != nil {
			fail(w, 400, err.Error())
			return
		}
		code, hash := newRecovery()
		a := &Account{ID: randomID(), Username: req.Username, PassHash: hashPassword(req.Password), Recovery: hash}
		if err := s.st.create(a); err != nil {
			if errors.Is(err, errTaken) {
				fail(w, 409, "taken")
			} else {
				fail(w, 500, "failed")
			}
			return
		}
		log.Printf("new password account")
		signIn(w, a, map[string]any{"recoveryCode": code})
	})

	mux.HandleFunc(p+"login", func(w http.ResponseWriter, r *http.Request) {
		var req struct{ Username, Password string }
		if !read(w, r, "login", 30, 10*time.Minute, &req) {
			return
		}
		if !s.lim.allow("login-user|"+strings.ToLower(req.Username), 10, 10*time.Minute) {
			fail(w, 429, "too_many")
			return
		}
		a := s.st.byUsername(strings.TrimSpace(req.Username))
		hash := dummyHash
		if a != nil && a.PassHash != "" {
			hash = a.PassHash
		}
		if !checkPassword(req.Password, hash) || a == nil || a.PassHash == "" {
			fail(w, 401, "wrong")
			return
		}
		signIn(w, a, nil)
	})

	mux.HandleFunc(p+"recover", func(w http.ResponseWriter, r *http.Request) {
		var req struct{ Username, RecoveryCode, NewPassword string }
		if !read(w, r, "recover", 20, 10*time.Minute, &req) {
			return
		}
		if !s.lim.allow("recover-user|"+strings.ToLower(req.Username), 8, 10*time.Minute) {
			fail(w, 429, "too_many")
			return
		}
		a := s.st.byUsername(strings.TrimSpace(req.Username))
		if a == nil || a.Recovery == "" || subtle.ConstantTimeCompare([]byte(recoveryHash(req.RecoveryCode)), []byte(a.Recovery)) != 1 {
			fail(w, 401, "wrong")
			return
		}
		if err := checkNewPassword(req.NewPassword, a.Username); err != nil {
			fail(w, 400, err.Error())
			return
		}
		code, hash := newRecovery()
		if err := s.st.update(a.ID, func(x *Account) error { x.PassHash, x.Recovery = hashPassword(req.NewPassword), hash; return nil }); err != nil {
			fail(w, 500, "failed")
			return
		}
		// a reset signs every device out (someone else may have had the password)
		s.st.endAll(a.ID)
		signIn(w, a, map[string]any{"recoveryCode": code})
	})

	mux.HandleFunc(p+"code/new", func(w http.ResponseWriter, r *http.Request) {
		if !read(w, r, "code-new", 10, time.Hour, nil) {
			return
		}
		code := newCode(4, 4)
		if a := s.st.session(bearer(r)); a != nil {
			// a sync code for an existing account (to sign in on another device by typing it)
			if err := s.st.update(a.ID, func(x *Account) error { x.CodeHash = codeHash(code); return nil }); err != nil {
				fail(w, 500, "failed")
				return
			}
			reply(w, 200, map[string]any{"code": code, "account": summary(s.st.get(a.ID))})
			return
		}
		a := &Account{ID: randomID(), CodeHash: codeHash(code)}
		if err := s.st.create(a); err != nil {
			fail(w, 500, "failed")
			return
		}
		log.Printf("new sync-code account")
		signIn(w, a, map[string]any{"code": code})
	})

	mux.HandleFunc(p+"code/login", func(w http.ResponseWriter, r *http.Request) {
		var req struct{ Code string }
		if !read(w, r, "code-login", 20, 10*time.Minute, &req) {
			return
		}
		a := s.st.bySyncCode(codeHash(req.Code))
		if a == nil || len(normCode(req.Code)) < 16 {
			fail(w, 401, "wrong")
			return
		}
		signIn(w, a, nil)
	})

	// QR code: a signed-in device asks for a one-time link; the phone that scans it is signed in to the same account
	mux.HandleFunc(p+"link/new", func(w http.ResponseWriter, r *http.Request) {
		a := signedIn(w, r)
		if a == nil {
			return
		}
		if !read(w, r, "link-new", 30, 10*time.Minute, nil) {
			return
		}
		tok, ok := s.links.add(a.ID)
		if !ok {
			fail(w, 503, "busy")
			return
		}
		reply(w, 200, map[string]any{"token": tok, "expires": int(linkTTL.Seconds())})
	})

	mux.HandleFunc(p+"link/use", func(w http.ResponseWriter, r *http.Request) {
		var req struct{ Token string }
		if !read(w, r, "link-use", 30, 10*time.Minute, &req) {
			return
		}
		id := s.links.take(req.Token)
		a := s.st.get(id)
		if id == "" || a == nil {
			fail(w, 401, "expired")
			return
		}
		signIn(w, a, nil)
	})

	mux.HandleFunc(p+"me", func(w http.ResponseWriter, r *http.Request) {
		if a := signedIn(w, r); a != nil {
			reply(w, 200, summary(a))
		}
	})

	mux.HandleFunc(p+"data", func(w http.ResponseWriter, r *http.Request) {
		a := signedIn(w, r)
		if a == nil {
			return
		}
		if r.Method == http.MethodGet {
			reply(w, 200, map[string]any{"fields": s.st.fields(a.ID), "now": time.Now().UnixMilli()})
			return
		}
		var req struct {
			Fields map[string]Field `json:"fields"`
		}
		if !read(w, r, "data", 240, time.Minute, &req) {
			return
		}
		out, err := s.st.merge(a.ID, req.Fields)
		if err != nil {
			if errors.Is(err, errTooBig) {
				fail(w, 413, "too_big")
			} else {
				fail(w, 500, "failed")
			}
			return
		}
		reply(w, 200, map[string]any{"fields": out, "now": time.Now().UnixMilli()})
	})

	mux.HandleFunc(p+"password", func(w http.ResponseWriter, r *http.Request) {
		a := signedIn(w, r)
		if a == nil {
			return
		}
		var req struct{ Current, New, Username string }
		if !read(w, r, "password", 10, 10*time.Minute, &req) {
			return
		}
		username := a.Username
		if a.PassHash != "" {
			if !checkPassword(req.Current, a.PassHash) {
				fail(w, 401, "wrong")
				return
			}
		} else {
			// first password for a sync-code / Discord / Twitch account: it also needs a username
			username = strings.TrimSpace(req.Username)
			if err := checkUsername(username); err != nil {
				fail(w, 400, err.Error())
				return
			}
		}
		if err := checkNewPassword(req.New, username); err != nil {
			fail(w, 400, err.Error())
			return
		}
		var code string
		err := s.st.update(a.ID, func(x *Account) error {
			x.Username, x.PassHash = username, hashPassword(req.New)
			if x.Recovery == "" {
				var h string
				code, h = newRecovery()
				x.Recovery = h
			}
			return nil
		})
		if errors.Is(err, errTaken) {
			fail(w, 409, "taken")
			return
		} else if err != nil {
			fail(w, 500, "failed")
			return
		}
		// a new password signs every other device out
		s.st.endSessions(bearer(r), true, bearer(r))
		out := map[string]any{"ok": true, "account": summary(s.st.get(a.ID))}
		if code != "" {
			out["recoveryCode"] = code
		}
		reply(w, 200, out)
	})

	mux.HandleFunc(p+"recovery/new", func(w http.ResponseWriter, r *http.Request) {
		a := signedIn(w, r)
		if a == nil {
			return
		}
		var req struct{ Password string }
		if !read(w, r, "recovery-new", 10, 10*time.Minute, &req) {
			return
		}
		if a.PassHash == "" || !checkPassword(req.Password, a.PassHash) {
			fail(w, 401, "wrong")
			return
		}
		code, hash := newRecovery()
		if err := s.st.update(a.ID, func(x *Account) error { x.Recovery = hash; return nil }); err != nil {
			fail(w, 500, "failed")
			return
		}
		reply(w, 200, map[string]any{"recoveryCode": code})
	})

	mux.HandleFunc(p+"unlink", func(w http.ResponseWriter, r *http.Request) {
		a := signedIn(w, r)
		if a == nil {
			return
		}
		var req struct{ Method string }
		if !read(w, r, "unlink", 20, 10*time.Minute, &req) {
			return
		}
		err := s.st.update(a.ID, func(x *Account) error {
			if ways(x) <= 1 {
				return errLast
			}
			switch req.Method {
			case "discord":
				x.Discord, x.DiscordName = "", ""
			case "twitch":
				x.Twitch, x.TwitchName = "", ""
			case "code":
				x.CodeHash = ""
			default:
				return errBad
			}
			return nil
		})
		switch {
		case errors.Is(err, errLast):
			fail(w, 400, "last_method")
		case err != nil:
			fail(w, 400, "bad_request")
		default:
			reply(w, 200, map[string]any{"ok": true, "account": summary(s.st.get(a.ID))})
		}
	})

	mux.HandleFunc(p+"logout", func(w http.ResponseWriter, r *http.Request) {
		if !read(w, r, "logout", 60, time.Minute, nil) {
			return
		}
		s.st.endSessions(bearer(r), r.URL.Query().Get("all") == "1", "")
		reply(w, 200, map[string]bool{"ok": true})
	})

	mux.HandleFunc(p+"delete", func(w http.ResponseWriter, r *http.Request) {
		a := signedIn(w, r)
		if a == nil {
			return
		}
		var req struct{ Password string }
		if !read(w, r, "delete", 10, 10*time.Minute, &req) {
			return
		}
		if a.PassHash != "" && !checkPassword(req.Password, a.PassHash) {
			fail(w, 401, "wrong")
			return
		}
		if err := s.st.remove(a.ID); err != nil {
			fail(w, 500, "failed")
			return
		}
		log.Printf("account deleted")
		reply(w, 200, map[string]bool{"ok": true})
	})

	mux.HandleFunc(p+"export", func(w http.ResponseWriter, r *http.Request) {
		a := signedIn(w, r)
		if a == nil {
			return
		}
		w.Header().Set("Content-Disposition", `attachment; filename="riftwise-account.json"`)
		reply(w, 200, map[string]any{"account": summary(a), "data": s.st.fields(a.ID)})
	})

	// ---- Discord / Twitch ----
	for _, prov := range []string{"discord", "twitch"} {
		prov := prov
		mux.HandleFunc(p+"auth/"+prov+"/start", func(w http.ResponseWriter, r *http.Request) {
			var req struct{ Mode string }
			if !read(w, r, "oauth-start", 30, 10*time.Minute, &req) {
				return
			}
			if req.Mode != "app" {
				req.Mode = "web"
			}
			link := ""
			if tok := bearer(r); tok != "" {
				if a := s.st.session(tok); a != nil {
					link = a.ID
				}
			}
			u, poll, err := s.oauth.start(prov, req.Mode, link)
			if err != nil {
				fail(w, 400, "not_enabled")
				return
			}
			reply(w, 200, map[string]string{"url": u, "poll": poll})
		})
		mux.HandleFunc(p+"auth/"+prov+"/callback", func(w http.ResponseWriter, r *http.Request) {
			if !s.lim.allow("oauth-cb|"+clientIP(r), 30, 10*time.Minute) {
				fail(w, 429, "too_many")
				return
			}
			s.callback(w, r, prov)
		})
	}

	mux.HandleFunc(p+"auth/poll", func(w http.ResponseWriter, r *http.Request) {
		if !s.lim.allow("oauth-poll|"+clientIP(r), 200, 10*time.Minute) {
			fail(w, 429, "too_many")
			return
		}
		res, known := s.oauth.takeResult(r.URL.Query().Get("id"))
		switch {
		case !known:
			fail(w, 404, "expired")
		case res == nil:
			reply(w, 200, map[string]bool{"pending": true})
		case res.Err != "":
			fail(w, 400, res.Err)
		default:
			out := map[string]any{"ok": true}
			if res.Token != "" {
				out["token"] = res.Token
			}
			if a := s.st.get(res.Account); a != nil {
				out["account"] = summary(a)
			}
			reply(w, 200, out)
		}
	})

	mux.HandleFunc(p+"auth/ticket", func(w http.ResponseWriter, r *http.Request) {
		var req struct{ Ticket string }
		if !read(w, r, "oauth-ticket", 30, 10*time.Minute, &req) {
			return
		}
		res := s.oauth.takeTicket(req.Ticket)
		if res == nil || res.Token == "" {
			fail(w, 401, "expired")
			return
		}
		out := map[string]any{"token": res.Token}
		if a := s.st.get(res.Account); a != nil {
			out["account"] = summary(a)
		}
		reply(w, 200, out)
	})

	return s.cors(mux)
}

var (
	errLast = errors.New("last")
	errBad  = errors.New("bad")
)

// cors lets the website and the Windows app call the API (tokens travel in the Authorization header, never in
// cookies, so other sites can't act for a signed-in person).
func (s *Server) cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if o := r.Header.Get("Origin"); allowedOrigins[o] {
			w.Header().Set("Access-Control-Allow-Origin", o)
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Max-Age", "600")
			w.Header().Add("Vary", "Origin")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(204)
			return
		}
		next.ServeHTTP(w, r)
	})
}
