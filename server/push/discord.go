package main

// Discord: RiftWise posts to any channel whose webhook a server admin adds on riftwise.gg (Watchlist tab). No bot
// account or token: a webhook is Discord's own "post into this channel" address, made in the channel's settings.
// Each one chooses what it gets: results as matches end, all-time records as they fall, and the daily odds card
// (og/today.png) once a day when there are matches. Webhooks are kept in <data>/discord.json; one that Discord says
// is gone (404/401) is dropped. Only discord.com webhook addresses are taken, so nothing else can be reached.

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
)

var discordURL = regexp.MustCompile(`^https://(?:(?:ptb|canary)\.)?discord(?:app)?\.com/api/webhooks/\d{5,30}/[\w-]{20,120}$`)

const maxHooks = 1000

type hook struct {
	URL     string `json:"url"`
	Added   int64  `json:"added"`
	Results bool   `json:"results"`
	Records bool   `json:"records"`
	Daily   bool   `json:"daily"`
}

type embed struct {
	Title       string `json:"title"`
	URL         string `json:"url,omitempty"`
	Description string `json:"description,omitempty"`
	Color       int    `json:"color,omitempty"`
	Image       *struct {
		URL string `json:"url"`
	} `json:"image,omitempty"`
	Footer *struct {
		Text string `json:"text"`
	} `json:"footer,omitempty"`
}

var hooksMu sync.Mutex

func (a *App) hooksPath() string { return filepath.Join(a.dataDir, "discord.json") }

func (a *App) loadHooks() []hook {
	var hs []hook
	if b, err := os.ReadFile(a.hooksPath()); err == nil {
		json.Unmarshal(b, &hs)
	}
	return hs
}

func (a *App) saveHooks(hs []hook) error {
	b, err := json.Marshal(hs)
	if err != nil {
		return err
	}
	tmp := a.hooksPath() + ".tmp"
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, a.hooksPath())
}

// postHook sends one message; gone is true when Discord says the webhook no longer exists.
func (a *App) postHook(url string, e embed) (ok, gone bool) {
	if e.Footer == nil {
		e.Footer = &struct {
			Text string `json:"text"`
		}{"riftwise.gg · free, no ads"}
	}
	body, _ := json.Marshal(map[string]any{"username": "RiftWise", "avatar_url": siteURL + "icon-192.png", "embeds": []embed{e}})
	resp, err := a.client.Post(url, "application/json", bytes.NewReader(body))
	if err != nil {
		return false, false
	}
	io.Copy(io.Discard, io.LimitReader(resp.Body, 1<<16))
	resp.Body.Close()
	return resp.StatusCode/100 == 2, resp.StatusCode == 404 || resp.StatusCode == 401
}

// postAll sends a message to every webhook that wants this kind ("results", "records", "daily").
func (a *App) postAll(kind string, e embed) int {
	hooksMu.Lock()
	hs := a.loadHooks()
	hooksMu.Unlock()
	sent := 0
	var gone []string
	for _, h := range hs {
		if (kind == "results" && !h.Results) || (kind == "records" && !h.Records) || (kind == "daily" && !h.Daily) {
			continue
		}
		ok, g := a.postHook(h.URL, e)
		if ok {
			sent++
		}
		if g {
			gone = append(gone, h.URL)
		}
		time.Sleep(250 * time.Millisecond) // Discord's limits are per webhook, but a burst helps nobody
	}
	if len(gone) > 0 {
		hooksMu.Lock()
		now := a.loadHooks()
		keep := now[:0]
		for _, h := range now {
			if !contains(gone, h.URL) {
				keep = append(keep, h)
			}
		}
		a.saveHooks(keep)
		hooksMu.Unlock()
		log.Printf("discord: %d webhooks gone, removed", len(gone))
	}
	if sent > 0 {
		log.Printf("discord %s: %q to %d channels", kind, e.Title, sent)
	}
	return sent
}

func contains(list []string, s string) bool {
	for _, x := range list {
		if x == s {
			return true
		}
	}
	return false
}

// resultEmbed: a finished series as a Discord message (Riot's names and score, the match page).
func resultEmbed(e riotEvent) (embed, bool) {
	if e.Match == nil || len(e.Match.Teams) < 2 || e.Match.Teams[0].Result == nil || e.Match.Teams[1].Result == nil {
		return embed{}, false
	}
	a, b := e.Match.Teams[0], e.Match.Teams[1]
	stage := e.League.Name
	if e.BlockName != "" {
		stage += " · " + e.BlockName
	}
	if n := e.Match.Strategy.Count; n > 1 {
		stage += fmt.Sprintf(" · best of %d", n)
	}
	return embed{
		Title:       fmt.Sprintf("%s %d–%d %s", a.Name, a.Result.GameWins, b.Result.GameWins, b.Name),
		URL:         siteURL + "match/riot-" + e.Match.ID,
		Description: stage + "\nDrafts, gold graphs and every game's stats on RiftWise.",
		Color:       0x5ee3c8,
	}, true
}

// dailyCard posts today's odds card once a day, a little before the day's first match.
func (a *App) dailyCard(byID map[string]riotEvent, now time.Time) {
	soon := false
	for _, e := range byID {
		if t, err := time.Parse(time.RFC3339, e.StartTime); err == nil && e.State == "unstarted" && t.Sub(now) > 0 && t.Sub(now) <= 2*time.Hour {
			soon = true
			break
		}
	}
	if !soon || !a.sent.claim("discord-daily:"+now.UTC().Format("2006-01-02")) {
		return
	}
	a.postAll("daily", embed{
		Title:       "Today's pro matches: RiftWise's chances",
		URL:         siteURL + "schedule",
		Description: "The model's chance for each match today, from the power rankings. Not advice.",
		Color:       0xb39dff,
		// a new address every hour so Discord doesn't show yesterday's copy
		Image: &struct {
			URL string `json:"url"`
		}{siteURL + "og/today.png?d=" + now.UTC().Format("2006010215")},
	})
}

func (a *App) discordRoutes(mux *http.ServeMux, lim *limiter) {
	// add (or change) a webhook: a welcome message must reach the channel first
	mux.HandleFunc(apiPrefix+"discord", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeJSON(w, 405, map[string]string{"error": "post only"})
			return
		}
		if !lim.allow(clientIP(r)) {
			writeJSON(w, 429, map[string]string{"error": "too many requests"})
			return
		}
		var req struct {
			URL                     string
			Results, Records, Daily bool
		}
		if json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&req) != nil {
			writeJSON(w, 400, map[string]string{"error": "bad request"})
			return
		}
		req.URL = strings.TrimSpace(req.URL)
		if !discordURL.MatchString(req.URL) {
			writeJSON(w, 400, map[string]string{"error": "not_a_webhook"})
			return
		}
		if !req.Results && !req.Records && !req.Daily {
			writeJSON(w, 400, map[string]string{"error": "nothing_chosen"})
			return
		}
		hooksMu.Lock()
		hs := a.loadHooks()
		found := -1
		for i, h := range hs {
			if h.URL == req.URL {
				found = i
			}
		}
		hooksMu.Unlock()
		if found < 0 && len(hs) >= maxHooks {
			writeJSON(w, 503, map[string]string{"error": "full"})
			return
		}
		if found < 0 {
			ok, _ := a.postHook(req.URL, embed{Title: "RiftWise is set up in this channel", URL: siteURL,
				Description: "Live League of Legends esports results, records and the daily odds card will be posted here.", Color: 0xb39dff})
			if !ok {
				writeJSON(w, 400, map[string]string{"error": "webhook_refused"})
				return
			}
		}
		hooksMu.Lock()
		defer hooksMu.Unlock()
		hs = a.loadHooks()
		h := hook{URL: req.URL, Added: time.Now().Unix(), Results: req.Results, Records: req.Records, Daily: req.Daily}
		replaced := false
		for i := range hs {
			if hs[i].URL == req.URL {
				h.Added, hs[i], replaced = hs[i].Added, h, true
			}
		}
		if !replaced {
			hs = append(hs, h)
		}
		if err := a.saveHooks(hs); err != nil {
			writeJSON(w, 500, map[string]string{"error": "could not save"})
			return
		}
		writeJSON(w, 200, map[string]any{"ok": true, "new": !replaced})
	})

	// remove: whoever has the webhook address can take it off (it's the channel's secret)
	mux.HandleFunc(apiPrefix+"discord/remove", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeJSON(w, 405, map[string]string{"error": "post only"})
			return
		}
		if !lim.allow(clientIP(r)) {
			writeJSON(w, 429, map[string]string{"error": "too many requests"})
			return
		}
		var req struct{ URL string }
		if json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&req) != nil {
			writeJSON(w, 400, map[string]string{"error": "bad request"})
			return
		}
		hooksMu.Lock()
		defer hooksMu.Unlock()
		hs := a.loadHooks()
		keep := hs[:0]
		for _, h := range hs {
			if h.URL != strings.TrimSpace(req.URL) {
				keep = append(keep, h)
			}
		}
		removed := len(keep) < len(hs)
		if removed {
			a.saveHooks(keep)
		}
		writeJSON(w, 200, map[string]any{"ok": true, "removed": removed})
	})
}
