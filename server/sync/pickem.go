package main

// The Worlds Pick'Em leaderboard: each account's Swiss and bracket picks, scored against Riot's results.
//
// - POST pickem/submit {event, picks:[{s,r,a,b,w}], teams:[{u,c,n}]} (signed in): enters or updates the picks.
//   A pick for a series already played is ignored, and a stored pick can't change once its series is done, so
//   nobody can pick with the result in hand. Each pick is stamped when first seen.
// - GET pickem/board?event=worlds-2026: the top 50 by score, how many entered, how many series are decided, and
//   the caller's own row when signed in.
// - POST pickem/leave {event} (signed in): deletes the account's picks for that event.
//
// Results come from the push service's copy of Riot's schedule (/api/push/schedule, one request a minute for
// everyone) and are kept in <data>/pickem/<event>/results.json, so a series that leaves Riot's schedule window
// still counts. Teams are matched the way the picker does it: by code (TLAW = TL), by name, else the one team
// whose name starts Riot's ("Team Liquid Alienware").
//
// Points: 1 per Swiss series, 2 per quarterfinal, 3 per semifinal, 4 for the final.

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
)

var pickemScheduleURL = "http://127.0.0.1:8092/riftwise/api/push/schedule"

type pickemPick struct {
	S string `json:"s"` // "swiss" | "ko"
	R int    `json:"r"` // round (Swiss 1..5; knockouts 1 = quarterfinal, 2 = semifinal, 3 = final)
	A string `json:"a"` // team page slugs
	B string `json:"b"`
	W string `json:"w"` // the winner picked (a or b)
	T int64  `json:"t"` // when first entered (unix ms)
}

type pickemTeam struct {
	U string `json:"u"`
	C string `json:"c"`
	N string `json:"n"`
}

type pickemEntry struct {
	Name    string       `json:"name"`
	Picks   []pickemPick `json:"picks"`
	Updated int64        `json:"updated"`
	Hidden  bool         `json:"hidden,omitempty"` // the name isn't shown to anyone else (pickem/hide)
}

type pickemResult struct {
	ID    string `json:"id"`
	A     string `json:"a"` // slugs
	B     string `json:"b"`
	W     string `json:"w"`
	KO    bool   `json:"ko"`
	Start string `json:"start"`
}

type pickemRow struct {
	Rank   int    `json:"rank"`
	Name   string `json:"name"`
	Score  int    `json:"score"`
	Right  int    `json:"right"`
	Scored int    `json:"scored"`
	Me     bool   `json:"me,omitempty"`
	Hidden bool   `json:"hidden,omitempty"` // shown as a hidden player: Name is "" except on the caller's own row
	sortBy string // the real name, for ties: a hidden name keeps its place
}

var eventRe = regexp.MustCompile(`^(worlds|msi|first-stand)-(20\d\d)$`)
var koRe = regexp.MustCompile(`(?i)quarter|semi|final|knockout`)

var pickemMu sync.Mutex

func (s *Server) pickemDir(event string) string { return filepath.Join(s.st.dir, "pickem", event) }

func teamCode(c string) string {
	c = strings.ToUpper(strings.TrimSpace(c))
	if c == "TLAW" {
		return "TL"
	}
	return c
}

func normName(n string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(n) {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// slugOf finds the team page for Riot's code and name among the teams the entrants sent.
func slugOf(teams []pickemTeam, code, name string) string {
	c, n := teamCode(code), normName(name)
	for _, t := range teams {
		if teamCode(t.C) == c {
			return t.U
		}
	}
	for _, t := range teams {
		if normName(t.N) == n {
			return t.U
		}
	}
	var lead []string
	for _, t := range teams {
		if tn := normName(t.N); len(tn) >= 3 && strings.HasPrefix(n, tn) {
			lead = append(lead, t.U)
		}
	}
	if len(lead) == 1 {
		return lead[0]
	}
	return ""
}

type riotSched struct {
	Events []struct {
		StartTime string `json:"startTime"`
		State     string `json:"state"`
		Type      string `json:"type"`
		BlockName string `json:"blockName"`
		League    struct {
			Slug string `json:"slug"`
		} `json:"league"`
		Match struct {
			ID    string `json:"id"`
			Teams []struct {
				Name   string `json:"name"`
				Code   string `json:"code"`
				Result *struct {
					GameWins int `json:"gameWins"`
				} `json:"result"`
			} `json:"teams"`
		} `json:"match"`
	} `json:"events"`
}

var pickemSched struct {
	mu   sync.Mutex
	at   time.Time
	body riotSched
}

func loadRiotSchedule() riotSched {
	pickemSched.mu.Lock()
	defer pickemSched.mu.Unlock()
	if time.Since(pickemSched.at) < 2*time.Minute {
		return pickemSched.body
	}
	pickemSched.at = time.Now()
	c := &http.Client{Timeout: 5 * time.Second}
	resp, err := c.Get(pickemScheduleURL)
	if err != nil {
		return pickemSched.body
	}
	defer resp.Body.Close()
	var body riotSched
	if resp.StatusCode == http.StatusOK && json.NewDecoder(resp.Body).Decode(&body) == nil && len(body.Events) > 0 {
		pickemSched.body = body
	}
	return pickemSched.body
}

// results: the decided series of the event, from the stored file plus whatever Riot's schedule shows now (merged
// and saved). Needs the teams list to turn Riot's codes into slugs.
func (s *Server) pickemResults(event string, teams []pickemTeam) []pickemResult {
	league, year := eventRe.FindStringSubmatch(event)[1], eventRe.FindStringSubmatch(event)[2]
	dir := s.pickemDir(event)
	var stored []pickemResult
	readJSON(filepath.Join(dir, "results.json"), &stored)
	byID := map[string]pickemResult{}
	for _, r := range stored {
		byID[r.ID] = r
	}
	changed := false
	for _, e := range loadRiotSchedule().Events {
		if e.Type != "match" || e.League.Slug != league || !strings.HasPrefix(e.StartTime, year) || e.State != "completed" || len(e.Match.Teams) != 2 {
			continue
		}
		a, b := e.Match.Teams[0], e.Match.Teams[1]
		if a.Result == nil || b.Result == nil || a.Result.GameWins == b.Result.GameWins {
			continue
		}
		if _, ok := byID[e.Match.ID]; ok {
			continue
		}
		ua, ub := slugOf(teams, a.Code, a.Name), slugOf(teams, b.Code, b.Name)
		if ua == "" || ub == "" || ua == ub {
			continue
		}
		w := ua
		if b.Result.GameWins > a.Result.GameWins {
			w = ub
		}
		byID[e.Match.ID] = pickemResult{ID: e.Match.ID, A: ua, B: ub, W: w, KO: koRe.MatchString(e.BlockName), Start: e.StartTime}
		changed = true
	}
	out := make([]pickemResult, 0, len(byID))
	for _, r := range byID {
		out = append(out, r)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Start < out[j].Start })
	if changed {
		os.MkdirAll(dir, 0o755)
		writeJSON(filepath.Join(dir, "results.json"), out)
	}
	return out
}

func pair(a, b string) string {
	if a > b {
		a, b = b, a
	}
	return a + "|" + b
}

// decided: the result of a pick's series, if played (Swiss picks match a non-knockout series between the pair,
// knockout picks a knockout one).
func decided(results []pickemResult, p pickemPick) *pickemResult {
	for i := range results {
		r := &results[i]
		if pair(r.A, r.B) == pair(p.A, p.B) && r.KO == (p.S == "ko") {
			return r
		}
	}
	return nil
}

func points(p pickemPick) int {
	if p.S != "ko" {
		return 1
	}
	switch p.R {
	case 1:
		return 2
	case 2:
		return 3
	}
	return 4
}

func (s *Server) pickemTeams(event string) []pickemTeam {
	var teams []pickemTeam
	readJSON(filepath.Join(s.pickemDir(event), "teams.json"), &teams)
	return teams
}

func (s *Server) pickemEntries(event string) map[string]pickemEntry {
	out := map[string]pickemEntry{}
	files, _ := filepath.Glob(filepath.Join(s.pickemDir(event), "entry-*.json"))
	for _, f := range files {
		var e pickemEntry
		if readJSON(f, &e) == nil {
			out[strings.TrimSuffix(strings.TrimPrefix(filepath.Base(f), "entry-"), ".json")] = e
		}
	}
	return out
}

func displayName(a *Account) string {
	switch {
	case a.Username != "":
		return a.Username
	case a.DiscordName != "":
		return a.DiscordName
	case a.TwitchName != "":
		return a.TwitchName
	}
	id := a.ID
	if len(id) > 4 {
		id = id[:4]
	}
	return "Fan " + id
}

// board: everyone's score, ranked; me is the caller's account id ("" when not signed in).
func (s *Server) pickemBoard(event, me string) map[string]any {
	teams := s.pickemTeams(event)
	results := s.pickemResults(event, teams)
	entries := s.pickemEntries(event)
	rows := make([]pickemRow, 0, len(entries))
	for id, e := range entries {
		row := pickemRow{Name: e.Name, Me: id == me, Hidden: e.Hidden, sortBy: strings.ToLower(e.Name)}
		if e.Hidden && !row.Me {
			row.Name = ""
		}
		for _, p := range e.Picks {
			r := decided(results, p)
			if r == nil {
				continue
			}
			row.Scored++
			if r.W == p.W {
				row.Right++
				row.Score += points(p)
			}
		}
		rows = append(rows, row)
	}
	sort.SliceStable(rows, func(i, j int) bool {
		if rows[i].Score != rows[j].Score {
			return rows[i].Score > rows[j].Score
		}
		if rows[i].Right != rows[j].Right {
			return rows[i].Right > rows[j].Right
		}
		return rows[i].sortBy < rows[j].sortBy
	})
	var mine *pickemRow
	for i := range rows {
		rows[i].Rank = i + 1
		if i > 0 && rows[i].Score == rows[i-1].Score && rows[i].Right == rows[i-1].Right {
			rows[i].Rank = rows[i-1].Rank
		}
		if rows[i].Me {
			r := rows[i]
			mine = &r
		}
	}
	top := rows
	if len(top) > 50 {
		top = top[:50]
	}
	out := map[string]any{"event": event, "players": len(rows), "results": len(results), "rows": top}
	if me != "" {
		out["me"] = mine
	}
	return out
}

func (s *Server) pickemRoutes(mux *http.ServeMux, p string,
	read func(w http.ResponseWriter, r *http.Request, limitKey string, n int, window time.Duration, v any) bool,
	signedIn func(w http.ResponseWriter, r *http.Request) *Account) {

	mux.HandleFunc(p+"pickem/board", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			fail(w, 405, "get_only")
			return
		}
		if !s.lim.allow("pickem-board|"+clientIP(r), 60, time.Minute) {
			fail(w, 429, "too_many")
			return
		}
		event := r.URL.Query().Get("event")
		if !eventRe.MatchString(event) {
			fail(w, 400, "bad_event")
			return
		}
		me := ""
		if a := s.st.session(bearer(r)); a != nil {
			me = a.ID
		}
		pickemMu.Lock()
		defer pickemMu.Unlock()
		reply(w, 200, s.pickemBoard(event, me))
	})

	mux.HandleFunc(p+"pickem/submit", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Event string       `json:"event"`
			Picks []pickemPick `json:"picks"`
			Teams []pickemTeam `json:"teams"`
		}
		if !read(w, r, "pickem", 20, time.Minute, &req) {
			return
		}
		a := signedIn(w, r)
		if a == nil {
			return
		}
		if !eventRe.MatchString(req.Event) || len(req.Picks) > 200 || len(req.Teams) > 64 {
			fail(w, 400, "bad_request")
			return
		}
		pickemMu.Lock()
		defer pickemMu.Unlock()
		dir := s.pickemDir(req.Event)
		os.MkdirAll(dir, 0o755)
		// the teams: the union of what everyone sent (slug -> code, name), so results map to pages
		teams := s.pickemTeams(req.Event)
		known := map[string]bool{}
		for _, t := range teams {
			known[t.U] = true
		}
		for _, t := range req.Teams {
			if t.U != "" && !known[t.U] && len(t.U) <= 80 && len(t.C) <= 16 && len(t.N) <= 80 {
				teams = append(teams, pickemTeam{U: t.U, C: t.C, N: t.N})
				known[t.U] = true
			}
		}
		writeJSON(filepath.Join(dir, "teams.json"), teams)
		results := s.pickemResults(req.Event, teams)
		var old pickemEntry
		readJSON(filepath.Join(dir, "entry-"+a.ID+".json"), &old)
		stored := map[string]pickemPick{}
		for _, p := range old.Picks {
			stored[p.S+":"+pair(p.A, p.B)] = p
		}
		now := time.Now().UnixMilli()
		next := map[string]pickemPick{}
		for _, p := range req.Picks {
			if (p.S != "swiss" && p.S != "ko") || p.A == "" || p.B == "" || p.A == p.B || (p.W != p.A && p.W != p.B) || p.R < 1 || p.R > 9 {
				continue
			}
			key := p.S + ":" + pair(p.A, p.B)
			if prev, ok := stored[key]; ok && decided(results, prev) != nil {
				next[key] = prev // played: the stored pick stands
				continue
			}
			if decided(results, p) != nil {
				continue // already played: not a pick
			}
			p.T = now
			if prev, ok := stored[key]; ok && prev.W == p.W {
				p.T = prev.T
			}
			next[key] = p
		}
		// a stored pick for a played series stays even when the client no longer sends it (it's locked there too)
		for key, prev := range stored {
			if _, ok := next[key]; !ok && decided(results, prev) != nil {
				next[key] = prev
			}
		}
		entry := pickemEntry{Name: displayName(a), Updated: now, Hidden: old.Hidden}
		for _, p := range next {
			entry.Picks = append(entry.Picks, p)
		}
		sort.Slice(entry.Picks, func(i, j int) bool {
			return entry.Picks[i].S+":"+pair(entry.Picks[i].A, entry.Picks[i].B) < entry.Picks[j].S+":"+pair(entry.Picks[j].A, entry.Picks[j].B)
		})
		if err := writeJSON(filepath.Join(dir, "entry-"+a.ID+".json"), entry); err != nil {
			fail(w, 500, "failed")
			return
		}
		reply(w, 200, s.pickemBoard(req.Event, a.ID))
	})

	// hide (or show again) the caller's name on the board: the row stays, scored as before, shown as a hidden player
	mux.HandleFunc(p+"pickem/hide", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Event string `json:"event"`
			Hide  bool   `json:"hide"`
		}
		if !read(w, r, "pickem", 20, time.Minute, &req) {
			return
		}
		a := signedIn(w, r)
		if a == nil {
			return
		}
		if !eventRe.MatchString(req.Event) {
			fail(w, 400, "bad_event")
			return
		}
		pickemMu.Lock()
		defer pickemMu.Unlock()
		path := filepath.Join(s.pickemDir(req.Event), "entry-"+a.ID+".json")
		var e pickemEntry
		if readJSON(path, &e) != nil {
			fail(w, 404, "not_entered")
			return
		}
		e.Hidden = req.Hide
		if err := writeJSON(path, e); err != nil {
			fail(w, 500, "failed")
			return
		}
		reply(w, 200, s.pickemBoard(req.Event, a.ID))
	})

	mux.HandleFunc(p+"pickem/leave", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Event string `json:"event"`
		}
		if !read(w, r, "pickem", 20, time.Minute, &req) {
			return
		}
		a := signedIn(w, r)
		if a == nil {
			return
		}
		if !eventRe.MatchString(req.Event) {
			fail(w, 400, "bad_event")
			return
		}
		pickemMu.Lock()
		defer pickemMu.Unlock()
		os.Remove(filepath.Join(s.pickemDir(req.Event), "entry-"+a.ID+".json"))
		reply(w, 200, map[string]any{"ok": true})
	})
}
