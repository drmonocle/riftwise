package main

// Anonymous daily counts for the analytics hub's RiftWise funnel (scripts/analytics/funnel.py): once a day each
// browser says it visited, with its theme, language, web or desktop app and version, and once a day that it opened
// a second page (src/usage.ts). Only the day's totals are kept, in <data>/usage/<date>.json (dates in US Eastern
// time, like the hub): no address, no id, nothing about who sent it.

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sync"
	"time"
	_ "time/tzdata" // America/New_York on a Windows server without the zone database
)

type usageDay struct {
	Visits     int            `json:"visits"`
	SecondPage int            `json:"secondPage"`
	Themes     map[string]int `json:"themes"`
	Langs      map[string]int `json:"langs"`
	Apps       map[string]int `json:"apps"`
	Versions   map[string]int `json:"versions"`
}

var (
	usageMu   sync.Mutex
	usageWord = regexp.MustCompile(`^[A-Za-z0-9.-]{1,16}$`)
	eastern   = func() *time.Location {
		if l, err := time.LoadLocation("America/New_York"); err == nil {
			return l
		}
		return time.UTC
	}()
)

// countUsage adds one event to the day's totals (false for an event or value it doesn't take).
func (a *App) countUsage(event, theme, lang, app, version string, now time.Time) bool {
	if event != "visit" && event != "second" {
		return false
	}
	usageMu.Lock()
	defer usageMu.Unlock()
	dir := filepath.Join(a.dataDir, "usage")
	os.MkdirAll(dir, 0o755)
	path := filepath.Join(dir, now.In(eastern).Format("2006-01-02")+".json")
	var d usageDay
	if b, err := os.ReadFile(path); err == nil {
		json.Unmarshal(b, &d)
	}
	add := func(m *map[string]int, k string) {
		if *m == nil {
			*m = map[string]int{}
		}
		if !usageWord.MatchString(k) {
			k = "other"
		}
		// a day holds a few dozen values at most; anything past that is junk sent by hand
		if _, ok := (*m)[k]; ok || len(*m) < 60 {
			(*m)[k]++
		}
	}
	if event == "second" {
		d.SecondPage++
	} else {
		d.Visits++
		add(&d.Themes, theme)
		add(&d.Langs, lang)
		add(&d.Apps, app)
		add(&d.Versions, version)
	}
	b, _ := json.Marshal(d)
	tmp := path + ".tmp"
	if os.WriteFile(tmp, b, 0o644) == nil {
		os.Rename(tmp, path)
	}
	return true
}

func (a *App) usageRoute(mux *http.ServeMux, lim *limiter) {
	mux.HandleFunc(apiPrefix+"usage", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeJSON(w, 405, map[string]string{"error": "post only"})
			return
		}
		if !lim.allow(clientIP(r)) {
			writeJSON(w, 429, map[string]string{"error": "too many requests"})
			return
		}
		var req struct{ Event, Theme, Lang, App, V string }
		if json.NewDecoder(http.MaxBytesReader(w, r.Body, 1024)).Decode(&req) != nil || !a.countUsage(req.Event, req.Theme, req.Lang, req.App, req.V, time.Now()) {
			writeJSON(w, 400, map[string]string{"error": "bad request"})
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})
}
