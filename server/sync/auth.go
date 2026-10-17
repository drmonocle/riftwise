package main

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"unicode/utf8"

	"golang.org/x/crypto/argon2"
)

// Argon2id settings (OWASP's minimum: 19 MiB, 2 passes, 1 thread): about 30 ms per check on HomeServer.
const (
	argonTime    = 2
	argonMemory  = 19 * 1024
	argonThreads = 1
	argonKeyLen  = 32
)

func randomBytes(n int) []byte {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		panic(err) // the system's random source failing is not something to carry on from
	}
	return b
}

func randomToken(n int) string { return base64.RawURLEncoding.EncodeToString(randomBytes(n)) }

func randomID() string { return hex.EncodeToString(randomBytes(12)) }

// hashPassword returns a self-describing Argon2id hash ($argon2id$v=19$m=..,t=..,p=..$salt$hash).
func hashPassword(pw string) string {
	salt := randomBytes(16)
	key := argon2.IDKey([]byte(pw), salt, argonTime, argonMemory, argonThreads, argonKeyLen)
	return fmt.Sprintf("$argon2id$v=19$m=%d,t=%d,p=%d$%s$%s", argonMemory, argonTime, argonThreads,
		base64.RawStdEncoding.EncodeToString(salt), base64.RawStdEncoding.EncodeToString(key))
}

func checkPassword(pw, encoded string) bool {
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 || parts[1] != "argon2id" {
		return false
	}
	var m, t uint32
	var p uint8
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &m, &t, &p); err != nil {
		return false
	}
	salt, err1 := base64.RawStdEncoding.DecodeString(parts[4])
	want, err2 := base64.RawStdEncoding.DecodeString(parts[5])
	if err1 != nil || err2 != nil {
		return false
	}
	got := argon2.IDKey([]byte(pw), salt, t, m, p, uint32(len(want)))
	return subtle.ConstantTimeCompare(got, want) == 1
}

// A dummy hash to check against when the username doesn't exist, so a wrong username takes as long as a wrong
// password (nobody can find out which usernames exist by timing).
var dummyHash = hashPassword("riftwise-dummy-password")

// ---- usernames and passwords --------------------------------------------------------------------------------

var usernameRE = regexp.MustCompile(`^[A-Za-z0-9_.-]{3,24}$`)

var reserved = map[string]bool{"admin": true, "administrator": true, "riftwise": true, "riftwatch": true, "monocle": true,
	"support": true, "moderator": true, "mod": true, "system": true, "root": true, "lolworlds": true, "official": true}

var (
	errUsername     = errors.New("username")
	errPassShort    = errors.New("password_short")
	errPassLong     = errors.New("password_long")
	errPassCommon   = errors.New("password_common")
	errPassUsername = errors.New("password_username")
)

func checkUsername(u string) error {
	if !usernameRE.MatchString(u) || reserved[strings.ToLower(u)] || strings.Trim(u, "._-") == "" {
		return errUsername
	}
	return nil
}

// Passwords: 10 to 128 characters (any characters, spaces welcome), not the username, not one of the most common
// passwords, and not just one character repeated or a run like 1234567890.
func checkNewPassword(pw, username string) error {
	n := utf8.RuneCountInString(pw)
	if n < 10 {
		return errPassShort
	}
	if n > 128 {
		return errPassLong
	}
	low := strings.ToLower(pw)
	if username != "" && strings.Contains(low, strings.ToLower(username)) {
		return errPassUsername
	}
	if commonPasswords[low] || allSame(low) || isRun(low) {
		return errPassCommon
	}
	return nil
}

func allSame(s string) bool {
	r, _ := utf8.DecodeRuneInString(s)
	return strings.Trim(s, string(r)) == ""
}

// isRun: 1234567890, 0987654321, abcdefghij, qwertyuiop ... (any stretch of them)
func isRun(s string) bool {
	for _, seq := range []string{"01234567890123", "98765432109876", "abcdefghijklmnopqrstuvwxyz", "zyxwvutsrqponmlkjihgfedcba",
		"qwertyuiopasdfghjklzxcvbnm", "1qaz2wsx3edc4rfv", "qazwsxedcrfvtgbyhn"} {
		if strings.Contains(seq, s) {
			return true
		}
	}
	return false
}

// The most common passwords of 10+ characters (from public breach lists), lower case.
var commonPasswords = map[string]bool{}

func init() {
	for _, p := range strings.Fields(`1234567890 0123456789 1234567891 12345678910 123456789a 123456789q a123456789
		qwertyuiop password123 password12 password1! passw0rd123 iloveyou12 iloveyou123 qwerty1234 qwerty123456
		1q2w3e4r5t 1q2w3e4r5t6y 1qaz2wsx3edc zaq12wsxcde 123qweasdzxc qwe123qwe123 abc1234567 abcd123456 abcdef1234
		football123 baseball123 basketball soccer1234 princess12 sunshine12 superman12 batman1234 starwars12
		dragon1234 monkey1234 michael123 jennifer12 jordan2323 letmein123 welcome123 welcome1234 trustno1234
		master1234 shadow1234 freedom123 whatever12 computer12 internet12 samsung123 liverpool1 chelsea123
		arsenal123 manchester mercedes12 1111111111 0000000000 1212121212 1122334455 1234512345 1234554321
		9876543210 0987654321 147258369 1472583690 asdfghjkl1 asdfghjkl; zxcvbnm123 qwertyuiop1 password1234
		passwordpassword leagueoflegends league1234 leagueoflegends1 riotgames1 riotgames123 faker12345 teemo12345
		yasuo12345 iloveleague summoner123 lolesports esports1234 gamer12345 minecraft1 minecraft12 fortnite12
		pokemon123 naruto1234 changeme123 administrator admin12345 admin123456 secret1234 test123456 testtest12`) {
		commonPasswords[p] = true
	}
}

// ---- codes ----------------------------------------------------------------------------------------------------

// Crockford base32 without 0/O, 1/I/L, U: easy to read out and type.
const codeAlphabet = "23456789ABCDEFGHJKMNPQRSTVWXYZ"

// newCode makes groups of 4 or 5 random characters ("K7QF-2XHM-..."); 4 groups of 4 is ~78 bits.
func newCode(groups, size int) string {
	var b strings.Builder
	for g := 0; g < groups; g++ {
		if g > 0 {
			b.WriteByte('-')
		}
		for _, x := range randomBytes(size) {
			// rejection-free is fine here: 256 % 30 bias is tiny for codes this long
			b.WriteByte(codeAlphabet[int(x)%len(codeAlphabet)])
		}
	}
	return b.String()
}

// normCode upper-cases a typed code and drops spaces and dashes (the alphabet has no look-alike letters to fix).
func normCode(s string) string {
	return strings.NewReplacer(" ", "", "-", "").Replace(strings.ToUpper(strings.TrimSpace(s)))
}

func codeHash(code string) string {
	h := sha256.Sum256([]byte("riftwise-code:" + normCode(code)))
	return hex.EncodeToString(h[:])
}
