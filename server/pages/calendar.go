package main

// A calendar to subscribe to (riftwise.gg/calendar.ics?teams=T1,GEN&leagues=worlds,lck): the matches of those teams
// (Riot's team codes) and leagues (Riot's league slugs or names), from the push service's schedule (tabs.go). Calendar
// apps re-read it every few hours, so new matches and changed times show up by themselves; finished ones keep their
// score. Without teams or leagues it lists every match on the schedule.

import (
	"fmt"
	"net/http"
	"strings"
	"time"
)

func icsText(s string) string {
	r := strings.NewReplacer(`\`, `\\`, ";", `\;`, ",", `\,`, "\n", `\n`, "\r", "")
	return r.Replace(s)
}

// icsLine folds a line at 75 octets (RFC 5545), not inside a UTF-8 character.
func icsLine(b *strings.Builder, line string) {
	for len(line) > 75 {
		cut := 75
		for cut > 0 && line[cut]&0xC0 == 0x80 {
			cut--
		}
		b.WriteString(line[:cut] + "\r\n ")
		line = line[cut:]
	}
	b.WriteString(line + "\r\n")
}

// listParam: the comma-separated values of a query parameter, compared without case, spaces or punctuation
// (normName: "Gen.G", "GEN.G" and "geng" are one).
func listParam(r *http.Request, key string) map[string]bool {
	out := map[string]bool{}
	for _, v := range strings.Split(r.URL.Query().Get(key), ",") {
		if v = normName(v); v != "" {
			out[v] = true
		}
	}
	return out
}

// wanted: a match of one of the chosen teams (Riot's code or name: "T1", "Gen.G"; a stats page knows the name) or
// leagues (Riot's slug or name: "lck" or "LCK", which is also the stats pages' short name), or any match when nothing
// is chosen. The calendar and the RSS feed share it.
func wanted(e riotEvent, teams, leagues map[string]bool) bool {
	if len(teams)+len(leagues) == 0 {
		return true
	}
	for _, t := range e.Match.Teams {
		if teams[normName(t.Code)] || teams[normName(t.Name)] {
			return true
		}
	}
	return leagues[normName(e.League.Slug)] || leagues[normName(e.League.Name)]
}

func serveCalendar(w http.ResponseWriter, r *http.Request) {
	teams, leagues := listParam(r, "teams"), listParam(r, "leagues")
	now := time.Now().UTC()
	var b strings.Builder
	for _, l := range []string{"BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//RiftWise//Schedule//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
		"X-WR-CALNAME:RiftWise: LoL esports", "X-PUBLISHED-TTL:PT3H", "REFRESH-INTERVAL;VALUE=DURATION:PT3H"} {
		icsLine(&b, l)
	}
	stamp := now.Format("20060102T150405Z")
	for _, e := range loadSchedule() {
		if !wanted(e, teams, leagues) {
			continue
		}
		a, c := e.Match.Teams[0], e.Match.Teams[1]
		start, err := time.Parse(time.RFC3339, e.StartTime)
		if err != nil {
			continue
		}
		n := e.Match.Strategy.Count
		if n < 1 {
			n = 1
		}
		summary := a.Name + " vs " + c.Name
		if e.State == "completed" && a.Result != nil && c.Result != nil {
			summary = fmt.Sprintf("%s %d–%d %s", a.Name, a.Result.GameWins, c.Result.GameWins, c.Name)
		}
		stage := e.League.Name
		if e.BlockName != "" {
			stage += " · " + e.BlockName
		}
		if n > 1 {
			summary += fmt.Sprintf(" (Bo%d)", n)
		}
		uid := e.Match.ID
		if uid == "" {
			uid = e.StartTime + "-" + a.Code + "-" + c.Code
		}
		icsLine(&b, "BEGIN:VEVENT")
		icsLine(&b, "UID:"+uid+"@riftwise.gg")
		icsLine(&b, "DTSTAMP:"+stamp)
		icsLine(&b, "DTSTART:"+start.UTC().Format("20060102T150405Z"))
		// about an hour a game, as most broadcasts run
		icsLine(&b, "DTEND:"+start.Add(time.Duration(n)*time.Hour).UTC().Format("20060102T150405Z"))
		icsLine(&b, "SUMMARY:"+icsText(summary+" – "+stage))
		icsLine(&b, "DESCRIPTION:"+icsText("Match prep, head-to-head and live stats on RiftWise: "+publicURL+"schedule"))
		icsLine(&b, "URL:"+publicURL+"schedule")
		icsLine(&b, "END:VEVENT")
	}
	icsLine(&b, "END:VCALENDAR")
	w.Header().Set("Content-Type", "text/calendar; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=900")
	if r.Method != http.MethodHead {
		w.Write([]byte(b.String()))
	}
}
