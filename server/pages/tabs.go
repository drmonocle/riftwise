package main

// The app's other tabs as pages of their own (riftwise.gg/schedule, /schedule/<league>, /results, /stream,
// /watchlist, /news, /settings), so they can be linked, bookmarked and found in search. The schedule and results
// pages carry the matches themselves in plain HTML and schema.org SportsEvents, from the schedule the push
// service keeps (one Riot request a minute for everyone, -schedule).
//
// Also the breadcrumbs (schema.org BreadcrumbList) of every stats page.

import (
	"encoding/json"
	"html"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// scheduleURL: the push service's copy of Riot's schedule (server/push, /api/push/schedule)
var scheduleURL = "http://127.0.0.1:8092/riftwise/api/push/schedule"

type tabInfo struct {
	title, desc, name string
	index             bool
}

var tabPages = map[string]tabInfo{
	"schedule":  {"LoL esports schedule: today's and upcoming pro matches | RiftWise", "Every upcoming professional League of Legends match (Worlds, MSI, LCK, LPL, LEC, LTA and more) in your time zone, with head-to-head records, match prep and calendar reminders.", "Schedule", true},
	"results":   {"LoL esports results: the latest pro match scores | RiftWise", "The latest professional League of Legends results (Worlds, MSI, LCK, LPL, LEC, LTA and more), with every game's draft and stats a click away.", "Results", true},
	"stream":    {"LoL Worlds 24/7: classic pro games streaming nonstop | RiftWise", "A 24/7 stream of classic League of Legends World Championship and MSI games, with what's on now and next.", "24/7 Stream", true},
	"news":      {"LoL esports news sources | RiftWise", "Where to read League of Legends esports news: LoL Esports, regional outlets and roster-move trackers, in your language where there is one.", "News", true},
	"watchlist": {"Follow teams and players | RiftWise", "Follow your teams and players to see their next matches first.", "Watchlist", false},
	"settings":  {"Settings | RiftWise", "RiftWise settings: language, spoilers, alerts and sync.", "Settings", false},
}

type riotEvent struct {
	StartTime string `json:"startTime"`
	State     string `json:"state"`
	Type      string `json:"type"`
	BlockName string `json:"blockName"`
	League    struct {
		Name string `json:"name"`
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
		Strategy struct {
			Count int `json:"count"`
		} `json:"strategy"`
	} `json:"match"`
}

// schedCache: the schedule, asked for at most every two minutes; the last good copy stays when the push service
// doesn't answer.
var schedCache struct {
	mu     sync.Mutex
	at     time.Time
	events []riotEvent
}

func loadSchedule() []riotEvent {
	schedCache.mu.Lock()
	defer schedCache.mu.Unlock()
	if time.Since(schedCache.at) < 2*time.Minute {
		return schedCache.events
	}
	schedCache.at = time.Now()
	c := &http.Client{Timeout: 5 * time.Second}
	resp, err := c.Get(scheduleURL)
	if err != nil {
		return schedCache.events
	}
	defer resp.Body.Close()
	var body struct {
		Events []riotEvent `json:"events"`
	}
	if resp.StatusCode == http.StatusOK && json.NewDecoder(resp.Body).Decode(&body) == nil && len(body.Events) > 0 {
		evs := body.Events[:0]
		for _, e := range body.Events {
			if e.Type == "match" && len(e.Match.Teams) == 2 {
				evs = append(evs, e)
			}
		}
		schedCache.events = evs
	}
	return schedCache.events
}

// tabPage: the title, description and contents of a tab's page; ok false when the address isn't one.
func tabPage(parts []string) (info tabInfo, extra *intlPage, ok bool) {
	info, ok = tabPages[parts[0]]
	if !ok || len(parts) > 2 || (len(parts) == 2 && parts[0] != "schedule" && parts[0] != "results") {
		return info, nil, false
	}
	crumbs := [][2]string{{"RiftWise", publicURL}, {info.name, publicURL + parts[0]}}
	if parts[0] != "schedule" && parts[0] != "results" {
		return info, &intlPage{LD: []json.RawMessage{breadcrumbs(crumbs)}}, true
	}
	done := parts[0] == "results"
	league, leagueName := "", ""
	if len(parts) == 2 {
		league = strings.ToLower(parts[1])
	}
	var rows []riotEvent
	for _, e := range loadSchedule() {
		if league != "" && e.League.Slug != league {
			continue
		}
		if league != "" && leagueName == "" {
			leagueName = e.League.Name
		}
		if (e.State == "completed") == done {
			rows = append(rows, e)
		}
	}
	if league != "" {
		if leagueName == "" {
			// a league with nothing on the schedule now: the page works (the app shows it), but isn't listed
			info.index = false
			leagueName = parts[1]
		}
		if done {
			info.title = leagueName + " results: latest scores | RiftWise"
			info.desc = "The latest " + leagueName + " League of Legends results, with every game's draft and stats a click away."
		} else {
			info.title = leagueName + " schedule: upcoming matches | RiftWise"
			info.desc = "Every upcoming " + leagueName + " League of Legends match in your time zone, with head-to-head records, match prep and calendar reminders."
		}
		crumbs = append(crumbs, [2]string{leagueName, publicURL + parts[0] + "/" + league})
	}
	sort.SliceStable(rows, func(i, j int) bool {
		if done {
			return rows[i].StartTime > rows[j].StartTime
		}
		return rows[i].StartTime < rows[j].StartTime
	})
	if len(rows) > 40 {
		rows = rows[:40]
	}
	var h strings.Builder
	head := map[bool]string{false: "Upcoming matches", true: "Latest results"}[done]
	if leagueName != "" {
		head = leagueName + ": " + strings.ToLower(head[:1]) + head[1:]
	}
	h.WriteString("<h2>" + html.EscapeString(head) + "</h2>")
	if len(rows) == 0 {
		h.WriteString("<p>Nothing on the schedule right now.</p>")
	} else {
		h.WriteString("<ul>")
	}
	var events []map[string]any
	for _, e := range rows {
		a, b := e.Match.Teams[0], e.Match.Teams[1]
		when := e.StartTime
		if t, err := time.Parse(time.RFC3339, e.StartTime); err == nil {
			when = t.UTC().Format("Jan 2, 15:04 UTC")
		}
		vs := a.Name + " vs " + b.Name
		if done && a.Result != nil && b.Result != nil {
			vs = a.Name + " " + strconv.Itoa(a.Result.GameWins) + "–" + strconv.Itoa(b.Result.GameWins) + " " + b.Name
		}
		stage := e.League.Name
		if e.BlockName != "" {
			stage += " · " + e.BlockName
		}
		bo := ""
		if n := e.Match.Strategy.Count; n > 1 {
			bo = " (Bo" + strconv.Itoa(n) + ")"
		}
		h.WriteString(`<li><time datetime="` + html.EscapeString(e.StartTime) + `">` + html.EscapeString(when) + "</time> · " +
			html.EscapeString(stage) + ": " + html.EscapeString(vs+bo) + "</li>")
		if !done && len(events) < 20 && a.Name != "TBD" && b.Name != "TBD" {
			status := "https://schema.org/EventScheduled"
			events = append(events, map[string]any{
				"@context": "https://schema.org", "@type": "SportsEvent", "name": a.Name + " vs " + b.Name + " – " + e.League.Name,
				"startDate": e.StartTime, "eventStatus": status, "sport": "League of Legends esports",
				"eventAttendanceMode": "https://schema.org/OnlineEventAttendanceMode",
				"location":            map[string]any{"@type": "VirtualLocation", "url": "https://lolesports.com/"},
				"organizer":           map[string]any{"@type": "Organization", "name": "Riot Games", "url": "https://www.riotgames.com/"},
				"competitor": []map[string]any{
					{"@type": "SportsTeam", "name": a.Name}, {"@type": "SportsTeam", "name": b.Name},
				},
				"url": publicURL + parts[0] + map[bool]string{true: "/" + league, false: ""}[league != ""],
			})
		}
	}
	if len(rows) > 0 {
		h.WriteString("</ul>")
	}
	ld := []json.RawMessage{breadcrumbs(crumbs)}
	for _, ev := range events {
		if b, err := json.Marshal(ev); err == nil {
			ld = append(ld, b)
		}
	}
	return info, &intlPage{Title: info.title, Desc: info.desc, HTML: h.String(), LD: ld}, true
}

// scheduleLeagues: the leagues with something on the schedule (their /schedule/<league> pages go in the sitemap)
func scheduleLeagues() []string {
	seen := map[string]bool{}
	var out []string
	for _, e := range loadSchedule() {
		if e.League.Slug != "" && !seen[e.League.Slug] {
			seen[e.League.Slug] = true
			out = append(out, e.League.Slug)
		}
	}
	sort.Strings(out)
	return out
}

// breadcrumbs: a schema.org BreadcrumbList of (name, address) pairs.
func breadcrumbs(items [][2]string) json.RawMessage {
	list := make([]map[string]any, 0, len(items))
	for i, it := range items {
		list = append(list, map[string]any{"@type": "ListItem", "position": i + 1, "name": it[0], "item": it[1]})
	}
	b, _ := json.Marshal(map[string]any{"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": list})
	return b
}

// entityCrumbs: where a team, player, tournament, match, champion or league page sits under Pro Stats.
func entityCrumbs(kind, title, canonical string) json.RawMessage {
	name := strings.TrimSuffix(title, brand)
	if i := strings.Index(name, " – "); i > 0 {
		name = name[:i]
	}
	items := [][2]string{{"Pro Stats", publicURL + "stats"}}
	switch kind {
	case "event", "game":
		items = append(items, [2]string{"Tournaments", publicURL + "stats/tournaments"})
	case "league":
		items = append(items, [2]string{"Leagues", publicURL + "stats/leagues"})
	case "champ":
		items = append(items, [2]string{"Champions", publicURL + "stats/champions"})
	case "team":
		items = append(items, [2]string{"Power Rankings", publicURL + "stats/rankings"})
	}
	return breadcrumbs(append(items, [2]string{name, canonical}))
}
