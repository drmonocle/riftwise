// riftwise-pages gives every RiftWise stats page (riftwise.gg/player/faker,
// /team/t1, /tournament/worlds-2025, /match/..., /champion/ahri, /league/lck, /stats...) the app's index.html
// with that page's own title, description, canonical address, link-preview tags, JSON-LD and a plain-HTML
// summary in <noscript> (for crawlers that don't run scripts), so search engines index each page and links
// shared in chat apps show what they point to. It also serves the sitemaps. IIS sends only those addresses
// here; everything else stays plain IIS. (The JSON-LD / noscript / Twitter tags came from Antigravity's SEO pass
// on the server, 2026-10-17.)
//
// Titles and descriptions come from the nightly stats build (stats/<version>/hub/seo/*.tsv), and the
// page itself is the deployed index.html; both are re-read when they change.
//
// IIS forwards the pages as /riftwise/<page> (basePath, the address they had before the move to riftwise.gg);
// every address this service writes (canonical, sitemaps, redirects) is the public one under -public.
//
//	riftwise-pages -site C:\inetpub\riftwise.gg -stats C:\inetpub\wwwroot\riftwise\stats -addr 127.0.0.1:8093
package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"html"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
)

const (
	version  = "0.7.51" // the app's version (package.json; npm run set-version), reported by the health check
	basePath = "/riftwise/" // what IIS forwards here
	perMap   = 45000        // URLs per sitemap file (the limit is 50,000)
)

var started = time.Now() // reported by the health check: a fresh time means a new exe really took over

// publicURL is the site's public address with a trailing slash (-public); publicPath its path part ("/").
var publicURL, publicPath = "https://riftwise.gg/", "/"

func setPublic(u string) {
	publicURL = strings.TrimRight(u, "/") + "/"
	publicPath = "/"
	if i := strings.Index(publicURL, "://"); i >= 0 {
		if j := strings.Index(publicURL[i+3:], "/"); j >= 0 {
			publicPath = publicURL[i+3+j:]
		}
	}
}

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
	"leaders":     {"Pro LoL player leaderboards: every stat, every league", "Rank every player of a League of Legends league season or tournament on any stat: KDA, damage, gold, CS, vision, laning leads at 15 minutes and more, by role, with a minimum number of games."},
	"tiers":       {"Pro LoL tier list by role and patch", "What pro League of Legends teams actually pick and ban on each patch, by role: every champion placed in a tier by its presence and win rate in pro games."},
	"counters":    {"LoL counter-pick finder: every pro lane matchup", "Pick a champion and see every lane opponent pro play has put against it, with its win rate and gold lead at 15 minutes in that matchup, from every pro game since 2011."},
	"best":        {"The best pro LoL games ever, rated", "Every professional League of Legends game since 2011 rated 0 to 100 for action, closeness, stakes and drama: the best games and series of all time, by year and by league."},
	"worlds":      {"LoL Worlds hub: facts, Swiss stage and bracket picker", "The League of Legends World Championship on one page: the standout stats from every game so far, a Swiss stage and knockout picker with each team's win chances, and the chances of every team to win Worlds."},
	"msi":         {"LoL MSI hub: every Mid-Season Invitational in numbers", "The League of Legends Mid-Season Invitational on one page: the standout stats from every game, for one year or every MSI together."},
	"first-stand": {"LoL First Stand hub: facts from every game", "League of Legends First Stand on one page: the standout stats from every game, for one year or every First Stand together."},
	"about":       {"How RiftWise counts pro LoL stats", "Where RiftWise's pro League of Legends numbers come from and what every stat means: KDA, KP, DMG%, GD per minute, presence, blind picks and more."},
}

type entry struct {
	title, desc string
	index       bool
}

// intlPage: what the stats build wrote for one Worlds / MSI / First Stand page (seo_pages.py): its title and
// description, a plain-HTML summary (winner, final, standings, leaders, every series) and schema.org data.
type intlPage struct {
	Title string            `json:"title"`
	Desc  string            `json:"desc"`
	HTML  string            `json:"html"`
	LD    []json.RawMessage `json:"ld"`
}

type store struct {
	mu        sync.RWMutex
	site      string // the web build (index.html)
	stats     string // the stats data (latest.json, <version>/hub/...)
	version   string
	pages     map[string]map[string]entry  // kind -> slug -> entry
	order     map[string][]string          // kind -> slugs in file order (for sitemaps)
	alias     map[string]map[string]string // kind -> old slug or short name -> current (team: "sk-telecom-t1", league: "lck")
	intl      map[string]intlPage          // "worlds", "worlds/2025", "msi/all"... -> the page's summary (hub/seo/pages)
	ratings   *ratingsFile                 // hub/ratings.json: the power ratings behind /og/today.png (og_today.go)
	failed    string                       // a build without hub files (logged once, not retried)
	indexHTML string
	indexMod  time.Time
	checked   time.Time
}

// IndexNow: after a new stats build, the pages that are new or changed are reported to the search engines that take
// it (Bing, Yandex, Naver, Seznam; DuckDuckGo, Yahoo and Ecosia show Bing's index) instead of waiting for their
// crawlers. The key is public by design: the site serves it as <publicURL><indexNowKey>.txt (web/ in the app).
const indexNowKey = "8857f591ec7075047cd40b758014ae0c"

// indexNowOn: set by main (-indexnow); off in tests, so they never call out.
var indexNowOn bool

func indexNow(urls []string) {
	if !indexNowOn || len(urls) == 0 {
		return
	}
	if len(urls) > 10000 { // the most one request takes
		urls = urls[:10000]
	}
	host := strings.TrimSuffix(publicURL[strings.Index(publicURL, "://")+3:], publicPath)
	body, err := json.Marshal(map[string]any{"host": host, "key": indexNowKey, "keyLocation": publicURL + indexNowKey + ".txt", "urlList": urls})
	if err != nil {
		return
	}
	go func() {
		c := &http.Client{Timeout: 30 * time.Second}
		resp, err := c.Post("https://api.indexnow.org/indexnow", "application/json; charset=utf-8", bytes.NewReader(body))
		if err != nil {
			log.Printf("indexnow: %v", err)
			return
		}
		resp.Body.Close()
		log.Printf("indexnow: %d pages sent, answer %d", len(urls), resp.StatusCode)
	}()
}

// changedPages: the addresses of pages that are new or whose title / description / summary changed since the last
// build this service loaded (the sections when it has none yet, after a restart).
func (s *store) changedPages(pages map[string]map[string]entry, intl map[string]intlPage) []string {
	var out []string
	if s.version == "" {
		for sec := range sections {
			if sec == "" {
				out = append(out, publicURL+"stats")
			} else {
				out = append(out, publicURL+"stats/"+sec)
			}
		}
	} else {
		for kind, m := range pages {
			old := s.pages[kind]
			for slug, e := range m {
				if o, ok := old[slug]; e.index && (!ok || o != e) {
					out = append(out, publicURL+kindPath[kind]+"/"+slug)
				}
			}
		}
		for k, ip := range intl {
			if o, ok := s.intl[k]; !ok || o.Title != ip.Title || o.Desc != ip.Desc || o.HTML != ip.HTML {
				out = append(out, publicURL+"stats/"+k)
			}
		}
	}
	sort.Strings(out)
	return out
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
	b, err := os.ReadFile(filepath.Join(s.stats, "latest.json"))
	if err != nil || json.Unmarshal(b, &latest) != nil || latest.Version == "" || latest.Version == s.version || latest.Version == s.failed {
		return
	}
	hub := filepath.Join(s.stats, latest.Version, "hub")
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
	alias := map[string]map[string]string{}
	var a struct {
		Team   map[string]string `json:"team"`
		League map[string]string `json:"league"`
	}
	if b, err := os.ReadFile(filepath.Join(hub, "alias.json")); err == nil && json.Unmarshal(b, &a) == nil {
		alias["team"], alias["league"] = a.Team, a.League
	}
	// worlds.json, worlds.2025.json, msi.all.json... -> "worlds", "worlds/2025", "msi/all"
	intl := map[string]intlPage{}
	if files, err := filepath.Glob(filepath.Join(hub, "seo", "pages", "*.json")); err == nil {
		for _, f := range files {
			var ip intlPage
			if b, err := os.ReadFile(f); err == nil && json.Unmarshal(b, &ip) == nil && ip.Title != "" {
				intl[strings.Replace(strings.TrimSuffix(filepath.Base(f), ".json"), ".", "/", 1)] = ip
			}
		}
	}
	indexNow(s.changedPages(pages, intl))
	s.pages, s.order, s.alias, s.version, s.intl = pages, order, alias, latest.Version, intl
	s.ratings = loadRatings(hub)
	log.Printf("stats %s loaded: %d teams, %d players, %d events, %d matches, %d champions, %d leagues",
		latest.Version, len(pages["team"]), len(pages["player"]), len(pages["event"]), len(pages["game"]), len(pages["champ"]), len(pages["league"]))
}

var (
	reTitle = regexp.MustCompile(`(?s)<title>.*?</title>`)
	reDesc  = regexp.MustCompile(`(?s)<meta\s+name="description"\s+content="[^"]*"\s*/?>`)
	// the site-wide versions of these in index.html make way for the page's own
	reSiteTags = regexp.MustCompile(`(?is)\s*(<link\s+rel="canonical"[^>]*>|<link\s+rel="alternate"\s+hreflang=[^>]*>|<meta\s+(property="og:|name="twitter:)[^>]*>|<script\s+type="application/ld\+json">.*?</script>)`)
	reNoscript = regexp.MustCompile(`(?is)\s*<noscript>.*?</noscript>`)
	// index.html's #root: empty, or (the web build, vite.config.ts) holding the home page's heading
	reRoot = regexp.MustCompile(`(?s)<div id="root">.*?</div>`)
)

// Links in every page's <noscript> summary (paths under the site's root)
var noscriptLinks = [][2]string{
	{"", "RiftWise"}, {"stats", "Pro Stats"}, {"stats/worlds", "Worlds"}, {"stats/worlds/all", "Every Worlds winner"}, {"stats/msi", "MSI"},
	{"stats/first-stand", "First Stand"}, {"stats/rankings", "Power Rankings"}, {"stats/best", "Best games"}, {"stats/tournaments", "Tournaments"},
	{"stats/leagues", "Leagues"}, {"stats/champions", "Champions"}, {"stats/patches", "Patches"}, {"stats/records", "Records"},
	{"stats/titles", "Title winners"}, {"stats/compare", "Compare"}, {"stats/prep", "Match prep"}, {"stats/draft", "Draft board"},
	{"stats/finder", "Game finder"}, {"schedule", "Schedule"}, {"results", "Results"}, {"stats/data", "CSV data"}, {"team/t1", "T1"}, {"team/geng", "Gen.G"},
	{"team/bilibili-gaming", "BLG"}, {"team/g2-esports", "G2"}, {"team/fnatic", "Fnatic"}, {"player/faker", "Faker"},
	{"player/chovy", "Chovy"}, {"player/caps", "Caps"}, {"player/keria", "Keria"}, {"player/ruler", "Ruler"},
}

// page returns index.html with this page's title, description and preview tags.
// What a stats page is about, for search engines (schema.org): a player is a Person, a team a SportsTeam, a
// tournament or a match a SportsEvent, a league a SportsOrganization. nil for the rest.
func aboutOf(kind, title string) map[string]any {
	name := strings.TrimSuffix(title, " | RiftWise")
	if i := strings.Index(name, " – "); i > 0 {
		name = name[:i] // "Faker – pro stats, champions and career" -> "Faker"
	}
	types := map[string]string{"player": "Person", "team": "SportsTeam", "event": "SportsEvent", "game": "SportsEvent", "league": "SportsOrganization"}
	t, ok := types[kind]
	if !ok || name == "" {
		return nil
	}
	about := map[string]any{"@type": t, "name": name}
	if t != "Person" {
		about["sport"] = "League of Legends esports"
	}
	return about
}

func withAbout(m map[string]any, about map[string]any) map[string]any {
	if about != nil {
		m["about"] = about
	}
	return m
}

// maxTitle: search results cut longer titles, and Bing's site scan flags them.
const maxTitle = 65

const brand = " | RiftWise"

var reNote = regexp.MustCompile(`\s*\([^()]*\)`)

// fitTitle keeps a page title within maxTitle characters, losing the least useful part first: Leaguepedia's notes
// ("ACL eSports (Spanish Team)"), then the part after " – " when what comes before it says enough (else the end of
// that part, cut at a word), then the brand, and as a last resort the end of the title.
func fitTitle(title string) string {
	n := utf8.RuneCountInString
	if n(title) <= maxTitle {
		return title
	}
	body := strings.TrimSuffix(title, brand)
	hasBrand := body != title
	body = strings.TrimSpace(reNote.ReplaceAllString(body, ""))
	room := maxTitle
	if hasBrand {
		room -= n(brand)
	}
	if n(body) > room {
		if i := strings.Index(body, " – "); i > 0 {
			head, tail := body[:i], body[i+len(" – "):]
			body = head
			if n(head) < 30 {
				if t := cutWords(tail, room-n(head)-3); t != "" {
					body = head + " – " + t
				}
			}
		}
	}
	if n(body) > room && hasBrand {
		hasBrand, room = false, maxTitle
	}
	if n(body) > room {
		body = cutWords(body, room-1) + "…"
	}
	if hasBrand {
		return body + brand
	}
	return body
}

// cutWords shortens s to at most max characters at a word break (and drops a dangling separator).
func cutWords(s string, max int) string {
	r := []rune(s)
	if max <= 0 {
		return ""
	}
	if len(r) <= max {
		return s
	}
	cut := string(r[:max])
	if r[max] == ' ' {
		return strings.TrimRight(cut, " –-:,·")
	}
	if i := strings.LastIndex(cut, " "); i > 0 {
		cut = cut[:i]
	}
	return strings.TrimRight(cut, " –-:,·")
}

// pageLang: the page's language (riftwise.gg/<seg>/...; empty for English) and every language's address of it.
type pageLang struct {
	lang, seg string
	alts      [][2]string
}

func (s *store) page(title, desc, canonical string, index bool, og string, about map[string]any, extra *intlPage, pl pageLang) string {
	s.mu.RLock()
	doc, ver := s.indexHTML, s.version
	s.mu.RUnlock()
	if doc == "" {
		return ""
	}
	t, d, c := html.EscapeString(title), html.EscapeString(desc), html.EscapeString(canonical)
	// the <title> is kept short for search results; link previews (og / twitter) show the whole one
	doc = reTitle.ReplaceAllLiteralString(doc, "<title>"+html.EscapeString(fitTitle(title))+"</title>")
	doc = reDesc.ReplaceAllLiteralString(doc, `<meta name="description" content="`+d+`" />`)
	doc = reSiteTags.ReplaceAllLiteralString(doc, "")
	doc = reNoscript.ReplaceAllLiteralString(doc, "")
	if pl.lang != "" {
		doc = strings.Replace(doc, `<html lang="en">`, `<html lang="`+pl.lang+`">`, 1)
	}
	var tags strings.Builder
	tags.WriteString(`<link rel="canonical" href="` + c + `" />` + "\n")
	if index {
		for _, a := range pl.alts {
			tags.WriteString(`    <link rel="alternate" hreflang="` + a[0] + `" href="` + html.EscapeString(a[1]) + `" />` + "\n")
		}
	}
	if v := ver; v != "" {
		// the app starts loading this build's files without asking for stats/latest.json first
		tags.WriteString(`    <meta name="rw-stats" content="` + html.EscapeString(v) + `" />` + "\n")
	}
	tags.WriteString(`    <meta property="og:type" content="website" />` + "\n")
	tags.WriteString(`    <meta property="og:site_name" content="RiftWise" />` + "\n")
	tags.WriteString(`    <meta property="og:title" content="` + t + `" />` + "\n")
	tags.WriteString(`    <meta property="og:description" content="` + d + `" />` + "\n")
	tags.WriteString(`    <meta property="og:url" content="` + c + `" />` + "\n")
	// the page's own preview picture (og.go), else the icon
	img, card := publicURL+"icon-512.png?v=2", "summary"
	if og != "" {
		img, card = publicURL+og, "summary_large_image"
		tags.WriteString(`    <meta property="og:image:width" content="1200" />` + "\n")
		tags.WriteString(`    <meta property="og:image:height" content="630" />` + "\n")
	}
	tags.WriteString(`    <meta property="og:image" content="` + img + `" />` + "\n")
	tags.WriteString(`    <meta name="twitter:card" content="` + card + `" />` + "\n")
	tags.WriteString(`    <meta name="twitter:title" content="` + t + `" />` + "\n")
	tags.WriteString(`    <meta name="twitter:description" content="` + d + `" />` + "\n")
	tags.WriteString(`    <meta name="twitter:image" content="` + img + `" />` + "\n")
	if !index {
		tags.WriteString(`    <meta name="robots" content="noindex" />` + "\n")
	} else if ld, err := json.Marshal(withAbout(map[string]any{
		"@context": "https://schema.org", "@type": "WebPage", "name": title, "description": desc, "url": canonical, "inLanguage": map[bool]string{true: pl.lang, false: "en"}[pl.lang != ""],
		"isPartOf": map[string]any{"@type": "WebSite", "name": "RiftWise", "alternateName": []string{"RiftWise.gg", "RiftWise Pro LoL Stats"}, "url": publicURL},
	}, about)); err == nil {
		tags.WriteString(`    <script type="application/ld+json">` + string(ld) + `</script>` + "\n")
		if extra != nil {
			for _, x := range extra.LD {
				tags.WriteString(`    <script type="application/ld+json">` + string(x) + `</script>` + "\n")
			}
		}
	}
	tags.WriteString("  </head>")
	doc = strings.Replace(doc, "</head>", tags.String(), 1)
	var ns strings.Builder
	// the page's main heading in the page itself (crawlers skip <noscript>); the app replaces it once it starts
	h1 := html.EscapeString(strings.TrimSuffix(title, brand))
	ns.WriteString(`<div id="root"><h1 style="font:600 16px system-ui,sans-serif;color:#c8aa6e;margin:16px">` + h1 + `</h1></div>`)
	ns.WriteString(`<noscript><main><p><strong>` + t + `</strong></p><p>` + d + `</p>`)
	if extra != nil {
		ns.WriteString(extra.HTML) // built and escaped by the stats build
	}
	ns.WriteString(`<nav aria-label="RiftWise">`)
	for i, l := range noscriptLinks {
		if i > 0 {
			ns.WriteString(" · ")
		}
		ns.WriteString(`<a href="` + publicPath + map[bool]string{true: pl.seg + "/", false: ""}[pl.seg != ""] + l[0] + `">` + l[1] + `</a>`)
	}
	ns.WriteString(` · <a href="https://lolworlds.com/">LoL Worlds 24/7 stream</a></nav></main></noscript>`)
	return reRoot.ReplaceAllLiteralString(doc, ns.String())
}

func (s *store) serve(w http.ResponseWriter, r *http.Request) {
	s.refresh()
	rest := strings.TrimPrefix(r.URL.Path, basePath)
	// riftwise.gg/<lang>/...: the same page in another language (i18n.go)
	seg, lang, rest := splitLang(rest)
	parts := strings.Split(strings.Trim(rest, "/"), "/")
	status, title, desc, index, og := http.StatusOK, "", "", true, ""
	var about map[string]any
	var extra *intlPage

	switch {
	case lang != "" && parts[0] == "":
		// a language's home page (riftwise.gg/ko/): the Live tab; English's (/) is the plain index.html
		title, desc, og = "RiftWise", sections[""][1], "og/home.png"
	case parts[0] == "og":
		s.serveOG(w, r)
		return
	case len(parts) == 1 && parts[0] == "about":
		title = "About RiftWise: made by Kyle \"Dr. Monocle\" Hoover | RiftWise"
		desc = "Who makes RiftWise, why, and its promises: free forever, no ads, no selling data, no account needed."
		og = "og/home.png"
	case tabPages[parts[0]].name != "":
		// the app's other tabs (tabs.go): /schedule, /schedule/<league>, /results, /stream, /news, ...
		info, tx, ok := tabPage(parts)
		if !ok {
			status, title, desc, index = http.StatusNotFound, "Page not found | RiftWise", sections[""][1], false
			break
		}
		title, desc, index, extra, og = info.title, info.desc, info.index, tx, "og/home.png"
	case len(parts) == 1 && parts[0] == "overlay":
		// the stream overlay (OBS browser source): the app, not for search engines
		title, desc, index = "RiftWise stream overlay", "Win chances, form and the live score of one matchup, for a stream.", false
	case parts[0] == "stats":
		sec := ""
		if len(parts) > 1 {
			sec = parts[1]
		}
		info, ok := sections[sec]
		if !ok || len(parts) > 3 || (len(parts) == 3 && !sectionYear(sec, parts[2])) {
			status, title, desc, index = http.StatusNotFound, "Page not found | RiftWise", sections[""][1], false
			break
		}
		title, desc = info[0]+" | RiftWise", info[1]
		og = "og/stats/" + sec + ".png"
		if sec == "" {
			og = "og/home.png"
		}
		if len(parts) == 3 && intlNames[sec] != "" {
			name := intlNames[sec]
			if parts[2] == "all" {
				title = "LoL " + name + ": every year in numbers | RiftWise"
				desc = "Every League of Legends " + name + " together: most titles, kills, games played and appearances, the champions that keep winning or losing, and the biggest games."
			} else {
				title = "LoL " + name + " " + parts[2] + ": facts and stats | RiftWise"
				desc = "League of Legends " + name + " " + parts[2] + " on one page: the standout stats from every game."
				if sec == "worlds" {
					title = "LoL Worlds " + parts[2] + ": facts, Swiss stage and bracket picker | RiftWise"
					desc = "The League of Legends World Championship " + parts[2] + " on one page: the standout stats from every game, the Swiss stage and the bracket, with each team's chances."
				}
			}
		} else if len(parts) == 3 {
			title = "Pro LoL tournaments in " + parts[2] + " | RiftWise"
			desc = "Every professional League of Legends tournament in " + parts[2] + ": results, brackets, standings and stats."
		}
		if intlNames[sec] != "" {
			s.mu.RLock()
			ip, ok := s.intl[strings.Join(parts[1:], "/")]
			s.mu.RUnlock()
			if ok {
				title, desc, extra = ip.Title, ip.Desc, &ip
			}
		}
		if extra == nil && sec != "" {
			crumbs := [][2]string{{"Pro Stats", publicURL + "stats"}, {strings.TrimSuffix(info[0], brand), publicURL + "stats/" + sec}}
			if len(parts) == 3 {
				crumbs = append(crumbs, [2]string{parts[2], publicURL + strings.Join(parts, "/")})
			}
			extra = &intlPage{LD: []json.RawMessage{breadcrumbs(crumbs)}}
		}
	case (len(parts) == 2 || (len(parts) == 3 && parts[0] == "league" && isYear(parts[2]))) && kinds[parts[0]] != "":
		kind, slug := kinds[parts[0]], strings.ToLower(parts[1])
		s.mu.RLock()
		e, ok := s.pages[kind][slug]
		to := s.alias[kind][slug]
		s.mu.RUnlock()
		if !ok && to != "" && to != slug && (kind == "team" || kind == "league") {
			http.Redirect(w, r, publicPath+parts[0]+"/"+to+yearSuffix(parts), http.StatusMovedPermanently)
			return
		}
		if !ok && kind == "league" {
			e, ok = s.bareLeague(slug)
		}
		if !ok {
			status, title, desc, index = http.StatusNotFound, "Page not found | RiftWise", sections[""][1], false
			break
		}
		title, desc, index = e.title, e.desc, e.index
		og = "og/" + parts[0] + "/" + slug + ".png"
		if len(parts) == 2 {
			about = aboutOf(kind, title)
			extra = &intlPage{LD: []json.RawMessage{entityCrumbs(kind, title, publicURL+rest)}}
		}
		if len(parts) == 3 { // one season of a league: /league/lck/2025
			name := strings.TrimSuffix(title, " | RiftWise")
			if i := strings.Index(name, " – "); i > 0 {
				name = name[:i] // "LCK – every season, champions and results" -> "LCK"
			}
			title = name + " " + parts[2] + " season | RiftWise"
			desc = parts[2] + ": " + desc
			index = false // the league page itself is the one to list
		}
	default:
		http.NotFound(w, r)
		return
	}

	pl := pageLang{lang: lang, seg: seg}
	path := strings.Trim(rest, "/")
	canonical := publicURL + path
	if seg != "" {
		canonical = publicURL + seg + "/" + path
	}
	if status == http.StatusOK {
		if lang != "" {
			title, desc = localize(lang, parts, title, desc)
		}
		pl.alts = alternates(path)
	}
	body := s.page(title, desc, canonical, index, og, about, extra, pl)
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

var reSlug = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,100}$`)

// bareLeague: a league the build wrote a page for but left out of league.tsv because none of its games are in the
// catalog (small leagues known only from their tournament list, ~190 of them). The app shows their tournaments, so
// the page is served like any other, kept out of search engines (noindex, not in the sitemap).
func (s *store) bareLeague(slug string) (entry, bool) {
	s.mu.RLock()
	ver := s.version
	s.mu.RUnlock()
	if ver == "" || !reSlug.MatchString(slug) {
		return entry{}, false
	}
	b, err := os.ReadFile(filepath.Join(s.stats, ver, "hub", "league", slug+".json"))
	if err != nil {
		return entry{}, false
	}
	var l struct {
		L      string            `json:"l"`
		Events []json.RawMessage `json:"events"`
	}
	if json.Unmarshal(b, &l) != nil || l.L == "" {
		return entry{}, false
	}
	return entry{title: l.L + " – tournaments | RiftWise",
		desc: l.L + ": " + strconv.Itoa(len(l.Events)) + " tournaments, with their dates and stages. No game stats for this league yet."}, true
}

// Sitemaps: riftwise.gg/sitemap.xml lists the pieces (riftwise.gg/sitemap-<kind>-<n>.xml).
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
		fmt.Fprintf(w, "<sitemap><loc>%ssitemap-sections-1.xml</loc></sitemap>\n", publicURL)
		for _, kind := range []string{"team", "player", "event", "league", "champ", "game"} {
			n := 0
			for _, slug := range s.order[kind] {
				if s.pages[kind][slug].index {
					n++
				}
			}
			for i := 1; i <= (n+perMap-1)/perMap; i++ {
				fmt.Fprintf(w, "<sitemap><loc>%ssitemap-%s-%d.xml</loc><lastmod>%s</lastmod></sitemap>\n", publicURL, kind, i, lastmod)
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
			fmt.Fprintf(w, "<url><loc>%sstats%s</loc></url>\n", publicURL, map[bool]string{true: "", false: "/" + sec}[sec == ""])
		}
		// the tabs with a page worth finding, and each league on the schedule now
		for _, tab := range []string{"schedule", "results", "stream", "news"} {
			fmt.Fprintf(w, "<url><loc>%s%s</loc></url>\n", publicURL, tab)
		}
		for _, lg := range scheduleLeagues() {
			fmt.Fprintf(w, "<url><loc>%sschedule/%s</loc></url>\n", publicURL, lg)
		}
		// every year (and every year together) of Worlds, MSI and First Stand
		keys := make([]string, 0, len(s.intl))
		for k := range s.intl {
			if strings.Contains(k, "/") {
				keys = append(keys, k)
			}
		}
		sort.Strings(keys)
		for _, k := range keys {
			fmt.Fprintf(w, "<url><loc>%sstats/%s</loc></url>\n", publicURL, k)
		}
		fmt.Fprintf(w, "<url><loc>%sabout</loc></url>\n", publicURL)
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
			fmt.Fprintf(w, "<url><loc>%s%s/%s</loc><lastmod>%s</lastmod></url>\n", publicURL, kindPath[p[0]], html.EscapeString(slug), lastmod)
		}
	} else {
		http.NotFound(w, r)
		return
	}
	fmt.Fprint(w, "</urlset>\n")
}

func main() {
	site := flag.String("site", `C:\inetpub\riftwise.gg`, "the deployed RiftWise web folder (index.html)")
	stats := flag.String("stats", "", "the stats data folder (default: <site>\\stats)")
	public := flag.String("public", "https://riftwise.gg/", "the site's public address")
	addr := flag.String("addr", "127.0.0.1:8093", "listen address (IIS forwards to it)")
	logDir := flag.String("logs", "", "folder for pages.log (default: log to the console)")
	flag.StringVar(&scheduleURL, "schedule", scheduleURL, "the push service's schedule (for the /schedule and /results pages)")
	flag.BoolVar(&indexNowOn, "indexnow", true, "report new and changed pages to IndexNow after each stats build")
	flag.StringVar(&statusScripts, "scripts", statusScripts, "the stats build's folder (build_stats.log, audit_latest.json) for /status")
	flag.StringVar(&statusRelease, "release", statusRelease, "the release watcher's folder (status.json) for /status")
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
	setPublic(*public)
	if *stats == "" {
		*stats = filepath.Join(*site, "stats")
	}
	s := &store{site: *site, stats: *stats}
	s.refresh()

	mux := http.NewServeMux()
	mux.HandleFunc(basePath+"pages/health", func(w http.ResponseWriter, r *http.Request) {
		s.refresh()
		s.mu.RLock()
		defer s.mu.RUnlock()
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"ok": s.indexHTML != "" && s.version != "", "version": version, "started": started.UTC().Format(time.RFC3339), "stats": s.version,
			"teams": len(s.pages["team"]), "players": len(s.pages["player"]), "events": len(s.pages["event"]),
			"matches": len(s.pages["game"]), "champions": len(s.pages["champ"]), "leagues": len(s.pages["league"]),
		})
	})
	mux.HandleFunc(basePath+"status", s.serveStatus)          // status.go
	mux.HandleFunc(basePath+"status.json", s.serveStatusJSON) // read by scripts/server/status_watch.ps1
	mux.HandleFunc(basePath, func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if r.URL.Path == basePath+"calendar.ics" {
			serveCalendar(w, r) // calendar.go
			return
		}
		if r.URL.Path == basePath+"feed.xml" {
			serveFeed(w, r) // feed.go
			return
		}
		if strings.HasPrefix(r.URL.Path, basePath+"sitemap") && strings.HasSuffix(r.URL.Path, ".xml") {
			s.sitemap(w, r)
			return
		}
		s.serve(w, r)
	})
	srv := &http.Server{Addr: *addr, Handler: mux, ReadHeaderTimeout: 10 * time.Second, WriteTimeout: 30 * time.Second}
	log.Printf("riftwise-pages %s on %s, site %s, stats %s, public %s", version, *addr, *site, *stats, publicURL)
	log.Fatal(srv.ListenAndServe())
}

// intlNames: the international events with a page of their own (/stats/<section>[/<year>|/all]).
var intlNames = map[string]string{"worlds": "Worlds", "msi": "MSI", "first-stand": "First Stand"}

// sectionYear: what may follow a section in the address (a year for tournaments; a year or "all" for the events).
func sectionYear(sec, part string) bool {
	if intlNames[sec] != "" {
		return isYear(part) || part == "all"
	}
	return sec == "tournaments" && isYear(part)
}

func isYear(s string) bool {
	if len(s) != 4 {
		return false
	}
	for _, c := range s {
		if c < '0' || c > '9' {
			return false
		}
	}
	return true
}

// "/2025" for /league/<slug>/2025, so a renamed league's season address keeps its season
func yearSuffix(parts []string) string {
	if len(parts) == 3 {
		return "/" + parts[2]
	}
	return ""
}
