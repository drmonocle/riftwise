package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// oauth.json in the data folder (never in the repo):
//
//	{ "publicBase": "https://lolworlds.com/riftwise",
//	  "discord": { "clientId": "...", "clientSecret": "..." },
//	  "twitch":  { "clientId": "...", "clientSecret": "..." } }
//
// Redirect addresses to register with Discord / Twitch: <publicBase>/api/sync/auth/discord/callback and
// <publicBase>/api/sync/auth/twitch/callback. A provider without an id and secret is simply not offered.
type oauthApp struct {
	ClientID     string `json:"clientId"`
	ClientSecret string `json:"clientSecret"`
}

type OAuth struct {
	Base    string    `json:"publicBase"`
	Discord *oauthApp `json:"discord"`
	Twitch  *oauthApp `json:"twitch"`

	mu      sync.Mutex
	path    string                   // oauth.json, re-read when it changes (no restart needed after adding keys)
	modTime time.Time                // of the version loaded
	checked time.Time                // last time the file was looked at
	pending map[string]*pendingLogin // state -> sign-in in progress
	results map[string]*loginResult  // poll id -> finished sign-in (Windows app)
	tickets map[string]*loginResult  // ticket -> finished sign-in (web page)
	client  *http.Client
}

type pendingLogin struct {
	Provider string
	Mode     string // "web" or "app"
	Link     string // account to add this sign-in to (Settings -> add Discord), or ""
	Poll     string
	Created  time.Time
}

type loginResult struct {
	Token   string
	Account string
	Err     string
	Created time.Time
}

func loadOAuth(dir string) *OAuth {
	o := &OAuth{path: filepath.Join(dir, "oauth.json"), Base: "https://lolworlds.com/riftwise"}
	o.reload(true)
	o.pending = map[string]*pendingLogin{}
	o.results = map[string]*loginResult{}
	o.tickets = map[string]*loginResult{}
	o.client = &http.Client{Timeout: 15 * time.Second}
	return o
}

// reload reads oauth.json again if it changed (looked at no more than every 20 seconds unless forced).
func (o *OAuth) reload(force bool) {
	o.mu.Lock()
	defer o.mu.Unlock()
	if !force && time.Since(o.checked) < 20*time.Second {
		return
	}
	o.checked = time.Now()
	fi, err := os.Stat(o.path)
	if err != nil {
		if o.Discord != nil || o.Twitch != nil {
			log.Printf("oauth.json gone: Discord and Twitch sign-in off")
		}
		o.Discord, o.Twitch, o.modTime = nil, nil, time.Time{}
		return
	}
	if !force && fi.ModTime().Equal(o.modTime) {
		return
	}
	var c struct {
		Base    string    `json:"publicBase"`
		Discord *oauthApp `json:"discord"`
		Twitch  *oauthApp `json:"twitch"`
	}
	if err := readJSON(o.path, &c); err != nil {
		if !errors.Is(err, os.ErrNotExist) {
			log.Printf("oauth.json: %v", err)
		}
		return
	}
	o.modTime = fi.ModTime()
	if c.Base != "" {
		o.Base = strings.TrimRight(c.Base, "/")
	}
	o.Discord, o.Twitch = c.Discord, c.Twitch
	log.Printf("oauth.json loaded: discord=%v twitch=%v", c.Discord != nil && c.Discord.ClientSecret != "", c.Twitch != nil && c.Twitch.ClientSecret != "")
}

func (o *OAuth) app(provider string) *oauthApp {
	o.reload(false)
	o.mu.Lock()
	defer o.mu.Unlock()
	var a *oauthApp
	switch provider {
	case "discord":
		a = o.Discord
	case "twitch":
		a = o.Twitch
	}
	if a == nil || a.ClientID == "" || a.ClientSecret == "" {
		return nil
	}
	return a
}

func (o *OAuth) enabled(provider string) bool { return o.app(provider) != nil }

func (o *OAuth) base() string {
	o.mu.Lock()
	defer o.mu.Unlock()
	return o.Base
}

func (o *OAuth) redirectURI(provider string) string {
	return o.base() + "/api/sync/auth/" + provider + "/callback"
}

// start remembers a sign-in in progress and returns the provider's sign-in address and a poll id.
func (o *OAuth) start(provider, mode, link string) (string, string, error) {
	app := o.app(provider)
	if app == nil {
		return "", "", errors.New("not enabled")
	}
	state := randomToken(24)
	poll := randomToken(24)
	o.mu.Lock()
	o.sweepLocked()
	if len(o.pending) > 5000 {
		o.mu.Unlock()
		return "", "", errors.New("busy")
	}
	o.pending[state] = &pendingLogin{Provider: provider, Mode: mode, Link: link, Poll: poll, Created: time.Now()}
	o.mu.Unlock()
	q := url.Values{"response_type": {"code"}, "client_id": {app.ClientID}, "redirect_uri": {o.redirectURI(provider)}, "state": {state}}
	var u string
	switch provider {
	case "discord":
		q.Set("scope", "identify")
		u = "https://discord.com/oauth2/authorize?" + q.Encode()
	case "twitch":
		q.Set("scope", "")
		u = "https://id.twitch.tv/oauth2/authorize?" + q.Encode()
	}
	return u, poll, nil
}

func (o *OAuth) sweepLocked() {
	now := time.Now()
	for k, p := range o.pending {
		if now.Sub(p.Created) > 10*time.Minute {
			delete(o.pending, k)
		}
	}
	for k, r := range o.results {
		if now.Sub(r.Created) > 10*time.Minute {
			delete(o.results, k)
		}
	}
	for k, r := range o.tickets {
		if now.Sub(r.Created) > 2*time.Minute {
			delete(o.tickets, k)
		}
	}
}

func (o *OAuth) takePending(state string) *pendingLogin {
	o.mu.Lock()
	defer o.mu.Unlock()
	p := o.pending[state]
	delete(o.pending, state)
	if p != nil && time.Since(p.Created) > 10*time.Minute {
		return nil
	}
	return p
}

// takeResult hands a finished Windows-app sign-in over once.
func (o *OAuth) takeResult(poll string) (*loginResult, bool) {
	o.mu.Lock()
	defer o.mu.Unlock()
	o.sweepLocked()
	if r := o.results[poll]; r != nil {
		delete(o.results, poll)
		return r, true
	}
	for _, p := range o.pending {
		if p.Poll == poll {
			return nil, true // still waiting for the person to finish signing in
		}
	}
	return nil, false
}

func (o *OAuth) takeTicket(t string) *loginResult {
	o.mu.Lock()
	defer o.mu.Unlock()
	o.sweepLocked()
	r := o.tickets[t]
	delete(o.tickets, t)
	return r
}

// identity exchanges the provider's code for the person's id and display name.
func (o *OAuth) identity(provider, code string) (id, name string, err error) {
	app := o.app(provider)
	if app == nil {
		return "", "", errors.New("not enabled")
	}
	form := url.Values{"grant_type": {"authorization_code"}, "code": {code}, "redirect_uri": {o.redirectURI(provider)},
		"client_id": {app.ClientID}, "client_secret": {app.ClientSecret}}
	tokenURL := map[string]string{"discord": "https://discord.com/api/oauth2/token", "twitch": "https://id.twitch.tv/oauth2/token"}[provider]
	resp, err := o.client.PostForm(tokenURL, form)
	if err != nil {
		return "", "", err
	}
	defer resp.Body.Close()
	var tok struct {
		AccessToken string `json:"access_token"`
	}
	if resp.StatusCode != 200 || json.NewDecoder(io.LimitReader(resp.Body, 1<<16)).Decode(&tok) != nil || tok.AccessToken == "" {
		return "", "", fmt.Errorf("%s token: HTTP %d", provider, resp.StatusCode)
	}
	userURL := map[string]string{"discord": "https://discord.com/api/users/@me", "twitch": "https://api.twitch.tv/helix/users"}[provider]
	req, _ := http.NewRequest("GET", userURL, nil)
	req.Header.Set("Authorization", "Bearer "+tok.AccessToken)
	if provider == "twitch" {
		req.Header.Set("Client-Id", app.ClientID)
	}
	ur, err := o.client.Do(req)
	if err != nil {
		return "", "", err
	}
	defer ur.Body.Close()
	if ur.StatusCode != 200 {
		return "", "", fmt.Errorf("%s user: HTTP %d", provider, ur.StatusCode)
	}
	body := io.LimitReader(ur.Body, 1<<16)
	if provider == "discord" {
		var u struct {
			ID         string `json:"id"`
			Username   string `json:"username"`
			GlobalName string `json:"global_name"`
		}
		if err := json.NewDecoder(body).Decode(&u); err != nil || u.ID == "" {
			return "", "", errors.New("discord user")
		}
		name = u.GlobalName
		if name == "" {
			name = u.Username
		}
		return u.ID, name, nil
	}
	var tu struct {
		Data []struct {
			ID          string `json:"id"`
			Login       string `json:"login"`
			DisplayName string `json:"display_name"`
		} `json:"data"`
	}
	if err := json.NewDecoder(body).Decode(&tu); err != nil || len(tu.Data) == 0 || tu.Data[0].ID == "" {
		return "", "", errors.New("twitch user")
	}
	name = tu.Data[0].DisplayName
	if name == "" {
		name = tu.Data[0].Login
	}
	return tu.Data[0].ID, name, nil
}

// callback finishes a sign-in: finds (or makes) the account, signs the device in and hands the result over.
func (s *Server) callback(w http.ResponseWriter, r *http.Request, provider string) {
	q := r.URL.Query()
	p := s.oauth.takePending(q.Get("state"))
	if p == nil || p.Provider != provider {
		s.finish(w, r, nil, &loginResult{Err: "expired"})
		return
	}
	res := &loginResult{Created: time.Now()}
	if q.Get("error") != "" || q.Get("code") == "" {
		res.Err = "cancelled"
		s.finish(w, r, p, res)
		return
	}
	pid, name, err := s.oauth.identity(provider, q.Get("code"))
	if err != nil {
		log.Printf("%s sign-in: %v", provider, err)
		res.Err = "provider"
		s.finish(w, r, p, res)
		return
	}
	set := func(a *Account) {
		if provider == "discord" {
			a.Discord, a.DiscordName = pid, name
		} else {
			a.Twitch, a.TwitchName = pid, name
		}
	}
	acc := s.st.byProvider(provider, pid)
	switch {
	case p.Link != "":
		// adding Discord / Twitch to the signed-in account
		if acc != nil && acc.ID != p.Link {
			res.Err = "linked_elsewhere"
		} else if err := s.st.update(p.Link, func(a *Account) error { set(a); return nil }); err != nil {
			res.Err = "failed"
		} else {
			res.Account = p.Link
			res.Token = "" // already signed in on that device
		}
	case acc != nil:
		_ = s.st.update(acc.ID, func(a *Account) error { set(a); return nil }) // keep the display name current
		res.Account = acc.ID
	default:
		a := &Account{ID: randomID()}
		set(a)
		if err := s.st.create(a); err != nil {
			res.Err = "failed"
		} else {
			res.Account = a.ID
			log.Printf("new %s account", provider)
		}
	}
	if res.Err == "" && p.Link == "" {
		if tok, err := s.st.newSession(res.Account); err == nil {
			res.Token = tok
		} else {
			res.Err = "failed"
		}
	}
	s.finish(w, r, p, res)
}

// finish sends the person back: the web page gets a one-time ticket in the address (#signin=...), the Windows app
// picks the result up by polling, and the browser tab it opened says to go back to the app.
func (s *Server) finish(w http.ResponseWriter, r *http.Request, p *pendingLogin, res *loginResult) {
	res.Created = time.Now()
	if p != nil && p.Mode == "app" {
		s.oauth.mu.Lock()
		s.oauth.results[p.Poll] = res
		s.oauth.mu.Unlock()
		msg := "You're signed in to RiftWise. You can close this tab and go back to the app."
		if res.Err != "" {
			msg = "Signing in didn't work (" + res.Err + "). Close this tab and try again in the app."
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'")
		fmt.Fprintf(w, `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>RiftWise</title>`+
			`<body style="background:#0c0a1d;color:#efeaff;font:16px system-ui;display:grid;place-items:center;height:90vh;margin:0">`+
			`<p style="max-width:28rem;text-align:center">%s</p>`, html.EscapeString(msg))
		return
	}
	base := strings.TrimRight(siteURL, "/")
	target := base + "/#settings"
	if res.Err != "" {
		target = base + "/#signin-error=" + url.QueryEscape(res.Err)
	} else if p != nil && p.Link != "" {
		target = base + "/#signin-linked"
	} else {
		ticket := randomToken(24)
		s.oauth.mu.Lock()
		s.oauth.tickets[ticket] = res
		s.oauth.mu.Unlock()
		target = base + "/#signin=" + ticket
	}
	http.Redirect(w, r, target, http.StatusFound)
}
