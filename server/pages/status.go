package main

// riftwise.gg/status (and /status.json): is everything running? When the stats were last built and how long builds
// take, whether each service answers, when the last alert went out, how fresh the head-to-head data is, what the data
// check found, and the last release. `problems` lists what needs a look; scripts/server/status_watch.ps1 reads it
// every 5 minutes and sends a phone notification (ntfy) for each new one, so the rules live here, with tests.

import (
	"bufio"
	"encoding/json"
	"fmt"
	"html"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

var (
	statusScripts = `C:\Scripts\riftwise`       // build_stats.log, audit_latest.json
	statusRelease = `C:\Sites\riftwise-release` // the release watcher's status.json
	statusPush    = "http://127.0.0.1:8092/riftwise/api/push/health"
	statusSync    = "http://127.0.0.1:8094/riftwise/api/sync/health"
	statusH2H     = "https://api.github.com/repos/drmonocle/riftwise/commits/h2h-data"
)

type buildRun struct {
	Start string  `json:"start"`
	Secs  int     `json:"secs,omitempty"` // 0 while running or when it failed before the end
	Exit  *int    `json:"exit,omitempty"` // nil while running
	Min   float64 `json:"minutes,omitempty"`
}

type svcStatus struct {
	Name    string `json:"name"`
	OK      bool   `json:"ok"`
	Version string `json:"version,omitempty"`
	Started string `json:"started,omitempty"`
	Detail  string `json:"detail,omitempty"`
}

type problem struct {
	Key  string `json:"key"`
	Text string `json:"text"`
}

type statusDoc struct {
	Checked string `json:"checked"`
	Version string `json:"version"` // the app version this page service is
	Stats   struct {
		Version  string  `json:"version"`
		Built    string  `json:"built"`
		AgeHours float64 `json:"ageHours"`
	} `json:"stats"`
	Builds struct {
		Recent     []buildRun `json:"recent"` // newest first
		MedianSecs int        `json:"medianSecs"`
	} `json:"builds"`
	Services []svcStatus `json:"services"`
	Alerts   struct {
		LastSent string `json:"lastSent"`
		Tag      string `json:"tag"`
	} `json:"alerts"`
	H2H struct {
		Updated  string  `json:"updated"`
		AgeHours float64 `json:"ageHours"`
	} `json:"h2h"`
	Audit struct {
		Version string         `json:"version"`
		Counts  map[string]int `json:"counts"`
		Hard    []string       `json:"hard"`
	} `json:"audit"`
	Release  json.RawMessage `json:"release,omitempty"`
	Problems []problem       `json:"problems"`
}

var reBuildStart = regexp.MustCompile(`^==== \S+ (\d{1,2})/(\d{1,2})/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})`)
var reBuildDone = regexp.MustCompile(`^done: \S+ in (\d+)s`)
var reBuildExit = regexp.MustCompile(`^exit (-?\d+)`)

// parseBuildLog: the runs in the stats build's log (run_build_stats.cmd: "==== <date> <time>", the build's own lines
// ending "done: <version> in <n>s", then "exit <code>"), newest first; the times are the server's local time.
func parseBuildLog(r io.Reader, now time.Time) []buildRun {
	var runs []buildRun
	sc := bufio.NewScanner(r)
	sc.Buffer(make([]byte, 1<<20), 1<<20)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if m := reBuildStart.FindStringSubmatch(line); m != nil {
			n := func(i int) int { v, _ := strconv.Atoi(m[i]); return v }
			t := time.Date(n(3), time.Month(n(1)), n(2), n(4), n(5), n(6), 0, time.Local)
			runs = append(runs, buildRun{Start: t.Format(time.RFC3339)})
			continue
		}
		if len(runs) == 0 {
			continue
		}
		cur := &runs[len(runs)-1]
		if m := reBuildDone.FindStringSubmatch(line); m != nil {
			cur.Secs, _ = strconv.Atoi(m[1])
		} else if m := reBuildExit.FindStringSubmatch(line); m != nil && cur.Exit == nil {
			code, _ := strconv.Atoi(m[1])
			cur.Exit = &code
		}
	}
	for i := range runs {
		if runs[i].Exit == nil {
			if t, err := time.Parse(time.RFC3339, runs[i].Start); err == nil {
				runs[i].Min = float64(int(now.Sub(t).Minutes()*10)) / 10
			}
		}
	}
	// a run that never wrote its exit line and isn't the newest was cut short (server restart): not running
	for i := 0; i < len(runs)-1; i++ {
		if runs[i].Exit == nil {
			code := -1
			runs[i].Exit, runs[i].Min = &code, 0
		}
	}
	for i, j := 0, len(runs)-1; i < j; i, j = i+1, j-1 {
		runs[i], runs[j] = runs[j], runs[i]
	}
	return runs
}

// medianSecs: the typical length of a good build (the last 15 that finished; 0 with fewer than 5).
func medianSecs(runs []buildRun) int {
	var secs []int
	for _, r := range runs {
		if r.Exit != nil && *r.Exit == 0 && r.Secs > 0 {
			secs = append(secs, r.Secs)
			if len(secs) == 15 {
				break
			}
		}
	}
	if len(secs) < 5 {
		return 0
	}
	sort.Ints(secs)
	return secs[len(secs)/2]
}

// tailFile: the last n bytes of a file (the build log grows by every build's ~100 lines).
func tailFile(path string, n int64) (io.Reader, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil {
		return nil, err
	}
	if st.Size() > n {
		f.Seek(st.Size()-n, io.SeekStart)
	}
	b, err := io.ReadAll(f)
	if err != nil {
		return nil, err
	}
	if st.Size() > n {
		if i := strings.IndexByte(string(b), '\n'); i >= 0 {
			b = b[i+1:] // start at a whole line
		}
	}
	return strings.NewReader(string(b)), nil
}

var statusHTTP = &http.Client{Timeout: 4 * time.Second}

func getJSON(url string, v any, header map[string]string) error {
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	for k, val := range header {
		req.Header.Set(k, val)
	}
	resp, err := statusHTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	return json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(v)
}

// the head-to-head data's last update (GitHub, unauthenticated: asked at most every 30 minutes)
var h2hCache struct {
	mu      sync.Mutex
	at      time.Time
	updated string
}

func h2hUpdated() string {
	h2hCache.mu.Lock()
	defer h2hCache.mu.Unlock()
	if time.Since(h2hCache.at) < 30*time.Minute {
		return h2hCache.updated
	}
	h2hCache.at = time.Now()
	var c struct {
		Commit struct {
			Committer struct {
				Date string `json:"date"`
			} `json:"committer"`
		} `json:"commit"`
	}
	if getJSON(statusH2H, &c, map[string]string{"User-Agent": "riftwise-status", "Accept": "application/vnd.github+json"}) == nil && c.Commit.Committer.Date != "" {
		h2hCache.updated = c.Commit.Committer.Date
	}
	return h2hCache.updated
}

var statusCache struct {
	mu  sync.Mutex
	at  time.Time
	doc statusDoc
}

// status: what the page shows, at most 30 seconds old.
func (s *store) status() statusDoc {
	statusCache.mu.Lock()
	defer statusCache.mu.Unlock()
	if time.Since(statusCache.at) < 30*time.Second {
		return statusCache.doc
	}
	now := time.Now()
	var d statusDoc
	d.Checked, d.Version = now.UTC().Format(time.RFC3339), version

	var latest struct {
		Version string `json:"version"`
		Built   string `json:"built"`
	}
	if b, err := os.ReadFile(filepath.Join(s.stats, "latest.json")); err == nil {
		json.Unmarshal(b, &latest)
	}
	d.Stats.Version, d.Stats.Built = latest.Version, latest.Built
	if t, err := time.Parse(time.RFC3339Nano, latest.Built); err == nil {
		d.Stats.AgeHours = hours(now.Sub(t))
	}

	if r, err := tailFile(filepath.Join(statusScripts, "build_stats.log"), 600<<10); err == nil {
		runs := parseBuildLog(r, now)
		d.Builds.MedianSecs = medianSecs(runs)
		if len(runs) > 15 {
			runs = runs[:15]
		}
		d.Builds.Recent = runs
	}

	s.mu.RLock()
	pagesOK := s.indexHTML != "" && s.version != ""
	s.mu.RUnlock()
	d.Services = append(d.Services, svcStatus{Name: "pages", OK: pagesOK, Version: version, Started: started.UTC().Format(time.RFC3339)})
	var push struct {
		OK          bool   `json:"ok"`
		Version     string `json:"version"`
		Started     string `json:"started"`
		LastError   string `json:"lastError"`
		LastSent    string `json:"lastSent"`
		LastSentTag string `json:"lastSentTag"`
		Subs        int    `json:"subscriptions"`
	}
	if err := getJSON(statusPush, &push, nil); err != nil {
		d.Services = append(d.Services, svcStatus{Name: "push", Detail: err.Error()})
	} else {
		d.Services = append(d.Services, svcStatus{Name: "push", OK: push.OK, Version: push.Version, Started: push.Started,
			Detail: strings.TrimSpace(fmt.Sprintf("%d subscribers %s", push.Subs, push.LastError))})
		d.Alerts.LastSent, d.Alerts.Tag = push.LastSent, push.LastSentTag
	}
	var sy struct {
		OK       bool   `json:"ok"`
		Version  string `json:"version"`
		Started  string `json:"started"`
		Accounts int    `json:"accounts"`
	}
	if err := getJSON(statusSync, &sy, nil); err != nil {
		d.Services = append(d.Services, svcStatus{Name: "sync", Detail: err.Error()})
	} else {
		d.Services = append(d.Services, svcStatus{Name: "sync", OK: sy.OK, Version: sy.Version, Started: sy.Started, Detail: fmt.Sprintf("%d accounts", sy.Accounts)})
	}

	d.H2H.Updated = h2hUpdated()
	if t, err := time.Parse(time.RFC3339, d.H2H.Updated); err == nil {
		d.H2H.AgeHours = hours(now.Sub(t))
	}

	var audit struct {
		Version string         `json:"version"`
		Counts  map[string]int `json:"counts"`
	}
	if b, err := os.ReadFile(filepath.Join(statusScripts, "audit_latest.json")); err == nil {
		json.Unmarshal(b, &audit)
	}
	d.Audit.Version, d.Audit.Counts = audit.Version, audit.Counts
	d.Audit.Hard = hardAuditKinds(audit.Counts)

	// written by Windows PowerShell, which may start the file with a byte-order mark JSON doesn't allow
	if b, err := os.ReadFile(filepath.Join(statusRelease, "status.json")); err == nil {
		if b = []byte(strings.TrimPrefix(string(b), string(rune(0xFEFF)))); json.Valid(b) {
			d.Release = b
		}
	}
	d.Problems = problems(d)
	statusCache.at, statusCache.doc = now, d
	return d
}

func hours(dur time.Duration) float64 { return float64(int(dur.Hours()*10)) / 10 }

// hardAuditKinds: the data check's findings that make it fail (audit_data.py: broken links and wrong series or
// champion facts), as opposed to the source data's known slips it only counts.
func hardAuditKinds(counts map[string]int) []string {
	hard := []string{} // [] in status.json, not null
	for k, n := range counts {
		for _, p := range []string{"broken link", "series score above", "series winner", "wrong champion"} {
			if n > 0 && strings.HasPrefix(k, p) {
				hard = append(hard, k)
			}
		}
	}
	sort.Strings(hard)
	return hard
}

// problems: what needs a look now. The keys stay the same while a problem lasts, so the watcher alerts once.
func problems(d statusDoc) []problem {
	out := []problem{}
	add := func(key, text string) { out = append(out, problem{key, text}) }
	for _, s := range d.Services {
		if !s.OK {
			add("service-"+s.Name, fmt.Sprintf("The %s service isn't healthy: %s", s.Name, firstNonEmpty(s.Detail, "not answering")))
		}
	}
	if d.Stats.Built == "" {
		add("stats-missing", "No stats build found (latest.json)")
	} else if d.Stats.AgeHours > 30 {
		add("stats-old", fmt.Sprintf("The stats haven't been rebuilt for %.0f hours", d.Stats.AgeHours))
	}
	med := d.Builds.MedianSecs
	if len(d.Builds.Recent) > 0 {
		last := d.Builds.Recent[0]
		switch {
		case last.Exit == nil && med > 0 && last.Min*60 > float64(2*med):
			add("build-running-long", fmt.Sprintf("The stats build started %s has run %.0f minutes (usually %d)", last.Start, last.Min, (med+30)/60))
		case last.Exit != nil && *last.Exit != 0:
			add("build-failed", fmt.Sprintf("The stats build started %s failed (exit %d); the previous data stays live", last.Start, *last.Exit))
		case last.Exit != nil && med > 0 && last.Secs > 2*med:
			add("build-slow", fmt.Sprintf("The stats build started %s took %d minutes, twice the usual %d", last.Start, (last.Secs+30)/60, (med+30)/60))
		}
	}
	if len(d.Audit.Hard) > 0 {
		add("audit-hard", "The data check found: "+strings.Join(d.Audit.Hard, "; "))
	}
	if d.Audit.Version != "" && d.Stats.Version != "" && d.Audit.Version != d.Stats.Version && d.Stats.AgeHours > 1 {
		add("audit-missing", "The data check didn't run on the current stats build "+d.Stats.Version)
	}
	if d.H2H.Updated != "" && d.H2H.AgeHours > 13 {
		add("h2h-old", fmt.Sprintf("The head-to-head data hasn't updated for %.0f hours (every 6 hours normally)", d.H2H.AgeHours))
	}
	var rel struct {
		Result  string `json:"result"`
		Version string `json:"version"`
		Error   string `json:"error"`
	}
	if len(d.Release) > 0 && json.Unmarshal(d.Release, &rel) == nil && rel.Result == "failed" {
		add("release-failed-"+rel.Version, fmt.Sprintf("Release %s failed and was rolled back: %s", rel.Version, rel.Error))
	}
	return out
}

func firstNonEmpty(a, b string) string {
	if a != "" {
		return a
	}
	return b
}

func (s *store) serveStatusJSON(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Robots-Tag", "noindex")
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	enc.Encode(s.status())
}

// serveStatus: the same as a page to read, no script (it reloads itself every minute).
func (s *store) serveStatus(w http.ResponseWriter, r *http.Request) {
	d := s.status()
	var b strings.Builder
	row := func(ok bool, what, detail string) {
		mark, cls := "✓", "ok"
		if !ok {
			mark, cls = "✗", "bad"
		}
		b.WriteString(`<tr><td class="` + cls + `">` + mark + `</td><th>` + html.EscapeString(what) + `</th><td>` + html.EscapeString(detail) + "</td></tr>\n")
	}
	bad := map[string]bool{}
	for _, p := range d.Problems {
		bad[strings.SplitN(p.Key, "-", 2)[0]] = true
		bad[p.Key] = true
	}
	when := func(iso string) string {
		t, err := time.Parse(time.RFC3339Nano, iso)
		if err != nil {
			return iso
		}
		return ago(time.Since(t)) + " (" + t.UTC().Format("Jan 2 15:04") + " UTC)"
	}
	row(!bad["stats"], "Stats build", fmt.Sprintf("%s, built %s", d.Stats.Version, when(d.Stats.Built)))
	if len(d.Builds.Recent) > 0 {
		last := d.Builds.Recent[0]
		text := fmt.Sprintf("usually %d min", (d.Builds.MedianSecs+30)/60)
		switch {
		case last.Exit == nil:
			text = fmt.Sprintf("running for %.0f min, %s", last.Min, text)
		case *last.Exit != 0:
			text = fmt.Sprintf("last one failed (exit %d), %s", *last.Exit, text)
		default:
			text = fmt.Sprintf("last one took %d min, %s", (last.Secs+30)/60, text)
		}
		row(!bad["build"], "Build length", text)
	}
	for _, sv := range d.Services {
		row(sv.OK, "Service: "+sv.Name, strings.TrimSpace(fmt.Sprintf("%s %s %s", sv.Version, firstNonEmpty(sv.Detail, ""), func() string {
			if sv.Started == "" {
				return ""
			}
			return "· up since " + when(sv.Started)
		}())))
	}
	sent := "none since the push service started"
	if d.Alerts.LastSent != "" {
		sent = when(d.Alerts.LastSent) + " · " + d.Alerts.Tag
	}
	row(true, "Last alert sent", sent)
	row(!bad["h2h"], "Head-to-head data", firstNonEmpty(when(d.H2H.Updated), "unknown"))
	auditText := "nothing broken"
	if len(d.Audit.Hard) > 0 {
		auditText = strings.Join(d.Audit.Hard, "; ")
	}
	n := 0
	for _, c := range d.Audit.Counts {
		n += c
	}
	row(!bad["audit"], "Data check", fmt.Sprintf("%s · %d source-data slips counted (build %s)", auditText, n, d.Audit.Version))
	if len(d.Release) > 0 {
		var rel struct{ Version, Result, At, Error string }
		json.Unmarshal(d.Release, &rel)
		row(rel.Result != "failed", "Last release", strings.TrimSpace(fmt.Sprintf("%s %s %s %s", rel.Version, rel.Result, when(rel.At), rel.Error)))
	}

	title := "All good"
	if len(d.Problems) > 0 {
		title = fmt.Sprintf("%d to look at", len(d.Problems))
	}
	var probs strings.Builder
	for _, p := range d.Problems {
		probs.WriteString("<li>" + html.EscapeString(p.Text) + "</li>")
	}
	page := `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><meta http-equiv="refresh" content="60"><title>Status | RiftWise</title>
<style>:root{color-scheme:dark}body{margin:0;background:#0c0a1d;color:#efeaff;font:14px/1.5 system-ui,"Segoe UI",sans-serif}
main{max-width:860px;margin:0 auto;padding:24px 16px}h1{font-size:22px;margin:0 0 4px}p{color:#b9b0dc;margin:0 0 16px}
table{width:100%;border-collapse:collapse;background:#151230;border:1px solid #2a2452}td,th{padding:8px 10px;border-top:1px solid #2a2452;text-align:left;vertical-align:top}
th{white-space:nowrap;font-weight:600}td.ok{color:#5ee3c8;width:1em}td.bad{color:#ff6b81;width:1em}ul{color:#ff6b81;padding-left:20px}a{color:#5ee3c8}</style></head>
<body><main><h1>RiftWise status: ` + html.EscapeString(title) + `</h1><p>Checked ` + html.EscapeString(d.Checked) + ` · app ` + html.EscapeString(d.Version) +
		` · <a href="/status.json">status.json</a> · reloads every minute</p>`
	if probs.Len() > 0 {
		page += "<ul>" + probs.String() + "</ul>"
	}
	page += "<table>" + b.String() + "</table></main></body></html>"
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	w.Write([]byte(page))
}

// ago: "5 minutes ago", "3 hours ago", "2 days ago".
func ago(d time.Duration) string {
	switch {
	case d < 2*time.Minute:
		return "just now"
	case d < 2*time.Hour:
		return fmt.Sprintf("%d minutes ago", int(d.Minutes()))
	case d < 48*time.Hour:
		return fmt.Sprintf("%d hours ago", int(d.Hours()))
	}
	return fmt.Sprintf("%d days ago", int(d.Hours()/24))
}
