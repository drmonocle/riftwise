package main

import "testing"

func TestAllowedEndpoint(t *testing.T) {
	good := []string{
		"https://fcm.googleapis.com/fcm/send/abc",
		"https://updates.push.services.mozilla.com/wpush/v2/abc",
		"https://wns2-par02p.notify.windows.com/w/?token=abc",
		"https://web.push.apple.com/QAbc",
	}
	bad := []string{
		"http://fcm.googleapis.com/fcm/send/abc",
		"https://evil.example.com/fcm.googleapis.com",
		"https://fcm.googleapis.com.evil.com/x",
		"https://notify.windows.com.evil.com/x",
		"https://127.0.0.1/x",
		"https://user@fcm.googleapis.com/x",
		"https://fcm.googleapis.com:8443/x",
	}
	for _, u := range good {
		if !allowedEndpoint(u) {
			t.Errorf("should allow %s", u)
		}
	}
	for _, u := range bad {
		if allowedEndpoint(u) {
			t.Errorf("should refuse %s", u)
		}
	}
}

func TestTranslate(t *testing.T) {
	a := &App{locales: map[string]map[string]string{
		"ko": {"MATCH LIVE: {a} vs {b}": "경기 시작: {a} vs {b}", "event::Worlds": "롤드컵"},
	}}
	if got := a.tr("ko", "MATCH LIVE: {a} vs {b}", map[string]string{"a": "T1", "b": "GEN"}); got != "경기 시작: T1 vs GEN" {
		t.Errorf("ko: %q", got)
	}
	if got := a.tr("en", "MATCH LIVE: {a} vs {b}", map[string]string{"a": "T1", "b": "GEN"}); got != "MATCH LIVE: T1 vs GEN" {
		t.Errorf("en: %q", got)
	}
	if got := a.leagueName("ko", "worlds", "Worlds"); got != "롤드컵" {
		t.Errorf("ko worlds: %q", got)
	}
	if got := a.leagueName("en", "worlds", "Worlds"); got != "Worlds" {
		t.Errorf("en worlds falls back to the English after ::, got %q", got)
	}
	if got := a.leagueName("en", "lck", "LCK"); got != "LCK" {
		t.Errorf("lck: %q", got)
	}
}

func TestKeyLengths(t *testing.T) {
	// a real-looking p256dh (65 bytes) and auth (16 bytes), base64url without padding
	p := "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM"
	if n := b64len(p); n != 65 {
		t.Errorf("p256dh decoded to %d bytes", n)
	}
	if n := b64len("tBHItJI5svbpez7KI4CCXg"); n != 16 {
		t.Errorf("auth decoded to %d bytes", n)
	}
}
