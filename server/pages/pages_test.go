package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const indexHTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta
      name="description"
      content="RiftWatch: live scores."
    />
    <title>RiftWatch</title>
  </head>
  <body><div id="root"></div></body>
</html>`

func testSite(t *testing.T) *store {
	dir := t.TempDir()
	must := func(err error) {
		if err != nil {
			t.Fatal(err)
		}
	}
	must(os.WriteFile(filepath.Join(dir, "index.html"), []byte(indexHTML), 0o644))
	hub := filepath.Join(dir, "stats", "20261015000000", "hub")
	must(os.MkdirAll(filepath.Join(hub, "seo"), 0o755))
	must(os.WriteFile(filepath.Join(dir, "stats", "latest.json"), []byte(`{"version": "20261015000000"}`), 0o644))
	files := map[string]string{
		"team":   "t1\tT1 – stats | RiftWatch\tT1: 1,216-644 & more <b>\t1\nsmall-team\tSmall – stats | RiftWatch\tFew games\t0\n",
		"player": "faker\tFaker – pro stats | RiftWatch\tFaker, Mid for T1.\t1\n",
		"event":  "worlds-2025\tWorlds 2025 | RiftWatch\tWorlds 2025.\t1\n",
		"game":   "worlds-2025-finals-1\tT1 vs KT | RiftWatch\tT1 vs KT.\t1\n",
		"champ":  "ahri\tAhri in pro play | RiftWatch\tAhri.\t1\n",
		"league": "lck\tLCK – every season | RiftWatch\tLCK.\t1\n",
	}
	for k, v := range files {
		must(os.WriteFile(filepath.Join(hub, "seo", k+".tsv"), []byte(v), 0o644))
	}
	must(os.WriteFile(filepath.Join(hub, "alias.json"), []byte(`{"team": {"sk-telecom-t1": "t1"}}`), 0o644))
	s := &store{site: dir}
	s.refresh()
	return s
}

func get(s *store, path string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodGet, path, nil)
	if strings.Contains(path, "sitemap") {
		s.sitemap(w, r)
	} else {
		s.serve(w, r)
	}
	return w
}

func TestPageGetsItsOwnTags(t *testing.T) {
	s := testSite(t)
	w := get(s, "/riftwatch/team/t1")
	body := w.Body.String()
	if w.Code != 200 {
		t.Fatalf("status %d", w.Code)
	}
	for _, want := range []string{
		"<title>T1 – stats | RiftWatch</title>",
		`<meta name="description" content="T1: 1,216-644 &amp; more &lt;b&gt;" />`,
		`<link rel="canonical" href="https://lolworlds.com/riftwatch/team/t1" />`,
		`<meta property="og:title" content="T1 – stats | RiftWatch" />`,
		`<div id="root"></div>`,
	} {
		if !strings.Contains(body, want) {
			t.Errorf("missing %q in\n%s", want, body)
		}
	}
	if strings.Contains(body, "live scores") || strings.Contains(body, "noindex") {
		t.Error("old description or noindex left in")
	}
}

func TestThinPageIsNoindex(t *testing.T) {
	if !strings.Contains(get(testSite(t), "/riftwatch/team/small-team").Body.String(), `content="noindex"`) {
		t.Error("expected noindex")
	}
}

func TestUnknownAndOldNames(t *testing.T) {
	s := testSite(t)
	if w := get(s, "/riftwatch/player/nobody"); w.Code != 404 || !strings.Contains(w.Body.String(), `<div id="root">`) {
		t.Errorf("unknown player: %d", w.Code)
	}
	w := get(s, "/riftwatch/team/sk-telecom-t1")
	if w.Code != 301 || w.Header().Get("Location") != "/riftwatch/team/t1" {
		t.Errorf("old team name: %d %q", w.Code, w.Header().Get("Location"))
	}
	if w := get(s, "/riftwatch/stats/tournaments/2019"); w.Code != 200 || !strings.Contains(w.Body.String(), "in 2019") {
		t.Errorf("tournaments of a year: %d", w.Code)
	}
	if w := get(s, "/riftwatch/league/lck"); w.Code != 200 || !strings.Contains(w.Body.String(), "<title>LCK – every season | RiftWatch</title>") {
		t.Errorf("league page: %d", w.Code)
	}
	if w := get(s, "/riftwatch/stats/patches"); w.Code != 200 || !strings.Contains(w.Body.String(), "every patch") {
		t.Errorf("patches section: %d", w.Code)
	}
	if w := get(s, "/riftwatch/stats/downloads"); w.Code != 200 || !strings.Contains(w.Body.String(), "CSV") {
		t.Errorf("downloads section: %d", w.Code)
	}
	if w := get(s, "/riftwatch/stats/nope"); w.Code != 404 {
		t.Errorf("unknown section: %d", w.Code)
	}
}

func TestSitemaps(t *testing.T) {
	s := testSite(t)
	idx := get(s, "/riftwatch/sitemap.xml").Body.String()
	if !strings.Contains(idx, "sitemap-team-1.xml") || !strings.Contains(idx, "sitemap-game-1.xml") {
		t.Errorf("index: %s", idx)
	}
	teams := get(s, "/riftwatch/sitemap-team-1.xml").Body.String()
	if !strings.Contains(teams, "/riftwatch/team/t1</loc>") || strings.Contains(teams, "small-team") {
		t.Errorf("teams: %s", teams)
	}
	if !strings.Contains(get(s, "/riftwatch/sitemap-sections-1.xml").Body.String(), "/riftwatch/stats/records") {
		t.Error("sections sitemap")
	}
	if !strings.Contains(idx, "sitemap-league-1.xml") || !strings.Contains(get(s, "/riftwatch/sitemap-league-1.xml").Body.String(), "/riftwatch/league/lck</loc>") {
		t.Error("league sitemap")
	}
}

// A build from before league pages existed still loads (no league.tsv).
func TestOldBuildWithoutLeagues(t *testing.T) {
	s := testSite(t)
	os.Remove(filepath.Join(s.site, "stats", "20261015000000", "hub", "seo", "league.tsv"))
	s2 := &store{site: s.site}
	s2.refresh()
	if s2.version == "" {
		t.Fatal("build without league.tsv was rejected")
	}
	if w := get(s2, "/riftwatch/team/t1"); w.Code != 200 {
		t.Errorf("team page: %d", w.Code)
	}
	if w := get(s2, "/riftwatch/league/lck"); w.Code != 404 {
		t.Errorf("league page without data: %d", w.Code)
	}
}
