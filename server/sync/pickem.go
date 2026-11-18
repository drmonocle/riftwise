package main

// The Worlds Pick'Em leaderboard: each account's Swiss and bracket picks, scored against Riot's results.
//
// - POST pickem/submit {event, picks:[{s,m,r,a,b,w}], teams:[{u,c,n}], group?} (signed in): enters or updates the picks.
//   A pick for a series already started or played is ignored, and a stored pick can't change once started/done, so
//   nobody can pick with the result in hand. Each pick is stamped when first seen.
// - GET pickem/board?event=worlds-2026[&group=CODE]: the top 50 by score (all members when filtered to a friends league),
//   how many entered, how many series are decided, the caller's own row and picks when signed in.
// - POST pickem/leave {event} (signed in): deletes the account's picks for that event.
// - GET pickem/groups | POST pickem/group/create | POST pickem/group/join | POST pickem/group/leave (signed in):
//   private friends league boards keyed by 6-character invite code.
//
// Results come from the push service's copy of Riot's schedule (/api/push/schedule, one request a minute for
// everyone) and are kept in <data>/pickem/<event>/results.json, so a series that leaves Riot's schedule window
// still counts. Teams are matched the way the picker does it: by code+name, name, code (TLAW = TL), else prefix.
//
// Points: Swiss 1, Quarterfinal 2, Semifinal 3, Final 4; regional/season match picks: 1 regular season, 2 playoffs.

import (
	"crypto/rand"
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
	S string `json:"s"` // "swiss" | "ko" | "match"
	M string `json:"m,omitempty"`
	R int    `json:"r"` // round (Swiss 1..5; knockouts 1 = quarterfinal, 2 = semifinal, 3 = final; match 1 = regular, 2 = playoff)
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

var eventRe = regexp.MustCompile(`^(season|worlds|msi|first-stand|lck|lpl|lec|lcs|lcp|cblol|emea-masters|demacia-cup)-(20\d\d)$`)
var matchIDRe = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)
var groupCodeRe = regexp.MustCompile(`^[A-HJ-NP-Z2-9]{6}$`)
var koRe = regexp.MustCompile(`(?i)quarter|semi|final|knockout|playoff`)

const groupAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

var pickemMu sync.Mutex

func (s *Server) pickemDir(event string) string { return filepath.Join(s.st.dir, "pickem", event) }
func (s *Server) pickemGroupsDir() string       { return filepath.Join(s.st.dir, "pickem-groups") }

type pickemGroup struct {
	Code    string   `json:"code"`
	Name    string   `json:"name"`
	Owner   string   `json:"owner"`
	Created int64    `json:"created"`
	Members []string `json:"members"`
}

func matchPickemLeague(prefix, riotSlug string) bool {
	switch prefix {
	case "season":
		return riotSlug != ""
	case "first-stand":
		return riotSlug == "first_stand" || riotSlug == "first-stand"
	case "cblol":
		return riotSlug == "cblol-brazil" || riotSlug == "cblol"
	case "emea-masters":
		return riotSlug == "emea_masters" || riotSlug == "emea-masters"
	case "demacia-cup":
		return riotSlug == "demacia_cup" || riotSlug == "demacia-cup"
	case "lcs":
		return riotSlug == "lcs" || riotSlug == "lta_n" || riotSlug == "lta_north"
	default:
		return riotSlug == prefix
	}
}

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
// Prefer an exact (code+name) or exact-name match before code-only so cross-league boards don't collide.
func slugOf(teams []pickemTeam, code, name string) string {
	c, n := teamCode(code), normName(name)
	if c != "" && n != "" {
		for _, t := range teams {
			if teamCode(t.C) == c && normName(t.N) == n {
				return t.U
			}
		}
	}
	if n != "" {
		for _, t := range teams {
			if normName(t.N) == n {
				return t.U
			}
		}
	}
	if c != "" {
		for _, t := range teams {
			if teamCode(t.C) == c {
				return t.U
			}
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
		if e.Type != "match" || !matchPickemLeague(league, e.League.Slug) || !strings.HasPrefix(e.StartTime, year) || e.State != "completed" || len(e.Match.Teams) != 2 {
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

func pickKey(p pickemPick) string {
	if p.S == "match" {
		return "match:" + p.M
	}
	return p.S + ":" + pair(p.A, p.B)
}

func startedMatchIDs(sched riotSched, now time.Time) map[string]bool {
	out := map[string]bool{}
	for _, e := range sched.Events {
		if e.Type != "match" || e.Match.ID == "" {
			continue
		}
		if e.State == "inProgress" || e.State == "completed" {
			out[e.Match.ID] = true
			continue
		}
		if t, err := time.Parse(time.RFC3339, e.StartTime); err == nil && !t.After(now) {
			out[e.Match.ID] = true
		}
	}
	return out
}

// decided: the result of a pick's series, if played (schedule match picks match by match id; Swiss picks match a
// non-knockout series between the pair, knockout picks a knockout one).
func decided(results []pickemResult, p pickemPick) *pickemResult {
	if p.S == "match" {
		for i := range results {
			if results[i].ID == p.M {
				return &results[i]
			}
		}
		return nil
	}
	for i := range results {
		r := &results[i]
		if pair(r.A, r.B) == pair(p.A, p.B) && r.KO == (p.S == "ko") {
			return r
		}
	}
	return nil
}

func points(p pickemPick, r *pickemResult) int {
	if p.S == "match" {
		if p.R >= 2 || (r != nil && r.KO) {
			return 2
		}
		return 1
	}
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

func containsStr(list []string, v string) bool {
	for _, x := range list {
		if x == v {
			return true
		}
	}
	return false
}

func (s *Server) newGroupCode() (string, error) {
	dir := s.pickemGroupsDir()
	for attempt := 0; attempt < 16; attempt++ {
		var raw [6]byte
		if _, err := rand.Read(raw[:]); err != nil {
			return "", err
		}
		var b [6]byte
		for i := range b {
			b[i] = groupAlphabet[int(raw[i])&31]
		}
		code := string(b[:])
		if _, err := os.Stat(filepath.Join(dir, code+".json")); os.IsNotExist(err) {
			return code, nil
		}
	}
	return "", os.ErrExist
}

func (s *Server) loadGroup(code string) (*pickemGroup, error) {
	var g pickemGroup
	if err := readJSON(filepath.Join(s.pickemGroupsDir(), code+".json"), &g); err != nil {
		return nil, err
	}
	return &g, nil
}

func (s *Server) saveGroup(g *pickemGroup) error {
	if err := os.MkdirAll(s.pickemGroupsDir(), 0o755); err != nil {
		return err
	}
	return writeJSON(filepath.Join(s.pickemGroupsDir(), g.Code+".json"), g)
}

func (s *Server) memberGroupCodes(id string) []string {
	var codes []string
	_ = readJSON(filepath.Join(s.pickemGroupsDir(), "member-"+id+".json"), &codes)
	return codes
}

func (s *Server) saveMemberGroupCodes(id string, codes []string) error {
	if err := os.MkdirAll(s.pickemGroupsDir(), 0o755); err != nil {
		return err
	}
	return writeJSON(filepath.Join(s.pickemGroupsDir(), "member-"+id+".json"), codes)
}

func groupSummary(g *pickemGroup, me string) map[string]any {
	return map[string]any{
		"code":    g.Code,
		"name":    g.Name,
		"members": len(g.Members),
		"owner":   me != "" && g.Owner == me,
		"joined":  me != "" && containsStr(g.Members, me),
	}
}

func (s *Server) myPickemGroups(me string) []map[string]any {
	codes := s.memberGroupCodes(me)
	out := make([]map[string]any, 0, len(codes))
	for _, c := range codes {
		if g, err := s.loadGroup(c); err == nil && containsStr(g.Members, me) {
			out = append(out, groupSummary(g, me))
		}
	}
	return out
}

// board: everyone's score, ranked; me is the caller's account id ("" when not signed in).
func (s *Server) pickemBoard(event, me, groupCode string) (map[string]any, int, string) {
	var grp *pickemGroup
	var memberSet map[string]bool
	if groupCode != "" {
		code := strings.ToUpper(strings.TrimSpace(groupCode))
		if !groupCodeRe.MatchString(code) {
			return nil, 400, "bad_group"
		}
		g, err := s.loadGroup(code)
		if err != nil {
			return nil, 404, "group_not_found"
		}
		grp = g
		memberSet = map[string]bool{}
		for _, id := range g.Members {
			memberSet[id] = true
		}
	}
	teams := s.pickemTeams(event)
	results := s.pickemResults(event, teams)
	entries := s.pickemEntries(event)
	scoreEntry := func(id string, e pickemEntry) pickemRow {
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
				row.Score += points(p, r)
			}
		}
		return row
	}
	var rows []pickemRow
	if grp != nil {
		rows = make([]pickemRow, 0, len(grp.Members))
		for _, id := range grp.Members {
			if e, ok := entries[id]; ok {
				rows = append(rows, scoreEntry(id, e))
			} else if acct := s.st.account(id); acct != nil {
				name := displayName(acct)
				rows = append(rows, pickemRow{Name: name, Me: id == me, sortBy: strings.ToLower(name)})
			}
		}
	} else {
		rows = make([]pickemRow, 0, len(entries))
		for id, e := range entries {
			rows = append(rows, scoreEntry(id, e))
		}
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
	if grp == nil && len(top) > 50 {
		top = top[:50]
	}
	out := map[string]any{"event": event, "players": len(rows), "results": len(results), "rows": top}
	if grp != nil {
		out["group"] = groupSummary(grp, me)
	}
	if me != "" {
		out["me"] = mine
		if mineEntry, ok := entries[me]; ok {
			out["myPicks"] = mineEntry.Picks
		}
	}
	return out, 200, ""
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
		group := r.URL.Query().Get("group")
		me := ""
		if a := s.st.session(bearer(r)); a != nil {
			me = a.ID
		}
		pickemMu.Lock()
		defer pickemMu.Unlock()
		board, code, errMsg := s.pickemBoard(event, me, group)
		if errMsg != "" {
			fail(w, code, errMsg)
			return
		}
		reply(w, 200, board)
	})

	mux.HandleFunc(p+"pickem/groups", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			fail(w, 405, "get_only")
			return
		}
		if !s.lim.allow("pickem-board|"+clientIP(r), 60, time.Minute) {
			fail(w, 429, "too_many")
			return
		}
		a := signedIn(w, r)
		if a == nil {
			return
		}
		pickemMu.Lock()
		defer pickemMu.Unlock()
		reply(w, 200, map[string]any{"groups": s.myPickemGroups(a.ID)})
	})

	mux.HandleFunc(p+"pickem/group/create", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Name string `json:"name"`
		}
		if !read(w, r, "pickem-group", 10, time.Minute, &req) {
			return
		}
		a := signedIn(w, r)
		if a == nil {
			return
		}
		name := strings.TrimSpace(req.Name)
		nr := len([]rune(name))
		if nr < 1 || nr > 40 {
			fail(w, 400, "bad_name")
			return
		}
		pickemMu.Lock()
		defer pickemMu.Unlock()
		codes := s.memberGroupCodes(a.ID)
		if len(codes) >= 12 {
			fail(w, 400, "too_many_groups")
			return
		}
		code, err := s.newGroupCode()
		if err != nil {
			fail(w, 500, "failed")
			return
		}
		g := &pickemGroup{Code: code, Name: name, Owner: a.ID, Created: time.Now().UnixMilli(), Members: []string{a.ID}}
		if err := s.saveGroup(g); err != nil {
			fail(w, 500, "failed")
			return
		}
		codes = append(codes, code)
		if err := s.saveMemberGroupCodes(a.ID, codes); err != nil {
			fail(w, 500, "failed")
			return
		}
		reply(w, 200, map[string]any{"group": groupSummary(g, a.ID), "groups": s.myPickemGroups(a.ID)})
	})

	mux.HandleFunc(p+"pickem/group/join", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Code string `json:"code"`
		}
		if !read(w, r, "pickem-group", 15, time.Minute, &req) {
			return
		}
		a := signedIn(w, r)
		if a == nil {
			return
		}
		code := strings.ToUpper(strings.TrimSpace(req.Code))
		if !groupCodeRe.MatchString(code) {
			fail(w, 400, "bad_group")
			return
		}
		pickemMu.Lock()
		defer pickemMu.Unlock()
		g, err := s.loadGroup(code)
		if err != nil {
			fail(w, 404, "group_not_found")
			return
		}
		if !containsStr(g.Members, a.ID) {
			if len(g.Members) >= 200 {
				fail(w, 400, "group_full")
				return
			}
			codes := s.memberGroupCodes(a.ID)
			if len(codes) >= 12 {
				fail(w, 400, "too_many_groups")
				return
			}
			g.Members = append(g.Members, a.ID)
			if err := s.saveGroup(g); err != nil {
				fail(w, 500, "failed")
				return
			}
			if !containsStr(codes, code) {
				codes = append(codes, code)
				_ = s.saveMemberGroupCodes(a.ID, codes)
			}
		}
		reply(w, 200, map[string]any{"group": groupSummary(g, a.ID), "groups": s.myPickemGroups(a.ID)})
	})

	mux.HandleFunc(p+"pickem/group/leave", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Code string `json:"code"`
		}
		if !read(w, r, "pickem-group", 15, time.Minute, &req) {
			return
		}
		a := signedIn(w, r)
		if a == nil {
			return
		}
		code := strings.ToUpper(strings.TrimSpace(req.Code))
		if !groupCodeRe.MatchString(code) {
			fail(w, 400, "bad_group")
			return
		}
		pickemMu.Lock()
		defer pickemMu.Unlock()
		codes := s.memberGroupCodes(a.ID)
		keptCodes := codes[:0]
		for _, c := range codes {
			if c != code {
				keptCodes = append(keptCodes, c)
			}
		}
		_ = s.saveMemberGroupCodes(a.ID, keptCodes)
		if g, err := s.loadGroup(code); err == nil && containsStr(g.Members, a.ID) {
			kept := make([]string, 0, len(g.Members))
			for _, m := range g.Members {
				if m != a.ID {
					kept = append(kept, m)
				}
			}
			if len(kept) == 0 {
				_ = os.Remove(filepath.Join(s.pickemGroupsDir(), code+".json"))
			} else {
				g.Members = kept
				if g.Owner == a.ID {
					g.Owner = kept[0]
				}
				_ = s.saveGroup(g)
			}
		}
		reply(w, 200, map[string]any{"ok": true, "groups": s.myPickemGroups(a.ID)})
	})

	mux.HandleFunc(p+"pickem/submit", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Event string       `json:"event"`
			Picks []pickemPick `json:"picks"`
			Teams []pickemTeam `json:"teams"`
			Group string       `json:"group,omitempty"`
		}
		if !read(w, r, "pickem", 20, time.Minute, &req) {
			return
		}
		a := signedIn(w, r)
		if a == nil {
			return
		}
		if !eventRe.MatchString(req.Event) || len(req.Picks) > 500 || len(req.Teams) > 256 {
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
		started := startedMatchIDs(loadRiotSchedule(), time.Now())
		isLocked := func(p pickemPick) bool {
			return decided(results, p) != nil || (p.S == "match" && started[p.M])
		}
		var old pickemEntry
		readJSON(filepath.Join(dir, "entry-"+a.ID+".json"), &old)
		stored := map[string]pickemPick{}
		for _, p := range old.Picks {
			stored[pickKey(p)] = p
		}
		now := time.Now().UnixMilli()
		next := map[string]pickemPick{}
		for _, p := range req.Picks {
			if p.S == "match" {
				if !matchIDRe.MatchString(p.M) {
					continue
				}
			} else if p.S != "swiss" && p.S != "ko" {
				continue
			}
			if p.A == "" || p.B == "" || p.A == p.B || (p.W != p.A && p.W != p.B) || p.R < 1 || p.R > 9 {
				continue
			}
			key := pickKey(p)
			if prev, ok := stored[key]; ok && isLocked(prev) {
				next[key] = prev // started or played: the stored pick stands
				continue
			}
			if isLocked(p) {
				continue // already started or played: not a pick
			}
			p.T = now
			if prev, ok := stored[key]; ok && prev.W == p.W {
				p.T = prev.T
			}
			next[key] = p
		}
		// a stored pick for a started/played series stays even when the client no longer sends it
		for key, prev := range stored {
			if _, ok := next[key]; !ok && isLocked(prev) {
				next[key] = prev
			}
		}
		entry := pickemEntry{Name: displayName(a), Updated: now, Hidden: old.Hidden}
		for _, p := range next {
			entry.Picks = append(entry.Picks, p)
		}
		sort.Slice(entry.Picks, func(i, j int) bool {
			return pickKey(entry.Picks[i]) < pickKey(entry.Picks[j])
		})
		if err := writeJSON(filepath.Join(dir, "entry-"+a.ID+".json"), entry); err != nil {
			fail(w, 500, "failed")
			return
		}
		if req.Group != "" {
			if board, code, errMsg := s.pickemBoard(req.Event, a.ID, req.Group); errMsg == "" && code == 200 {
				reply(w, 200, board)
				return
			}
		}
		board, _, _ := s.pickemBoard(req.Event, a.ID, "")
		reply(w, 200, board)
	})

	// hide (or show again) the caller's name on the board: the row stays, scored as before, shown as a hidden player
	mux.HandleFunc(p+"pickem/hide", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Event string `json:"event"`
			Hide  bool   `json:"hide"`
			Group string `json:"group,omitempty"`
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
		if req.Group != "" {
			if board, code, errMsg := s.pickemBoard(req.Event, a.ID, req.Group); errMsg == "" && code == 200 {
				reply(w, 200, board)
				return
			}
		}
		board, _, _ := s.pickemBoard(req.Event, a.ID, "")
		reply(w, 200, board)
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

// refreshPickem updates results.json for every active Pick'Em folder on disk so decided series are stored even when
// nobody opens Pick'Em before Riot's rolling schedule window drops a finished match.
func (s *Server) refreshPickem() {
	entries, err := os.ReadDir(filepath.Join(s.st.dir, "pickem"))
	if err != nil {
		return
	}
	for _, e := range entries {
		name := e.Name()
		if !e.IsDir() || !eventRe.MatchString(name) {
			continue
		}
		pickemMu.Lock()
		s.pickemResults(name, s.pickemTeams(name))
		pickemMu.Unlock()
	}
}

func (s *Server) startPickemRefresh(interval time.Duration, stop <-chan struct{}) {
	go func() {
		select {
		case <-time.After(10 * time.Second):
		case <-stop:
			return
		}
		s.refreshPickem()
		t := time.NewTicker(interval)
		defer t.Stop()
		for {
			select {
			case <-t.C:
				s.refreshPickem()
			case <-stop:
				return
			}
		}
	}()
}
