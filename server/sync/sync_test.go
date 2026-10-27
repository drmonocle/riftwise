package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestPasswords(t *testing.T) {
	h := hashPassword("correct horse battery")
	if !checkPassword("correct horse battery", h) || checkPassword("correct horse batterY", h) {
		t.Fatal("hash check")
	}
	if !strings.HasPrefix(h, "$argon2id$v=19$m=19456,t=2,p=1$") {
		t.Fatal("hash format", h)
	}
	cases := map[string]error{
		"short":                  errPassShort,
		"1234567890":             errPassCommon,
		"aaaaaaaaaaaa":           errPassCommon,
		"qwertyuiop":             errPassCommon,
		"Password123":            errPassCommon,
		"fakerfan2026!!":         errPassUsername, // contains the username "fakerfan"
		"blue side wins 2026":    nil,
		strings.Repeat("x1", 70): errPassLong,
	}
	for pw, want := range cases {
		if got := checkNewPassword(pw, "fakerfan"); got != want {
			t.Errorf("%q: got %v want %v", pw, got, want)
		}
	}
	for _, u := range []string{"ab", "admin", "has space", "...", strings.Repeat("a", 25)} {
		if checkUsername(u) == nil {
			t.Errorf("username %q should be refused", u)
		}
	}
	if checkUsername("Faker_Fan.26") != nil {
		t.Error("good username refused")
	}
}

func TestCodes(t *testing.T) {
	c := newCode(4, 4)
	if len(c) != 19 || strings.Count(c, "-") != 3 {
		t.Fatal("code shape", c)
	}
	if codeHash(c) != codeHash(strings.ToLower(strings.ReplaceAll(c, "-", " "))) {
		t.Fatal("typed codes should match however they're spaced or cased")
	}
}

func TestMergeKeepsNewest(t *testing.T) {
	st, _ := openStore(t.TempDir())
	a := &Account{ID: "a1", Username: "x1x"}
	if err := st.create(a); err != nil {
		t.Fatal(err)
	}
	raw := func(s string) json.RawMessage { return json.RawMessage(s) }
	_, _ = st.merge("a1", map[string]Field{"settings": {V: raw(`{"theme":"rift"}`), T: 100}})
	out, _ := st.merge("a1", map[string]Field{"settings": {V: raw(`{"theme":"classic"}`), T: 50}, "follows": {V: raw(`["T1"]`), T: 60}})
	if string(out["settings"].V) != `{"theme":"rift"}` || string(out["follows"].V) != `["T1"]` {
		t.Fatalf("merge: %s %s", out["settings"].V, out["follows"].V)
	}
	if _, err := st.merge("a1", map[string]Field{"Bad Name": {V: raw(`1`), T: 1}}); err == nil {
		t.Fatal("bad field name accepted")
	}
	// reopening reads everything back
	st2, _ := openStore(st.dir)
	if st2.byUsername("X1X") == nil || string(st2.fields("a1")["settings"].V) != `{"theme":"rift"}` {
		t.Fatal("not saved")
	}
}

type client struct {
	t     *testing.T
	h     http.Handler
	token string
}

func (c *client) call(method, path string, body any) (int, map[string]any) {
	var buf bytes.Buffer
	if body != nil {
		_ = json.NewEncoder(&buf).Encode(body)
	}
	req := httptest.NewRequest(method, apiPrefix+path, &buf)
	req.Header.Set("Origin", "https://lolworlds.com")
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}
	rec := httptest.NewRecorder()
	c.h.ServeHTTP(rec, req)
	var out map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	if rec.Header().Get("Access-Control-Allow-Origin") != "https://lolworlds.com" {
		c.t.Fatalf("%s: no CORS header", path)
	}
	return rec.Code, out
}

func TestFlows(t *testing.T) {
	st, _ := openStore(t.TempDir())
	h := newServer(st, loadOAuth(st.dir)).routes()
	c := &client{t: t, h: h}

	if code, out := c.call("POST", "register", map[string]string{"username": "FakerFan", "password": "short"}); code != 400 || out["error"] != "password_short" {
		t.Fatal("weak password accepted", code, out)
	}
	code, out := c.call("POST", "register", map[string]string{"username": "FakerFan", "password": "blue side wins 2026"})
	if code != 200 || out["token"] == "" || out["recoveryCode"] == nil {
		t.Fatal("register", code, out)
	}
	recovery := out["recoveryCode"].(string)
	c.token = out["token"].(string)
	if code, _ := c.call("POST", "register", map[string]string{"username": "fakerfan", "password": "another good one 99"}); code != 409 {
		t.Fatal("duplicate username (any case) accepted", code)
	}

	// sync: a newer value wins, an older one doesn't
	now := time.Now().UnixMilli()
	c.call("POST", "data", map[string]any{"fields": map[string]any{"follows": map[string]any{"v": []string{"T1"}, "t": now}}})
	_, out = c.call("POST", "data", map[string]any{"fields": map[string]any{"follows": map[string]any{"v": []string{"GEN"}, "t": now - 1000}}})
	f := out["fields"].(map[string]any)["follows"].(map[string]any)
	if f["v"].([]any)[0] != "T1" {
		t.Fatal("older value won", f)
	}

	// signing in on a second device sees the same data
	d2 := &client{t: t, h: h}
	if code, _ := d2.call("POST", "login", map[string]string{"username": "fakerfan", "password": "wrong password!!"}); code != 401 {
		t.Fatal("wrong password let in", code)
	}
	code, out = d2.call("POST", "login", map[string]string{"username": "fakerfan", "password": "blue side wins 2026"})
	if code != 200 {
		t.Fatal("login", code, out)
	}
	d2.token = out["token"].(string)
	_, out = d2.call("GET", "data", nil)
	if out["fields"].(map[string]any)["follows"] == nil {
		t.Fatal("second device sees no data")
	}

	// forgotten password: the recovery code resets it, signs every device out and gives a new code
	d3 := &client{t: t, h: h}
	code, out = d3.call("POST", "recover", map[string]string{"username": "FakerFan", "recoveryCode": strings.ToLower(recovery), "newPassword": "red side wins 2027"})
	if code != 200 || out["recoveryCode"] == recovery {
		t.Fatal("recover", code, out)
	}
	if code, _ := c.call("GET", "me", nil); code != 401 {
		t.Fatal("old devices still signed in after a reset", code)
	}
	if code, _ := d3.call("POST", "recover", map[string]string{"username": "FakerFan", "recoveryCode": recovery, "newPassword": "red side wins 2028"}); code != 401 {
		t.Fatal("a used recovery code worked twice", code)
	}
	d3.token = out["token"].(string)

	// a sync code for this account signs another device in
	_, out = d3.call("POST", "code/new", nil)
	syncCode := out["code"].(string)
	d4 := &client{t: t, h: h}
	if code, out := d4.call("POST", "code/login", map[string]string{"code": syncCode}); code != 200 || out["account"].(map[string]any)["username"] != "FakerFan" {
		t.Fatal("sync code sign-in", code, out)
	}

	// a QR code link signs a phone in once
	_, out = d3.call("POST", "link/new", nil)
	link := out["token"].(string)
	phone := &client{t: t, h: h}
	if code, out := phone.call("POST", "link/use", map[string]string{"token": link}); code != 200 || out["token"] == nil {
		t.Fatal("link sign-in", code, out)
	}
	if code, _ := phone.call("POST", "link/use", map[string]string{"token": link}); code != 401 {
		t.Fatal("a link worked twice", code)
	}
	if code, _ := (&client{t: t, h: h}).call("POST", "link/new", nil); code != 401 {
		t.Fatal("signed-out device made a link", code)
	}

	// delete needs the password, then everything is gone
	if code, _ := d3.call("POST", "delete", map[string]string{"password": "nope nope nope"}); code != 401 {
		t.Fatal("delete without the password", code)
	}
	if code, _ := d3.call("POST", "delete", map[string]string{"password": "red side wins 2027"}); code != 200 {
		t.Fatal("delete", code)
	}
	if st.count() != 0 || st.byUsername("fakerfan") != nil {
		t.Fatal("account not deleted")
	}

	// a code-only account: made with one click, and its code is the way back in
	anon := &client{t: t, h: h}
	_, out = anon.call("POST", "code/new", nil)
	if out["token"] == nil || out["code"] == nil || out["account"].(map[string]any)["hasCode"] != true {
		t.Fatal("code account", out)
	}
	anon.token = out["token"].(string)
	if code, out := anon.call("POST", "unlink", map[string]string{"method": "code"}); code != 400 || out["error"] != "last_method" {
		t.Fatal("removed the only way in", code, out)
	}
	// Discord / Twitch are off without oauth.json
	_, out = anon.call("GET", "config", nil)
	if out["discord"] != false || out["twitch"] != false {
		t.Fatal("oauth should be off", out)
	}
}

func TestLoginLimit(t *testing.T) {
	st, _ := openStore(t.TempDir())
	c := &client{t: t, h: newServer(st, loadOAuth(st.dir)).routes()}
	last := 0
	for i := 0; i < 12; i++ {
		last, _ = c.call("POST", "login", map[string]string{"username": "someone", "password": "guess number " + string(rune('a'+i))})
	}
	if last != 429 {
		t.Fatal("no limit on password guessing", last)
	}
}

func TestOAuthKeysFile(t *testing.T) {
	dir := t.TempDir()
	o := loadOAuth(dir)
	if o.enabled("discord") || o.enabled("twitch") {
		t.Fatal("on without keys")
	}
	_ = os.WriteFile(filepath.Join(dir, "oauth.json"), []byte(`{"discord":{"clientId":"123","clientSecret":"s"}}`), 0o600)
	o.reload(true) // the server looks again by itself within 20 seconds
	if !o.enabled("discord") || o.enabled("twitch") {
		t.Fatal("keys file not picked up")
	}
	u, poll, err := o.start("discord", "app", "")
	if err != nil || poll == "" || !strings.Contains(u, "client_id=123") ||
		!strings.Contains(u, url.QueryEscape("https://lolworlds.com/riftwise/api/sync/auth/discord/callback")) {
		t.Fatal("start url", u, err)
	}
}

// Pick'Em: a hidden name keeps its row and score but shows as "" to everyone else; its owner still sees it.
func TestPickemHide(t *testing.T) {
	sched := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.Write([]byte(`{"events": []}`)) }))
	defer sched.Close()
	pickemScheduleURL = sched.URL
	st, _ := openStore(t.TempDir())
	h := newServer(st, loadOAuth(st.dir)).routes()
	a, b := &client{t: t, h: h}, &client{t: t, h: h}
	for _, c := range []struct {
		c    *client
		name string
	}{{a, "HiddenFan"}, {b, "OtherFan"}} {
		_, out := c.c.call("POST", "register", map[string]string{"username": c.name, "password": "blue side wins 2026"})
		c.c.token, _ = out["token"].(string)
	}
	picks := []map[string]any{{"s": "ko", "r": 1, "a": "t1", "b": "geng", "w": "t1"}}
	teams := []map[string]string{{"u": "t1", "c": "T1", "n": "T1"}, {"u": "geng", "c": "GEN", "n": "Gen.G"}}
	if code, _ := a.call("POST", "pickem/hide", map[string]any{"event": "worlds-2026", "hide": true}); code != 404 {
		t.Fatal("hide before entering", code)
	}
	for _, c := range []*client{a, b} {
		if code, out := c.call("POST", "pickem/submit", map[string]any{"event": "worlds-2026", "picks": picks, "teams": teams}); code != 200 {
			t.Fatal("submit", code, out)
		}
	}
	if code, _ := a.call("POST", "pickem/hide", map[string]any{"event": "worlds-2026", "hide": true}); code != 200 {
		t.Fatal("hide", code)
	}
	names := func(c *client) (shown []string, me map[string]any) {
		_, out := c.call("GET", "pickem/board?event=worlds-2026", nil)
		for _, r := range out["rows"].([]any) {
			row := r.(map[string]any)
			shown = append(shown, row["name"].(string))
		}
		me, _ = out["me"].(map[string]any)
		return
	}
	if shown, _ := names(b); len(shown) != 2 || strings.Contains(strings.Join(shown, ","), "HiddenFan") {
		t.Fatalf("others see %v", shown)
	}
	if _, me := names(a); me == nil || me["name"] != "HiddenFan" || me["hidden"] != true {
		t.Fatalf("own row %v", me)
	}
	// entering again keeps it hidden; showing it again works
	a.call("POST", "pickem/submit", map[string]any{"event": "worlds-2026", "picks": picks, "teams": teams})
	if shown, _ := names(b); strings.Contains(strings.Join(shown, ","), "HiddenFan") {
		t.Fatal("name back after updating picks")
	}
	a.call("POST", "pickem/hide", map[string]any{"event": "worlds-2026", "hide": false})
	if shown, _ := names(b); !strings.Contains(strings.Join(shown, ","), "HiddenFan") {
		t.Fatalf("not shown again: %v", shown)
	}
}
