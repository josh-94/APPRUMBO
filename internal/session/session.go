package session

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"strconv"
	"strings"
	"time"
)

const cookieName = "hoy_session"

func CookieName() string { return cookieName }

func PasswordOK(given, want string) bool {
	if want == "" {
		return false
	}
	sumGiven := sha256.Sum256([]byte(given))
	sumWant := sha256.Sum256([]byte(want))
	return subtle.ConstantTimeCompare(sumGiven[:], sumWant[:]) == 1
}

func Sign(secret string, exp time.Time) string {
	payload := strconv.FormatInt(exp.Unix(), 10)
	return payload + "." + macHex(secret, payload)
}

func Valid(secret, value string, now time.Time) bool {
	payload, sig, ok := strings.Cut(value, ".")
	if !ok || len(sig) != 64 {
		return false
	}
	expected := macHex(secret, payload)
	if subtle.ConstantTimeCompare([]byte(sig), []byte(expected)) != 1 {
		return false
	}
	expUnix, err := strconv.ParseInt(payload, 10, 64)
	if err != nil {
		return false
	}
	return now.Before(time.Unix(expUnix, 0))
}

func macHex(secret, payload string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(payload))
	return hexEncode(mac.Sum(nil))
}

func hexEncode(b []byte) string {
	const digits = "0123456789abcdef"
	out := make([]byte, len(b)*2)
	for i, v := range b {
		out[i*2] = digits[v>>4]
		out[i*2+1] = digits[v&0x0f]
	}
	return string(out)
}
