package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

const buildLog = `==== Mon 10/26/2026  5:14:18.39
games: 138000
done: 20261026051520 in 600s
exit 0
==== Mon 10/26/2026  9:14:19.84
done: 20261026091520 in 620s
exit 0
==== Mon 10/26/2026 13:14:19.84
Traceback (most recent call last):
exit 1
==== Tue 10/27/2026  5:14:18.39
done: 20261027051520 in 580s
exit 0
==== Tue 10/27/2026  9:14:19.84
done: 20261027091520 in 640s
exit 0
==== Tue 10/27/2026 13:14:19.84
done: 20261027131544 in 610s
exit 0
==== Tue 10/27/2026 17:00:00.00
`

func TestParseBuildLog(t *testing.T) {
	now := time.Date(2026, 10, 27, 17, 45, 0, 0, time.Local)
	runs := parseBuildLog(strings.NewReader(buildLog), now)
	if len(runs) != 7 {
		t.Fatalf("%d runs", len(runs))
	}
	if runs[0].Exit != nil || runs[0].Min != 45 {
		t.Errorf("running build: %+v", runs[0])
	}
	if runs[1].Secs != 610 || *runs[1].Exit != 0 {
		t.Errorf("last finished build: %+v", runs[1])
	}
	if runs[4].Secs != 0 || *runs[4].Exit != 1 {
		t.Errorf("failed build: %+v", runs[4])
	}
	if m := medianSecs(runs); m != 610 {
		t.Errorf("median %d", m)
	}
	// a run cut short by a restart (no exit line) isn't "running" once a newer one started
	cut := parseBuildLog(strings.NewReader("==== Tue 10/27/2026  5:14:18.39 \ngames: 1\n==== Tue 10/27/2026  9:14:19.84 \ndone: x in 5s\nexit 0\n"), now)
	if cut[1].Exit == nil || *cut[1].Exit != -1 {
		t.Errorf("cut-short run: %+v", cut[1])
	}
}

func TestStatusProblems(t *testing.T) {
	zero, one := 0, 1
	base := func() statusDoc {
		var d statusDoc
		d.Stats.Version, d.Stats.Built, d.Stats.AgeHours = "v2", "2026-10-27T13:27:00Z", 3
		d.Builds.MedianSecs = 600
		d.Builds.Recent = []buildRun{{Start: "2026-10-27T13:14:19Z", Secs: 610, Exit: &zero}}
		d.Services = []svcStatus{{Name: "pages", OK: true}, {Name: "push", OK: true}, {Name: "sync", OK: true}}
		d.Audit.Version = "v2"
		d.H2H.Updated, d.H2H.AgeHours = "2026-10-27T12:00:00Z", 4
		return d
	}
	if p := problems(base()); len(p) != 0 {
		t.Fatalf("all good, but: %+v", p)
	}
	keys := func(d statusDoc) string {
		var k []string
		for _, p := range problems(d) {
			k = append(k, p.Key)
		}
		return strings.Join(k, ",")
	}
	cases := map[string]func(*statusDoc){
		"service-sync":       func(d *statusDoc) { d.Services[2] = svcStatus{Name: "sync", Detail: "connection refused"} },
		"stats-old":          func(d *statusDoc) { d.Stats.AgeHours = 31 },
		"build-failed":       func(d *statusDoc) { d.Builds.Recent[0].Exit, d.Builds.Recent[0].Secs = &one, 0 },
		"build-slow":         func(d *statusDoc) { d.Builds.Recent[0].Secs = 1300 },
		"build-running-long": func(d *statusDoc) { d.Builds.Recent[0] = buildRun{Start: "x", Min: 21} },
		"audit-hard":         func(d *statusDoc) { d.Audit.Hard = []string{"broken link to a team"} },
		"audit-missing":      func(d *statusDoc) { d.Audit.Version = "v1" },
		"h2h-old":            func(d *statusDoc) { d.H2H.AgeHours = 14 },
		"release-failed-0.7.49": func(d *statusDoc) {
			d.Release = json.RawMessage(`{"version": "0.7.49", "result": "failed", "error": "pages not healthy"}`)
		},
	}
	for want, change := range cases {
		d := base()
		change(&d)
		if got := keys(d); got != want {
			t.Errorf("%s: got %q", want, got)
		}
	}
	// a slow build that's still within twice the usual isn't a problem
	d := base()
	d.Builds.Recent[0] = buildRun{Start: "x", Min: 15}
	if got := keys(d); got != "" {
		t.Errorf("15-minute build flagged: %q", got)
	}
	if h := hardAuditKinds(map[string]int{"broken link to a team": 2, "same champion twice in one game": 92, "series winner differs": 0}); strings.Join(h, ",") != "broken link to a team" {
		t.Errorf("hard kinds: %v", h)
	}
}

// /status and /status.json from the files on disk and the other services' health checks.
func TestStatusPage(t *testing.T) {
	s := testSite(t)
	dir := t.TempDir()
	statusScripts, statusRelease = dir, dir
	os.WriteFile(filepath.Join(dir, "build_stats.log"), []byte(buildLog), 0o644)
	os.WriteFile(filepath.Join(dir, "audit_latest.json"), []byte(`{"version": "20261015000000", "counts": {"same champion twice in one game": 3}}`), 0o644)
	// as Windows PowerShell 5.1 wrote it on the server: with a byte-order mark
	os.WriteFile(filepath.Join(dir, "status.json"), []byte("﻿"+`{"version": "0.7.49", "result": "installed", "at": "2026-10-27T15:00:00Z"}`), 0o644)
	healthy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"ok": true, "version": "0.7.49", "started": "2026-10-27T15:00:00Z", "lastSent": "2026-10-27T16:00:00Z", "lastSentTag": "rec-game-fastest"}`))
	}))
	defer healthy.Close()
	statusPush, statusSync, statusH2H = healthy.URL, "http://127.0.0.1:1/down", healthy.URL
	statusCache.at = time.Time{}
	h2hCache.at = time.Time{}

	w := httptest.NewRecorder()
	s.serveStatusJSON(w, httptest.NewRequest(http.MethodGet, "/riftwise/status.json", nil))
	var d statusDoc
	if err := json.Unmarshal(w.Body.Bytes(), &d); err != nil {
		t.Fatal(err, w.Body.String())
	}
	if d.Stats.Version != "20261015000000" || d.Alerts.Tag != "rec-game-fastest" || len(d.Builds.Recent) != 7 || d.Builds.MedianSecs != 610 {
		t.Errorf("status: %+v", d)
	}
	if !strings.Contains(string(d.Release), `"0.7.49"`) || d.Audit.Hard == nil {
		t.Errorf("release %q, hard %v", d.Release, d.Audit.Hard)
	}
	var syncDown bool
	for _, p := range d.Problems {
		syncDown = syncDown || p.Key == "service-sync"
	}
	if !syncDown {
		t.Errorf("sync down not a problem: %+v", d.Problems)
	}
	w = httptest.NewRecorder()
	s.serveStatus(w, httptest.NewRequest(http.MethodGet, "/riftwise/status", nil))
	if b := w.Body.String(); !strings.Contains(b, "RiftWise status: ") || !strings.Contains(b, "noindex") || !strings.Contains(b, "Service: sync") || !strings.Contains(b, "rec-game-fastest") || !strings.Contains(b, "Last release") {
		t.Errorf("page: %s", b)
	}
}
