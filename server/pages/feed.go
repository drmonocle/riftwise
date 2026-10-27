package main

// riftwise.gg/feed.xml: the latest pro results as an RSS feed (feed readers, Discord/Slack feed bots, IFTTT...),
// from the schedule the push service keeps. Each item is one finished series, newest first, linking to the match
// page. Upcoming matches aren't in it: a feed is for things that happened.

import (
	"html"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"
)

const feedMax = 60

func serveFeed(w http.ResponseWriter, r *http.Request) {
	var done []riotEvent
	for _, e := range loadSchedule() {
		a, b := e.Match.Teams[0], e.Match.Teams[1]
		if e.State == "completed" && a.Result != nil && b.Result != nil && e.Match.ID != "" {
			done = append(done, e)
		}
	}
	sort.SliceStable(done, func(i, j int) bool { return done[i].StartTime > done[j].StartTime })
	if len(done) > feedMax {
		done = done[:feedMax]
	}
	var sb strings.Builder
	sb.WriteString(`<?xml version="1.0" encoding="UTF-8"?>` + "\n")
	sb.WriteString(`<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">` + "\n<channel>\n")
	sb.WriteString("<title>RiftWise: LoL esports results</title>\n")
	sb.WriteString("<link>" + publicURL + "results</link>\n")
	sb.WriteString(`<atom:link href="` + publicURL + `feed.xml" rel="self" type="application/rss+xml"/>` + "\n")
	sb.WriteString("<description>The latest professional League of Legends results (Worlds, MSI, LCK, LPL, LEC, LTA and more), with every game's draft and stats a click away on riftwise.gg.</description>\n")
	sb.WriteString("<language>en</language>\n")
	sb.WriteString("<lastBuildDate>" + time.Now().UTC().Format(time.RFC1123Z) + "</lastBuildDate>\n")
	sb.WriteString("<ttl>10</ttl>\n")
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
