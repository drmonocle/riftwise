package main

// riftwise.gg/feed.xml: the latest pro results as an RSS feed (feed readers, Discord/Slack feed bots, IFTTT...),
// from the schedule the push service keeps. Each item is one finished series, newest first, linking to the match
// page. Upcoming matches aren't in it: a feed is for things that happened. ?teams=T1&leagues=lck narrows it to those
// teams and leagues, as the calendar does (calendar.go wanted), so every team and league page can offer its own feed.

import (
	"encoding/json"
	"fmt"
	"html"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"
)

const feedMax = 60

func (s *store) serveFeed(w http.ResponseWriter, r *http.Request) {
	teams, leagues := listParam(r, "teams"), listParam(r, "leagues")
	var done []riotEvent
	for _, e := range loadSchedule() {
		a, b := e.Match.Teams[0], e.Match.Teams[1]
		if e.State == "completed" && a.Result != nil && b.Result != nil && e.Match.ID != "" && wanted(e, teams, leagues) {
			done = append(done, e)
		}
	}
	// a narrowed feed is named after what it follows: "RiftWise: T1, LCK results"
	title, self := "RiftWise: LoL esports results", publicURL+"feed.xml"
	if len(teams)+len(leagues) > 0 {
		var names []string
		for _, key := range []string{"teams", "leagues"} {
			for _, v := range strings.Split(r.URL.Query().Get(key), ",") {
				if v = strings.TrimSpace(v); v != "" && len(v) <= 40 {
					names = append(names, v)
				}
			}
		}
		sort.Strings(names)
		if len(names) > 6 {
			names = append(names[:6], "…")
		}
		title = "RiftWise: " + strings.Join(names, ", ") + " results"
		self += "?" + r.URL.RawQuery
	}
	sort.SliceStable(done, func(i, j int) bool { return done[i].StartTime > done[j].StartTime })
	if len(done) > feedMax {
		done = done[:feedMax]
	}
	var sb strings.Builder
	sb.WriteString(`<?xml version="1.0" encoding="UTF-8"?>` + "\n")
	sb.WriteString(`<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">` + "\n<channel>\n")
	sb.WriteString("<title>" + html.EscapeString(title) + "</title>\n")
	sb.WriteString("<link>" + publicURL + "results</link>\n")
	sb.WriteString(`<atom:link href="` + html.EscapeString(self) + `" rel="self" type="application/rss+xml"/>` + "\n")
	sb.WriteString("<description>The latest professional League of Legends results (Worlds, MSI, LCK, LPL, LEC, LTA and more), with every game's draft and stats a click away on riftwise.gg.</description>\n")
	sb.WriteString("<language>en</language>\n")
	sb.WriteString("<lastBuildDate>" + time.Now().UTC().Format(time.RFC1123Z) + "</lastBuildDate>\n")
	sb.WriteString("<ttl>10</ttl>\n")
	// the whole feed also carries the week's recap (hub/weekly.json, built nightly): one item a week, its guid the
	// week's Monday, so a reader shows it once and the latest numbers are on the page it links to
	if len(teams)+len(leagues) == 0 {
		if it := s.weeklyItem(); it != "" {
			sb.WriteString(it)
		}
	}
	for _, e := range done {
		a, b := e.Match.Teams[0], e.Match.Teams[1]
		title := a.Name + " " + strconv.Itoa(a.Result.GameWins) + "–" + strconv.Itoa(b.Result.GameWins) + " " + b.Name + " · " + e.League.Name
		if e.BlockName != "" {
			title += " · " + e.BlockName
		}
		link := publicURL + "match/riot-" + e.Match.ID
		when := e.StartTime
		if t, err := time.Parse(time.RFC3339, e.StartTime); err == nil {
			when = t.UTC().Format(time.RFC1123Z)
		}
		bo := ""
		if n := e.Match.Strategy.Count; n > 1 {
			bo = " (best of " + strconv.Itoa(n) + ")"
		}
		desc := a.Name + " beat " + b.Name
		if b.Result.GameWins > a.Result.GameWins {
			desc = b.Name + " beat " + a.Name
		}
		desc += " " + strconv.Itoa(max(a.Result.GameWins, b.Result.GameWins)) + "–" + strconv.Itoa(min(a.Result.GameWins, b.Result.GameWins)) + bo +
			" in " + e.League.Name + ". Drafts, builds and every game's stats: " + link
		sb.WriteString("<item>\n<title>" + html.EscapeString(title) + "</title>\n<link>" + html.EscapeString(link) + "</link>\n" +
			`<guid isPermaLink="false">riftwise-match-` + html.EscapeString(e.Match.ID) + "</guid>\n" +
			"<pubDate>" + when + "</pubDate>\n<category>" + html.EscapeString(e.League.Name) + "</category>\n" +
			"<description>" + html.EscapeString(desc) + "</description>\n</item>\n")
	}
	sb.WriteString("</channel>\n</rss>\n")
	body := sb.String()
	w.Header().Set("Content-Type", "application/rss+xml; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=300")
	w.Header().Set("Content-Length", strconv.Itoa(len(body)))
	if r.Method != http.MethodHead {
		w.Write([]byte(body))
	}
}

// weeklyItem: the RSS item for the current stats build's weekly.json ("" without one).
func (s *store) weeklyItem() string {
	s.mu.RLock()
	ver := s.version
	s.mu.RUnlock()
	b, err := os.ReadFile(filepath.Join(s.stats, ver, "hub", "weekly.json"))
	if ver == "" || err != nil {
		return ""
	}
	var wk struct {
		From, To      string
		Series, Games int
		Upsets        []struct {
			W, L, S string
			P       float64
		}
		Best []struct {
			A, B string
			R    float64
		}
	}
	if json.Unmarshal(b, &wk) != nil || wk.Series == 0 {
		return ""
	}
	to, err := time.Parse("2006-01-02", wk.To)
	if err != nil {
		return ""
	}
	monday := to.AddDate(0, 0, -((int(to.Weekday()) + 6) % 7))
	desc := fmt.Sprintf("%d series and %d games in the top leagues and international events from %s to %s.", wk.Series, wk.Games, wk.From, wk.To)
	if len(wk.Upsets) > 0 {
		u := wk.Upsets[0]
		desc += fmt.Sprintf(" Biggest upset: %s beat %s %s (%d%% before game 1).", u.W, u.L, u.S, int(u.P*100+0.5))
	}
	if len(wk.Best) > 0 {
		desc += fmt.Sprintf(" Best game: %s vs %s, rated %.0f.", wk.Best[0].A, wk.Best[0].B, wk.Best[0].R)
	}
	link := publicURL + "stats/weekly"
	// one element a line, as the result items
	lines := []string{
		"<item>",
		"<title>" + html.EscapeString("The week in pro LoL: "+wk.From+" to "+wk.To) + "</title>",
		"<link>" + link + "</link>",
		`<guid isPermaLink="false">riftwise-weekly-` + monday.Format("2006-01-02") + "</guid>",
		"<pubDate>" + to.Add(23*time.Hour).Format(time.RFC1123Z) + "</pubDate>",
		"<category>Weekly recap</category>",
		"<description>" + html.EscapeString(desc) + "</description>",
		"</item>",
	}
	return strings.Join(lines, "\n") + "\n"
}
