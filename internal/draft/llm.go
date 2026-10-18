package draft

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
)

const defaultGroqBaseURL = "https://api.groq.com/openai/v1"

// LLMConfig drives money/capture drafts: Groq first when keyed, else Ollama.
type LLMConfig struct {
	GroqAPIKey      string
	GroqModel       string
	GroqBaseURL     string // tests override; empty = production Groq
	OllamaURL       string
	OllamaModel     string
	OllamaNumThread int
}

func (c LLMConfig) hasGroq() bool {
	return strings.TrimSpace(c.GroqAPIKey) != ""
}

func (c LLMConfig) hasOllama() bool {
	return strings.TrimSpace(c.OllamaURL) != "" && strings.TrimSpace(c.OllamaModel) != ""
}

func (c LLMConfig) groqURL() string {
	if u := strings.TrimSpace(c.GroqBaseURL); u != "" {
		return strings.TrimRight(u, "/")
	}
	return defaultGroqBaseURL
}

func (c LLMConfig) groqModel() string {
	if m := strings.TrimSpace(c.GroqModel); m != "" {
		return m
	}
	return "llama-3.1-8b-instant"
}

func completeWithFallback(ctx context.Context, cfg LLMConfig, system, user string, maxTokens int) (string, error) {
	if cfg.hasGroq() {
		raw, err := completeGroq(ctx, cfg, system, user, maxTokens)
		if err == nil {
			return raw, nil
		}
		if !cfg.hasOllama() {
			return "", err
		}
	}
	if !cfg.hasOllama() {
		return "", ErrUnavailable
	}
	return completeChat(ctx, cfg.OllamaURL, cfg.OllamaModel, system, user, nil, 512, maxTokens, cfg.OllamaNumThread)
}

func completeGroq(ctx context.Context, cfg LLMConfig, system, user string, maxTokens int) (string, error) {
	if maxTokens <= 0 {
		maxTokens = 200
	}
	body, err := json.Marshal(map[string]any{
		"model":       cfg.groqModel(),
		"temperature": 0.1,
		"max_tokens":  maxTokens,
		"response_format": map[string]string{
			"type": "json_object",
		},
		"messages": []any{
			map[string]string{"role": "system", "content": system},
			map[string]string{"role": "user", "content": user},
		},
	})
	if err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, cfg.groqURL()+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(cfg.GroqAPIKey))
	resp, err := httpClient.Do(req)
	if err != nil {
		if errors.Is(ctx.Err(), context.DeadlineExceeded) {
			return "", ErrTimeout
		}
		return "", ErrUnavailable
	}
	defer resp.Body.Close()
	payload, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return "", ErrUnavailable
	}
	if resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode >= 500 {
		return "", ErrUnavailable
	}
	if resp.StatusCode >= 400 {
		return "", ErrUnavailable
	}
	var decoded struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(payload, &decoded); err != nil {
		return "", ErrUnreadable
	}
	if len(decoded.Choices) == 0 || strings.TrimSpace(decoded.Choices[0].Message.Content) == "" {
		return "", ErrUnreadable
	}
	return decoded.Choices[0].Message.Content, nil
}
