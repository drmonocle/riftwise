package main

// riftwise.gg/og/today.png: today's pro matches with the model's chance for each, as one 1600x900 card, drawn fresh
// every ten minutes. A fixed address for the daily post (X, Discord), instead of a screenshot of the Rankings page.
// Chances follow src/hub/winChance.ts: the published power ratings (hub/ratings.json) on the top-league scale, the
// rating difference scaled by the matchup's context (two top-league teams from one league, from two leagues, or
// anything else) and the series length calibrated like past series held up.

import (
	"bytes"
	"encoding/json"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/image/font"
)

type ratingTeam struct {
	slug, name, code, league string
	rating                   float64
	top                      bool
}

type ratingsFile struct {
	teams  []ratingTeam
	adjust struct {
		Intl   float64            `json:"intl"`
		Other  float64            `json:"other"`
		Series map[string]float64 `json:"series"`
	}
	asof string
}

// loadRatings reads hub/ratings.json of one build (nil when it isn't there).
func loadRatings(hub string) *ratingsFile {
	b, err := os.ReadFile(filepath.Join(hub, "ratings.json"))
	if err != nil {
		return nil
	}
	var raw struct {
		Asof   string            `json:"asof"`
		Teams  [][]json.RawMessage `json:"teams"`
		Adjust json.RawMessage   `json:"adjust"`
	}
	if json.Unmarshal(b, &raw) != nil {
		return nil
	}
	rf := &ratingsFile{asof: raw.Asof}
	json.Unmarshal(raw.Adjust, &rf.adjust)
	str := func(m json.RawMessage) string {
		var s string
		json.Unmarshal(m, &s)
		return s
	}
	num := func(m json.RawMessage) float64 {
		var f float64
		json.Unmarshal(m, &f)
		return f
	}
	for _, t := range raw.Teams {
		// [slug, team, code, league, league slug, rating, change, games, last game, tier 1/2, ...]
		if len(t) < 10 {
			continue
		}
		rf.teams = append(rf.teams, ratingTeam{slug: str(t[0]), name: str(t[1]), code: str(t[2]), league: str(t[4]), rating: num(t[5]), top: num(t[9]) == 1})
	}
	return rf
}

func normCode(s string) string {
	s = strings.ToUpper(strings.TrimSpace(s))
	// Riot's sponsor codes (TLAW = Team Liquid Alienware)
	if s == "TLAW" {
		return "TL"
	}
	return s
}

func normName(s string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(s) {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// find: the rated team for Riot's code and name (the code, the name, else the one team whose name starts Riot's).
func (rf *ratingsFile) find(code, name string) *ratingTeam {
	c, n := normCode(code), normName(name)
	var lead []*ratingTeam
	for i := range rf.teams {
		t := &rf.teams[i]
		if normCode(t.code) == c {
			return t
		}
	}
	for i := range rf.teams {
		t := &rf.teams[i]
		if normName(t.name) == n {
			return t
		}
		if tn := normName(t.name); len(tn) >= 3 && strings.HasPrefix(n, tn) {
			lead = append(lead, t)
		}
	}
	if len(lead) == 1 {
		return lead[0]
	}
	return nil
}

func gameChance(ra, rb, scale float64) float64 { return 1 / (1 + math.Pow(10, (rb-ra)*scale/400)) }

func choose(n, k int) float64 {
	r := 1.0
	for i := 1; i <= k; i++ {
		r = r * float64(n-k+i) / float64(i)
	}
	return r
}

// seriesChance: a's chance to win a best-of-`bo` when it wins one game with chance p.
func (rf *ratingsFile) seriesChance(a, b *ratingTeam, bo int) float64 {
	scale := 1.0
	if !a.top || !b.top {
		if rf.adjust.Other > 0 {
			scale = rf.adjust.Other
		}
	} else if a.league != b.league && rf.adjust.Intl > 0 {
		scale = rf.adjust.Intl
	}
	p := gameChance(a.rating, b.rating, scale)
	c := 1.0
	if bo > 1 {
		if v, ok := rf.adjust.Series[strconv.Itoa(bo)]; ok && v > 0 {
			c = v
		}
	}
	q := 0.5 + (p-0.5)*c
	need := bo/2 + 1
	total := 0.0
	for k := 0; k < need; k++ {
		total += choose(need-1+k, k) * math.Pow(q, float64(need)) * math.Pow(1-q, float64(k))
	}
	return total
}

type todayRow struct {
	left, right, mid string
	pa               float64 // a's chance, -1 when unrated
	done             bool
}

var todayCache struct {
	mu  sync.Mutex
	at  time.Time
	key string
	png []byte
}

// todayCard: the card for the next 24 hours' matches (and today's finished ones), or nil without a schedule.
func (s *store) todayCard() []byte {
	s.mu.RLock()
	rf, ver := s.ratings, s.version
	s.mu.RUnlock()
	now := time.Now().UTC()
	key := ver + "|" + now.Format("2006-01-02T15") + "|" + strconv.Itoa(now.Minute()/10)
	todayCache.mu.Lock()
	if todayCache.key == key && todayCache.png != nil {
		b := todayCache.png
		todayCache.mu.Unlock()
		return b
	}
	todayCache.mu.Unlock()

	var rows []todayRow
	from, to := now.Add(-6*time.Hour), now.Add(24*time.Hour)
	evs := loadSchedule()
	sort.SliceStable(evs, func(i, j int) bool { return evs[i].StartTime < evs[j].StartTime })
	for _, e := range evs {
		t, err := time.Parse(time.RFC3339, e.StartTime)
		if err != nil || t.Before(from) || t.After(to) {
			continue
		}
		a, b := e.Match.Teams[0], e.Match.Teams[1]
		if a.Name == "TBD" || b.Name == "TBD" {
			continue
		}
		bo := e.Match.Strategy.Count
		if bo < 1 {
			bo = 1
		}
		row := todayRow{pa: -1}
		if rf != nil {
			ta, tb := rf.find(a.Code, a.Name), rf.find(b.Code, b.Name)
			if ta != nil && tb != nil {
				row.pa = rf.seriesChance(ta, tb, bo)
			}
		}
		row.left, row.right = a.Code, b.Code
		if e.State == "completed" && a.Result != nil && b.Result != nil {
			row.done = true
			row.mid = strconv.Itoa(a.Result.GameWins) + "–" + strconv.Itoa(b.Result.GameWins)
		} else {
			row.mid = t.UTC().Format("15:04") + " UTC"
		}
		row.mid = e.League.Name + " · " + row.mid
		if bo > 1 {
			row.mid += " · Bo" + strconv.Itoa(bo)
		}
		rows = append(rows, row)
		if len(rows) == 12 {
			break
		}
	}
	title := "Today's pro matches: our chances"
	if len(rows) == 0 {
		title = "No pro matches in the next 24 hours"
	}
	asof := ""
	if rf != nil {
		asof = "Power ratings as of " + rf.asof + " · " + now.Format("Jan 2, 15:04") + " UTC"
	}
	b := ogToday(title, asof, rows)
	todayCache.mu.Lock()
	todayCache.key, todayCache.png, todayCache.at = key, b, now
	todayCache.mu.Unlock()
	return b
}

// ogToday draws the list card: brand line, the title, one line per match (A chance% · league · time · chance% B).
func ogToday(title, sub string, rows []todayRow) []byte {
	ogDrawMu.Lock()
	defer ogDrawMu.Unlock()
	img := image.NewRGBA(image.Rect(0, 0, ogW, ogH))
	top, bottom := ogRGB("#151230"), ogRGB("#0c0a1d")
	for y := 0; y < ogH; y++ {
		t := float64(y) / float64(ogH)
		c := color.RGBA{
			uint8(float64(top.R)*(1-t) + float64(bottom.R)*t),
			uint8(float64(top.G)*(1-t) + float64(bottom.G)*t),
			uint8(float64(top.B)*(1-t) + float64(bottom.B)*t), 255}
		draw.Draw(img, image.Rect(0, y, ogW, y+1), image.NewUniform(c), image.Point{}, draw.Src)
	}
	accent, text, subC, muted, teal := ogRGB("#b39dff"), ogRGB("#efeaff"), ogRGB("#b9b0dc"), ogRGB("#8c85b0"), ogRGB("#5ee3c8")
	draw.Draw(img, image.Rect(0, 0, 14, ogH), image.NewUniform(accent), image.Point{}, draw.Src)
	const left, right = 72, ogW - 72
	brand, label := ogFace(true, 30), ogFace(false, 26)
	if brand == nil || label == nil {
		return nil
	}
	drawText(img, brand, left, 86, accent, "RIFTWISE")
	kindLabel := "TODAY"
	lw := (&font.Drawer{Face: label}).MeasureString(kindLabel).Ceil()
	drawText(img, label, right-lw, 86, muted, kindLabel)
	titleFace := ogFace(true, 52)
	drawText(img, titleFace, left, 160, text, title)
	y := 160
	if sub != "" {
		drawText(img, ogFace(false, 24), left, 196, subC, sub)
		y = 196
	}
	// the rows: as many lines as fit, smaller when there are many
	size := 40.0
	if len(rows) > 8 {
		size = 32
	}
	rowFace, midFace := ogFace(true, size), ogFace(false, size*0.65)
	step := int(size * 1.45)
	y += step
	pctW := (&font.Drawer{Face: rowFace}).MeasureString("100%").Ceil()
	for _, r := range rows {
		if y > ogH-80 {
			break
		}
		la, lb := r.left, r.right
		pa, pb := "", ""
		if r.pa >= 0 {
			pa, pb = strconv.Itoa(int(math.Round(r.pa*100)))+"%", strconv.Itoa(int(math.Round((1-r.pa)*100)))+"%"
		}
		ca, cb := text, text
		if r.pa >= 0 {
			if r.pa >= 0.5 {
				ca = teal
			} else {
				cb = teal
			}
		}
		x := left
		drawText(img, rowFace, x, y, ca, la)
		x += (&font.Drawer{Face: rowFace}).MeasureString(la).Ceil() + 18
		if pa != "" {
			drawText(img, rowFace, x, y, muted, pa)
		}
		x += pctW + 30
		// the right side, right-aligned
		xr := right
		wb := (&font.Drawer{Face: rowFace}).MeasureString(lb).Ceil()
		xr -= wb
		drawText(img, rowFace, xr, y, cb, lb)
		if pb != "" {
			xr -= pctW + 18
			drawText(img, rowFace, xr, y, muted, pb)
		}
		xr -= 30
		// the middle: league, time or score
		mid := r.mid
		for (&font.Drawer{Face: midFace}).MeasureString(mid).Ceil() > xr-x && len(mid) > 4 {
			mid = strings.TrimRight(mid[:len(mid)-2], " ·") + "…"
		}
		mw := (&font.Drawer{Face: midFace}).MeasureString(mid).Ceil()
		drawText(img, midFace, x+(xr-x-mw)/2, y, subC, mid)
		y += step
	}
	foot := ogFace(false, 26)
	drawText(img, foot, left, ogH-52, muted, "riftwise.gg/stats/rankings · the model's chances, not advice · free, no ads")
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		return nil
	}
	return buf.Bytes()
}
