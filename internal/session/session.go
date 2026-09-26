package session

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"strconv"
	"strings"
	"time"
)

const (
	cookieName = "hoy_session"
	oauthName  = "hoy_oauth"
)

func CookieName() string { return cookieName }

func OAuthCookieName() string { return oauthName }

func Sign(secret string, userID int64, exp time.Time) string {
	payload := strconv.FormatInt(userID, 10) + ":" + strconv.FormatInt(exp.Unix(), 10)
	return payload + "." + macHex(secret, payload)
}

func UserID(secret, value string, now time.Time) (int64, bool) {
	payload, ok := verifiedPayload(secret, value)
	if !ok {
		return 0, false
	}
	userPart, expPart, ok := strings.Cut(payload, ":")
	if !ok {
		return 0, false
	}
	userID, err := strconv.ParseInt(userPart, 10, 64)
	if err != nil || userID <= 0 {
		return 0, false
	}
	expUnix, err := strconv.ParseInt(expPart, 10, 64)
	if err != nil || !now.Before(time.Unix(expUnix, 0)) {
		return 0, false
	}
	return userID, true
}

func SignOAuth(secret, state, verifier string, exp time.Time) string {
	payload := state + "\n" + verifier + "\n" + strconv.FormatInt(exp.Unix(), 10)
	encoded := base64.RawURLEncoding.EncodeToString([]byte(payload))
	return encoded + "." + macHex(secret, payload)
}

func ReadOAuth(secret, value string, now time.Time) (state, verifier string, ok bool) {
	encoded, sig, found := strings.Cut(value, ".")
	if !found {
		return "", "", false
	}
	raw, err := base64.RawURLEncoding.DecodeString(encoded)
	if err != nil {
		return "", "", false
	}
	payload := string(raw)
	if !macOK(secret, payload, sig) {
		return "", "", false
	}
	parts := strings.Split(payload, "\n")
	if len(parts) != 3 || parts[0] == "" || parts[1] == "" {
		return "", "", false
	}
	expUnix, err := strconv.ParseInt(parts[2], 10, 64)
	if err != nil || !now.Before(time.Unix(expUnix, 0)) {
		return "", "", false
	}
	return parts[0], parts[1], true
}

func verifiedPayload(secret, value string) (string, bool) {
	payload, sig, ok := strings.Cut(value, ".")
	if !ok || !macOK(secret, payload, sig) {
		return "", false
	}
	return payload, true
}

func macOK(secret, payload, sig string) bool {
	if len(sig) != 64 {
		return false
	}
	expected := macHex(secret, payload)
	return subtle.ConstantTimeCompare([]byte(sig), []byte(expected)) == 1
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
