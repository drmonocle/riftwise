package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
)

// Account is one person. Exactly how they sign in decides which fields are set: Username + PassHash (+ Recovery),
// CodeHash (sync code), and/or Discord / Twitch ids. Hashes only; the password, recovery code and sync code are never
// stored.
type Account struct {
	ID          string    `json:"id"`
	Username    string    `json:"username,omitempty"`
	PassHash    string    `json:"passHash,omitempty"`
	Recovery    string    `json:"recovery,omitempty"`
	CodeHash    string    `json:"codeHash,omitempty"`
	Discord     string    `json:"discord,omitempty"`
	DiscordName string    `json:"discordName,omitempty"`
	Twitch      string    `json:"twitch,omitempty"`
	TwitchName  string    `json:"twitchName,omitempty"`
	Created     time.Time `json:"created"`
	Seen        time.Time `json:"seen"`
}

// Field is one synced value and when it last changed (milliseconds, from the device that changed it).
type Field struct {
	V json.RawMessage `json:"v"`
	T int64           `json:"t"`
}

type Session struct {
	Account string    `json:"account"`
	Created time.Time `json:"created"`
	Used    time.Time `json:"used"`
}

const (
	maxFields     = 32
	maxFieldBytes = 48 << 10
	maxDataBytes  = 96 << 10
	sessionIdle   = 180 * 24 * time.Hour
)

// Store keeps each account in accounts\<id>.json, its synced data in data\<id>.json and all sign-ins in
// sessions.json (keyed by the SHA-256 of the token). Everything is also held in memory; files are written through a
// temporary file so a crash never leaves half a file.
type Store struct {
	mu       sync.Mutex
	dir      string
	accounts map[string]*Account
	data     map[string]map[string]Field
	sessions map[string]*Session
	byUser   map[string]string
	byCode   map[string]string
	byOAuth  map[string]string // "discord:<id>" / "twitch:<id>" -> account id
}

func openStore(dir string) (*Store, error) {
	st := &Store{dir: dir, accounts: map[string]*Account{}, data: map[string]map[string]Field{}, sessions: map[string]*Session{},
		byUser: map[string]string{}, byCode: map[string]string{}, byOAuth: map[string]string{}}
	for _, d := range []string{"accounts", "data"} {
		if err := os.MkdirAll(filepath.Join(dir, d), 0o755); err != nil {
			return nil, err
		}
	}
	files, _ := filepath.Glob(filepath.Join(dir, "accounts", "*.json"))
	for _, f := range files {
		var a Account
		if err := readJSON(f, &a); err != nil {
			return nil, err
		}
		st.accounts[a.ID] = &a
		st.index(&a)
		var fields map[string]Field
		if err := readJSON(filepath.Join(dir, "data", a.ID+".json"), &fields); err == nil {
			st.data[a.ID] = fields
		}
	}
	if err := readJSON(filepath.Join(dir, "sessions.json"), &st.sessions); err != nil && !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}
	if st.sessions == nil {
		st.sessions = map[string]*Session{}
	}
	return st, nil
}

func readJSON(path string, v any) error {
	b, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	if err := json.Unmarshal(b, v); err != nil {
		return fmt.Errorf("%s: %w", path, err)
	}
	return nil
}

// writeJSON saves compact JSON (pretty-printing would also reformat the synced values themselves).
func writeJSON(path string, v any) error {
	b, err := json.Marshal(v)
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func (st *Store) index(a *Account) {
	if a.Username != "" {
		st.byUser[strings.ToLower(a.Username)] = a.ID
	}
	if a.CodeHash != "" {
		st.byCode[a.CodeHash] = a.ID
	}
	if a.Discord != "" {
		st.byOAuth["discord:"+a.Discord] = a.ID
	}
	if a.Twitch != "" {
		st.byOAuth["twitch:"+a.Twitch] = a.ID
	}
}

func (st *Store) unindex(a *Account) {
	delete(st.byUser, strings.ToLower(a.Username))
	delete(st.byCode, a.CodeHash)
	delete(st.byOAuth, "discord:"+a.Discord)
	delete(st.byOAuth, "twitch:"+a.Twitch)
}

func (st *Store) saveAccountLocked(a *Account) error {
	return writeJSON(filepath.Join(st.dir, "accounts", a.ID+".json"), a)
}

func (st *Store) saveSessionsLocked() error {
	return writeJSON(filepath.Join(st.dir, "sessions.json"), st.sessions)
}

func (st *Store) count() int {
	st.mu.Lock()
	defer st.mu.Unlock()
	return len(st.accounts)
}

func (st *Store) counts() map[string]int {
	st.mu.Lock()
	defer st.mu.Unlock()
	c := map[string]int{"accounts": len(st.accounts), "sessions": len(st.sessions)}
	for _, a := range st.accounts {
		if a.PassHash != "" {
			c["password"]++
		}
		if a.CodeHash != "" {
			c["code"]++
		}
		if a.Discord != "" {
			c["discord"]++
		}
		if a.Twitch != "" {
			c["twitch"]++
		}
	}
	return c
}

// create adds a new account (its fields already filled in) and saves it; it fails if the username, code or
// Discord/Twitch id is already taken.
func (st *Store) create(a *Account) error {
	st.mu.Lock()
	defer st.mu.Unlock()
	if a.Username != "" && st.byUser[strings.ToLower(a.Username)] != "" {
		return errTaken
	}
	if a.CodeHash != "" && st.byCode[a.CodeHash] != "" {
		return errTaken
	}
	if a.Discord != "" && st.byOAuth["discord:"+a.Discord] != "" {
		return errTaken
	}
	if a.Twitch != "" && st.byOAuth["twitch:"+a.Twitch] != "" {
		return errTaken
	}
	a.Created = time.Now().UTC()
	a.Seen = a.Created
	if err := st.saveAccountLocked(a); err != nil {
		return err
	}
	st.accounts[a.ID] = a
	st.index(a)
	return nil
}

var errTaken = errors.New("taken")

// update changes an account under the lock (fn returns an error to cancel) and saves it.
func (st *Store) update(id string, fn func(a *Account) error) error {
	st.mu.Lock()
	defer st.mu.Unlock()
	a := st.accounts[id]
	if a == nil {
		return os.ErrNotExist
	}
	before := *a
	if err := fn(a); err != nil {
		*a = before
		return err
	}
	// a new username / provider id must still be free
	if a.Username != before.Username && a.Username != "" {
		if other := st.byUser[strings.ToLower(a.Username)]; other != "" && other != id {
			*a = before
			return errTaken
		}
	}
	for _, p := range []struct{ old, now, key string }{{before.Discord, a.Discord, "discord:"}, {before.Twitch, a.Twitch, "twitch:"}} {
		if p.now != p.old && p.now != "" {
			if other := st.byOAuth[p.key+p.now]; other != "" && other != id {
				*a = before
				return errTaken
			}
		}
	}
	if err := st.saveAccountLocked(a); err != nil {
		*a = before
		return err
	}
	st.unindex(&before)
	st.index(a)
	return nil
}

func (st *Store) get(id string) *Account {
	st.mu.Lock()
	defer st.mu.Unlock()
	if a := st.accounts[id]; a != nil {
		c := *a
		return &c
	}
	return nil
}

func (st *Store) byUsername(name string) *Account {
	st.mu.Lock()
	id := st.byUser[strings.ToLower(name)]
	st.mu.Unlock()
	return st.get(id)
}

func (st *Store) bySyncCode(hash string) *Account {
	st.mu.Lock()
	id := st.byCode[hash]
	st.mu.Unlock()
	return st.get(id)
}

func (st *Store) byProvider(provider, pid string) *Account {
	st.mu.Lock()
	id := st.byOAuth[provider+":"+pid]
	st.mu.Unlock()
	return st.get(id)
}

// remove deletes an account, its data and every sign-in.
func (st *Store) remove(id string) error {
	st.mu.Lock()
	defer st.mu.Unlock()
	a := st.accounts[id]
	if a == nil {
		return nil
	}
	st.unindex(a)
	delete(st.accounts, id)
	delete(st.data, id)
	for k, s := range st.sessions {
		if s.Account == id {
			delete(st.sessions, k)
		}
	}
	_ = os.Remove(filepath.Join(st.dir, "accounts", id+".json"))
	_ = os.Remove(filepath.Join(st.dir, "data", id+".json"))
	return st.saveSessionsLocked()
}

func tokenHash(token string) string {
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:])
}

// newSession signs a device in and returns its token (only the hash is kept).
func (st *Store) newSession(accountID string) (string, error) {
	token := randomToken(32)
	st.mu.Lock()
	defer st.mu.Unlock()
	now := time.Now().UTC()
	st.sessions[tokenHash(token)] = &Session{Account: accountID, Created: now, Used: now}
	if a := st.accounts[accountID]; a != nil {
		a.Seen = now
		_ = st.saveAccountLocked(a)
	}
	return token, st.saveSessionsLocked()
}

// session returns the account a token belongs to (nil if unknown or idle too long) and marks it used.
func (st *Store) session(token string) *Account {
	if token == "" {
		return nil
	}
	h := tokenHash(token)
	st.mu.Lock()
	defer st.mu.Unlock()
	s := st.sessions[h]
	if s == nil {
		return nil
	}
	now := time.Now().UTC()
	if now.Sub(s.Used) > sessionIdle || st.accounts[s.Account] == nil {
		delete(st.sessions, h)
		_ = st.saveSessionsLocked()
		return nil
	}
	// saving every request would be wasteful: once an hour is plenty for "last used"
	if now.Sub(s.Used) > time.Hour {
		s.Used = now
		if a := st.accounts[s.Account]; a != nil {
			a.Seen = now
			_ = st.saveAccountLocked(a)
		}
		_ = st.saveSessionsLocked()
	}
	c := *st.accounts[s.Account]
	return &c
}

// endSessions signs out one token, or every device of the account (all=true), optionally keeping one token.
func (st *Store) endSessions(token string, all bool, keep string) {
	st.mu.Lock()
	defer st.mu.Unlock()
	h := tokenHash(token)
	s := st.sessions[h]
	if s == nil {
		return
	}
	if !all {
		delete(st.sessions, h)
	} else {
		k := ""
		if keep != "" {
			k = tokenHash(keep)
		}
		for key, x := range st.sessions {
			if x.Account == s.Account && key != k {
				delete(st.sessions, key)
			}
		}
	}
	_ = st.saveSessionsLocked()
}

// endAll signs every device of an account out.
func (st *Store) endAll(accountID string) {
	st.mu.Lock()
	defer st.mu.Unlock()
	for k, x := range st.sessions {
		if x.Account == accountID {
			delete(st.sessions, k)
		}
	}
	_ = st.saveSessionsLocked()
}

// fields returns the account's synced data.
func (st *Store) fields(id string) map[string]Field {
	st.mu.Lock()
	defer st.mu.Unlock()
	out := map[string]Field{}
	for k, f := range st.data[id] {
		out[k] = f
	}
	return out
}

var errTooBig = errors.New("too big")

// synced field names: short lower-case words ("follows", "settings", "revealed")
var fieldName = regexp.MustCompile(`^[a-z][a-z0-9_]{0,31}$`)

// merge keeps, field by field, whichever value changed last, and returns the result.
func (st *Store) merge(id string, in map[string]Field) (map[string]Field, error) {
	st.mu.Lock()
	defer st.mu.Unlock()
	cur := st.data[id]
	next := map[string]Field{}
	for k, f := range cur {
		next[k] = f
	}
	changed := false
	now := time.Now().UnixMilli()
	for k, f := range in {
		if !fieldName.MatchString(k) || len(f.V) > maxFieldBytes || !json.Valid(f.V) {
			return nil, errTooBig
		}
		if f.T > now+5*60*1000 { // a device clock far in the future can't win forever
			f.T = now
		}
		if old, ok := next[k]; !ok || f.T > old.T {
			next[k] = f
			changed = true
		}
	}
	if len(next) > maxFields {
		return nil, errTooBig
	}
	size := 0
	for _, f := range next {
		size += len(f.V)
	}
	if size > maxDataBytes {
		return nil, errTooBig
	}
	if changed {
		if err := writeJSON(filepath.Join(st.dir, "data", id+".json"), next); err != nil {
			return nil, err
		}
		st.data[id] = next
	}
	out := map[string]Field{}
	for k, f := range next {
		out[k] = f
	}
	return out, nil
}
