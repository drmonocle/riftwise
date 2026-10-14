// riftwatch-push sends RiftWatch's phone and browser alerts (Web Push).
//
// It watches Riot's lolesports feed and the 24/7 stream schedule, and sends:
//   - "starting soon" 15 minutes before a match of a team you follow,
//   - "match live" when it starts,
//   - "S-tier banger airing now" when a legendary game starts on the 24/7 stream.
//
// The web app (lolworlds.com/riftwatch) registers a browser's push address and the teams it follows
// through /riftwatch/api/push/*, which IIS forwards here. Nothing else about the person is stored.
//
//	riftwatch-push serve  [-data DIR] [-addr 127.0.0.1:8092]   run the API and the alert loop
//	riftwatch-push key    [-data DIR]                          print the public VAPID key
//	riftwatch-push stats  [-data DIR]                          subscriber counts
//	riftwatch-push sample [-data DIR] -kind kickoff|pregame|banger|test [-team T1]
//	                                                           send a sample alert to followers of a team
package main

import (
	"flag"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

const version = "1.0.0"

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: riftwatch-push serve|key|stats|sample [flags]")
		os.Exit(2)
	}
	cmd := os.Args[1]
	fs := flag.NewFlagSet(cmd, flag.ExitOnError)
	dataDir := fs.String("data", `C:\Sites\riftwatch-push-data`, "data folder (keys, subscriptions, locales, logs)")
	addr := fs.String("addr", "127.0.0.1:8092", "listen address (serve)")
	kind := fs.String("kind", "test", "sample: kickoff, pregame, banger or test")
	team := fs.String("team", "T1", "sample: send to people following this team")
	_ = fs.Parse(os.Args[2:])

	app, err := newApp(*dataDir)
	if err != nil {
		log.Fatal(err)
	}

	switch cmd {
	case "serve":
		app.openLog()
		log.Printf("riftwatch-push %s starting on %s, %d subscriptions", version, *addr, app.store.count())
		go app.alertLoop()
		log.Fatal(app.serveHTTP(*addr))
	case "key":
		fmt.Println(app.vapid.Public)
	case "stats":
		byLang := map[string]int{}
		for _, s := range app.store.all() {
			byLang[s.Lang]++
		}
		langs := make([]string, 0, len(byLang))
		for l := range byLang {
			langs = append(langs, l)
		}
		sort.Strings(langs)
		fmt.Printf("subscriptions: %d\n", app.store.count())
		for _, l := range langs {
			fmt.Printf("  %s: %d\n", l, byLang[l])
		}
	case "sample":
		n := app.sendSample(*kind, strings.ToUpper(*team))
		fmt.Printf("sent %s sample to %d subscriptions\n", *kind, n)
	default:
		fmt.Fprintln(os.Stderr, "unknown command", cmd)
		os.Exit(2)
	}
}

// openLog sends the log to <data>\logs\push.log (the previous one is kept as push.1.log above 5 MB).
func (a *App) openLog() {
	dir := filepath.Join(a.dataDir, "logs")
	_ = os.MkdirAll(dir, 0o755)
	p := filepath.Join(dir, "push.log")
	if fi, err := os.Stat(p); err == nil && fi.Size() > 5<<20 {
		_ = os.Rename(p, filepath.Join(dir, "push.1.log"))
	}
	f, err := os.OpenFile(p, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		log.Printf("log file: %v", err)
		return
	}
	log.SetOutput(io.MultiWriter(os.Stdout, f))
	log.SetFlags(log.LstdFlags)
}
