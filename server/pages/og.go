// Link previews: a 1200x630 picture for every page (riftwise.gg/og/team/t1.png, /og/stats/records.png...) with the
// page's title and description, so a link posted on X or Discord shows a card instead of the plain icon. Drawn
// here with the Go fonts (no external files), cached in memory per stats build.
package main

import (
	"bytes"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync"

	"golang.org/x/image/font"
	"golang.org/x/image/font/gofont/gobold"
	"golang.org/x/image/font/gofont/goregular"
	"golang.org/x/image/font/opentype"
	"golang.org/x/image/math/fixed"
)

const ogW, ogH = 1200, 630

var (
	ogOnce    sync.Once
	ogBold    *opentype.Font
	ogRegular *opentype.Font
	ogFaces   = map[string]font.Face{}
	ogFaceMu  sync.Mutex

	// ogDrawMu: one card is drawn at a time. A font face keeps its glyph buffer between calls, so two requests
	// drawing with the same cached face at once crashed (crawlers fetch many cards together).
	ogDrawMu sync.Mutex

	ogCacheMu sync.Mutex
	ogCache   = map[string][]byte{}
	ogCacheV  string
)

func ogLoadFonts() {
	var err error
	if ogBold, err = opentype.Parse(gobold.TTF); err != nil {
		log.Printf("og: bold font: %v", err)
	}
	if ogRegular, err = opentype.Parse(goregular.TTF); err != nil {
		log.Printf("og: regular font: %v", err)
	}
}

func ogFace(bold bool, size float64) font.Face {
	ogOnce.Do(ogLoadFonts)
	key := map[bool]string{true: "b", false: "r"}[bold] + ":" + fixed.Int26_6(size*64).String()
	ogFaceMu.Lock()
	defer ogFaceMu.Unlock()
	if f, ok := ogFaces[key]; ok {
		return f
	}
	src := ogRegular
	if bold {
		src = ogBold
	}
	if src == nil {
		return nil
	}
	f, err := opentype.NewFace(src, &opentype.FaceOptions{Size: size, DPI: 72, Hinting: font.HintingFull})
	if err != nil {
		return nil
	}
	ogFaces[key] = f
	return f
}

func ogRGB(h string) color.RGBA {
	var r, g, b uint8
	if len(h) == 7 {
		var v uint32
		for _, c := range h[1:] {
			v <<= 4
			switch {
			case c >= '0' && c <= '9':
				v |= uint32(c - '0')
			case c >= 'a' && c <= 'f':
				v |= uint32(c-'a') + 10
			case c >= 'A' && c <= 'F':
				v |= uint32(c-'A') + 10
			}
		}
		r, g, b = uint8(v>>16), uint8(v>>8), uint8(v)
	}
	return color.RGBA{r, g, b, 255}
}

// wrap breaks text into lines no wider than width (in pixels), at most max lines; the last line gets "…" if cut.
func wrap(face font.Face, text string, width int, max int) []string {
	d := &font.Drawer{Face: face}
	words := strings.Fields(text)
	var lines []string
	cur := ""
	for _, w := range words {
		try := w
		if cur != "" {
			try = cur + " " + w
		}
		if d.MeasureString(try).Ceil() <= width || cur == "" {
			cur = try
			continue
		}
		lines = append(lines, cur)
		cur = w
		if len(lines) == max {
			last := lines[max-1]
			for d.MeasureString(last+" …").Ceil() > width && len(last) > 1 {
				last = strings.TrimRight(last[:len(last)-1], " ")
			}
			lines[max-1] = last + " …"
			return lines
		}
	}
	if cur != "" {
		lines = append(lines, cur)
	}
	if len(lines) > max {
		lines = lines[:max]
	}
	return lines
}

func drawText(img *image.RGBA, face font.Face, x, y int, c color.Color, text string) {
	d := &font.Drawer{Dst: img, Src: image.NewUniform(c), Face: face, Dot: fixed.P(x, y)}
	d.DrawString(text)
}

// ogImage draws the card: brand line, the title big, the description, the address at the bottom.
func ogImage(kind, title, desc string) []byte {
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
	accent, text, sub, muted := ogRGB("#b39dff"), ogRGB("#efeaff"), ogRGB("#b9b0dc"), ogRGB("#8c85b0")
	// accent bar down the left
	draw.Draw(img, image.Rect(0, 0, 14, ogH), image.NewUniform(accent), image.Point{}, draw.Src)
	const left, right = 72, ogW - 72
	brand, label := ogFace(true, 30), ogFace(false, 26)
	if brand == nil || label == nil {
		return nil
	}
	drawText(img, brand, left, 86, accent, "RIFTWISE")
	kindLabel := map[string]string{"team": "TEAM", "player": "PLAYER", "event": "TOURNAMENT", "game": "MATCH", "champ": "CHAMPION",
		"league": "LEAGUE", "stats": "PRO STATS", "home": "PRO STATS"}[kind]
	if kindLabel != "" {
		lw := (&font.Drawer{Face: label}).MeasureString(kindLabel).Ceil()
		drawText(img, label, right-lw, 86, muted, kindLabel)
	}
	// the title: as big as fits in three lines
	size := 64.0
	var lines []string
	var titleFace font.Face
	for ; size >= 36; size -= 4 {
		titleFace = ogFace(true, size)
		lines = wrap(titleFace, title, right-left, 3)
		if len(lines) <= 3 && !(len(lines) == 3 && strings.HasSuffix(lines[2], "…")) {
			break
		}
	}
	y := 190
	for _, l := range lines {
		drawText(img, titleFace, left, y, text, l)
		y += int(size * 1.18)
	}
	descFace := ogFace(false, 30)
	y += 18
	for _, l := range wrap(descFace, desc, right-left, 3) {
		if y > ogH-100 {
			break
		}
		drawText(img, descFace, left, y, sub, l)
		y += 40
	}
	foot := ogFace(false, 26)
	drawText(img, foot, left, ogH-52, muted, "riftwise.gg · live scores, every pro stat since 2011, free")
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		return nil
	}
	return buf.Bytes()
}

// serveOG answers /og/<kind path>/<slug>.png, /og/stats/<section>.png and /og/home.png.
func (s *store) serveOG(w http.ResponseWriter, r *http.Request) {
	s.refresh()
	rest := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, basePath+"og/"), ".png")
	parts := strings.Split(rest, "/")
	kind, title, desc := "", "", ""
	switch {
	case len(parts) == 1 && parts[0] == "home":
		kind, title, desc = "home", "RiftWise: live LoL esports scores, pro stats and power rankings", sections[""][1]
	case len(parts) == 2 && parts[0] == "stats":
		info, ok := sections[parts[1]]
		if !ok {
			http.NotFound(w, r)
			return
		}
		kind, title, desc = "stats", info[0], info[1]
	case len(parts) == 2 && kinds[parts[0]] != "":
		s.mu.RLock()
		e, ok := s.pages[kinds[parts[0]]][strings.ToLower(parts[1])]
		s.mu.RUnlock()
		if !ok {
			http.NotFound(w, r)
			return
		}
		kind, title, desc = kinds[parts[0]], strings.TrimSuffix(e.title, " | RiftWise"), e.desc
	default:
		http.NotFound(w, r)
		return
	}
	s.mu.RLock()
	ver := s.version
	s.mu.RUnlock()
	key := ver + "|" + rest
	ogCacheMu.Lock()
	if ogCacheV != ver || len(ogCache) > 3000 {
		ogCache, ogCacheV = map[string][]byte{}, ver
	}
	b, ok := ogCache[key]
	ogCacheMu.Unlock()
	if !ok {
		b = ogImage(kind, title, desc)
		if b == nil {
			http.Error(w, "no picture", http.StatusInternalServerError)
			return
		}
		ogCacheMu.Lock()
		ogCache[key] = b
		ogCacheMu.Unlock()
	}
	w.Header().Set("Content-Type", "image/png")
	w.Header().Set("Cache-Control", "public, max-age=86400")
	w.Header().Set("Content-Length", strconv.Itoa(len(b)))
	if r.Method != http.MethodHead {
		w.Write(b)
	}
}
