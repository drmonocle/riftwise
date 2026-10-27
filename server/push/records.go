package main

// "Record broken" alerts: the stats build writes hub/records_new.json, the all-time #1 rows of its records set in
// the last two days (scripts/stats/hub.py, next to records.json). Every ten minutes the newest build's file is
// read and each record not alerted yet goes to the subscribers who take the 24/7-stream "banger" alerts (the
// same "something special happened" opt-in). Texts come from the app's locale files like the other alerts; the
// record names are the Records page's own titles, so they are already translated.

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

type newRecord struct {
	S string         `json:"s"` // game | player | team
	K string         `json:"k"` // the record's key in records.json
	R map[string]any `json:"r"` // the #1 row
}

// recordTitles: the records worth an alert, with the Records page's title for each (a translation key).
var recordTitles = map[string]string{
	"game/fastest":   "Fastest wins",
	"game/longest":   "Longest games",
	"game/bloodiest": "Most kills in a game",
	"player/kills":   "Most kills by one player",
	"player/assists": "Most assists by one player",
	"player/dmg":     "Most damage in a game",
	"player/cs":      "Most CS in a game",
	"team/streaks":   "Longest win streaks",
}

func (a *App) recordLoop() {
	time.Sleep(time.Minute)
	for {
		a.pollRecords()
		time.Sleep(10 * time.Minute)
	}
}

// latestHub: the newest stats build's hub folder ("" without one).
func (a *App) latestHub() string {
	if a.statsDir == "" {
		return ""
	}
	var latest struct {
		Version string `json:"version"`
	}
	b, err := os.ReadFile(filepath.Join(a.statsDir, "latest.json"))
	if err != nil || json.Unmarshal(b, &latest) != nil || latest.Version == "" {
		return ""
	}
	return filepath.Join(a.statsDir, latest.Version, "hub")
}

// recordAlert: the alert for one record row in one language, and the id it is sent once under; ok false for a
// record that isn't alerted or a row without a name.
func (a *App) recordAlert(n newRecord, lang string) (p payload, id string, ok bool) {
	title := recordTitles[n.S+"/"+n.K]
	if title == "" {
		return p, "", false
	}
	str := func(k string) string {
		v, _ := n.R[k].(string)
		return v
	}
	num := func(k string) float64 {
		v, _ := n.R[k].(float64)
		return v
	}
	who := ""
	switch n.S {
	case "player":
		who = str("pl")
		if t := str("team"); t != "" && who != "" {
			who += " (" + t + ")"
		}
	case "game":
		if str("a") != "" && str("b") != "" {
			who = str("a") + " vs " + str("b")
		}
	default:
		who = str("team")
	}
	if strings.TrimSpace(who) == "" {
		return p, "", false
	}
	var value string
	if n.K == "fastest" || n.K == "longest" {
		m := num("v") // minutes
		value = fmt.Sprintf("%d:%02d", int(m), int((m-float64(int(m)))*60+0.5))
	} else {
		value = fmt.Sprintf("%d", int(num("v")+0.5))
	}
	url := siteURL + "stats/records"
	if g := str("g"); g != "" {
		url = siteURL + "match/" + g
		if gn := num("gn"); gn > 0 {
			url += fmt.Sprintf("?g=%d", int(gn))
		}
	}
	body := a.tr(lang, title, nil) + ": " + value
	if event := str("t"); event != "" {
		body += " · " + event
	}
	return payload{
		Title: "🏆 " + a.tr(lang, "New all-time record: {who}", map[string]string{"who": who}),
		Body:  body,
		URL:   url,
		Tag:   "rec-" + n.S + "-" + n.K,
	}, "rec:" + n.S + ":" + n.K + ":" + str("date") + ":" + who, true
}

func (a *App) pollRecords() {
	hub := a.latestHub()
	if hub == "" {
		return
	}
	b, err := os.ReadFile(filepath.Join(hub, "records_new.json"))
	if err != nil {
		return // builds before 0.7.47 don't write it
	}
	var list []newRecord
	if json.Unmarshal(b, &list) != nil {
		return
	}
	for _, n := range list {
		p, id, ok := a.recordAlert(n, "en")
		if !ok || !a.sent.claim(id) {
			continue
		}
		go a.postAll("records", embed{Title: p.Title, Description: p.Body, URL: p.URL, Color: 0xffc857}) // discord.go
		var subs []Sub
		for _, s := range a.store.all() {
			if s.Banger {
				subs = append(subs, s)
			}
		}
		if len(subs) == 0 {
			continue
		}
		sent := a.sendTo(subs, 3600, func(lang string) payload {
			p, _, _ := a.recordAlert(n, lang)
			return p
		})
		log.Printf("record %s/%s: %s (%s): sent %d/%d", n.S, n.K, p.Title, p.Body, sent, len(subs))
	}
}

// previewRecords: the alerts the current all-time #1 of each alerted record would send, in one language (none are
// sent). /api/push/records/preview?lang=ko shows the wording without waiting for a record to fall.
func (a *App) previewRecords(lang string) []payload {
	out := []payload{}
	hub := a.latestHub()
	if hub == "" {
		return out
	}
	b, err := os.ReadFile(filepath.Join(hub, "records.json"))
	if err != nil {
		return out
	}
	var all map[string]json.RawMessage
	if json.Unmarshal(b, &all) != nil {
		return out
	}
	keys := make([]string, 0, len(recordTitles))
	for k := range recordTitles {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, key := range keys {
		sec, k, _ := strings.Cut(key, "/")
		var lists map[string]json.RawMessage
		var rows []map[string]any
		if json.Unmarshal(all[sec], &lists) != nil || json.Unmarshal(lists[k], &rows) != nil || len(rows) == 0 {
			continue
		}
		if p, _, ok := a.recordAlert(newRecord{S: sec, K: k, R: rows[0]}, lang); ok {
			out = append(out, p)
		}
	}
	return out
}
