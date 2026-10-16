// riftwise-pages gives every RiftWise stats page (lolworlds.com/riftwise/player/faker,
// /team/t1, /tournament/worlds-2025, /match/..., /champion/ahri, /league/lck, /stats...) the app's index.html
// with that page's own title, description, canonical address and link-preview tags, so search
// engines index each page and links shared in chat apps show what they point to. It also serves
// the sitemaps. IIS sends only those addresses here; everything else stays plain IIS.
//
// Titles and descriptions come from the nightly stats build (stats/<version>/hub/seo/*.tsv), and the
// page itself is the deployed index.html; both are re-read when they change.
//
//	riftwise-pages -site C:\inetpub\wwwroot\riftwise -addr 127.0.0.1:8093
package main

import (
	"bufio"
	"encoding/json"
	"flag"
	"fmt"
	"html"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	version  = "1.4.0"
	origin   = "https://lolworlds.com"
	basePath = "/riftwise/"
	perMap   = 45000 // URLs per sitemap file (the limit is 50,000)
)

// Path segment -> seo file kind
var kinds = map[string]string{"team": "team", "player": "player", "tournament": "event", "match": "game", "champion": "champ", "league": "league"}
var kindPath = map[string]string{"team": "team", "player": "player", "event": "tournament", "game": "match", "champ": "champion", "league": "league"}

// Every build has these; league.tsv only exists in builds from 2026-10 on, so it's optional.
var requiredKinds = []string{"team", "player", "event", "game", "champ"}
var sections = map[string][2]string{
	"":            {"Pro Stats: every League of Legends esports game since 2011", "Search every pro League of Legends team, player, tournament and champion since 2011: results, brackets, drafts, builds, records and power rankings, updated through the day."},
	"tournaments": {"Pro LoL tournaments by year", "Every professional League of Legends tournament since 2011, by year: results, brackets, standings and stats."},
	"leagues":     {"Every pro LoL league and its champions", "Every professional League of Legends league since 2011: each season's winner, the most successful teams and every tournament."},
	"patches":     {"The pro LoL meta on every patch", "The most picked and banned champions on every League of Legends patch in professional play, since 2011."},
	"champions":   {"Champion pick, ban and win rates in pro play", "Pick, ban and win rates for every champion in professional League of Legends, by patch and by year."},
	"records":     {"All-time pro LoL records", "Fastest wins, longest games, most kills and other all-time records from professional League of Legends."},
	"titles":      {"Every pro LoL title winner", "Every Worlds, MSI, First Stand and league title winner in professional League of Legends history."},
	"compare":     {"Compare pro LoL teams and players", "Compare any two professional League of Legends teams or players side by side."},
	"data":        {"Free pro LoL data downloads (CSV)", "Every professional League of Legends game since 2011 as a free CSV spreadsheet: players, champions, drafts, gold, damage and objectives."},
	"prep":        {"LoL match prep for analysts and casters", "Prep any pro League of Legends match: storylines, form, head-to-head, team numbers, draft tendencies and every lane, free."},
	"rankings":    {"LoL power rankings: every pro team, every region", "Power rankings for every active professional League of Legends team on one scale across all regions, with win chances, league strength and how accurate they have been."},
	"finder":      {"Pro LoL game finder", "Find any professional League of Legends game: filter by league, year, patch, team, champion, side and result, then download the list."},
	"draft":       {"Pro LoL draft board", "Plan a League of Legends draft between two pro teams with their champion pools, first picks, bans and win rates in view."},
	"about":       {"How RiftWise counts pro LoL stats", "Where RiftWise's pro League of Legends numbers come from and what every stat means: KDA, KP, DMG%, GD per minute, presence, blind picks and more."},
}

type entry struct {
	title, desc string
	index       bool
}

type store struct {
	mu        sync.RWMutex
	site      string
	version   string
	pages     map[string]map[string]entry // kind -> slug -> entry
	order     map[string][]string         // kind -> slugs in file order (for sitemaps)
	alias     map[string]string           // old team slug -> current
	failed    string                      // a build without hub files (logged once, not retried)
	indexHTML string
	indexMod  time.Time
	checked   time.Time
}

func (s *store) refresh() {
	s.mu.RLock()
	fresh := time.Since(s.checked) < 30*time.Second
	s.mu.RUnlock()
	if fresh {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if time.Since(s.checked) < 30*time.Second {
		return
	}
	s.checked = time.Now()

	if st, err := os.Stat(filepath.Join(s.site, "index.html")); err == nil && !st.ModTime().Equal(s.indexMod) {
		if b, err := os.ReadFile(filepath.Join(s.site, "index.html")); err == nil {
			s.indexHTML, s.indexMod = string(b), st.ModTime()
			log.Printf("index.html reloaded (%d bytes)", len(b))
		}
	}

	var latest struct {
		Version string `json:"version"`
	}
	b, err := os.ReadFile(filepath.Join(s.site, "stats", "latest.json"))
	if err != nil || json.Unmarshal(b, &latest) != nil || latest.Version == "" || latest.Version == s.version || latest.Version == s.failed {
		return
	}
	hub := filepath.Join(s.site, "stats", latest.Version, "hub")
	pages := map[string]map[string]entry{}
	order := map[string][]string{}
	for _, kind := range append(requiredKinds, "league") {
		f, err := os.Open(filepath.Join(hub, "seo", kind+".tsv"))
		if err != nil && kind == "league" {
			pages[kind] = map[string]entry{}
			continue
		}
		if err != nil {
			log.Printf("stats %s: no %s.tsv (%v); keeping the previous build", latest.Version, kind, err)
			s.failed = latest.Version
			return
		}
		m := map[string]entry{}
		sc := bufio.NewScanner(f)
		sc.Buffer(make([]byte, 1<<20), 1<<20)
		for sc.Scan() {
			p := strings.Split(sc.Text(), "\t")
			if len(p) < 4 || p[0] == "" {
				continue
			}
			m[p[0]] = entry{title: p[1], desc: p[2], index: p[3] == "1"}
			order[kind] = append(order[kind], p[0])
		}
		f.Close()
		pages[kind] = m
	}
	alias := map[string]string{}
	var a struct {
		Team map[string]string `json:"team"`
	}
	if b, err := os.ReadFile(filepath.Join(hub, "alias.json")); err == nil && json.Unmarshal(b, &a) == nil {
		alias = a.Team
	}
	s.pages, s.order, s.alias, s.version = pages, order, alias, latest.Version
	log.Printf("stats %s loaded: %d teams, %d players, %d events, %d matches, %d champions, %d leagues",
		latest.Version, len(pages["team"]), len(pages["player"]), len(pages["event"]), len(pages["game"]), len(pages["champ"]), len(pages["league"]))
}

var (
	reTitle = regexp.MustCompile(`(?s)<title>.*?</title>`)
	reDesc  = regexp.MustCompile(`(?s)<meta\s+name="description"\s+content="[^"]*"\s*/?>`)
)

// page returns index.html with this page's title, description and preview tags.
func (s *store) page(title, desc, canonical string, index bool) string {
	s.mu.RLock()
	doc := s.indexHTML
	s.mu.RUnlock()
	if doc == "" {
		return ""
	}
	t, d, c := html.EscapeString(title), html.EscapeString(desc), html.EscapeString(canonical)
	doc = reTitle.ReplaceAllLiteralString(doc, "<title>"+t+"</title>")
	doc = reDesc.ReplaceAllLiteralString(doc, `<meta name="description" content="`+d+`" />`)
	var tags strings.Builder
	tags.WriteString(`<link rel="canonical" href="` + c + `" />` + "\n")
	tags.WriteString(`    <meta property="og:type" content="website" />` + "\n")
	tags.WriteString(`    <meta property="og:site_name" content="RiftWise" />` + "\n")
	tags.WriteString(`    <meta property="og:title" content="` + t + `" />` + "\n")
	tags.WriteString(`    <meta property="og:description" content="` + d + `" />` + "\n")
	tags.WriteString(`    <meta property="og:url" content="` + c + `" />` + "\n")
	tags.WriteString(`    <meta property="og:image" content="` + origin + basePath + `icon-512.png" />` + "\n")
	tags.WriteString(`    <meta name="twitter:card" content="summary" />` + "\n")
	if !index {
		tags.WriteString(`    <meta name="robots" content="noindex" />` + "\n")
	}
	tags.WriteString("  </head>")
	return strings.Replace(doc, "</head>", tags.String(), 1)
}

func (s *store) serve(w http.ResponseWriter, r *http.Request) {
	s.refresh()
	rest := strings.TrimPrefix(r.URL.Path, basePath)
	parts := strings.Split(strings.Trim(rest, "/"), "/")
	status, title, desc, index := http.StatusOK, "", "", true

	switch {
	case parts[0] == "stats":
		sec := ""
		if len(parts) > 1 {
			sec = parts[1]
		}
		info, ok := sections[sec]
		if !ok || len(parts) > 3 || (len(parts) == 3 && sec != "tournaments") {
			status, title, desc, index = http.StatusNotFound, "Page not found | RiftWise", sections[""][1], false
			break
		}
		title, desc = info[0]+" | RiftWise", info[1]
		if len(parts) == 3 {
			title = "Pro LoL tournaments in " + parts[2] + " | RiftWise"
			desc = "Every professional League of Legends tournament in " + parts[2] + ": results, brackets, standings and stats."
		}
	case len(parts) == 2 && kinds[parts[0]] != "":
		kind, slug := kinds[parts[0]], strings.ToLower(parts[1])
		s.mu.RLock()
		e, ok := s.pages[kind][slug]
		to := s.alias[slug]
		s.mu.RUnlock()
		if !ok && kind == "team" && to != "" {
			http.Redirect(w, r, basePath+"team/"+to, http.StatusMovedPermanently)
			return
		}
		if !ok {
			status, title, desc, index = http.StatusNotFound, "Page not found | RiftWise", sections[""][1], false
			break
		}
		title, desc, index = e.title, e.desc, e.index
	default:
		http.NotFound(w, r)
		return
	}

	canonical := origin + r.URL.Path
	body := s.page(title, desc, canonical, index)
	if body == "" {
		http.Error(w, "RiftWise is starting, try again in a moment", http.StatusServiceUnavailable)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	w.WriteHeader(status)
	if r.Method != http.MethodHead {
		w.Write([]byte(body))
	}
}

// Sitemaps: /riftwise/sitemap.xml lists the pieces (/riftwise/sitemap-<kind>-<n>.xml).
func (s *store) sitemap(w http.ResponseWriter, r *http.Request) {
	s.refresh()
	name := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, basePath), ".xml")
	s.mu.RLock()
	defer s.mu.RUnlock()
	lastmod := ""
	if len(s.version) >= 8 {
		lastmod = s.version[:4] + "-" + s.version[4:6] + "-" + s.version[6:8]
	}
	w.Header().Set("Content-Type", "application/xml; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=3600")
	if name == "sitemap" {
		fmt.Fprint(w, `<?xml version="1.0" encoding="UTF-8"?>`+"\n"+`<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`+"\n")
		fmt.Fprintf(w, "<sitemap><loc>%s%ssitemap-sections-1.xml</loc></sitemap>\n", origin, basePath)
		for _, kind := range []string{"team", "player", "event", "league", "champ", "game"} {
			n := 0
			for _, slug := range s.order[kind] {
				if s.pages[kind][slug].index {
					n++
				}
			}
			for i := 1; i <= (n+perMap-1)/perMap; i++ {
				fmt.Fprintf(w, "<sitemap><loc>%s%ssitemap-%s-%d.xml</loc><lastmod>%s</lastmod></sitemap>\n", origin, basePath, kind, i, lastmod)
			}
		}
		fmt.Fprint(w, "</sitemapindex>\n")
		return
	}
	p := strings.Split(strings.TrimPrefix(name, "sitemap-"), "-")
	if len(p) != 2 {
		http.NotFound(w, r)
		return
	}
	part, err := strconv.Atoi(p[1])
	if err != nil || part < 1 {
		http.NotFound(w, r)
		return
	}
	fmt.Fprint(w, `<?xml version="1.0" encoding="UTF-8"?>`+"\n"+`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`+"\n")
	if p[0] == "sections" {
		for sec := range sections {
			fmt.Fprintf(w, "<url><loc>%s%sstats%s</loc></url>\n", origin, basePath, map[bool]string{true: "", false: "/" + sec}[sec == ""])
		}
	} else if _, ok := s.pages[p[0]]; ok {
		i := 0
		for _, slug := range s.order[p[0]] {
			if !s.pages[p[0]][slug].index {
				continue
			}
			i++
			if i <= (part-1)*perMap {
				continue
			}
			if i > part*perMap {
				break
			}
			fmt.Fprintf(w, "<url><loc>%s%s%s/%s</loc><lastmod>%s</lastmod></url>\n", origin, basePath, kindPath[p[0]], html.EscapeString(slug), lastmod)
		}
	} else {
		http.NotFound(w, r)
		return
	}
	fmt.Fprint(w, "</urlset>\n")
}

func main() {
	site := flag.String("site", `C:\inetpub\wwwroot\riftwise`, "the deployed RiftWise web folder")
	addr := flag.String("addr", "127.0.0.1:8093", "listen address (IIS forwards to it)")
	logDir := flag.String("logs", "", "folder for pages.log (default: log to the console)")
	flag.Parse()
	if *logDir != "" {
		os.MkdirAll(*logDir, 0o755)
		p := filepath.Join(*logDir, "pages.log")
		if st, err := os.Stat(p); err == nil && st.Size() > 5<<20 {
			os.Rename(p, p+".old")
		}
		if f, err := os.OpenFile(p, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644); err == nil {
			log.SetOutput(f)
		}
	}
	s := &store{site: *site}
	s.refresh()

	mux := http.NewServeMux()
	mux.HandleFunc(basePath+"pages/health", func(w http.ResponseWriter, r *http.Request) {
		s.refresh()
		s.mu.RLock()
		defer s.mu.RUnlock()
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"ok": s.indexHTML != "" && s.version != "", "version": version, "stats": s.version,
			"teams": len(s.pages["team"]), "players": len(s.pages["player"]), "events": len(s.pages["event"]),
			"matches": len(s.pages["game"]), "champions": len(s.pages["champ"]), "leagues": len(s.pages["league"]),
		})
	})
	mux.HandleFunc(basePath, func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if strings.HasPrefix(r.URL.Path, basePath+"sitemap") && strings.HasSuffix(r.URL.Path, ".xml") {
			s.sitemap(w, r)
			return
		}
		s.serve(w, r)
	})
	srv := &http.Server{Addr: *addr, Handler: mux, ReadHeaderTimeout: 10 * time.Second, WriteTimeout: 30 * time.Second}
	log.Printf("riftwise-pages %s on %s, site %s", version, *addr, *site)
	log.Fatal(srv.ListenAndServe())
}
