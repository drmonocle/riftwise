package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	webpush "github.com/SherClockHolmes/webpush-go"
)

// Sub is one browser that asked for alerts. The endpoint is the browser's push address (it identifies a
// browser, not a person); teams are the team codes it follows.
type Sub struct {
	Endpoint string    `json:"endpoint"`
	P256dh   string    `json:"p256dh"`
	Auth     string    `json:"auth"`
	Teams    []string  `json:"teams"`
	Players  []string  `json:"players,omitempty"`
	Lang     string    `json:"lang"`
	Kickoff  bool      `json:"kickoff"`
	Pregame  bool      `json:"pregame"`
	Banger   bool      `json:"banger"`
	Created  time.Time `json:"created"`
	Updated  time.Time `json:"updated"`
	LastOK   time.Time `json:"lastOk,omitempty"`
	Fails    int       `json:"fails,omitempty"`
}

// followsPlayer: the app sends the names it follows; matched without case or punctuation.
func (s *Sub) followsPlayer(name string) bool {
	n := normName(name)
	for _, p := range s.Players {
		if normName(p) == n {
			return true
		}
	}
	return false
}

func normName(s string) string {
	var b []rune
	for _, r := range strings.ToLower(s) {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r > 127 {
			b = append(b, r)
		}
	}
	return string(b)
}

func (s *Sub) follows(code string) bool {
	for _, t := range s.Teams {
		if t == code {
			return true
		}
	}
	return false
}

// Store keeps subscriptions in subs.json (written whole, through a temp file, on every change).
type Store struct {
	mu   sync.Mutex
	path string
	subs map[string]*Sub
}

func loadStore(path string) (*Store, error) {
	st := &Store{path: path, subs: map[string]*Sub{}}
	b, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return st, nil
	}
	if err != nil {
		return nil, err
	}
	var list []*Sub
	if err := json.Unmarshal(b, &list); err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	for _, s := range list {
		st.subs[s.Endpoint] = s
	}
	return st, nil
}

func (st *Store) saveLocked() error {
	list := make([]*Sub, 0, len(st.subs))
	for _, s := range st.subs {
		list = append(list, s)
	}
	b, err := json.MarshalIndent(list, "", " ")
	if err != nil {
		return err
	}
	return writeFileAtomic(st.path, b)
}

func (st *Store) upsert(s *Sub) error {
	st.mu.Lock()
	defer st.mu.Unlock()
	if old, ok := st.subs[s.Endpoint]; ok {
		s.Created, s.LastOK = old.Created, old.LastOK
	} else {
		s.Created = time.Now().UTC()
	}
	s.Updated = time.Now().UTC()
	st.subs[s.Endpoint] = s
	return st.saveLocked()
}

func (st *Store) remove(endpoint string) bool {
	st.mu.Lock()
	defer st.mu.Unlock()
	if _, ok := st.subs[endpoint]; !ok {
		return false
	}
	delete(st.subs, endpoint)
	_ = st.saveLocked()
	return true
}

func (st *Store) get(endpoint string) *Sub {
	st.mu.Lock()
	defer st.mu.Unlock()
	if s, ok := st.subs[endpoint]; ok {
		c := *s
		return &c
	}
	return nil
}

func (st *Store) count() int {
	st.mu.Lock()
	defer st.mu.Unlock()
	return len(st.subs)
}

// all returns copies, so senders can work without holding the lock.
func (st *Store) all() []Sub {
	st.mu.Lock()
	defer st.mu.Unlock()
	out := make([]Sub, 0, len(st.subs))
	for _, s := range st.subs {
		out = append(out, *s)
	}
	return out
}

// result records how a send went: gone subscriptions are dropped, long-failing ones too.
func (st *Store) result(endpoint string, ok, gone bool) {
	st.mu.Lock()
	defer st.mu.Unlock()
	s, exists := st.subs[endpoint]
	if !exists {
		return
	}
	switch {
	case gone:
		delete(st.subs, endpoint)
	case ok:
		s.LastOK, s.Fails = time.Now().UTC(), 0
	default:
		s.Fails++
		if s.Fails >= 30 {
			delete(st.subs, endpoint)
		}
	}
	_ = st.saveLocked()
}

// Sent remembers which alerts went out ("kick:<match>", "pre:<match>", "banger:<id>"), so restarts
// don't repeat them. Entries older than 3 days are dropped.
type Sent struct {
	mu   sync.Mutex
	path string
	m    map[string]time.Time
}

func loadSent(path string) *Sent {
	s := &Sent{path: path, m: map[string]time.Time{}}
	if b, err := os.ReadFile(path); err == nil {
		_ = json.Unmarshal(b, &s.m)
	}
	return s
}

// claim marks key as sent and reports whether it was new.
func (s *Sent) claim(key string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, done := s.m[key]; done {
		return false
	}
	now := time.Now().UTC()
	s.m[key] = now
	for k, t := range s.m {
		if now.Sub(t) > 72*time.Hour {
			delete(s.m, k)
		}
	}
	if b, err := json.Marshal(s.m); err == nil {
		_ = writeFileAtomic(s.path, b)
	}
	return true
}

func writeFileAtomic(path string, b []byte) error {
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

// VAPID keys identify this server to the browsers' push services. Made once, kept in vapid.json.
type VAPID struct {
	Public  string `json:"public"`
	Private string `json:"private"`
}

func loadOrCreateVAPID(dir string) (VAPID, error) {
	p := filepath.Join(dir, "vapid.json")
	var v VAPID
	if b, err := os.ReadFile(p); err == nil {
		if err := json.Unmarshal(b, &v); err != nil {
			return v, fmt.Errorf("%s: %w", p, err)
		}
		return v, nil
	}
	priv, pub, err := webpush.GenerateVAPIDKeys()
	if err != nil {
		return v, err
	}
	v = VAPID{Public: pub, Private: priv}
	b, _ := json.MarshalIndent(v, "", " ")
	return v, writeFileAtomic(p, b)
}
