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

func (a *App) pollRecords() {
	if a.statsDir == "" {
		return
	}
	var latest struct {
		Version string `json:"version"`
	}
	b, err := os.ReadFile(filepath.Join(a.statsDir, "latest.json"))
	if err != nil || json.Unmarshal(b, &latest) != nil || latest.Version == "" {
		return
	}
	b, err = os.ReadFile(filepath.Join(a.statsDir, latest.Version, "hub", "records_new.json"))
	if err != nil {
		return // builds before 0.7.47 don't write it
	}
	var list []newRecord
	if json.Unmarshal(b, &list) != nil {
		return
	}
	for _, n := range list {
		title := recordTitles[n.S+"/"+n.K]
		if title == "" {
			continue
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
			continue
		}
		var value string
		if n.K == "fastest" || n.K == "longest" {
			m := num("v") // minutes
			value = fmt.Sprintf("%d:%02d", int(m), int((m-float64(int(m)))*60+0.5))
		} else {
			value = fmt.Sprintf("%d", int(num("v")+0.5))
		}
		id := "rec:" + n.S + ":" + n.K + ":" + str("date") + ":" + who
		if !a.sent.claim(id) {
			continue
		}
		var subs []Sub
		for _, s := range a.store.all() {
			if s.Banger {
				subs = append(subs, s)
			}
		}
		if len(subs) == 0 {
			continue
		}
		url := siteURL + "stats/records"
		if g := str("g"); g != "" {
			url = siteURL + "match/" + g
			if gn := num("gn"); gn > 0 {
				url += fmt.Sprintf("?g=%d", int(gn))
			}
		}
		event := str("t")
		ok := a.sendTo(subs, 3600, func(lang string) payload {
			body := a.tr(lang, title, nil) + ": " + value
			if event != "" {
				body += " · " + event
			}
			return payload{
				Title: "🏆 " + a.tr(lang, "New all-time record: {who}", map[string]string{"who": who}),
				Body:  body,
				URL:   url,
				Tag:   "rec-" + n.S + "-" + n.K,
			}
		})
		log.Printf("record %s/%s %s (%s): sent %d/%d", n.S, n.K, who, value, ok, len(subs))
	}
}
