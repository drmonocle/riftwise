package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	webpush "github.com/SherClockHolmes/webpush-go"
)

// Riot's public key used by lolesports.com (the same one the RiftWatch app uses).
const riotKey = "0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z"
const riotBase = "https://esports-api.lolesports.com/persisted/gw"
const streamScheduleURL = "https://lolworlds.com/api.ashx?type=schedule-json"
const streamStatusURL = "https://lolworlds.com/riftwatch/stream-status.json"

const (
	pollEvery     = 45 * time.Second
	pregameWindow = 15 * time.Minute
)

type App struct {
	dataDir string
	store   *Store
	sent    *Sent
	vapid   VAPID
	locales map[string]map[string]string
	client  *http.Client

	mu          sync.Mutex
	seenWaiting map[string]bool // matches seen before they started (so a late start still alerts)
	lastPoll    time.Time
	lastErr     string
	lastStream  time.Time
}

func newApp(dataDir string) (*App, error) {
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		return nil, err
	}
	st, err := loadStore(filepath.Join(dataDir, "subs.json"))
	if err != nil {
		return nil, err
	}
	v, err := loadOrCreateVAPID(dataDir)
	if err != nil {
		return nil, err
	}
	a := &App{
		dataDir:     dataDir,
		store:       st,
		sent:        loadSent(filepath.Join(dataDir, "sent.json")),
		vapid:       v,
		locales:     loadLocales(filepath.Join(dataDir, "locales")),
		client:      &http.Client{Timeout: 20 * time.Second},
		seenWaiting: map[string]bool{},
	}
	return a, nil
}

// ---- translations: the app's own locale files, copied to <data>\locales at deploy ----

var langs = map[string]bool{"en": true, "es": true, "pt-BR": true, "ko": true, "vi": true, "zh-CN": true, "zh-TW": true, "ja": true, "fr": true, "de": true, "tr": true}

func loadLocales(dir string) map[string]map[string]string {
	out := map[string]map[string]string{}
	for l := range langs {
		if l == "en" {
			continue
		}
		b, err := os.ReadFile(filepath.Join(dir, l+".json"))
		if err != nil {
			continue
		}
		m := map[string]string{}
		if json.Unmarshal(b, &m) == nil {
			out[l] = m
		}
	}
	return out
}

var placeholder = regexp.MustCompile(`\{(\w+)\}`)

// tr translates English UI text the way the app's tl() does, filling {placeholders}.
// Context keys ("event::Worlds") fall back to the English after "::".
func (a *App) tr(lang, english string, vars map[string]string) string {
	text := stripContext(english)
	if m, ok := a.locales[lang]; ok {
		if t, ok := m[english]; ok && t != "" {
			text = t
		}
	}
	return placeholder.ReplaceAllStringFunc(text, func(p string) string {
		if v, ok := vars[p[1:len(p)-1]]; ok {
			return v
		}
		return p
	})
}

// leagueName uses the app's wording for international events (롤드컵, 先锋赛, 德玛西亚杯...).
func (a *App) leagueName(lang, slug, riotName string) string {
	switch slug {
	case "worlds":
		return a.tr(lang, "event::Worlds", nil)
	case "msi":
		return a.tr(lang, "event::MSI", nil)
	case "first_stand":
		return a.tr(lang, "event::First Stand", nil)
	case "demacia_cup":
		return a.tr(lang, "league::Demacia Cup", nil)
	}
	return riotName
}

func stripContext(s string) string {
	if i := strings.Index(s, "::"); i >= 0 {
		return s[i+2:]
	}
	return s
}

// ---- sending ----

type payload struct {
	Title string `json:"title"`
	Body  string `json:"body"`
	URL   string `json:"url"`
	Tag   string `json:"tag"`
}

// sendTo builds each subscriber's message in their language and sends it (8 at a time).
func (a *App) sendTo(subs []Sub, ttl int, build func(lang string) payload) int {
	sem := make(chan struct{}, 8)
	var wg sync.WaitGroup
	var mu sync.Mutex
	okCount := 0
	cache := map[string][]byte{}
	for i := range subs {
		s := subs[i]
		lang := s.Lang
		if !langs[lang] {
			lang = "en"
		}
		msg, ok := cache[lang]
		if !ok {
			msg, _ = json.Marshal(build(lang))
			cache[lang] = msg
		}
		wg.Add(1)
		sem <- struct{}{}
		go func() {
			defer wg.Done()
			defer func() { <-sem }()
			good := a.sendOne(&s, msg, ttl)
			if good {
				mu.Lock()
				okCount++
				mu.Unlock()
			}
		}()
	}
	wg.Wait()
	return okCount
}

func (a *App) sendOne(s *Sub, msg []byte, ttl int) bool {
	resp, err := webpush.SendNotification(msg, &webpush.Subscription{
		Endpoint: s.Endpoint,
		Keys:     webpush.Keys{P256dh: s.P256dh, Auth: s.Auth},
	}, &webpush.Options{
		Subscriber:      "https://lolworlds.com/riftwatch/",
		VAPIDPublicKey:  a.vapid.Public,
		VAPIDPrivateKey: a.vapid.Private,
		TTL:             ttl,
		Urgency:         webpush.UrgencyHigh,
		HTTPClient:      a.client,
	})
	if err != nil {
		a.store.result(s.Endpoint, false, false)
		log.Printf("send failed (%s): %v", hostOf(s.Endpoint), err)
		return false
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
	switch {
	case resp.StatusCode == 404 || resp.StatusCode == 410:
		a.store.result(s.Endpoint, false, true) // the browser dropped this subscription
		return false
	case resp.StatusCode >= 200 && resp.StatusCode < 300:
		a.store.result(s.Endpoint, true, false)
		return true
	default:
		a.store.result(s.Endpoint, false, false)
		log.Printf("send to %s: HTTP %d", hostOf(s.Endpoint), resp.StatusCode)
		return false
	}
}

func hostOf(endpoint string) string {
	if i := strings.Index(endpoint, "://"); i >= 0 {
		rest := endpoint[i+3:]
		if j := strings.Index(rest, "/"); j >= 0 {
			return rest[:j]
		}
		return rest
	}
	return "?"
}

// ---- the alert loop ----

type riotEvent struct {
	StartTime string `json:"startTime"`
	State     string `json:"state"`
	Type      string `json:"type"`
	BlockName string `json:"blockName"`
	League    struct {
		Name string `json:"name"`
		Slug string `json:"slug"`
	} `json:"league"`
	Match *struct {
		ID    string `json:"id"`
		Teams []struct {
			Name string `json:"name"`
			Code string `json:"code"`
		} `json:"teams"`
		Strategy struct {
			Count int `json:"count"`
		} `json:"strategy"`
	} `json:"match"`
}

func (a *App) riotEvents(path string) ([]riotEvent, error) {
	req, _ := http.NewRequest("GET", riotBase+path, nil)
	req.Header.Set("x-api-key", riotKey)
	resp, err := a.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("%s: HTTP %d", path, resp.StatusCode)
	}
	var body struct {
		Data struct {
			Schedule struct {
				Events []riotEvent `json:"events"`
			} `json:"schedule"`
		} `json:"data"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 8<<20)).Decode(&body); err != nil {
		return nil, err
	}
	return body.Data.Schedule.Events, nil
}

func (a *App) alertLoop() {
	for {
		a.pollMatches()
		if time.Since(a.lastStream) >= 2*time.Minute {
			a.pollStream()
			a.lastStream = time.Now()
		}
		time.Sleep(pollEvery)
	}
}

func (a *App) pollMatches() {
	sched, err1 := a.riotEvents("/getSchedule?hl=en-US")
	live, err2 := a.riotEvents("/getLive?hl=en-US")
	a.mu.Lock()
	a.lastPoll = time.Now()
	a.lastErr = ""
	if err1 != nil {
		a.lastErr = err1.Error()
	} else if err2 != nil {
		a.lastErr = err2.Error()
	}
	a.mu.Unlock()
	if err1 != nil && err2 != nil {
		log.Printf("riot feed: %v / %v", err1, err2)
		return
	}
	// getLive knows about starts first; getSchedule covers what's coming up
	byID := map[string]riotEvent{}
	for _, e := range sched {
		if e.Type == "match" && e.Match != nil && e.Match.ID != "" {
			byID[e.Match.ID] = e
		}
	}
	for _, e := range live {
		if e.Type == "match" && e.Match != nil && e.Match.ID != "" && e.State == "inProgress" {
			if old, ok := byID[e.Match.ID]; ok && e.StartTime == "" {
				e.StartTime = old.StartTime
			}
			byID[e.Match.ID] = e
		}
	}
	now := time.Now()
	for id, e := range byID {
		if len(e.Match.Teams) < 2 {
			continue
		}
		t1, t2 := strings.ToUpper(e.Match.Teams[0].Code), strings.ToUpper(e.Match.Teams[1].Code)
		if t1 == "" || t2 == "" || t1 == "TBD" || t2 == "TBD" {
			continue
		}
		start, _ := time.Parse(time.RFC3339, e.StartTime)
		switch e.State {
		case "unstarted":
			a.mu.Lock()
			a.seenWaiting[id] = true
			a.mu.Unlock()
			until := start.Sub(now)
			if !start.IsZero() && until > 0 && until <= pregameWindow && a.sent.claim("pre:"+id) {
				a.alertMatch("pregame", id, e, t1, t2, int(math.Ceil(until.Minutes())))
			}
		case "inProgress":
			a.mu.Lock()
			waited := a.seenWaiting[id]
			a.mu.Unlock()
			// Alert when we saw it waiting, or it began in the last 30 minutes (covers restarts)
			fresh := waited || (!start.IsZero() && now.Sub(start) < 30*time.Minute)
			if a.sent.claim("kick:"+id) && fresh {
				a.alertMatch("kickoff", id, e, t1, t2, 0)
			}
		}
	}
}

func (a *App) alertMatch(kind, id string, e riotEvent, t1, t2 string, minutes int) {
	var subs []Sub
	for _, s := range a.store.all() {
		if (kind == "kickoff" && !s.Kickoff) || (kind == "pregame" && !s.Pregame) {
			continue
		}
		if s.follows(t1) || s.follows(t2) {
			subs = append(subs, s)
		}
	}
	if len(subs) == 0 {
		return
	}
	bo := fmt.Sprint(e.Match.Strategy.Count)
	url := "/riftwatch/#match/" + id
	ok := a.sendTo(subs, map[string]int{"kickoff": 1800, "pregame": 900}[kind], func(lang string) payload {
		league := a.leagueName(lang, e.League.Slug, e.League.Name)
		if kind == "pregame" {
			return payload{
				Title: "⏰ " + a.tr(lang, "Starting soon: {a} vs {b}", map[string]string{"a": t1, "b": t2}),
				Body:  a.tr(lang, "{league} · starts in {n} min", map[string]string{"league": league, "n": fmt.Sprint(minutes)}),
				URL:   url, Tag: "pre-" + id,
			}
		}
		return payload{
			Title: "🔴 " + a.tr(lang, "MATCH LIVE: {a} vs {b}", map[string]string{"a": t1, "b": t2}),
			Body:  a.tr(lang, "{league} match is now live! (Bo{n})", map[string]string{"league": league, "n": bo}),
			URL:   url, Tag: "live-" + id,
		}
	})
	log.Printf("%s %s vs %s (%s): sent %d/%d", kind, t1, t2, e.League.Slug, ok, len(subs))
}

type streamEvent struct {
	ID       string `json:"id"`
	Type     string `json:"type"`
	Event    string `json:"event"`
	Season   string `json:"season"`
	Team1    string `json:"team1"`
	Team2    string `json:"team2"`
	Name     string `json:"name"`
	Tag      string `json:"tag"`
	IsBanger bool   `json:"isBanger"`
	UtcIso   string `json:"utcIso"`
}

// pollStream alerts banger followers when an S-tier game starts on the 24/7 stream (unless on break).
func (a *App) pollStream() {
	if resp, err := a.client.Get(streamStatusURL); err == nil {
		var st struct {
			OnBreak *bool `json:"onBreak"`
		}
		_ = json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&st)
		resp.Body.Close()
		if st.OnBreak != nil && *st.OnBreak {
			return
		}
	}
	resp, err := a.client.Get(streamScheduleURL)
	if err != nil {
		log.Printf("stream schedule: %v", err)
		return
	}
	defer resp.Body.Close()
	var events []streamEvent
	if err := json.NewDecoder(io.LimitReader(resp.Body, 16<<20)).Decode(&events); err != nil {
		log.Printf("stream schedule: %v", err)
		return
	}
	now := time.Now()
	for _, ev := range events {
		banger := ev.IsBanger || strings.EqualFold(strings.TrimSpace(ev.Tag), "banger")
		if !banger || ev.ID == "" {
			continue
		}
		start, err := time.Parse(time.RFC3339, ev.UtcIso)
		if err != nil || now.Before(start) || now.Sub(start) > 45*time.Minute {
			continue
		}
		if !a.sent.claim("banger:" + ev.ID + ":" + ev.UtcIso) {
			continue
		}
		var subs []Sub
		for _, s := range a.store.all() {
			if s.Banger {
				subs = append(subs, s)
			}
		}
		if len(subs) == 0 {
			continue
		}
		ok := a.sendTo(subs, 1800, func(lang string) payload {
			matchup := ev.Team1 + " vs " + ev.Team2
			if ev.Team1 == "" || ev.Team2 == "" {
				matchup = ev.Name
				if matchup == "" {
					matchup = a.tr(lang, "Legendary match", nil)
				}
			}
			event := strings.TrimSpace(a.tr(lang, "event::"+ev.Event, nil) + " " + ev.Season)
			return payload{
				Title: "🔥 " + a.tr(lang, "S-TIER BANGER AIRING NOW", nil),
				Body:  a.tr(lang, "{matchup} ({event}) is playing on the 24/7 stream!", map[string]string{"matchup": matchup, "event": event}),
				URL:   "/riftwatch/", Tag: "banger-" + ev.ID,
			}
		})
		log.Printf("banger %s: sent %d/%d", ev.ID, ok, len(subs))
	}
}

// sendSample sends a sample alert, for testing, to the people following team (any team for "test").
func (a *App) sendSample(kind, team string) int {
	var subs []Sub
	for _, s := range a.store.all() {
		if kind == "test" || kind == "banger" || s.follows(team) {
			subs = append(subs, s)
		}
	}
	return a.sendTo(subs, 300, func(lang string) payload {
		switch kind {
		case "kickoff":
			return payload{Title: "🔴 " + a.tr(lang, "MATCH LIVE: {a} vs {b}", map[string]string{"a": team, "b": "GEN"}),
				Body: a.tr(lang, "{league} match is now live! (Bo{n})", map[string]string{"league": "LCK", "n": "5"}), URL: "/riftwatch/", Tag: "sample"}
		case "pregame":
			return payload{Title: "⏰ " + a.tr(lang, "Starting soon: {a} vs {b}", map[string]string{"a": team, "b": "GEN"}),
				Body: a.tr(lang, "{league} · starts in {n} min", map[string]string{"league": a.leagueName(lang, "worlds", "Worlds"), "n": "15"}), URL: "/riftwatch/", Tag: "sample"}
		case "banger":
			return payload{Title: "🔥 " + a.tr(lang, "S-TIER BANGER AIRING NOW", nil),
				Body: a.tr(lang, "{matchup} ({event}) is playing on the 24/7 stream!", map[string]string{"matchup": "SKT vs SSG", "event": a.tr(lang, "event::Worlds", nil) + " S7 (2017)"}), URL: "/riftwatch/", Tag: "sample"}
		}
		return a.testPayload(lang)
	})
}

func (a *App) testPayload(lang string) payload {
	return payload{
		Title: a.tr(lang, "RiftWatch test alert", nil),
		Body:  a.tr(lang, "Alerts work. You'll get one like this when a team you follow starts a match.", nil),
		URL:   "/riftwatch/", Tag: "test",
	}
}
