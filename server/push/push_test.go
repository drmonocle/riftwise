package main

import (
	"encoding/json"
	"os"
	"path/filepath"
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
