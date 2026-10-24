package main

// Pages in the app's other languages: riftwise.gg/<lang>/<page> (riftwise.gg/ko/player/faker) is the same page with
// its title and description in that language, <html lang>, and hreflang links between every language's address of
// it (English is the address without a prefix), so search engines show each reader their own language's page.
// The texts are seo_i18n.json, built by scripts/seo_i18n.mjs from scripts/seo_templates.json and the app's
// translations.

import (
	_ "embed"
	"encoding/json"
	"strings"
)

//go:embed seo_i18n.json
var seoI18nRaw []byte

var seoI18n map[string]map[string]string

func init() {
	if err := json.Unmarshal(seoI18nRaw, &seoI18n); err != nil {
		panic("seo_i18n.json: " + err.Error())
	}
}

// urlLangs: the address prefix (lower case) -> the language's code (hreflang, <html lang>)
var urlLangs = map[string]string{
	"es": "es", "pt-br": "pt-BR", "ko": "ko", "vi": "vi", "zh-cn": "zh-CN", "zh-tw": "zh-TW", "ja": "ja", "fr": "fr", "de": "de", "tr": "tr",
}

// langOrder: the hreflang links in a stable order
var langOrder = []string{"es", "pt-br", "ko", "vi", "zh-cn", "zh-tw", "ja", "fr", "de", "tr"}

// splitLang takes the language prefix off a path ("ko/player/faker" -> "ko", "ko", "player/faker").
func splitLang(rest string) (seg, lang, tail string) {
	first, after, _ := strings.Cut(rest, "/")
	if l, ok := urlLangs[strings.ToLower(first)]; ok {
		return strings.ToLower(first), l, after
	}
	return "", "", rest
}

func tr(lang, key string) string {
	if s := seoI18n[lang][key]; s != "" {
		return s
	}
	return ""
}

func fill(lang, key, name string) string {
	return strings.ReplaceAll(tr(lang, key), "{name}", name)
}

// englishName: the name at the front of an English title ("Faker – pro stats... | RiftWise" -> "Faker").
func englishName(title string) string {
	name := strings.TrimSuffix(title, brand)
	if i := strings.Index(name, " – "); i > 0 {
		name = name[:i]
	}
	return strings.TrimSuffix(name, " in pro play")
}

// localize: the title and description of a page in lang, from the English ones and the address (parts without the
// prefix). What has no translation keeps its English text.
func localize(lang string, parts []string, title, desc string) (string, string) {
	t, d := "", ""
	switch {
	case parts[0] == "":
		t, d = tr(lang, "home.title"), tr(lang, "home.desc")
		if t != "" {
			return t, d
		}
	case parts[0] == "schedule" || parts[0] == "results" || parts[0] == "stream" || parts[0] == "news":
		t, d = tr(lang, parts[0]+".t"), tr(lang, parts[0]+".d")
		if len(parts) == 2 && t != "" {
			// one league's schedule: its name in front
			for _, cut := range []string{" schedule:", " results:"} {
				if i := strings.Index(title, cut); i > 0 {
					t = title[:i] + " – " + t
				}
			}
		}
	case parts[0] == "stats":
		sec := ""
		if len(parts) > 1 {
			sec = parts[1]
		}
		name := tr(lang, "sec."+sec+".name")
		if name == "" {
			return title, desc
		}
		if len(parts) == 3 && parts[2] != "all" {
			name += " " + parts[2]
		}
		t = name + " – " + tr(lang, "sec.suffix")
		if d = tr(lang, "sec."+sec+".desc"); d == "" {
			d = tr(lang, "sec.desc")
		}
	case kinds[parts[0]] != "":
		kind, name := kinds[parts[0]], englishName(title)
		switch kind {
		case "game":
			t, d = strings.TrimSuffix(title, brand), fill(lang, "game.d", strings.TrimSuffix(title, brand))
		case "champ":
			t, d = fill(lang, "champ.t", name), fill(lang, "champ.d", name)
		default:
			if len(parts) == 3 { // a league season: /league/lck/2025
				name += " " + parts[2]
			}
			t, d = name+" – "+tr(lang, kind+".t"), fill(lang, kind+".d", name)
			if tr(lang, kind+".t") == "" {
				t = ""
			}
		}
	}
	if t == "" {
		return title, desc
	}
	if d == "" {
		d = desc
	}
	return t + brand, d
}

// alternates: every language's address of a page (path without prefix, "" for the home page), English first, then
// x-default (English).
func alternates(path string) [][2]string {
	out := [][2]string{{"en", publicURL + path}}
	for _, seg := range langOrder {
		out = append(out, [2]string{urlLangs[seg], publicURL + seg + "/" + path})
	}
	return append(out, [2]string{"x-default", publicURL + path})
}
