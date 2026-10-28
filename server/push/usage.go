package main

// Anonymous daily counts for the analytics hub's RiftWise funnel (scripts/analytics/funnel.py): once a day each
// browser says it visited, with its theme, language, web or desktop app and version, and once a day that it opened
// a second page (src/usage.ts). Only the day's totals are kept, in <data>/usage/people/<date>.json (dates in US
// Eastern time, like the hub): no address, no id, nothing about who sent it.
//
// Page views the same way, for the stats home's "Most viewed this week" (src/hub/popular.ts): once a page a day each
// browser says it opened a team, player, tournament, champion or league page, with the name it shows. Kept per day
// in <data>/usage/people/views/<date>.json (page -> views and name); /api/push/popular gives the week's most opened.
//
// Only people: on 10-28 ~99.7 % of the counts came from crawlers that run the app. The app now sends a count only
// after someone pressed something ("person": true), and this side drops crawler user agents, the address ranges
// of the renderer swarms the analytics hub flags, and a second count of the same thing from the same address that
// day (the address is held only in memory, hashed, for the day). The counts from before that, crawlers included,
// stay in <data>/usage and <data>/usage/views and are no longer read.

import (
	"crypto/sha256"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
	_ "time/tzdata" // America/New_York on a Windows server without the zone database
	"unicode"
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
	dir := filepath.Join(a.dataDir, "usage", "people")
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

// ── Page views (Most viewed) ──────────────────────────────────────────────

type viewPage struct{ Page, Title string }

type pageCount struct {
	N int    `json:"n"`
	T string `json:"t"` // the name it was last counted with
}

type popularPage struct {
	Page  string `json:"page"`
	Title string `json:"title"`
	N     int    `json:"n"`
}

const (
	viewsPerPost = 20    // what one request may count (src/usage.ts sends 20 at a time)
	pagesPerDay  = 20000 // a day's file stops taking new pages here; a real day has a few thousand
	popularTop   = 12
)

var (
	viewPath = regexp.MustCompile(`^(team|player|event|champ|league)/[a-z0-9][a-z0-9-]{0,99}$`)
	// crawlers and scripts: a page they render isn't someone opening it (the app skips test browsers itself)
	botAgent = regexp.MustCompile(`(?i)bot|crawl|spider|slurp|headless|lighthouse|preview|python|curl|wget|go-http|okhttp|java/|axios|node-fetch|^$`)
	popular  struct {
		sync.Mutex
		at   time.Time
		body []byte
	}
)

// cleanTitle: the name as shown, without control characters, at most 60 letters ("" when nothing is left).
func cleanTitle(s string) string {
	s = strings.TrimSpace(strings.Map(func(r rune) rune {
		if unicode.IsControl(r) || r == unicode.ReplacementChar {
			return -1
		}
		return r
	}, s))
	if r := []rune(s); len(r) > 60 {
		s = strings.TrimSpace(string(r[:60]))
	}
	return s
}

func (a *App) viewsFile(day time.Time) string {
	return filepath.Join(a.dataDir, "usage", "people", "views", day.In(eastern).Format("2006-01-02")+".json")
}

// ── People, not crawlers ──────────────────────────────────────────────────

const seenMax = 200000 // a real day is a few thousand; past this, nothing new is counted until tomorrow

var (
	// the renderer swarms the analytics hub counts as automated (C:\goaccess\riftwise_filters.json suspect_prefixes)
	crawlerNets = []string{"72.63.", "43.119.", "47.82.", "43.104."}
	// what each address was counted for today: hashed, in memory only, gone at the next New York midnight
	seen struct {
		sync.Mutex
		day  string
		keys map[[16]byte]bool
	}
)

func crawlerNet(ip string) bool {
	for _, p := range crawlerNets {
		if strings.HasPrefix(ip, p) {
			return true
		}
	}
	return false
}

// firstFrom: true the first time today that `ip` is counted for `what` ("visit", "second", "view:player/faker").
// A crawler that opens every page in a fresh browser from one address counts once, like a person opening it twice.
func firstFrom(ip, what string, now time.Time) bool {
	day := now.In(eastern).Format("2006-01-02")
	h := sha256.Sum256([]byte(day + "|" + ip + "|" + what))
	var k [16]byte
	copy(k[:], h[:16])
	seen.Lock()
	defer seen.Unlock()
	if seen.day != day || seen.keys == nil {
		seen.day, seen.keys = day, map[[16]byte]bool{}
	}
	if seen.keys[k] || len(seen.keys) >= seenMax {
		return false
	}
	seen.keys[k] = true
	return true
}

// countViews adds one view to each page it takes (a page address it knows, with a name) and says how many.
func (a *App) countViews(pages []viewPage, now time.Time) int {
	usageMu.Lock()
	defer usageMu.Unlock()
	path := a.viewsFile(now)
	day := map[string]*pageCount{}
	if b, err := os.ReadFile(path); err == nil {
		json.Unmarshal(b, &day)
	}
	n := 0
	for i, p := range pages {
		if i == viewsPerPost {
			break
		}
		t := cleanTitle(p.Title)
		if !viewPath.MatchString(p.Page) || t == "" {
			continue
		}
		c := day[p.Page]
		if c == nil {
			if len(day) >= pagesPerDay {
				continue
			}
			c = &pageCount{}
			day[p.Page] = c
		}
		c.N++
		c.T = t
		n++
	}
	if n == 0 {
		return 0
	}
	os.MkdirAll(filepath.Dir(path), 0o755)
	b, _ := json.Marshal(day)
	tmp := path + ".tmp"
	if os.WriteFile(tmp, b, 0o644) == nil {
		os.Rename(tmp, path)
	}
	return n
}

// popularPages: the pages opened most in the seven days up to `now` (today included), at least twice, under the
// name of their latest day.
func (a *App) popularPages(now time.Time) []popularPage {
	usageMu.Lock()
	defer usageMu.Unlock()
	total := map[string]*popularPage{}
	today := now.In(eastern) // days counted back on New York's calendar (a DST day is 23 or 25 hours)
	for i := 0; i < 7; i++ {
		var day map[string]pageCount
		b, err := os.ReadFile(a.viewsFile(today.AddDate(0, 0, -i)))
		if err != nil || json.Unmarshal(b, &day) != nil {
			continue
		}
		for page, c := range day {
			p := total[page]
			if p == nil {
				p = &popularPage{Page: page, Title: c.T}
				total[page] = p
			}
			p.N += c.N
		}
	}
	out := []popularPage{}
	for _, p := range total {
		if p.N >= 2 && viewPath.MatchString(p.Page) {
			out = append(out, *p)
		}
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].N != out[j].N {
			return out[i].N > out[j].N
		}
		return out[i].Page < out[j].Page
	})
	if len(out) > popularTop {
		out = out[:popularTop]
	}
	return out
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
		var req struct {
			Event, Theme, Lang, App, V string
			Pages                      []viewPage
			Person                     bool
		}
		if json.NewDecoder(http.MaxBytesReader(w, r.Body, 8192)).Decode(&req) != nil {
			writeJSON(w, 400, map[string]string{"error": "bad request"})
			return
		}
		ip, now := clientIP(r), time.Now()
		// taken and dropped: an app that saw no one press anything (or is too old to say), a crawler's user agent,
		// a renderer swarm's address
		drop := !req.Person || botAgent.MatchString(r.UserAgent()) || crawlerNet(ip)
		bad := false
		switch req.Event {
		case "views":
			// at least one page it knows; each counted once a day from an address
			var fresh []viewPage
			known := 0
			for i, p := range req.Pages {
				if i == viewsPerPost {
					break
				}
				if !viewPath.MatchString(p.Page) || cleanTitle(p.Title) == "" {
					continue
				}
				known++
				if !drop && firstFrom(ip, "view:"+p.Page, now) {
					fresh = append(fresh, p)
				}
			}
			bad = known == 0
			if len(fresh) > 0 {
				a.countViews(fresh, now)
			}
		case "visit", "second":
			if !drop && firstFrom(ip, req.Event, now) {
				a.countUsage(req.Event, req.Theme, req.Lang, req.App, req.V, now)
			}
		default:
			bad = true
		}
		if bad {
			writeJSON(w, 400, map[string]string{"error": "bad request"})
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})

	// the week's most opened pages, worked out again every 10 minutes at most (the desktop app asks from its own origin)
	mux.HandleFunc(apiPrefix+"popular", func(w http.ResponseWriter, r *http.Request) {
		popular.Lock()
		if popular.body == nil || time.Since(popular.at) > 10*time.Minute {
			popular.body, _ = json.Marshal(map[string]any{"pages": a.popularPages(time.Now())})
			popular.at = time.Now()
		}
		b := popular.body
		popular.Unlock()
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Cache-Control", "public, max-age=600")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Write(b)
	})
}
