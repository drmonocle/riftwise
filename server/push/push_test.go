package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestAllowedEndpoint(t *testing.T) {
	good := []string{
		"https://fcm.googleapis.com/fcm/send/abc",
		"https://updates.push.services.mozilla.com/wpush/v2/abc",
		"https://wns2-par02p.notify.windows.com/w/?token=abc",
		"https://web.push.apple.com/QAbc",
	}
	bad := []string{
		"http://fcm.googleapis.com/fcm/send/abc",
		"https://evil.example.com/fcm.googleapis.com",
		"https://fcm.googleapis.com.evil.com/x",
		"https://notify.windows.com.evil.com/x",
		"https://127.0.0.1/x",
		"https://user@fcm.googleapis.com/x",
		"https://fcm.googleapis.com:8443/x",
	}
	for _, u := range good {
		if !allowedEndpoint(u) {
			t.Errorf("should allow %s", u)
		}
	}
	for _, u := range bad {
		if allowedEndpoint(u) {
			t.Errorf("should refuse %s", u)
		}
	}
}

func TestTranslate(t *testing.T) {
	a := &App{locales: map[string]map[string]string{
		"ko": {"MATCH LIVE: {a} vs {b}": "경기 시작: {a} vs {b}", "event::Worlds": "롤드컵"},
	}}
	if got := a.tr("ko", "MATCH LIVE: {a} vs {b}", map[string]string{"a": "T1", "b": "GEN"}); got != "경기 시작: T1 vs GEN" {
		t.Errorf("ko: %q", got)
	}
	if got := a.tr("en", "MATCH LIVE: {a} vs {b}", map[string]string{"a": "T1", "b": "GEN"}); got != "MATCH LIVE: T1 vs GEN" {
		t.Errorf("en: %q", got)
	}
	if got := a.leagueName("ko", "worlds", "Worlds"); got != "롤드컵" {
		t.Errorf("ko worlds: %q", got)
	}
	if got := a.leagueName("en", "worlds", "Worlds"); got != "Worlds" {
		t.Errorf("en worlds falls back to the English after ::, got %q", got)
	}
	if got := a.leagueName("en", "lck", "LCK"); got != "LCK" {
		t.Errorf("lck: %q", got)
	}
}

func TestKeyLengths(t *testing.T) {
	// a real-looking p256dh (65 bytes) and auth (16 bytes), base64url without padding
	p := "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM"
	if n := b64len(p); n != 65 {
		t.Errorf("p256dh decoded to %d bytes", n)
	}
	if n := b64len("tBHItJI5svbpez7KI4CCXg"); n != 16 {
		t.Errorf("auth decoded to %d bytes", n)
	}
}

// The kept schedule: fresh as it is, then marked stale (the app asks Riot itself), gone after a week; a restart
// reads the saved copy back with its own time.
func TestKeptSchedule(t *testing.T) {
	at := time.Date(2026, 10, 28, 12, 0, 0, 0, time.UTC)
	doc := []byte(`{"events":[{"type":"match"}],"at":"2026-10-28T12:00:00Z"}`)
	if b, ok := scheduleBody(doc, at, at.Add(5*time.Minute)); !ok || string(b) != string(doc) {
		t.Errorf("fresh: %s %v", b, ok)
	}
	b, ok := scheduleBody(doc, at, at.Add(time.Hour))
	var got struct {
		Events []json.RawMessage `json:"events"`
		Stale  bool              `json:"stale"`
	}
	if !ok || json.Unmarshal(b, &got) != nil || !got.Stale || len(got.Events) != 1 {
		t.Errorf("stale: %s %v", b, ok)
	}
	if string(doc) != `{"events":[{"type":"match"}],"at":"2026-10-28T12:00:00Z"}` {
		t.Error("the kept copy was changed")
	}
	if _, ok := scheduleBody(doc, at, at.Add(8*24*time.Hour)); ok {
		t.Error("a week-old copy served")
	}
	if _, ok := scheduleBody(nil, at, at); ok {
		t.Error("nothing served")
	}
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "schedule.json"), doc, 0o644); err != nil {
		t.Fatal(err)
	}
	a := &App{dataDir: dir}
	a.loadSavedSchedule()
	if string(a.schedJSON) != string(doc) || !a.schedAt.Equal(at) {
		t.Errorf("saved copy: %s %v", a.schedJSON, a.schedAt)
	}
}

// Record alerts: built from a records.json row in the subscriber's language; the preview shows the current #1s.
func TestRecordAlertPreview(t *testing.T) {
	dir := t.TempDir()
	hub := filepath.Join(dir, "20261028000000", "hub")
	if err := os.MkdirAll(hub, 0o755); err != nil {
		t.Fatal(err)
	}
	os.WriteFile(filepath.Join(dir, "latest.json"), []byte(`{"version": "20261028000000"}`), 0o644)
	os.WriteFile(filepath.Join(hub, "records.json"), []byte(`{"built": "x", "game": {"fastest": [{"v": 15.63, "a": "TOP", "b": "RNG", "date": "2018-09-07", "t": "LPL 2018", "g": "lpl-qf-1", "gn": 4}]},
		"player": {"kills": [{"v": 28, "pl": "Peyz", "team": "Gen.G", "date": "2024-05-19", "t": "MSI 2024"}], "perfect": [{"v": 1}]},
		"team": {"streaks": [{"v": 28, "team": "Flash Wolves", "date": "2017-04-09"}], "titles": "not a list"}}`), 0o644)
	a := &App{statsDir: dir, locales: map[string]map[string]string{
		"ko": {"New all-time record: {who}": "역대 신기록: {who}", "Most kills by one player": "한 선수 최다 킬"},
	}}
	got := a.previewRecords("ko")
	if len(got) != 3 {
		t.Fatalf("previews: %+v", got)
	}
	var kills payload
	for _, p := range got {
		if p.Tag == "rec-player-kills" {
			kills = p
		}
		if p.Tag == "rec-game-fastest" && (p.Body != "Fastest wins: 15:38 · LPL 2018" || p.URL != siteURL+"match/lpl-qf-1?g=4") {
			t.Errorf("fastest: %+v", p)
		}
	}
	if kills.Title != "🏆 역대 신기록: Peyz (Gen.G)" || kills.Body != "한 선수 최다 킬: 28 · MSI 2024" {
		t.Errorf("kills in Korean: %+v", kills)
	}
	if _, _, ok := a.recordAlert(newRecord{S: "player", K: "perfect", R: map[string]any{"v": 1.0}}, "en"); ok {
		t.Error("a record without an alert")
	}
}

// The day's usage totals: counted by event and value, nothing else kept; odd values are folded, junk refused.
func TestUsageCounts(t *testing.T) {
	a := &App{dataDir: t.TempDir()}
	now := time.Date(2026, 10, 28, 3, 0, 0, 0, time.UTC) // still Oct 27 in New York
	for _, e := range [][]string{{"visit", "rift", "ko", "web", "0.7.52"}, {"visit", "classic", "en", "desktop", "0.7.52"}, {"visit", "rift", "ko", "web", "<script>"}, {"second", "", "", "", ""}} {
		if !a.countUsage(e[0], e[1], e[2], e[3], e[4], now) {
			t.Fatalf("refused %v", e)
		}
	}
	if a.countUsage("delete", "x", "x", "x", "x", now) {
		t.Error("unknown event counted")
	}
	b, err := os.ReadFile(filepath.Join(a.dataDir, "usage", "people", "2026-10-27.json"))
	if err != nil {
		t.Fatal(err)
	}
	var d usageDay
	json.Unmarshal(b, &d)
	if d.Visits != 3 || d.SecondPage != 1 || d.Themes["rift"] != 2 || d.Langs["ko"] != 2 || d.Apps["desktop"] != 1 || d.Versions["other"] != 1 {
		t.Errorf("totals: %s", b)
	}
}

// Page views: only known page addresses with a name are counted, per day; the week's top needs two views or more,
// counts the last seven New York days. Over the wire: not crawlers, filtered ranges or counts without "person", and
// each address once a day.
func TestPageViews(t *testing.T) {
	a := &App{dataDir: t.TempDir()}
	now := time.Date(2026, 10, 28, 3, 0, 0, 0, time.UTC) // still Oct 27 in New York
	n := a.countViews([]viewPage{
		{"player/faker", "Faker"}, {"team/t1", "T1"}, {"team/t1", "T1\x00\n"}, {"match/x-1", "A vs B"},
		{"player/../x", "x"}, {"team/geng", "  "}, {"Player/Faker", "Faker"},
	}, now)
	if n != 3 {
		t.Errorf("counted %d, want 3", n)
	}
	b, err := os.ReadFile(filepath.Join(a.dataDir, "usage", "people", "views", "2026-10-27.json"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(b), `"team/t1":{"n":2,"t":"T1"}`) {
		t.Errorf("day file: %s", b)
	}
	// the funnel's own files stay as they were
	if _, err := os.Stat(filepath.Join(a.dataDir, "usage", "people", "2026-10-27.json")); err == nil {
		t.Error("views written to the funnel's day file")
	}
	many := make([]viewPage, 30)
	for i := range many {
		many[i] = viewPage{"champ/ahri", "Ahri"}
	}
	if n := a.countViews(many, now); n != viewsPerPost {
		t.Errorf("one request counted %d", n)
	}
	a.countViews([]viewPage{{"player/faker", "Faker"}}, now.AddDate(0, 0, -6))
	a.countViews([]viewPage{{"event/msi-2026", "MSI 2026"}, {"event/msi-2026", "MSI 2026"}}, now.AddDate(0, 0, -7)) // eight days back: left out
	top := a.popularPages(now)
	if len(top) != 3 || top[0].Page != "champ/ahri" || top[0].N != 20 || top[1].Page != "player/faker" || top[1].N != 2 || top[2].Page != "team/t1" {
		t.Errorf("top: %+v", top)
	}

	mux := http.NewServeMux()
	a.usageRoute(mux, &limiter{hits: map[string][]time.Time{}, tests: map[string]time.Time{}})
	// the filter file's ranges are left out (written with a byte-order mark, like PowerShell does)
	filters := filepath.Join(t.TempDir(), "filters.json")
	os.WriteFile(filters, []byte("\xef\xbb\xbf"+`{"suspect_prefixes":["192.0.2."]}`), 0o644)
	usageFilters.path, usageFilters.at, usageFilters.pfx = filters, time.Time{}, nil
	defer func() { usageFilters.path, usageFilters.pfx = "", nil }()
	// each post comes from its own address unless it says which (the counts are once a day per address)
	ips := 0
	post := func(ua, ip, body string) int {
		req := httptest.NewRequest("POST", apiPrefix+"usage", strings.NewReader(body))
		req.Header.Set("User-Agent", ua)
		if ip == "" {
			ips++
			ip = fmt.Sprintf("198.51.100.%d", ips)
		}
		req.Header.Set("CF-Connecting-IP", ip)
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)
		return rec.Code
	}
	chrome := "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36"
	geng := `{"event":"views","pages":[{"page":"team/geng","title":"Gen.G"}],"person":true}`
	visit := `{"event":"visit","theme":"rift","lang":"en","app":"web","v":"0.7.58","person":true}`
	for _, c := range []struct {
		what, ua, ip, body string
		code               int
	}{
		{"views", chrome, "203.0.113.5", geng, 204},
		{"the same page again from the same address", chrome, "203.0.113.5", geng, 204},
		{"junk views", chrome, "", `{"event":"views","pages":[{"page":"nope","title":"x"}],"person":true}`, 400},
		{"crawler views", "Googlebot/2.1", "", geng, 204},
		{"views before anyone pressed anything", chrome, "", `{"event":"views","pages":[{"page":"team/geng","title":"Gen.G"}]}`, 204},
		{"views from a filtered range", chrome, "192.0.2.9", geng, 204},
		{"views from another address", chrome, "", geng, 204},
		{"visit", chrome, "203.0.113.5", visit, 204},
		{"the same visit again", chrome, "203.0.113.5", visit, 204},
		{"crawler visit", "Mozilla/5.0 HeadlessChrome/141.0", "", visit, 204},
		{"visit from a filtered range", chrome, "192.0.2.77", visit, 204},
		{"visit from an older app", chrome, "", `{"event":"visit","theme":"rift","lang":"en","app":"web","v":"0.7.57"}`, 204},
		{"unknown event", chrome, "", `{"event":"delete","person":true}`, 400},
	} {
		if code := post(c.ua, c.ip, c.body); code != c.code {
			t.Errorf("%s: %d, want %d", c.what, code, c.code)
		}
	}
	today, _ := os.ReadFile(a.viewsFile(time.Now()))
	if !strings.Contains(string(today), `"team/geng":{"n":2,`) {
		t.Errorf("geng counted wrong (2 people, one of them twice, plus a crawler, an old app and a filtered range): %s", today)
	}
	var d usageDay
	b, _ = os.ReadFile(filepath.Join(a.dataDir, "usage", "people", time.Now().In(eastern).Format("2006-01-02")+".json"))
	if json.Unmarshal(b, &d) != nil || d.Visits != 1 || d.Versions["0.7.58"] != 1 {
		t.Errorf("visits counted wrong (one person, twice, plus a crawler, a filtered range and an old app): %s", b)
	}
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest("GET", apiPrefix+"popular", nil))
	var got struct{ Pages []popularPage }
	if rec.Code != 200 || json.Unmarshal(rec.Body.Bytes(), &got) != nil || got.Pages == nil || rec.Header().Get("Access-Control-Allow-Origin") != "*" {
		t.Errorf("popular: %d %s", rec.Code, rec.Body)
	}
}

// Discord: only discord.com webhook addresses are taken; a finished series becomes a message with its score.
func TestDiscord(t *testing.T) {
	for u, want := range map[string]bool{
		"https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz_ABC-123": true,
		"https://ptb.discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz_ABC-123": true,
		"https://discord.com.evil.io/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz": false,
		"http://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz_ABC-123": false,
		"https://127.0.0.1/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz": false,
		"https://discord.com/api/webhooks/123456789012345678/abc?x=https://evil": false,
	} {
		if discordURL.MatchString(u) != want {
			t.Errorf("%s: want %v", u, want)
		}
	}
	var e riotEvent
	json.Unmarshal([]byte(`{"state": "completed", "blockName": "Swiss", "league": {"name": "Worlds"}, "match": {"id": "113",
		"teams": [{"name": "T1", "code": "T1", "result": {"gameWins": 2}}, {"name": "Gen.G", "code": "GEN", "result": {"gameWins": 1}}], "strategy": {"count": 3}}}`), &e)
	m, ok := resultEmbed(e)
	if !ok || m.Title != "T1 2–1 Gen.G" || m.URL != siteURL+"match/riot-113" || !strings.HasPrefix(m.Description, "Worlds · Swiss · best of 3") {
		t.Errorf("result message: %+v", m)
	}
	// a webhook Discord no longer has is dropped; one that works stays
	gone := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(404) }))
	defer gone.Close()
	fine := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(204) }))
	defer fine.Close()
	a := &App{dataDir: t.TempDir(), client: http.DefaultClient}
	a.saveHooks([]hook{{URL: gone.URL, Results: true}, {URL: fine.URL, Results: true}, {URL: fine.URL + "/2", Records: true}})
	if n := a.postAll("results", m); n != 1 {
		t.Errorf("sent to %d", n)
	}
	if hs := a.loadHooks(); len(hs) != 2 || hs[0].URL != fine.URL {
		t.Errorf("hooks after: %+v", hs)
	}
}
