package main

import (
	"encoding/json"
	"fmt"
	"html"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"unicode/utf8"
)

// ssrResult holds the Wave-1 semantic HTML (placed inside #root) and Schema.org JSON-LD blocks
// generated directly from hub/*.json files on disk without running Python build scripts.
type ssrResult struct {
	html string
	lds  []json.RawMessage
}

const maxSSRCache = 2048

var reDescGames = regexp.MustCompile(`([0-9][0-9,]*) pro games?`)

func gamesFromDesc(desc string) int {
	m := reDescGames.FindStringSubmatch(desc)
	if len(m) < 2 {
		return 0
	}
	n, _ := strconv.Atoi(strings.ReplaceAll(m[1], ",", ""))
	return n
}

func loadSlugSet(path string) map[string]bool {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	var raw map[string]string
	if json.Unmarshal(b, &raw) != nil {
		return nil
	}
	out := make(map[string]bool, len(raw))
	for k, v := range raw {
		if k != "" && v != "" {
			out[k] = true
		}
	}
	return out
}

func buildChampSlugMap(m map[string]entry) map[string]string {
	out := make(map[string]string, len(m)*2)
	score := func(slug string) int {
		if reHexSuffix.MatchString(slug) {
			return 1
		}
		return 0
	}
	put := func(key, slug string) {
		if key == "" {
			return
		}
		if prev, ok := out[key]; ok {
			sp, sn := score(prev), score(slug)
			if sp < sn || (sp == sn && len(prev) <= len(slug)) {
				return
			}
		}
		out[key] = slug
	}
	for slug, e := range m {
		if !e.index && !strings.HasSuffix(e.title, brand) {
			continue
		}
		raw := strings.TrimSuffix(e.title, brand)
		if i := strings.Index(raw, " – "); i > 0 {
			raw = raw[:i]
		}
		raw = strings.TrimSuffix(raw, " in pro play")
		if raw == "" {
			continue
		}
		put(strings.ToLower(raw), slug)
		put(strings.ToLower(html.UnescapeString(raw)), slug)
	}
	return out
}

func (s *store) clearSSRCache(ver string) {
	s.ssrMu.Lock()
	defer s.ssrMu.Unlock()
	if s.ssrVer != ver || s.ssrCache == nil {
		s.ssrCache = map[string]ssrResult{}
		s.ssrVer = ver
	}
}

func (s *store) cachedSSR(ver, key string, build func() ssrResult) ssrResult {
	if ver == "" {
		return build()
	}
	s.ssrMu.Lock()
	if s.ssrVer == ver && s.ssrCache != nil {
		if v, ok := s.ssrCache[key]; ok {
			s.ssrMu.Unlock()
			return v
		}
	}
	s.ssrMu.Unlock()

	res := build()

	s.ssrMu.Lock()
	if s.ssrVer != ver || s.ssrCache == nil {
		s.ssrCache = map[string]ssrResult{}
		s.ssrVer = ver
	}
	if len(s.ssrCache) >= maxSSRCache {
		s.ssrCache = map[string]ssrResult{}
	}
	s.ssrCache[key] = res
	s.ssrMu.Unlock()
	return res
}

func (s *store) hasPage(kind, slug string) bool {
	if slug == "" || !reSlug.MatchString(slug) {
		return false
	}
	s.mu.RLock()
	_, ok := s.pages[kind][slug]
	s.mu.RUnlock()
	return ok
}

func (s *store) champSlug(name string) string {
	k := strings.ToLower(strings.TrimSpace(html.UnescapeString(name)))
	if k == "" {
		return ""
	}
	s.mu.RLock()
	slug := s.champByName[k]
	if slug == "" {
		guess := strings.Map(func(r rune) rune {
			switch {
			case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
				return r
			case r == ' ' || r == '-':
				return '-'
			default:
				return -1
			}
		}, k)
		guess = strings.Trim(strings.ReplaceAll(guess, "--", "-"), "-")
		if _, ok := s.pages["champ"][guess]; ok {
			slug = guess
		}
	}
	s.mu.RUnlock()
	return slug
}

func langBasePath(seg string) string {
	if seg != "" {
		return publicPath + seg + "/"
	}
	return publicPath
}

func langPublicBase(seg string) string {
	if seg != "" {
		return publicURL + seg + "/"
	}
	return publicURL
}

func (s *store) linkEntity(seg, kind, slug, label string) string {
	esc := html.EscapeString(label)
	if label == "" {
		return ""
	}
	slug = strings.ToLower(strings.TrimSpace(slug))
	if !s.hasPage(kind, slug) {
		return esc
	}
	return `<a href="` + langBasePath(seg) + kindPath[kind] + `/` + html.EscapeString(slug) + `">` + esc + `</a>`
}

func (s *store) linkChamp(seg, name string) string {
	esc := html.EscapeString(name)
	if name == "" {
		return ""
	}
	slug := s.champSlug(name)
	if slug == "" {
		return esc
	}
	return `<a href="` + langBasePath(seg) + `champion/` + html.EscapeString(slug) + `">` + esc + `</a>`
}

func seoTitleLen(title string) int {
	esc := html.EscapeString(title)
	esc = strings.ReplaceAll(esc, "&amp;", "&")
	return utf8.RuneCountInString(esc)
}

func firstValidTitle(candidates []string, fallback string) string {
	for _, c := range candidates {
		if c != "" && seoTitleLen(c) <= maxTitle {
			return c
		}
	}
	return fallback
}

func containsFold(s, sub string) bool {
	return strings.Contains(strings.ToLower(s), strings.ToLower(sub))
}

func fmtInt(n int) string {
	neg := n < 0
	if neg {
		n = -n
	}
	raw := strconv.Itoa(n)
	if len(raw) <= 3 {
		if neg {
			return "-" + raw
		}
		return raw
	}
	var out strings.Builder
	rem := len(raw) % 3
	if rem > 0 {
		out.WriteString(raw[:rem])
		if len(raw) > rem {
			out.WriteByte(',')
		}
	}
	for i := rem; i < len(raw); i += 3 {
		out.WriteString(raw[i : i+3])
		if i+3 < len(raw) {
			out.WriteByte(',')
		}
	}
	if neg {
		return "-" + out.String()
	}
	return out.String()
}

func fmtPct(w, g int) string {
	if g <= 0 {
		return "–"
	}
	if w > 0 && w*200 < g {
		return "&lt;1%"
	}
	return strconv.Itoa((w*100+g/2)/g) + "%"
}

func fmtUSD(v float64) string {
	if v < 1 {
		return ""
	}
	return "$" + fmtInt(int(v+0.5))
}

func cleanPtrString(s string) string {
	return strings.TrimSpace(s)
}

func safeExtURL(raw string) string {
	raw = strings.TrimSpace(raw)
	if !strings.HasPrefix(raw, "https://") && !strings.HasPrefix(raw, "http://") {
		return ""
	}
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" {
		return ""
	}
	return u.String()
}

func twitterURL(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	if strings.HasPrefix(raw, "https://") || strings.HasPrefix(raw, "http://") {
		if u, err := url.Parse(raw); err == nil && (strings.Contains(u.Host, "twitter.com") || strings.Contains(u.Host, "x.com")) {
			handle := strings.Trim(strings.TrimPrefix(u.Path, "/"), "/")
			if i := strings.IndexByte(handle, '/'); i > 0 {
				handle = handle[:i]
			}
			if handle != "" && !strings.ContainsAny(handle, " \t\n\"<>") {
				return "https://x.com/" + handle
			}
		}
		return ""
	}
	raw = strings.TrimPrefix(raw, "@")
	if raw == "" || strings.ContainsAny(raw, " \t\n/\"<>") {
		return ""
	}
	return "https://x.com/" + raw
}

func marshalLD(v any) (json.RawMessage, bool) {
	b, err := json.Marshal(v)
	if err != nil {
		return nil, false
	}
	return json.RawMessage(b), true
}

// ---------- Hub JSON shapes ----------

type ssrTeamDoc struct {
	Name      string   `json:"name"`
	U         string   `json:"u"`
	Region    string   `json:"region"`
	Codes     []string `json:"codes"`
	Disbanded int      `json:"disbanded"`
	G         int      `json:"g"`
	W         int      `json:"w"`
	SG        int      `json:"sg"`
	SW        int      `json:"sw"`
	From      string   `json:"from"`
	To        string   `json:"to"`
	AvgMin    float64  `json:"avgMin"`
	Kills     *float64 `json:"kills"`
	Deaths    *float64 `json:"deaths"`
	Earnings  float64  `json:"earnings"`
	Sides     []int    `json:"sides"`
	Rating    *struct {
		R      float64  `json:"r"`
		Rank   *int     `json:"rank"`
		Of     int      `json:"of"`
		League string   `json:"league"`
		Lrank  int      `json:"lrank"`
		Chg30  *float64 `json:"chg30"`
	} `json:"rating"`
	Obj *struct {
		Dragons  float64 `json:"dragons"`
		Barons   float64 `json:"barons"`
		Towers   float64 `json:"towers"`
		Heralds  float64 `json:"heralds"`
		Golddiff float64 `json:"golddiff"`
	} `json:"obj"`
	Names []struct {
		N    string `json:"n"`
		From string `json:"from"`
		To   string `json:"to"`
		G    int    `json:"g"`
	} `json:"names"`
	Years []struct {
		Y  string `json:"y"`
		G  int    `json:"g"`
		W  int    `json:"w"`
		As string `json:"as"`
	} `json:"years"`
	Recent []struct {
		Date string   `json:"date"`
		G    string   `json:"g"`
		Opp  string   `json:"opp"`
		Us   int      `json:"us"`
		Them int      `json:"them"`
		En   string   `json:"en"`
		E    string   `json:"e"`
		R    *float64 `json:"r"`
	} `json:"recent"`
	Opps []struct {
		N    string `json:"n"`
		U    string `json:"u"`
		G    int    `json:"g"`
		W    int    `json:"w"`
		Last string `json:"last"`
	} `json:"opps"`
	Champs []struct {
		C string `json:"c"`
		G int    `json:"g"`
		W int    `json:"w"`
	} `json:"champs"`
	Bans []struct {
		C string `json:"c"`
		G int    `json:"g"`
	} `json:"bans"`
	BansVs []struct {
		C string `json:"c"`
		G int    `json:"g"`
	} `json:"bansVs"`
	Events []struct {
		E    string  `json:"e"`
		En   string  `json:"en"`
		Date string  `json:"date"`
		As   string  `json:"as"`
		G    int     `json:"g"`
		W    int     `json:"w"`
		SG   int     `json:"sg"`
		SW   int     `json:"sw"`
		Pl   string  `json:"pl"`
		Usd  float64 `json:"usd"`
		Lu   string  `json:"lu"`
	} `json:"events"`
	Titles []struct {
		T     string `json:"t"`
		Date  string `json:"date"`
		Kind  string `json:"kind"`
		As    string `json:"as"`
		L     string `json:"l"`
		Score string `json:"score"`
		E     string `json:"e"`
	} `json:"titles"`
	BestStreak *struct {
		N    int    `json:"n"`
		Date string `json:"date"`
	} `json:"bestStreak"`
	Starters [][]string `json:"starters"`
	Roster   []struct {
		Y string `json:"y"`
		P []struct {
			N string `json:"n"`
			U string `json:"u"`
			G int    `json:"g"`
			R string `json:"r"`
		} `json:"p"`
	} `json:"roster"`
	Contracts map[string]string `json:"contracts"`
}

type ssrPlayerDoc struct {
	Name   string `json:"name"`
	U      string `json:"u"`
	Role   string `json:"role"`
	Img    string `json:"img"`
	Club   string `json:"club"`
	ClubU  string `json:"clubU"`
	ClubTo string `json:"clubTo"`
	Bio    struct {
		Real     string   `json:"real"`
		Native   string   `json:"native"`
		Country  string   `json:"country"`
		Born     string   `json:"born"`
		Res      string   `json:"res"`
		Twitter  string   `json:"twitter"`
		Stream   string   `json:"stream"`
		Youtube  string   `json:"youtube"`
		Contract string   `json:"contract"`
		Retired  int      `json:"retired"`
		Fav      []string `json:"fav"`
		Soloq    []string `json:"soloq"`
	} `json:"bio"`
	MVP    int `json:"mvp"`
	Pentas []struct {
		Date string `json:"date"`
		C    string `json:"c"`
		G    string `json:"g"`
		En   string `json:"en"`
	} `json:"pentas"`
	G       int      `json:"g"`
	W       int      `json:"w"`
	K       int      `json:"k"`
	D       int      `json:"d"`
	A       int      `json:"a"`
	KDA     float64  `json:"kda"`
	CSM     *float64 `json:"csm"`
	GPM     *float64 `json:"gpm"`
	DPM     *float64 `json:"dpm"`
	NChamps int      `json:"nChamps"`
	Teams   []struct {
		N    string `json:"n"`
		U    string `json:"u"`
		G    int    `json:"g"`
		W    int    `json:"w"`
		From string `json:"from"`
		To   string `json:"to"`
	} `json:"teams"`
	Years []struct {
		Y    string  `json:"y"`
		G    int     `json:"g"`
		W    int     `json:"w"`
		KDA  float64 `json:"kda"`
		Team string  `json:"team"`
	} `json:"years"`
	Champs []struct {
		C   string  `json:"c"`
		G   int     `json:"g"`
		W   int     `json:"w"`
		K   int     `json:"k"`
		D   int     `json:"d"`
		A   int     `json:"a"`
		KDA float64 `json:"kda"`
	} `json:"champs"`
	Events []struct {
		E    string   `json:"e"`
		En   string   `json:"en"`
		Date string   `json:"date"`
		T    string   `json:"t"`
		Tu   string   `json:"tu"`
		G    int      `json:"g"`
		W    int      `json:"w"`
		KDA  float64  `json:"kda"`
		C    []string `json:"c"`
		Pl   string   `json:"pl"`
		Lu   string   `json:"lu"`
	} `json:"events"`
	Recent []struct {
		Date string `json:"date"`
		G    string `json:"g"`
		C    string `json:"c"`
		K    int    `json:"k"`
		D    int    `json:"d"`
		A    int    `json:"a"`
		Win  int    `json:"win"`
		Opp  string `json:"opp"`
		En   string `json:"en"`
		Team string `json:"team"`
	} `json:"recent"`
	Best map[string]struct {
		V    float64 `json:"v"`
		Date string  `json:"date"`
		C    string  `json:"c"`
		Opp  string  `json:"opp"`
		En   string  `json:"en"`
		G    string  `json:"g"`
	} `json:"best"`
	Titles []struct {
		T    string `json:"t"`
		Date string `json:"date"`
		Kind string `json:"kind"`
		E    string `json:"e"`
	} `json:"titles"`
}

type ssrTupleRow []json.RawMessage

func tupleStr(r ssrTupleRow, idx int) string {
	if idx >= len(r) {
		return ""
	}
	var v string
	_ = json.Unmarshal(r[idx], &v)
	return v
}

func tupleFloat(r ssrTupleRow, idx int) (float64, bool) {
	if idx >= len(r) {
		return 0, false
	}
	var v *float64
	if json.Unmarshal(r[idx], &v) != nil || v == nil {
		return 0, false
	}
	return *v, true
}

func tupleInt(r ssrTupleRow, idx int) int {
	v, _ := tupleFloat(r, idx)
	return int(v)
}

type ssrChampDoc struct {
	Name  string `json:"name"`
	U     string `json:"u"`
	P     int    `json:"p"`
	W     int    `json:"w"`
	B     int    `json:"b"`
	Side  []int  `json:"side"`
	Roles []struct {
		R string `json:"r"`
		P int    `json:"p"`
	} `json:"roles"`
	Years []struct {
		Y string `json:"y"`
		P int    `json:"p"`
		W int    `json:"w"`
		B int    `json:"b"`
	} `json:"years"`
	Players []struct {
		N   string  `json:"n"`
		U   string  `json:"u"`
		G   int     `json:"g"`
		W   int     `json:"w"`
		KDA float64 `json:"kda"`
	} `json:"players"`
	Players12 []struct {
		N   string  `json:"n"`
		U   string  `json:"u"`
		G   int     `json:"g"`
		W   int     `json:"w"`
		KDA float64 `json:"kda"`
	} `json:"players12"`
	Builds *struct {
		Since  string        `json:"since"`
		G      int           `json:"g"`
		Items  []ssrTupleRow `json:"items"`
		Keys   []ssrTupleRow `json:"keys"`
		Spells []ssrTupleRow `json:"spells"`
	} `json:"builds"`
	Matchups   map[string][]ssrTupleRow `json:"matchups"`
	Matchups12 map[string][]ssrTupleRow `json:"matchups12"`
	Duos       []ssrTupleRow            `json:"duos"`
	Patches    []struct {
		P  string `json:"p"`
		Pk int    `json:"pk"`
		W  int    `json:"w"`
		B  int    `json:"b"`
		G  int    `json:"g"`
	} `json:"patches"`
	Recent []struct {
		Date string   `json:"date"`
		G    string   `json:"g"`
		N    string   `json:"n"`
		U    string   `json:"u"`
		Team string   `json:"team"`
		Opp  string   `json:"opp"`
		K    int      `json:"k"`
		D    int      `json:"d"`
		A    int      `json:"a"`
		Win  int      `json:"win"`
		En   string   `json:"en"`
		It   []string `json:"it"`
		Ks   string   `json:"ks"`
	} `json:"recent"`
}

type ssrEventDoc struct {
	N       string `json:"n"`
	U       string `json:"u"`
	Op      string `json:"op"`
	League  string `json:"league"`
	Lu      string `json:"lu"`
	Region  string `json:"region"`
	Level   string `json:"level"`
	Start   string `json:"start"`
	End     string `json:"end"`
	Year    string `json:"year"`
	Country string `json:"country"`
	Type    string `json:"type"`
	Games   int    `json:"games"`
	Series  int    `json:"series"`
	Parent  *struct {
		N string `json:"n"`
		U string `json:"u"`
	} `json:"parent"`
	Siblings []struct {
		N string `json:"n"`
		U string `json:"u"`
	} `json:"siblings"`
	Children []struct {
		N string `json:"n"`
		U string `json:"u"`
	} `json:"children"`
	Results []struct {
		P   string  `json:"p"`
		T   string  `json:"t"`
		U   string  `json:"u"`
		Usd float64 `json:"usd"`
	} `json:"results"`
	Standings []struct {
		Name string `json:"name"`
		Rows []struct {
			T  string `json:"t"`
			U  string `json:"u"`
			Pl *int   `json:"pl"`
			SW *int   `json:"sw"`
			SL *int   `json:"sl"`
			GW *int   `json:"gw"`
			GL *int   `json:"gl"`
		} `json:"rows"`
	} `json:"standings"`
	Teams []struct {
		T  string `json:"t"`
		U  string `json:"u"`
		G  int    `json:"g"`
		W  int    `json:"w"`
		SG int    `json:"sg"`
		SW int    `json:"sw"`
	} `json:"teams"`
	Rosters []struct {
		T string     `json:"t"`
		U string     `json:"u"`
		R string     `json:"r"`
		P [][]string `json:"p"`
	} `json:"rosters"`
	Leaders map[string][]struct {
		N string  `json:"n"`
		U string  `json:"u"`
		T string  `json:"t"`
		G int     `json:"g"`
		V float64 `json:"v"`
	} `json:"leaders"`
	Champs []struct {
		C string `json:"c"`
		P int    `json:"p"`
		W int    `json:"w"`
		B int    `json:"b"`
	} `json:"champs"`
	Stages []struct {
		Name   string `json:"name"`
		Series []struct {
			G    string `json:"g"`
			A    string `json:"a"`
			Au   string `json:"au"`
			B    string `json:"b"`
			Bu   string `json:"bu"`
			SA   *int   `json:"sa"`
			SB   *int   `json:"sb"`
			Bo   int    `json:"bo"`
			Date string `json:"date"`
			W    int    `json:"w"`
		} `json:"series"`
	} `json:"stages"`
}

type ssrLeagueDoc struct {
	L       string `json:"l"`
	U       string `json:"u"`
	S       string `json:"s"`
	Region  string `json:"region"`
	Primary bool   `json:"primary"`
	History []struct {
		L string `json:"l"`
		S string `json:"s"`
		U string `json:"u"`
		Y string `json:"y"`
	} `json:"history"`
	Events []struct {
		N  string `json:"n"`
		U  string `json:"u"`
		St string `json:"st"`
		En string `json:"en"`
		G  int    `json:"g"`
		W  string `json:"w"`
		Wu string `json:"wu"`
		Y  string `json:"y"`
	} `json:"events"`
	Titles []struct {
		T string `json:"t"`
		U string `json:"u"`
		N int    `json:"n"`
	} `json:"titles"`
}

type ssrGameDoc struct {
	E     string `json:"e"`
	En    string `json:"en"`
	Stage string `json:"stage"`
	Date  string `json:"date"`
	Bo    int    `json:"bo"`
	A     struct {
		N string `json:"n"`
		U string `json:"u"`
		C string `json:"c"`
	} `json:"a"`
	B struct {
		N string `json:"n"`
		U string `json:"u"`
		C string `json:"c"`
	} `json:"b"`
	SA    int `json:"sa"`
	SB    int `json:"sb"`
	W     int `json:"w"`
	Games []struct {
		N     int      `json:"n"`
		W     int      `json:"w"`
		Blue  string   `json:"blue"`
		Patch string   `json:"patch"`
		Date  string   `json:"date"`
		Min   *float64 `json:"min"`
		T     *struct {
			Blue struct {
				K     int      `json:"k"`
				Picks []string `json:"picks"`
				Bans  []string `json:"bans"`
			} `json:"blue"`
			Red struct {
				K     int      `json:"k"`
				Picks []string `json:"picks"`
				Bans  []string `json:"bans"`
			} `json:"red"`
		} `json:"t"`
		P []struct {
			S  int      `json:"s"`
			R  string   `json:"r"`
			N  string   `json:"n"`
			U  string   `json:"u"`
			C  string   `json:"c"`
			K  int      `json:"k"`
			D  int      `json:"d"`
			A  int      `json:"a"`
			CS *int     `json:"cs"`
			Gd *int     `json:"gd"`
			Dm *int     `json:"dm"`
			Ks string   `json:"ks"`
			It []string `json:"it"`
		} `json:"p"`
	} `json:"games"`
}

type ssrHomeDoc struct {
	Year   string `json:"year"`
	Latest []struct {
		N  string `json:"n"`
		U  string `json:"u"`
		L  string `json:"l"`
		St string `json:"st"`
		En string `json:"en"`
		G  int    `json:"g"`
		W  string `json:"w"`
		Wu string `json:"wu"`
	} `json:"latest"`
	Now []struct {
		N  string `json:"n"`
		U  string `json:"u"`
		L  string `json:"l"`
		St string `json:"st"`
		En string `json:"en"`
	} `json:"now"`
	Busiest []struct {
		N   string  `json:"n"`
		U   string  `json:"u"`
		G   int     `json:"g"`
		W   int     `json:"w"`
		KDA float64 `json:"kda"`
		T   string  `json:"t"`
		Tu  string  `json:"tu"`
	} `json:"busiest"`
	Potm []struct {
		N  string  `json:"n"`
		U  string  `json:"u"`
		T  string  `json:"t"`
		Tu string  `json:"tu"`
		R  string  `json:"r"`
		G  int     `json:"g"`
		Rt float64 `json:"rt"`
	} `json:"potm"`
	Moves []struct {
		D  string `json:"d"`
		N  string `json:"n"`
		U  string `json:"u"`
		R  string `json:"r"`
		To struct {
			N string `json:"n"`
			U string `json:"u"`
		} `json:"to"`
	} `json:"moves"`
}

func (s *store) readHubJSON(ver, rel string, out any) bool {
	if ver == "" {
		return false
	}
	b, err := os.ReadFile(filepath.Join(s.stats, ver, "hub", rel))
	if err != nil {
		return false
	}
	return json.Unmarshal(b, out) == nil
}

// enrichEntityMeta refines English entity <title> and <meta name="description"> to match high-volume search
// queries ("OpTic Gaming LoL", "OPT LoL", "Faker T1 LoL", "LCK LoL") while keeping <= maxTitle chars (no "…").
// Applies only when the entity's JSON exists in stats/<ver>/hub/, preserving all synthetic unit fixtures in pages_test.go.
func (s *store) enrichEntityMeta(kind, slug, origTitle, origDesc string) (string, string) {
	if !reSlug.MatchString(slug) {
		return origTitle, origDesc
	}
	s.mu.RLock()
	ver := s.version
	s.mu.RUnlock()
	if ver == "" {
		return origTitle, origDesc
	}
	switch kind {
	case "team":
		var doc ssrTeamDoc
		if !s.readHubJSON(ver, filepath.Join("team", slug+".json"), &doc) || doc.Name == "" {
			return origTitle, origDesc
		}
		code := ""
		for _, c := range doc.Codes {
			rc := utf8.RuneCountInString(c)
			if rc >= 2 && rc <= 6 && !strings.EqualFold(c, doc.Name) && !strings.Contains(doc.Name, "("+c+")") {
				code = c
				break
			}
		}
		hasLoL := containsFold(doc.Name, "lol") || containsFold(doc.Name, "league of legends")
		var cands []string
		if !hasLoL {
			if code != "" {
				cands = append(cands,
					doc.Name+" ("+code+") LoL – stats, roster & history"+brand,
					doc.Name+" ("+code+") LoL – stats & roster"+brand,
				)
			}
			cands = append(cands, doc.Name+" LoL – stats, roster & history"+brand)
			if code != "" {
				cands = append(cands, doc.Name+" ("+code+") LoL"+brand)
			}
			cands = append(cands, doc.Name+" LoL – stats"+brand, doc.Name+" LoL"+brand)
		} else if code != "" {
			cands = append(cands,
				doc.Name+" ("+code+") – stats, roster & history"+brand,
				doc.Name+" ("+code+") – stats & roster"+brand,
			)
		}
		title := firstValidTitle(cands, origTitle)
		desc := origDesc
		if !strings.Contains(desc, "Formerly") {
			var former []string
			seen := map[string]bool{strings.ToLower(doc.Name): true}
			for _, n := range doc.Names {
				k := strings.ToLower(strings.TrimSpace(n.N))
				if k != "" && !seen[k] {
					seen[k] = true
					former = append(former, n.N)
					if len(former) == 2 {
						break
					}
				}
			}
			if len(former) > 0 {
				add := " Formerly " + strings.Join(former, ", ") + "."
				if utf8.RuneCountInString(desc+add) <= 170 {
					desc += add
				}
			}
		}
		return title, desc
	case "player":
		var doc ssrPlayerDoc
		if !s.readHubJSON(ver, filepath.Join("player", slug+".json"), &doc) || doc.Name == "" {
			return origTitle, origDesc
		}
		var cands []string
		if doc.Club != "" && utf8.RuneCountInString(doc.Club) <= 10 && !strings.Contains(doc.Name, doc.Club) {
			cands = append(cands,
				doc.Name+" ("+doc.Club+") LoL – pro stats, champions & career"+brand,
				doc.Name+" ("+doc.Club+") LoL – pro stats & career"+brand,
			)
		}
		cands = append(cands, doc.Name+" LoL – pro stats, champions & career"+brand)
		if doc.Club != "" && utf8.RuneCountInString(doc.Club) <= 10 && !strings.Contains(doc.Name, doc.Club) {
			cands = append(cands, doc.Name+" ("+doc.Club+") LoL stats"+brand)
		}
		cands = append(cands, doc.Name+" LoL pro stats"+brand)
		return firstValidTitle(cands, origTitle), origDesc
	case "champ":
		var doc ssrChampDoc
		if !s.readHubJSON(ver, filepath.Join("champ", slug+".json"), &doc) || doc.Name == "" {
			return origTitle, origDesc
		}
		cands := []string{
			doc.Name + " LoL pro builds, counters, picks & win rate" + brand,
			doc.Name + " LoL pro builds, counters & win rate" + brand,
			doc.Name + " LoL pro stats & builds" + brand,
		}
		return firstValidTitle(cands, origTitle), origDesc
	case "league":
		var doc ssrLeagueDoc
		if !s.readHubJSON(ver, filepath.Join("league", slug+".json"), &doc) || doc.L == "" {
			return origTitle, origDesc
		}
		hasLoL := containsFold(doc.L, "lol") || containsFold(doc.L, "league of legends")
		var cands []string
		if doc.S != "" && !strings.EqualFold(doc.S, doc.L) && !containsFold(doc.L, doc.S) {
			if hasLoL {
				cands = append(cands, doc.L+" ("+doc.S+") – seasons & champions"+brand, doc.L+" ("+doc.S+")"+brand)
			} else {
				cands = append(cands, doc.L+" ("+doc.S+") LoL – seasons & champions"+brand, doc.L+" ("+doc.S+") LoL"+brand)
			}
			cands = append(cands, doc.S+" LoL – every season & champion"+brand, doc.S+" LoL seasons & champions"+brand)
		} else if !hasLoL {
			cands = append(cands, doc.L+" LoL – every season & champion"+brand, doc.L+" LoL seasons"+brand)
		}
		desc := origDesc
		if doc.S != "" && !containsFold(desc, doc.S) {
			add := " (" + doc.S + ")"
			if utf8.RuneCountInString(desc+add) <= 165 {
				desc = strings.TrimSuffix(desc, ".") + add + "."
			}
		}
		return firstValidTitle(cands, origTitle), desc
	}
	return origTitle, origDesc
}

// ---------- HTML writing primitives ----------

func writeKV(h *strings.Builder, rows [][2]string) {
	if len(rows) == 0 {
		return
	}
	h.WriteString(`<dl style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px 16px;margin:12px 0 18px;padding:12px;border:1px solid #2b244d;border-radius:8px;background:#120f26">`)
	for _, r := range rows {
		if r[1] == "" {
			continue
		}
		h.WriteString(`<div><dt style="font-size:11px;text-transform:uppercase;color:#8e84b8">` + html.EscapeString(r[0]) + `</dt><dd style="margin:2px 0 0;color:#efeaff;font-weight:600">` + r[1] + `</dd></div>`)
	}
	h.WriteString(`</dl>`)
}

func writeTable(h *strings.Builder, heading string, cols []string, rows [][]string) {
	if len(rows) == 0 {
		return
	}
	h.WriteString(`<section><h2>` + html.EscapeString(heading) + `</h2><table style="border-collapse:collapse;width:100%;margin:8px 0 18px;font-size:13px"><thead><tr>`)
	for _, c := range cols {
		h.WriteString(`<th style="text-align:left;padding:6px 8px;border-bottom:1px solid #2b244d;color:#c8aa6e">` + html.EscapeString(c) + `</th>`)
	}
	h.WriteString(`</tr></thead><tbody>`)
	for _, r := range rows {
		h.WriteString(`<tr>`)
		for _, cell := range r {
			h.WriteString(`<td style="padding:5px 8px;border-bottom:1px solid #1b1736">` + cell + `</td>`)
		}
		h.WriteString(`</tr>`)
	}
	h.WriteString(`</tbody></table></section>`)
}

func writeTabsNav(h *strings.Builder, basePath, activeTab string, tabs [][2]string) {
	h.WriteString(`<nav aria-label="Page sections" style="margin:8px 0 14px">`)
	for i, tb := range tabs {
		if i > 0 {
			h.WriteString(` · `)
		}
		href := basePath
		if tb[0] != "" {
			href += "/" + tb[0]
		}
		if tb[0] == activeTab {
			h.WriteString(`<strong>` + html.EscapeString(tb[1]) + `</strong>`)
		} else {
			h.WriteString(`<a href="` + html.EscapeString(href) + `">` + html.EscapeString(tb[1]) + `</a>`)
		}
	}
	h.WriteString(`</nav>`)
}

// ---------- Entity SSR builders ----------

func (s *store) buildSSR(seg, lang string, parts []string, title, desc, canonical string) ssrResult {
	s.mu.RLock()
	ver := s.version
	s.mu.RUnlock()
	key := seg + "|" + strings.Join(parts, "/") + "|" + title
	return s.cachedSSR(ver, key, func() ssrResult {
		switch {
		case parts[0] == "":
			return s.buildHomeSSR(seg, lang)
		case parts[0] == "stats":
			sec := ""
			if len(parts) > 1 {
				sec = parts[1]
			}
			return s.buildSectionSSR(ver, seg, sec, canonical, title, desc)
		case kinds[parts[0]] != "":
			kind := kinds[parts[0]]
			slug := strings.ToLower(parts[1])
			if !reSlug.MatchString(slug) {
				return ssrResult{}
			}
			tab := ""
			if len(parts) == 3 {
				tab = strings.ToLower(parts[2])
			}
			switch kind {
			case "team":
				return s.buildTeamSSR(ver, seg, slug, tab, canonical)
			case "player":
				return s.buildPlayerSSR(ver, seg, slug, tab, canonical)
			case "champ":
				return s.buildChampSSR(ver, seg, slug)
			case "event":
				return s.buildEventSSR(ver, seg, slug, tab, canonical)
			case "league":
				return s.buildLeagueSSR(ver, seg, slug, canonical)
			case "game":
				return s.buildGameSSR(ver, seg, slug, canonical)
			}
		}
		return ssrResult{}
	})
}

func (s *store) buildHomeSSR(seg, _ string) ssrResult {
	var res ssrResult
	if ws, ok := marshalLD(map[string]any{
		"@context": "https://schema.org", "@type": "WebSite", "@id": publicURL + "#website",
		"name": "RiftWise", "alternateName": []string{"RiftWise.gg", "RiftWise.lol", "RiftWise Pro LoL Stats"},
		"url": publicURL, "sameAs": []string{"https://github.com/drmonocle/riftwise", "https://lolworlds.com/"},
		"potentialAction": map[string]any{
			"@type":       "SearchAction",
			"target":      map[string]any{"@type": "EntryPoint", "urlTemplate": publicURL + "?q={search_term_string}"},
			"query-input": "required name=search_term_string",
		},
	}); ok {
		res.lds = append(res.lds, ws)
	}
	if org, ok := marshalLD(map[string]any{
		"@context": "https://schema.org", "@type": "Organization", "@id": publicURL + "#org",
		"name": "RiftWise", "url": publicURL, "logo": publicURL + "icon-512.png?v=2",
		"sameAs": []string{"https://github.com/drmonocle/riftwise", "https://lolworlds.com/"},
	}); ok {
		res.lds = append(res.lds, org)
	}

	s.mu.RLock()
	ver, rf := s.version, s.ratings
	s.mu.RUnlock()

	var home ssrHomeDoc
	hasHome := s.readHubJSON(ver, "home.json", &home)
	if !hasHome && rf == nil {
		return res
	}

	var h strings.Builder
	h.WriteString(`<article>`)
	h.WriteString(`<p>Complete League of Legends esports database covering every pro match, team, player, champion, tournament and league since 2011 — live scores, global power rankings, draft boards, builds, counter matchups and free CSV exports.</p>`)
	base := langBasePath(seg)
	toolLinks := [][2]string{
		{"matches", "Live matches"}, {"stats/rankings", "Power rankings"}, {"stats/worlds", "Worlds hub"},
		{"stats/msi", "MSI hub"}, {"stats/first-stand", "First Stand"}, {"stats/tournaments", "Tournaments"},
		{"stats/leagues", "Leagues"}, {"stats/champions", "Champions"}, {"stats/patches", "Patches"},
		{"stats/counters", "Counters"}, {"stats/synergy", "Duo synergies"}, {"stats/tiers", "Tier list"},
		{"stats/items", "Item history"}, {"stats/leaders", "Player leaders"}, {"stats/prep", "Match prep"},
		{"stats/draft", "Draft board"}, {"stats/compare", "Compare"}, {"stats/finder", "Game finder"},
		{"stats/best", "Best games"}, {"stats/records", "Records"}, {"stats/titles", "Title winners"},
		{"stats/weekly", "Weekly recap"}, {"stats/moves", "Roster moves"}, {"stats/gm", "Roster builder"},
		{"stats/pickem", "Pick'Em"}, {"stats/teams", "All teams"}, {"stats/players", "All players"},
		{"stats/data", "CSV downloads"}, {"schedule", "Schedule"}, {"results", "Results"},
	}
	h.WriteString(`<nav aria-label="Explore RiftWise" style="margin:10px 0 18px">`)
	for i, l := range toolLinks {
		if i > 0 {
			h.WriteString(` · `)
		}
		h.WriteString(`<a href="` + base + l[0] + `">` + html.EscapeString(l[1]) + `</a>`)
	}
	h.WriteString(`</nav>`)

	if rf != nil && len(rf.teams) > 0 {
		var rows [][]string
		rank := 0
		for _, t := range rf.teams {
			if !t.top {
				continue
			}
			rank++
			rows = append(rows, []string{
				strconv.Itoa(rank),
				s.linkEntity(seg, "team", t.slug, t.name),
				html.EscapeString(t.code),
				s.linkEntity(seg, "league", t.league, t.league),
				strconv.Itoa(int(t.rating + 0.5)),
			})
			if rank >= 20 {
				break
			}
		}
		writeTable(&h, "Global Power Rankings (Top 20)", []string{"#", "Team", "Code", "League", "Elo"}, rows)
	}

	if hasHome && len(home.Latest) > 0 {
		var rows [][]string
		for _, ev := range home.Latest {
			winner := "–"
			if ev.W != "" {
				winner = s.linkEntity(seg, "team", ev.Wu, ev.W)
			}
			rows = append(rows, []string{
				s.linkEntity(seg, "event", ev.U, ev.N),
				html.EscapeString(ev.L),
				html.EscapeString(ev.St + " – " + ev.En),
				winner,
				fmtInt(ev.G),
			})
		}
		writeTable(&h, "Latest Tournaments", []string{"Tournament", "League", "Dates", "Winner", "Games"}, rows)
	}

	if hasHome && len(home.Potm) > 0 {
		var rows [][]string
		for _, p := range home.Potm {
			rows = append(rows, []string{
				s.linkEntity(seg, "player", p.U, p.N),
				html.EscapeString(p.R),
				s.linkEntity(seg, "team", p.Tu, p.T),
				fmtInt(p.G),
				fmt.Sprintf("%.2f", p.Rt),
			})
		}
		writeTable(&h, "Top Rated Players (Last 30 Days)", []string{"Player", "Role", "Team", "Games", "Rating"}, rows)
	}

	if hasHome && len(home.Moves) > 0 {
		var rows [][]string
		for _, m := range home.Moves {
			rows = append(rows, []string{
				html.EscapeString(m.D),
				s.linkEntity(seg, "player", m.U, m.N),
				html.EscapeString(m.R),
				s.linkEntity(seg, "team", m.To.U, m.To.N),
			})
		}
		writeTable(&h, "Recent Roster Moves", []string{"Date", "Player", "Role", "Joined"}, rows)
	}

	h.WriteString(`</article>`)
	res.html = h.String()
	return res
}

func (s *store) buildSectionSSR(ver, seg, sec, canonical, title, desc string) ssrResult {
	var res ssrResult
	switch sec {
	case "data":
		if ds, ok := marshalLD(map[string]any{
			"@context": "https://schema.org", "@type": "Dataset",
			"name": title, "description": desc, "url": canonical,
			"isAccessibleForFree": true,
			"license":             "https://creativecommons.org/licenses/by-sa/3.0/",
			"creator":             map[string]any{"@type": "Organization", "name": "RiftWise", "url": publicURL},
			"keywords":            []string{"League of Legends", "LoL esports", "esports dataset", "CSV", "JSON"},
		}); ok {
			res.lds = append(res.lds, ds)
		}
		return res
	case "rankings":
		s.mu.RLock()
		rf := s.ratings
		s.mu.RUnlock()
		if rf == nil || len(rf.teams) == 0 {
			return res
		}
		var rows [][]string
		rank := 0
		for _, t := range rf.teams {
			if !t.top {
				continue
			}
			rank++
			rows = append(rows, []string{
				strconv.Itoa(rank),
				s.linkEntity(seg, "team", t.slug, t.name),
				html.EscapeString(t.code),
				s.linkEntity(seg, "league", t.league, t.league),
				strconv.Itoa(int(t.rating + 0.5)),
			})
			if rank >= 60 {
				break
			}
		}
		var h strings.Builder
		h.WriteString(`<article><p>Global LoL Esports Elo power rankings across LCK, LPL, LEC, LCS, LCP, CBLOL and international events (updated ` + html.EscapeString(rf.asof) + `).</p>`)
		writeTable(&h, "Top League Power Rankings", []string{"Rank", "Team", "Code", "League", "Elo"}, rows)
		h.WriteString(`</article>`)
		res.html = h.String()
		return res
	case "titles":
		var list []struct {
			T     string `json:"t"`
			Date  string `json:"date"`
			Kind  string `json:"kind"`
			W     string `json:"w"`
			L     string `json:"l"`
			Score string `json:"score"`
			U     string `json:"u"`
			E     string `json:"e"`
		}
		if !s.readHubJSON(ver, "titles.json", &list) || len(list) == 0 {
			return res
		}
		var rows [][]string
		for i, t := range list {
			if i >= 60 {
				break
			}
			rows = append(rows, []string{
				html.EscapeString(t.Date),
				s.linkEntity(seg, "event", t.E, t.T),
				s.linkEntity(seg, "team", t.U, t.W),
				html.EscapeString(t.L),
				html.EscapeString(t.Score),
			})
		}
		var h strings.Builder
		h.WriteString(`<article>`)
		writeTable(&h, "Recent Championship Title Winners", []string{"Date", "Tournament", "Champion", "Runner-up", "Score"}, rows)
		h.WriteString(`</article>`)
		res.html = h.String()
		return res
	case "champions":
		s.mu.RLock()
		slugs := append([]string(nil), s.order["champ"]...)
		pages := s.pages["champ"]
		var links []string
		for _, slug := range slugs {
			e := pages[slug]
			if !e.index {
				continue
			}
			links = append(links, `<a href="`+langBasePath(seg)+`champion/`+html.EscapeString(slug)+`">`+html.EscapeString(englishName(e.title))+`</a>`)
		}
		s.mu.RUnlock()
		if len(links) == 0 {
			return res
		}
		res.html = `<article><p>Pro builds, lane counter matchups, win rates and presence for every League of Legends champion since 2011.</p><p>` + strings.Join(links, " · ") + `</p></article>`
		return res
	case "leagues":
		s.mu.RLock()
		slugs := append([]string(nil), s.order["league"]...)
		pages := s.pages["league"]
		var links []string
		for _, slug := range slugs {
			e := pages[slug]
			if !e.index {
				continue
			}
			links = append(links, `<a href="`+langBasePath(seg)+`league/`+html.EscapeString(slug)+`">`+html.EscapeString(englishName(e.title))+`</a>`)
		}
		s.mu.RUnlock()
		if len(links) == 0 {
			return res
		}
		res.html = `<article><p>Every professional League of Legends league and circuit since 2011.</p><p>` + strings.Join(links, " · ") + `</p></article>`
		return res
	case "teams", "players":
		kind := map[string]string{"teams": "team", "players": "player"}[sec]
		top := s.topByGames(kind, 150)
		if len(top) == 0 {
			return res
		}
		s.mu.RLock()
		pages := s.pages[kind]
		var rows [][]string
		for _, slug := range top {
			e := pages[slug]
			rows = append(rows, []string{
				`<a href="` + langBasePath(seg) + kindPath[kind] + `/` + html.EscapeString(slug) + `">` + html.EscapeString(englishName(e.title)) + `</a>`,
				fmtInt(e.games),
				html.EscapeString(e.desc),
			})
		}
		s.mu.RUnlock()
		var h strings.Builder
		h.WriteString(`<article>`)
		label := map[string]string{"teams": "Teams", "players": "Players"}[sec]
		writeTable(&h, "Most Active Pro "+label+" (Top 150)", []string{"Name", "Pro Games", "Summary"}, rows)
		h.WriteString(`</article>`)
		res.html = h.String()
		return res
	}
	return res
}

func (s *store) topByGames(kind string, limit int) []string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	type item struct {
		slug  string
		games int
	}
	var list []item
	for _, slug := range s.order[kind] {
		e := s.pages[kind][slug]
		if !e.index {
			continue
		}
		list = append(list, item{slug: slug, games: e.games})
	}
	sort.Slice(list, func(i, j int) bool {
		if list[i].games != list[j].games {
			return list[i].games > list[j].games
		}
		return list[i].slug < list[j].slug
	})
	if len(list) > limit {
		list = list[:limit]
	}
	out := make([]string, len(list))
	for i, it := range list {
		out[i] = it.slug
	}
	return out
}

func (s *store) buildTeamSSR(ver, seg, slug, tab, canonical string) ssrResult {
	var doc ssrTeamDoc
	if !s.readHubJSON(ver, filepath.Join("team", slug+".json"), &doc) || doc.Name == "" {
		return ssrResult{}
	}
	var res ssrResult

	if tab == "" {
		altNames := []string{doc.Name + " LoL"}
		seenAlt := map[string]bool{strings.ToLower(doc.Name): true, strings.ToLower(doc.Name + " lol"): true}
		for _, c := range doc.Codes {
			k := strings.ToLower(strings.TrimSpace(c))
			if k != "" && !seenAlt[k] {
				seenAlt[k] = true
				altNames = append(altNames, c, c+" LoL")
			}
		}
		for _, n := range doc.Names {
			k := strings.ToLower(strings.TrimSpace(n.N))
			if k != "" && !seenAlt[k] {
				seenAlt[k] = true
				altNames = append(altNames, n.N)
			}
		}
		s.mu.RLock()
		hasLogo := s.logos[slug]
		s.mu.RUnlock()
		logoURL := publicURL + "og/team/" + slug + ".png"
		if hasLogo {
			logoURL = publicURL + "stats/logos/" + slug + ".webp"
		}
		ld := map[string]any{
			"@context": "https://schema.org", "@type": "SportsTeam", "@id": canonical + "#entity",
			"mainEntityOfPage": canonical,
			"name":             doc.Name, "alternateName": altNames,
			"sport": "League of Legends", "url": canonical,
			"logo": logoURL, "image": logoURL,
		}
		if doc.From != "" {
			ld["foundingDate"] = doc.From
		}
		if doc.Disbanded == 1 && doc.To != "" {
			ld["dissolutionDate"] = doc.To
		}
		if doc.Region != "" {
			ld["location"] = map[string]any{"@type": "Place", "name": doc.Region}
		}
		var athletes []map[string]any
		if len(doc.Starters) > 0 {
			for _, st := range doc.Starters {
				if len(st) >= 3 {
					a := map[string]any{"@type": "Person", "name": st[0], "jobTitle": "League of Legends " + st[2]}
					if st[1] != "" {
						a["url"] = langPublicBase(seg) + "player/" + st[1]
					}
					athletes = append(athletes, a)
				}
			}
		} else if len(doc.Roster) > 0 {
			for i, p := range doc.Roster[0].P {
				if i >= 6 {
					break
				}
				a := map[string]any{"@type": "Person", "name": p.N, "jobTitle": "League of Legends " + p.R}
				if p.U != "" {
					a["url"] = langPublicBase(seg) + "player/" + p.U
				}
				athletes = append(athletes, a)
			}
		}
		if len(athletes) > 0 {
			ld["athlete"] = athletes
		}
		if raw, ok := marshalLD(ld); ok {
			res.lds = append(res.lds, raw)
		}
	}

	var h strings.Builder
	h.WriteString(`<article>`)
	status := "Active"
	if doc.Disbanded == 1 {
		status = "Disbanded / Historical (" + doc.To + ")"
	}
	var lead strings.Builder
	lead.WriteString(html.EscapeString(doc.Name))
	if len(doc.Codes) > 0 {
		lead.WriteString(" (" + html.EscapeString(strings.Join(doc.Codes, ", ")) + ")")
	}
	lead.WriteString(" has played <strong>" + fmtInt(doc.G) + " pro League of Legends games</strong>")
	if doc.From != "" {
		lead.WriteString(" from " + html.EscapeString(doc.From) + " to " + html.EscapeString(doc.To))
	}
	lead.WriteString(fmt.Sprintf(" with a %s–%s record (%s win rate)", fmtInt(doc.W), fmtInt(doc.G-doc.W), fmtPct(doc.W, doc.G)))
	if doc.SG > 0 {
		lead.WriteString(fmt.Sprintf(" and %s–%s in match series (%s)", fmtInt(doc.SW), fmtInt(doc.SG-doc.SW), fmtPct(doc.SW, doc.SG)))
	}
	lead.WriteString(".")
	if doc.Rating != nil && doc.Rating.Rank != nil {
		lead.WriteString(fmt.Sprintf(" Current Global Power Ranking: <strong>#%d of %d</strong> (Elo %.0f, #%d in %s).", *doc.Rating.Rank, doc.Rating.Of, doc.Rating.R, doc.Rating.Lrank, html.EscapeString(doc.Rating.League)))
	} else if doc.Rating != nil {
		lead.WriteString(fmt.Sprintf(" Current Power Rating: <strong>%.0f Elo</strong> (#%d in %s).", doc.Rating.R, doc.Rating.Lrank, html.EscapeString(doc.Rating.League)))
	}
	if len(doc.Titles) > 0 {
		lead.WriteString(" Major titles: " + strconv.Itoa(len(doc.Titles)) + ".")
	}
	h.WriteString(`<p>` + lead.String() + `</p>`)

	writeTabsNav(&h, langBasePath(seg)+"team/"+slug, tab, [][2]string{
		{"", "Overview"}, {"stats", "Stats"}, {"matches", "Matches"}, {"history", "History"}, {"champions", "Champions"},
	})

	kv := [][2]string{
		{"Team", html.EscapeString(doc.Name)},
		{"Codes / Tags", html.EscapeString(strings.Join(doc.Codes, ", "))},
		{"Region", html.EscapeString(doc.Region)},
		{"Status", html.EscapeString(status)},
		{"Game Record", fmtInt(doc.W) + "–" + fmtInt(doc.G-doc.W) + " (" + fmtPct(doc.W, doc.G) + ")"},
		{"Series Record", fmtInt(doc.SW) + "–" + fmtInt(doc.SG-doc.SW) + " (" + fmtPct(doc.SW, doc.SG) + ")"},
	}
	if doc.AvgMin > 0 {
		kv = append(kv, [2]string{"Avg Game Time", fmt.Sprintf("%.1f min", doc.AvgMin)})
	}
	if doc.Kills != nil && doc.Deaths != nil {
		kv = append(kv, [2]string{"Kills / Deaths per Game", fmt.Sprintf("%.1f / %.1f", *doc.Kills, *doc.Deaths)})
	}
	if usd := fmtUSD(doc.Earnings); usd != "" {
		kv = append(kv, [2]string{"Prize Earnings", usd})
	}
	if doc.BestStreak != nil {
		kv = append(kv, [2]string{"Longest Win Streak", fmtInt(doc.BestStreak.N) + " (" + html.EscapeString(doc.BestStreak.Date) + ")"})
	}
	writeKV(&h, kv)

	renderStartersAndRosters := func(yearLimit int) {
		if len(doc.Starters) > 0 {
			var rows [][]string
			for _, st := range doc.Starters {
				if len(st) < 3 {
					continue
				}
				rows = append(rows, []string{
					html.EscapeString(st[2]),
					s.linkEntity(seg, "player", st[1], st[0]),
					html.EscapeString(doc.Contracts[st[1]]),
				})
			}
			writeTable(&h, "Current Starters", []string{"Role", "Player", "Contract Until"}, rows)
		}
		for i, yr := range doc.Roster {
			if i >= yearLimit {
				break
			}
			var rows [][]string
			for _, p := range yr.P {
				rows = append(rows, []string{
					html.EscapeString(p.R),
					s.linkEntity(seg, "player", p.U, p.N),
					fmtInt(p.G),
				})
			}
			writeTable(&h, doc.Name+" "+yr.Y+" Roster", []string{"Role", "Player", "Games"}, rows)
		}
	}

	renderTitles := func() {
		if len(doc.Titles) == 0 {
			return
		}
		var rows [][]string
		for _, t := range doc.Titles {
			rows = append(rows, []string{
				html.EscapeString(t.Date),
				s.linkEntity(seg, "event", t.E, t.T),
				html.EscapeString(t.As),
				html.EscapeString(t.L),
				html.EscapeString(t.Score),
			})
		}
		writeTable(&h, "Championship Titles ("+strconv.Itoa(len(doc.Titles))+")", []string{"Date", "Tournament", "Played As", "Runner-up", "Score"}, rows)
	}

	renderNames := func() {
		if len(doc.Names) <= 1 {
			return
		}
		var rows [][]string
		for _, n := range doc.Names {
			rows = append(rows, []string{
				html.EscapeString(n.N),
				html.EscapeString(n.From + " – " + n.To),
				fmtInt(n.G),
			})
		}
		writeTable(&h, "Team Brand & Name History", []string{"Team Name", "Active Dates", "Games"}, rows)
	}

	renderEvents := func(limit int) {
		var rows [][]string
		for i, ev := range doc.Events {
			if i >= limit {
				break
			}
			pl := ev.Pl
			if pl == "" {
				pl = "–"
			}
			rows = append(rows, []string{
				html.EscapeString(ev.Date),
				s.linkEntity(seg, "event", ev.E, ev.En),
				html.EscapeString(ev.As),
				html.EscapeString(pl),
				fmtInt(ev.SW) + "–" + fmtInt(ev.SG-ev.SW),
				fmtInt(ev.W) + "–" + fmtInt(ev.G-ev.W),
				html.EscapeString(fmtUSD(ev.Usd)),
			})
		}
		writeTable(&h, "Tournaments & Placements", []string{"Date", "Tournament", "Tag / Name", "Place", "Series", "Games", "Prize"}, rows)
	}

	renderRecent := func() {
		var rows [][]string
		for _, m := range doc.Recent {
			rows = append(rows, []string{
				html.EscapeString(m.Date),
				s.linkEntity(seg, "event", m.E, m.En),
				s.linkEntity(seg, "game", m.G, doc.Name+" vs "+m.Opp),
				fmt.Sprintf("%d–%d", m.Us, m.Them),
			})
		}
		writeTable(&h, "Recent Series", []string{"Date", "Tournament", "Matchup", "Score"}, rows)
	}

	renderOpps := func(limit int) {
		var rows [][]string
		for i, o := range doc.Opps {
			if i >= limit {
				break
			}
			cmp := `<a href="` + langBasePath(seg) + `stats/compare?teams=` + html.EscapeString(slug+","+o.U) + `">Compare</a>`
			if o.U == "" {
				cmp = "–"
			}
			rows = append(rows, []string{
				s.linkEntity(seg, "team", o.U, o.N),
				fmtInt(o.W) + "–" + fmtInt(o.G-o.W),
				fmtPct(o.W, o.G),
				fmtInt(o.G),
				cmp,
			})
		}
		writeTable(&h, "Head-to-Head vs Opponents", []string{"Opponent", "Record", "Win %", "Games", "Compare"}, rows)
	}

	renderChamps := func(limit int) {
		var rows [][]string
		for i, c := range doc.Champs {
			if i >= limit {
				break
			}
			rows = append(rows, []string{
				s.linkChamp(seg, c.C),
				fmtInt(c.G),
				fmtInt(c.W),
				fmtPct(c.W, c.G),
			})
		}
		writeTable(&h, "Most Picked Champions", []string{"Champion", "Games", "Wins", "Win %"}, rows)
		var banRows [][]string
		for _, b := range doc.Bans {
			banRows = append(banRows, []string{s.linkChamp(seg, b.C), fmtInt(b.G)})
		}
		writeTable(&h, "Most Banned by "+doc.Name, []string{"Champion", "Bans"}, banRows)
		var bvsRows [][]string
		for _, b := range doc.BansVs {
			bvsRows = append(bvsRows, []string{s.linkChamp(seg, b.C), fmtInt(b.G)})
		}
		writeTable(&h, "Most Banned Against "+doc.Name, []string{"Champion", "Bans"}, bvsRows)
	}

	renderStats := func() {
		if len(doc.Sides) == 4 && (doc.Sides[0]+doc.Sides[2]) > 0 {
			writeKV(&h, [][2]string{
				{"Blue Side Record", fmtInt(doc.Sides[1]) + "–" + fmtInt(doc.Sides[0]-doc.Sides[1]) + " (" + fmtPct(doc.Sides[1], doc.Sides[0]) + ")"},
				{"Red Side Record", fmtInt(doc.Sides[3]) + "–" + fmtInt(doc.Sides[2]-doc.Sides[3]) + " (" + fmtPct(doc.Sides[3], doc.Sides[2]) + ")"},
			})
		}
		if doc.Obj != nil {
			writeKV(&h, [][2]string{
				{"Dragons / Game", fmt.Sprintf("%.2f", doc.Obj.Dragons)},
				{"Barons / Game", fmt.Sprintf("%.2f", doc.Obj.Barons)},
				{"Towers / Game", fmt.Sprintf("%.2f", doc.Obj.Towers)},
				{"Rift Heralds / Game", fmt.Sprintf("%.2f", doc.Obj.Heralds)},
				{"Avg Gold Diff", fmtInt(int(doc.Obj.Golddiff))},
			})
		}
		var rows [][]string
		for _, y := range doc.Years {
			rows = append(rows, []string{
				html.EscapeString(y.Y),
				html.EscapeString(y.As),
				fmtInt(y.W) + "–" + fmtInt(y.G-y.W),
				fmtPct(y.W, y.G),
				fmtInt(y.G),
			})
		}
		writeTable(&h, "Year-by-Year Results", []string{"Year", "Team Name", "Record", "Win %", "Games"}, rows)
	}

	switch tab {
	case "matches":
		renderRecent()
		renderOpps(40)
	case "history":
		renderNames()
		renderTitles()
		renderEvents(60)
		renderStartersAndRosters(15)
	case "champions":
		renderChamps(30)
	case "stats":
		renderStats()
		renderChamps(12)
	default:
		renderStartersAndRosters(3)
		renderTitles()
		renderNames()
		renderEvents(20)
		renderOpps(15)
		renderChamps(15)
		renderRecent()
		renderStats()
	}

	h.WriteString(`</article>`)
	res.html = h.String()
	return res
}

func (s *store) buildPlayerSSR(ver, seg, slug, tab, canonical string) ssrResult {
	var doc ssrPlayerDoc
	if !s.readHubJSON(ver, filepath.Join("player", slug+".json"), &doc) || doc.Name == "" {
		return ssrResult{}
	}
	var res ssrResult

	if tab == "" {
		alt := []string{doc.Name + " LoL"}
		if doc.Bio.Real != "" {
			alt = append(alt, doc.Bio.Real)
		}
		if doc.Bio.Native != "" {
			alt = append(alt, doc.Bio.Native)
		}
		if doc.Club != "" {
			alt = append(alt, doc.Club+" "+doc.Name)
		}
		s.mu.RLock()
		hasPhoto := s.photos[slug]
		s.mu.RUnlock()
		imgURL := publicURL + "og/player/" + slug + ".png"
		if hasPhoto {
			imgURL = publicURL + "stats/photos/" + slug + ".webp"
		}
		roleTitle := "Professional League of Legends Player"
		if doc.Role != "" {
			roleTitle = "Professional League of Legends " + doc.Role + " Player"
		}
		person := map[string]any{
			"@type": "Person", "@id": canonical + "#entity",
			"name": doc.Name, "alternateName": alt, "jobTitle": roleTitle,
			"url": canonical, "image": imgURL,
		}
		if doc.Bio.Born != "" {
			person["birthDate"] = doc.Bio.Born
		}
		if doc.Bio.Country != "" {
			person["nationality"] = map[string]any{"@type": "Country", "name": doc.Bio.Country}
		}
		if doc.Club != "" {
			aff := map[string]any{"@type": "SportsTeam", "name": doc.Club}
			if doc.ClubU != "" {
				aff["url"] = langPublicBase(seg) + "team/" + doc.ClubU
			}
			person["affiliation"] = aff
			person["memberOf"] = aff
		}
		var sameAs []string
		if tw := twitterURL(doc.Bio.Twitter); tw != "" {
			sameAs = append(sameAs, tw)
		}
		if yt := safeExtURL(doc.Bio.Youtube); yt != "" {
			sameAs = append(sameAs, yt)
		}
		if st := safeExtURL(doc.Bio.Stream); st != "" {
			sameAs = append(sameAs, st)
		}
		if len(sameAs) > 0 {
			person["sameAs"] = sameAs
		}
		if raw, ok := marshalLD(map[string]any{
			"@context": "https://schema.org", "@type": "ProfilePage",
			"url": canonical, "mainEntity": person,
		}); ok {
			res.lds = append(res.lds, raw)
		}
	}

	var h strings.Builder
	h.WriteString(`<article>`)
	var lead strings.Builder
	lead.WriteString(`<strong>` + html.EscapeString(doc.Name) + `</strong>`)
	if doc.Bio.Real != "" {
		lead.WriteString(" (" + html.EscapeString(doc.Bio.Real))
		if doc.Bio.Native != "" {
			lead.WriteString(" · " + html.EscapeString(doc.Bio.Native))
		}
		lead.WriteString(")")
	}
	lead.WriteString(" is a League of Legends pro " + html.EscapeString(doc.Role) + " player")
	if doc.Bio.Country != "" {
		lead.WriteString(" from " + html.EscapeString(doc.Bio.Country))
	}
	if doc.Club != "" {
		lead.WriteString(", playing for " + s.linkEntity(seg, "team", doc.ClubU, doc.Club))
	}
	lead.WriteString(fmt.Sprintf(": <strong>%s pro games</strong> (%s wins, %.2f KDA across %d unique champions).", fmtInt(doc.G), fmtPct(doc.W, doc.G), doc.KDA, doc.NChamps))
	h.WriteString(`<p>` + lead.String() + `</p>`)

	writeTabsNav(&h, langBasePath(seg)+"player/"+slug, tab, [][2]string{
		{"", "Overview"}, {"stats", "Stats"}, {"champions", "Champions"}, {"matches", "Matches"}, {"career", "Career"},
	})

	kv := [][2]string{
		{"Player", html.EscapeString(doc.Name)},
		{"Full Name", html.EscapeString(doc.Bio.Real)},
		{"Role", html.EscapeString(doc.Role)},
		{"Nationality", html.EscapeString(doc.Bio.Country)},
		{"Born", html.EscapeString(doc.Bio.Born)},
		{"Current Team", s.linkEntity(seg, "team", doc.ClubU, doc.Club)},
		{"Contract Until", html.EscapeString(doc.Bio.Contract)},
		{"Career Record", fmtInt(doc.W) + "–" + fmtInt(doc.G-doc.W) + " (" + fmtPct(doc.W, doc.G) + ")"},
		{"Career K / D / A", fmtInt(doc.K) + " / " + fmtInt(doc.D) + " / " + fmtInt(doc.A)},
		{"KDA", fmt.Sprintf("%.2f", doc.KDA)},
	}
	if doc.CSM != nil {
		kv = append(kv, [2]string{"CS / Min", fmt.Sprintf("%.1f", *doc.CSM)})
	}
	if doc.GPM != nil {
		kv = append(kv, [2]string{"Gold / Min", fmt.Sprintf("%.0f", *doc.GPM)})
	}
	if doc.DPM != nil {
		kv = append(kv, [2]string{"DMG / Min", fmt.Sprintf("%.0f", *doc.DPM)})
	}
	if doc.MVP > 0 {
		kv = append(kv, [2]string{"Player of the Game", fmtInt(doc.MVP)})
	}
	if len(doc.Bio.Soloq) > 0 {
		kv = append(kv, [2]string{"Solo Queue IDs", html.EscapeString(strings.Join(doc.Bio.Soloq[:min(len(doc.Bio.Soloq), 4)], ", "))})
	}
	writeKV(&h, kv)

	renderTeams := func() {
		var rows [][]string
		for _, t := range doc.Teams {
			rows = append(rows, []string{
				s.linkEntity(seg, "team", t.U, t.N),
				html.EscapeString(t.From + " – " + t.To),
				fmtInt(t.W) + "–" + fmtInt(t.G-t.W),
				fmtPct(t.W, t.G),
				fmtInt(t.G),
			})
		}
		writeTable(&h, "Teams Played For", []string{"Team", "Dates", "Record", "Win %", "Games"}, rows)
	}

	renderTitles := func() {
		if len(doc.Titles) == 0 {
			return
		}
		var rows [][]string
		for _, t := range doc.Titles {
			rows = append(rows, []string{
				html.EscapeString(t.Date),
				s.linkEntity(seg, "event", t.E, t.T),
				html.EscapeString(t.Kind),
			})
		}
		writeTable(&h, "Championship Titles ("+strconv.Itoa(len(doc.Titles))+")", []string{"Date", "Tournament", "Tier"}, rows)
	}

	renderChamps := func(limit int) {
		var rows [][]string
		for i, c := range doc.Champs {
			if i >= limit {
				break
			}
			rows = append(rows, []string{
				s.linkChamp(seg, c.C),
				fmtInt(c.G),
				fmtInt(c.W),
				fmtPct(c.W, c.G),
				fmt.Sprintf("%.2f", c.KDA),
			})
		}
		writeTable(&h, "Most Played Champions ("+strconv.Itoa(doc.NChamps)+" Unique)", []string{"Champion", "Games", "Wins", "Win %", "KDA"}, rows)
	}

	renderEvents := func(limit int) {
		var rows [][]string
		for i, ev := range doc.Events {
			if i >= limit {
				break
			}
			pl := ev.Pl
			if pl == "" {
				pl = "–"
			}
			rows = append(rows, []string{
				html.EscapeString(ev.Date),
				s.linkEntity(seg, "event", ev.E, ev.En),
				s.linkEntity(seg, "team", ev.Tu, ev.T),
				html.EscapeString(pl),
				fmtInt(ev.W) + "–" + fmtInt(ev.G-ev.W),
				fmt.Sprintf("%.2f", ev.KDA),
			})
		}
		writeTable(&h, "Tournaments", []string{"Date", "Tournament", "Team", "Place", "Record", "KDA"}, rows)
	}

	renderRecent := func() {
		var rows [][]string
		for _, m := range doc.Recent {
			resTxt := "Loss"
			if m.Win == 1 {
				resTxt = "Win"
			}
			rows = append(rows, []string{
				html.EscapeString(m.Date),
				s.linkChamp(seg, m.C),
				fmt.Sprintf("%d/%d/%d", m.K, m.D, m.A),
				resTxt,
				html.EscapeString(m.Team + " vs " + m.Opp),
				s.linkEntity(seg, "game", m.G, m.En),
			})
		}
		writeTable(&h, "Recent Pro Games", []string{"Date", "Champion", "KDA", "Result", "Match", "Tournament"}, rows)
	}

	renderYears := func() {
		var rows [][]string
		for _, y := range doc.Years {
			rows = append(rows, []string{
				html.EscapeString(y.Y),
				html.EscapeString(y.Team),
				fmtInt(y.W) + "–" + fmtInt(y.G-y.W),
				fmtPct(y.W, y.G),
				fmt.Sprintf("%.2f", y.KDA),
			})
		}
		writeTable(&h, "Stats by Season", []string{"Year", "Team", "Record", "Win %", "KDA"}, rows)
	}

	switch tab {
	case "champions":
		renderChamps(60)
	case "matches":
		renderRecent()
	case "career":
		renderTeams()
		renderTitles()
		renderEvents(50)
	case "stats":
		renderYears()
		renderChamps(20)
	default:
		renderTeams()
		renderTitles()
		renderChamps(20)
		renderEvents(20)
		renderYears()
		renderRecent()
	}

	h.WriteString(`</article>`)
	res.html = h.String()
	return res
}

func (s *store) buildChampSSR(ver, seg, slug string) ssrResult {
	var doc ssrChampDoc
	if !s.readHubJSON(ver, filepath.Join("champ", slug+".json"), &doc) || doc.Name == "" {
		return ssrResult{}
	}
	var h strings.Builder
	h.WriteString(`<article>`)
	h.WriteString(fmt.Sprintf(`<p><strong>%s</strong> has been picked in <strong>%s</strong> and banned in <strong>%s</strong> professional League of Legends games (%s win rate).</p>`, html.EscapeString(doc.Name), fmtInt(doc.P), fmtInt(doc.B), fmtPct(doc.W, doc.P)))

	kv := [][2]string{
		{"Champion", html.EscapeString(doc.Name)},
		{"Pro Picks", fmtInt(doc.P)},
		{"Pro Bans", fmtInt(doc.B)},
		{"Win Rate", fmtPct(doc.W, doc.P)},
	}
	if len(doc.Side) == 4 {
		kv = append(kv,
			[2]string{"Blue Side Win %", fmtPct(doc.Side[1], doc.Side[0]) + " (" + fmtInt(doc.Side[0]) + ")"},
			[2]string{"Red Side Win %", fmtPct(doc.Side[3], doc.Side[2]) + " (" + fmtInt(doc.Side[2]) + ")"},
		)
	}
	if len(doc.Roles) > 0 {
		var rParts []string
		for _, r := range doc.Roles {
			rParts = append(rParts, fmt.Sprintf("%s (%s)", r.R, fmtInt(r.P)))
		}
		kv = append(kv, [2]string{"Roles Played", html.EscapeString(strings.Join(rParts, ", "))})
	}
	writeKV(&h, kv)

	if doc.Builds != nil && doc.Builds.G > 0 {
		var rows [][]string
		for i, it := range doc.Builds.Items {
			if i >= 14 {
				break
			}
			nm, g, w := tupleStr(it, 0), tupleInt(it, 1), tupleInt(it, 2)
			rows = append(rows, []string{html.EscapeString(nm), fmtInt(g), fmtPct(w, g)})
		}
		writeTable(&h, "Pro Items (Since "+doc.Builds.Since+", "+fmtInt(doc.Builds.G)+" games)", []string{"Item", "Games", "Win %"}, rows)
		var kRows [][]string
		for i, k := range doc.Builds.Keys {
			if i >= 6 {
				break
			}
			nm, g, w := tupleStr(k, 0), tupleInt(k, 1), tupleInt(k, 2)
			kRows = append(kRows, []string{html.EscapeString(nm), fmtInt(g), fmtPct(w, g)})
		}
		writeTable(&h, "Pro Keystones", []string{"Keystone", "Games", "Win %"}, kRows)
		var spRows [][]string
		for _, sp := range doc.Builds.Spells {
			nm, g, w := tupleStr(sp, 0), tupleInt(sp, 1), tupleInt(sp, 2)
			spRows = append(spRows, []string{html.EscapeString(nm), fmtInt(g), fmtPct(w, g)})
		}
		writeTable(&h, "Summoner Spells", []string{"Spells", "Games", "Win %"}, spRows)
	}

	mainRole := ""
	if len(doc.Roles) > 0 {
		mainRole = doc.Roles[0].R
	}
	if mList := doc.Matchups[mainRole]; len(mList) > 0 {
		var rows [][]string
		for i, m := range mList {
			if i >= 20 {
				break
			}
			opp, g, w := tupleStr(m, 0), tupleInt(m, 1), tupleInt(m, 2)
			gd15, hasGD := tupleFloat(m, 4)
			gdTxt := "–"
			if hasGD {
				gdTxt = fmtInt(int(gd15))
			}
			rows = append(rows, []string{
				s.linkChamp(seg, opp),
				fmtInt(g),
				fmtPct(w, g),
				gdTxt,
			})
		}
		writeTable(&h, "Pro "+mainRole+" Matchups & Counters", []string{"Opponent", "Games", "Win %", "GD@15"}, rows)
	}

	if len(doc.Duos) > 0 {
		var rows [][]string
		for i, d := range doc.Duos {
			if i >= 12 {
				break
			}
			partner, g, w := tupleStr(d, 0), tupleInt(d, 1), tupleInt(d, 2)
			rows = append(rows, []string{s.linkChamp(seg, partner), fmtInt(g), fmtPct(w, g)})
		}
		writeTable(&h, "Top Bot Lane Duo Partners", []string{"Partner", "Games", "Win %"}, rows)
	}

	var pRows [][]string
	for i, pl := range doc.Players {
		if i >= 20 {
			break
		}
		pRows = append(pRows, []string{
			s.linkEntity(seg, "player", pl.U, pl.N),
			fmtInt(pl.G),
			fmtInt(pl.W),
			fmtPct(pl.W, pl.G),
			fmt.Sprintf("%.2f", pl.KDA),
		})
	}
	writeTable(&h, "Pro Players With Most "+doc.Name+" Games", []string{"Player", "Games", "Wins", "Win %", "KDA"}, pRows)

	var yRows [][]string
	for _, y := range doc.Years {
		yRows = append(yRows, []string{
			html.EscapeString(y.Y),
			fmtInt(y.P),
			fmtInt(y.B),
			fmtPct(y.W, y.P),
		})
	}
	writeTable(&h, "Season-by-Season Pro Presence", []string{"Year", "Picks", "Bans", "Win %"}, yRows)

	var rRows [][]string
	for i, r := range doc.Recent {
		if i >= 12 {
			break
		}
		resTxt := "Loss"
		if r.Win == 1 {
			resTxt = "Win"
		}
		rRows = append(rRows, []string{
			html.EscapeString(r.Date),
			s.linkEntity(seg, "player", r.U, r.N),
			html.EscapeString(r.Team + " vs " + r.Opp),
			fmt.Sprintf("%d/%d/%d", r.K, r.D, r.A),
			resTxt,
			s.linkEntity(seg, "game", r.G, r.En),
		})
	}
	writeTable(&h, "Latest Pro Games", []string{"Date", "Player", "Match", "KDA", "Result", "Tournament"}, rRows)

	h.WriteString(`<p><a href="` + langBasePath(seg) + `stats/counters">Open Counter-Pick Finder</a> · <a href="` + langBasePath(seg) + `stats/synergy">Open Duo Synergy Explorer</a> · <a href="` + langBasePath(seg) + `stats/items">Open Item History</a></p>`)
	h.WriteString(`</article>`)
	return ssrResult{html: h.String()}
}

func (s *store) buildEventSSR(ver, seg, slug, tab, canonical string) ssrResult {
	var doc ssrEventDoc
	if !s.readHubJSON(ver, filepath.Join("event", slug+".json"), &doc) || doc.N == "" {
		return ssrResult{}
	}
	var res ssrResult

	if tab == "" {
		ld := map[string]any{
			"@context": "https://schema.org", "@type": "SportsEvent", "@id": canonical + "#entity",
			"name": doc.N, "sport": "League of Legends", "url": canonical,
		}
		if doc.Start != "" {
			ld["startDate"] = doc.Start
		}
		if doc.End != "" {
			ld["endDate"] = doc.End
			ld["eventStatus"] = "https://schema.org/EventCompleted"
		}
		if doc.Country != "" {
			ld["location"] = map[string]any{"@type": "Place", "name": doc.Country}
		} else if doc.Region != "" {
			ld["location"] = map[string]any{"@type": "Place", "name": doc.Region}
		}
		if doc.League != "" {
			org := map[string]any{"@type": "SportsOrganization", "name": doc.League}
			if doc.Lu != "" {
				org["url"] = langPublicBase(seg) + "league/" + doc.Lu
			}
			ld["organizer"] = org
		}
		if doc.Parent != nil && doc.Parent.U != "" {
			ld["superEvent"] = map[string]any{"@type": "SportsEvent", "name": doc.Parent.N, "url": langPublicBase(seg) + "tournament/" + doc.Parent.U}
		}
		var comps []map[string]any
		for i, t := range doc.Teams {
			if i >= 24 {
				break
			}
			comp := map[string]any{"@type": "SportsTeam", "name": t.T}
			if t.U != "" {
				comp["url"] = langPublicBase(seg) + "team/" + t.U
			}
			comps = append(comps, comp)
		}
		if len(comps) > 0 {
			ld["competitor"] = comps
		}
		if len(doc.Results) > 0 && doc.Results[0].P == "1" {
			win := map[string]any{"@type": "SportsTeam", "name": doc.Results[0].T}
			if doc.Results[0].U != "" {
				win["url"] = langPublicBase(seg) + "team/" + doc.Results[0].U
			}
			ld["winner"] = win
		}
		if raw, ok := marshalLD(ld); ok {
			res.lds = append(res.lds, raw)
		}
	}

	var h strings.Builder
	h.WriteString(`<article>`)
	h.WriteString(`<p><strong>` + html.EscapeString(doc.N) + `</strong>`)
	if doc.League != "" {
		h.WriteString(" (" + s.linkEntity(seg, "league", doc.Lu, doc.League) + ")")
	}
	h.WriteString(": " + fmtInt(doc.Series) + " series and " + fmtInt(doc.Games) + " pro games")
	if doc.Start != "" {
		h.WriteString(" (" + html.EscapeString(doc.Start) + " to " + html.EscapeString(doc.End) + ")")
	}
	h.WriteString(`.</p>`)

	writeTabsNav(&h, langBasePath(seg)+"tournament/"+slug, tab, [][2]string{
		{"", "Overview"}, {"matches", "Matches"}, {"stats", "Stats"}, {"champions", "Champions"}, {"teams", "Teams"},
	})

	kv := [][2]string{
		{"Tournament", html.EscapeString(doc.N)},
		{"League", s.linkEntity(seg, "league", doc.Lu, doc.League)},
		{"Region", html.EscapeString(doc.Region)},
		{"Dates", html.EscapeString(doc.Start + " – " + doc.End)},
		{"Format / Type", html.EscapeString(doc.Type)},
		{"Games / Series", fmtInt(doc.Games) + " / " + fmtInt(doc.Series)},
	}
	if doc.Country != "" {
		kv = append(kv, [2]string{"Host", html.EscapeString(doc.Country)})
	}
	writeKV(&h, kv)

	renderResults := func() {
		var rows [][]string
		for _, r := range doc.Results {
			rows = append(rows, []string{
				html.EscapeString(r.P),
				s.linkEntity(seg, "team", r.U, r.T),
				html.EscapeString(fmtUSD(r.Usd)),
			})
		}
		writeTable(&h, "Final Standings", []string{"Place", "Team", "Prize"}, rows)
	}

	renderTeams := func() {
		if len(doc.Rosters) > 0 {
			var rows [][]string
			for _, rt := range doc.Rosters {
				var pls []string
				for _, p := range rt.P {
					if len(p) >= 3 {
						pls = append(pls, s.linkEntity(seg, "player", p[1], p[0])+" ("+html.EscapeString(p[2])+")")
					}
				}
				rows = append(rows, []string{
					s.linkEntity(seg, "team", rt.U, rt.T),
					strings.Join(pls, ", "),
				})
			}
			writeTable(&h, "Participating Teams & Rosters", []string{"Team", "Roster"}, rows)
		} else if len(doc.Teams) > 0 {
			var rows [][]string
			for _, t := range doc.Teams {
				rows = append(rows, []string{
					s.linkEntity(seg, "team", t.U, t.T),
					fmtInt(t.SW) + "–" + fmtInt(t.SG-t.SW),
					fmtInt(t.W) + "–" + fmtInt(t.G-t.W),
				})
			}
			writeTable(&h, "Teams", []string{"Team", "Series", "Games"}, rows)
		}
	}

	renderStages := func(limit int) {
		var rows [][]string
		for _, st := range doc.Stages {
			for _, m := range st.Series {
				if len(rows) >= limit {
					break
				}
				sc := "vs"
				if m.SA != nil && m.SB != nil {
					sc = fmt.Sprintf("%d–%d", *m.SA, *m.SB)
				}
				rows = append(rows, []string{
					html.EscapeString(st.Name),
					html.EscapeString(m.Date),
					s.linkEntity(seg, "team", m.Au, m.A),
					s.linkEntity(seg, "game", m.G, sc),
					s.linkEntity(seg, "team", m.Bu, m.B),
				})
			}
		}
		writeTable(&h, "Series & Results", []string{"Stage", "Date", "Team A", "Score", "Team B"}, rows)
	}

	renderChamps := func(limit int) {
		var rows [][]string
		for i, c := range doc.Champs {
			if i >= limit {
				break
			}
			rows = append(rows, []string{
				s.linkChamp(seg, c.C),
				fmtInt(c.P),
				fmtInt(c.B),
				fmtPct(c.W, c.P),
			})
		}
		writeTable(&h, "Most Picked & Banned Champions", []string{"Champion", "Picks", "Bans", "Win %"}, rows)
	}

	renderLeaders := func() {
		for _, cat := range [][2]string{{"kda", "KDA Leaders"}, {"kills", "Kills Leaders"}, {"dpm", "DPM Leaders"}} {
			list := doc.Leaders[cat[0]]
			if len(list) == 0 {
				continue
			}
			var rows [][]string
			for _, l := range list {
				rows = append(rows, []string{
					s.linkEntity(seg, "player", l.U, l.N),
					html.EscapeString(l.T),
					fmtInt(l.G),
					fmt.Sprintf("%.2f", l.V),
				})
			}
			writeTable(&h, cat[1], []string{"Player", "Team", "Games", "Value"}, rows)
		}
	}

	switch tab {
	case "matches":
		renderStages(80)
	case "teams":
		renderTeams()
	case "champions":
		renderChamps(50)
	case "stats":
		renderLeaders()
		renderChamps(20)
	default:
		renderResults()
		renderTeams()
		renderStages(40)
		renderLeaders()
		renderChamps(20)
	}

	h.WriteString(`</article>`)
	res.html = h.String()
	return res
}

func (s *store) buildLeagueSSR(ver, seg, slug, canonical string) ssrResult {
	var doc ssrLeagueDoc
	if !s.readHubJSON(ver, filepath.Join("league", slug+".json"), &doc) || doc.L == "" {
		return ssrResult{}
	}
	var res ssrResult
	alt := []string{doc.L + " LoL"}
	seen := map[string]bool{strings.ToLower(doc.L): true, strings.ToLower(doc.L + " lol"): true}
	if doc.S != "" && !seen[strings.ToLower(doc.S)] {
		seen[strings.ToLower(doc.S)] = true
		alt = append(alt, doc.S, doc.S+" LoL")
	}
	for _, st := range doc.History {
		for _, cand := range []string{st.L, st.S} {
			if cand != "" && !seen[strings.ToLower(cand)] {
				seen[strings.ToLower(cand)] = true
				alt = append(alt, cand)
			}
		}
	}
	ld := map[string]any{
		"@context": "https://schema.org", "@type": "SportsOrganization", "@id": canonical + "#entity",
		"name": doc.L, "alternateName": alt, "sport": "League of Legends", "url": canonical,
	}
	if doc.Region != "" {
		ld["location"] = map[string]any{"@type": "Place", "name": doc.Region}
	}
	if raw, ok := marshalLD(ld); ok {
		res.lds = append(res.lds, raw)
	}

	var h strings.Builder
	h.WriteString(`<article><p><strong>` + html.EscapeString(doc.L) + `</strong>`)
	if doc.S != "" {
		h.WriteString(" (" + html.EscapeString(doc.S) + ")")
	}
	h.WriteString(fmt.Sprintf(": %d League of Legends tournaments recorded", len(doc.Events)))
	if doc.Region != "" {
		h.WriteString(" in " + html.EscapeString(doc.Region))
	}
	h.WriteString(`.</p>`)

	if len(doc.History) > 1 {
		var rows [][]string
		for _, st := range doc.History {
			rows = append(rows, []string{
				html.EscapeString(st.Y),
				s.linkEntity(seg, "league", st.U, st.L),
				html.EscapeString(st.S),
			})
		}
		writeTable(&h, "League History & Rebrands", []string{"Years", "League Name", "Short Name"}, rows)
	}

	var tRows [][]string
	for _, t := range doc.Titles {
		tRows = append(tRows, []string{s.linkEntity(seg, "team", t.U, t.T), fmtInt(t.N)})
	}
	writeTable(&h, "Most Titles in "+doc.L, []string{"Team", "Titles"}, tRows)

	var eRows [][]string
	for i, ev := range doc.Events {
		if i >= 100 {
			break
		}
		wTxt := "–"
		if ev.W != "" {
			wTxt = s.linkEntity(seg, "team", ev.Wu, ev.W)
		}
		eRows = append(eRows, []string{
			html.EscapeString(ev.Y),
			s.linkEntity(seg, "event", ev.U, ev.N),
			html.EscapeString(ev.St + " – " + ev.En),
			wTxt,
			fmtInt(ev.G),
		})
	}
	writeTable(&h, "Seasons & Tournaments", []string{"Year", "Tournament", "Dates", "Winner", "Games"}, eRows)
	h.WriteString(`</article>`)
	res.html = h.String()
	return res
}

func (s *store) buildGameSSR(ver, seg, slug, canonical string) ssrResult {
	var doc ssrGameDoc
	if !s.readHubJSON(ver, filepath.Join("game", slug+".json"), &doc) || doc.A.N == "" {
		return ssrResult{}
	}
	var res ssrResult
	winTeam := ""
	winSlug := ""
	switch doc.W {
	case 1:
		winTeam, winSlug = doc.A.N, doc.A.U
	case 2:
		winTeam, winSlug = doc.B.N, doc.B.U
	}
	compA := map[string]any{"@type": "SportsTeam", "name": doc.A.N}
	if doc.A.U != "" {
		compA["url"] = langPublicBase(seg) + "team/" + doc.A.U
	}
	compB := map[string]any{"@type": "SportsTeam", "name": doc.B.N}
	if doc.B.U != "" {
		compB["url"] = langPublicBase(seg) + "team/" + doc.B.U
	}
	ld := map[string]any{
		"@context": "https://schema.org", "@type": "SportsEvent", "@id": canonical + "#entity",
		"name":        doc.A.N + " vs " + doc.B.N + " – " + doc.En,
		"sport":       "League of Legends",
		"url":         canonical,
		"eventStatus": "https://schema.org/EventCompleted",
		"competitor":  []map[string]any{compA, compB},
	}
	if len(doc.Date) >= 10 {
		ld["startDate"] = doc.Date[:10]
	}
	if doc.En != "" {
		sup := map[string]any{"@type": "SportsEvent", "name": doc.En}
		if doc.E != "" {
			sup["url"] = langPublicBase(seg) + "tournament/" + doc.E
		}
		ld["superEvent"] = sup
	}
	if winTeam != "" {
		wObj := map[string]any{"@type": "SportsTeam", "name": winTeam}
		if winSlug != "" {
			wObj["url"] = langPublicBase(seg) + "team/" + winSlug
		}
		ld["winner"] = wObj
	}
	if raw, ok := marshalLD(ld); ok {
		res.lds = append(res.lds, raw)
	}

	var h strings.Builder
	h.WriteString(`<article>`)
	h.WriteString(fmt.Sprintf(`<p>%s <strong>%d–%d</strong> %s · %s (%s) · %s (Bo%d).</p>`,
		s.linkEntity(seg, "team", doc.A.U, doc.A.N), doc.SA, doc.SB, s.linkEntity(seg, "team", doc.B.U, doc.B.N),
		s.linkEntity(seg, "event", doc.E, doc.En), html.EscapeString(doc.Stage), html.EscapeString(doc.Date), doc.Bo))

	for _, g := range doc.Games {
		winner := "–"
		switch g.W {
		case 1:
			winner = doc.A.N
		case 2:
			winner = doc.B.N
		}
		blueTeam, redTeam := doc.A.N, doc.B.N
		if g.Blue == "b" {
			blueTeam, redTeam = doc.B.N, doc.A.N
		}
		meta := fmt.Sprintf("Game %d — Winner: %s (Blue: %s, Red: %s)", g.N, winner, blueTeam, redTeam)
		if g.Patch != "" {
			meta += " · Patch " + g.Patch
		}
		if g.Min != nil {
			meta += fmt.Sprintf(" · %.1f min", *g.Min)
		}
		h.WriteString(`<section><h2>` + html.EscapeString(meta) + `</h2>`)
		if g.T != nil {
			var bp, rp, bb, rb []string
			for _, c := range g.T.Blue.Picks {
				bp = append(bp, s.linkChamp(seg, c))
			}
			for _, c := range g.T.Red.Picks {
				rp = append(rp, s.linkChamp(seg, c))
			}
			for _, c := range g.T.Blue.Bans {
				bb = append(bb, s.linkChamp(seg, c))
			}
			for _, c := range g.T.Red.Bans {
				rb = append(rb, s.linkChamp(seg, c))
			}
			h.WriteString(`<p><strong>Blue Picks:</strong> ` + strings.Join(bp, ", ") + ` | <strong>Bans:</strong> ` + strings.Join(bb, ", ") + `</p>`)
			h.WriteString(`<p><strong>Red Picks:</strong> ` + strings.Join(rp, ", ") + ` | <strong>Bans:</strong> ` + strings.Join(rb, ", ") + `</p>`)
		}
		if len(g.P) > 0 {
			var rows [][]string
			for _, p := range g.P {
				cs, dm, gd := "–", "–", "–"
				if p.CS != nil {
					cs = fmtInt(*p.CS)
				}
				if p.Dm != nil {
					dm = fmtInt(*p.Dm)
				}
				if p.Gd != nil {
					gd = fmtInt(*p.Gd)
				}
				rows = append(rows, []string{
					html.EscapeString(p.R),
					s.linkEntity(seg, "player", p.U, p.N),
					s.linkChamp(seg, p.C),
					fmt.Sprintf("%d/%d/%d", p.K, p.D, p.A),
					cs, gd, dm,
					html.EscapeString(p.Ks),
				})
			}
			writeTable(&h, "Game "+strconv.Itoa(g.N)+" Scoreboard", []string{"Role", "Player", "Champion", "KDA", "CS", "Gold", "DMG", "Keystone"}, rows)
		}
		h.WriteString(`</section>`)
	}
	h.WriteString(`</article>`)
	res.html = h.String()
	return res
}

// ---------- Extended Sitemaps & Priority IndexNow ----------

func (s *store) entityTabURLs() []string {
	var out []string
	addTabs := func(kind, prefix string, tabs []string, minGames int) {
		for _, slug := range s.order[kind] {
			e := s.pages[kind][slug]
			if !e.index {
				continue
			}
			if e.summary == "" && (minGames <= 0 || e.games < minGames) {
				continue
			}
			for _, tb := range tabs {
				out = append(out, prefix+"/"+slug+"/"+tb)
			}
		}
	}
	addTabs("team", "team", []string{"stats", "matches", "history", "champions"}, 50)
	addTabs("player", "player", []string{"stats", "champions", "matches", "career"}, 150)
	// High-importance tournaments with rich summaries
	addTabs("event", "tournament", []string{"matches", "stats", "champions", "teams"}, 0)
	return out
}

func (s *store) intlBasePaths() []string {
	var base []string
	base = append(base, "")
	for sec := range sections {
		if sec != "" {
			base = append(base, "stats/"+sec)
		}
	}
	for _, tab := range []string{"matches", "schedule", "results", "stream", "news", "about"} {
		base = append(base, tab)
	}
	sort.Strings(base)

	for _, slug := range s.order["champ"] {
		if s.pages["champ"][slug].index {
			base = append(base, "champion/"+slug)
		}
	}
	for _, slug := range s.order["league"] {
		if s.pages["league"][slug].index {
			base = append(base, "league/"+slug)
		}
	}
	for _, slug := range s.order["team"] {
		e := s.pages["team"][slug]
		if e.index && (e.summary != "" || e.games >= 50) {
			base = append(base, "team/"+slug)
		}
	}
	// Top 2,000 indexed players by game count
	type pl struct {
		slug  string
		games int
	}
	var pls []pl
	for _, slug := range s.order["player"] {
		e := s.pages["player"][slug]
		if e.index {
			pls = append(pls, pl{slug: slug, games: e.games})
		}
	}
	sort.Slice(pls, func(i, j int) bool {
		if pls[i].games != pls[j].games {
			return pls[i].games > pls[j].games
		}
		return pls[i].slug < pls[j].slug
	})
	if len(pls) > 2000 {
		pls = pls[:2000]
	}
	for _, p := range pls {
		base = append(base, "player/"+p.slug)
	}
	return base
}

func (s *store) intlURLs() []string {
	base := s.intlBasePaths()
	out := make([]string, 0, len(base)*len(langOrder))
	for _, seg := range langOrder {
		for _, p := range base {
			out = append(out, seg+"/"+p)
		}
	}
	return out
}

func startupPriorityURLs(changed []string, pages map[string]map[string]entry, order map[string][]string) []string {
	seen := map[string]bool{}
	var out []string
	add := func(u string) {
		if u != "" && !seen[u] {
			seen[u] = true
			out = append(out, u)
		}
	}
	for _, u := range changed {
		add(u)
	}
	for _, slug := range order["champ"] {
		if pages["champ"][slug].index {
			add(publicURL + "champion/" + slug)
		}
	}
	for _, slug := range order["league"] {
		if pages["league"][slug].index {
			add(publicURL + "league/" + slug)
		}
	}
	type item struct {
		slug  string
		games int
	}
	addTop := func(kind string, limit int) {
		var list []item
		for _, slug := range order[kind] {
			e := pages[kind][slug]
			if e.index {
				list = append(list, item{slug: slug, games: e.games})
			}
		}
		sort.Slice(list, func(i, j int) bool { return list[i].games > list[j].games })
		for i, it := range list {
			if i >= limit {
				break
			}
			add(publicURL + kindPath[kind] + "/" + it.slug)
		}
	}
	addTop("team", 400)
	addTop("player", 400)
	return out
}

func serveOpenSearch(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/opensearchdescription+xml; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=86400")
	fmt.Fprintf(w, `<?xml version="1.0" encoding="UTF-8"?>`+"\n"+
		`<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/" xmlns:moz="http://www.mozilla.org/2006/browser/search/">`+"\n"+
		`  <ShortName>RiftWise</ShortName>`+"\n"+
		`  <Description>Search pro League of Legends teams, players, champions, tournaments and matches since 2011</Description>`+"\n"+
		`  <InputEncoding>UTF-8</InputEncoding>`+"\n"+
		`  <Image width="48" height="48" type="image/png">%sicon-48.png</Image>`+"\n"+
		`  <Url type="text/html" method="get" template="%s?q={searchTerms}" />`+"\n"+
		`  <moz:SearchForm>%s</moz:SearchForm>`+"\n"+
		`</OpenSearchDescription>`+"\n", html.EscapeString(publicURL), html.EscapeString(publicURL), html.EscapeString(publicURL))
}
