// riftwise-sync keeps RiftWise's optional accounts and syncs settings between a person's devices.
//
// Ways in (all optional; RiftWise works the same without an account):
//   - username + password (Argon2id-hashed; a one-time recovery code resets a forgotten password),
//   - a sync code (no account details at all: the code itself is the key),
//   - Discord or Twitch sign-in (only when <data>\oauth.json has that app's id and secret).
//
// What is stored per account: the username or the Discord / Twitch id and name, the password and recovery code
// hashes, and the synced data (followed teams/players/leagues/regions, settings, revealed spoilers). No email,
// no IP addresses (rate limits are kept in memory only).
//
// The web app (riftwise.gg/api/sync/*) and the Windows app (lolworlds.com/riftwise/api/sync/*) call the API,
// which IIS forwards here as /riftwise/api/sync/*.
//
//	riftwise-sync serve [-data DIR] [-addr 127.0.0.1:8094]   run the API
//	riftwise-sync stats [-data DIR]                          account counts
package main

import (
	"flag"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
)

// the app's version (package.json; npm run set-version), reported by the health check
const version = "0.7.75"

// siteURL is where a finished web sign-in lands (the provider's callback can still be the old address,
// lolworlds.com/riftwise, as registered with Discord / Twitch: oauth.json publicBase).
const siteURL = "https://riftwise.gg/"

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: riftwise-sync serve|stats [flags]")
		os.Exit(2)
	}
	cmd := os.Args[1]
	fs := flag.NewFlagSet(cmd, flag.ExitOnError)
	dataDir := fs.String("data", `C:\Sites\riftwise-sync-data`, "data folder (accounts, sessions, oauth.json, logs)")
	addr := fs.String("addr", "127.0.0.1:8094", "listen address (serve)")
	_ = fs.Parse(os.Args[2:])

	st, err := openStore(*dataDir)
	if err != nil {
		log.Fatal(err)
	}
	switch cmd {
	case "serve":
		openLog(*dataDir)
		srv := newServer(st, loadOAuth(*dataDir))
		log.Printf("riftwise-sync %s starting on %s, %d accounts, discord=%v twitch=%v", version, *addr, st.count(),
			srv.oauth.enabled("discord"), srv.oauth.enabled("twitch"))
		log.Fatal(srv.listen(*addr))
	case "stats":
		c := st.counts()
		fmt.Printf("accounts: %d (password %d, sync code %d, discord %d, twitch %d); sessions: %d\n",
			c["accounts"], c["password"], c["code"], c["discord"], c["twitch"], c["sessions"])
	default:
		fmt.Fprintln(os.Stderr, "unknown command", cmd)
		os.Exit(2)
	}
}

// openLog sends the log to <data>\logs\sync.log (the previous one is kept as sync.1.log above 5 MB).
func openLog(dataDir string) {
	dir := filepath.Join(dataDir, "logs")
	_ = os.MkdirAll(dir, 0o755)
	p := filepath.Join(dir, "sync.log")
	if fi, err := os.Stat(p); err == nil && fi.Size() > 5<<20 {
		_ = os.Rename(p, filepath.Join(dir, "sync.1.log"))
	}
	f, err := os.OpenFile(p, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		log.Printf("log file: %v", err)
		return
	}
	log.SetOutput(io.MultiWriter(os.Stdout, f))
}
