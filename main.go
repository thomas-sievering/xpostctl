package main

import (
	"bytes"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"
)

const (
	draftStatus  = "draft"
	postedStatus = "posted"
	failedStatus = "failed"
)

var version = "dev"

type Ctx struct{ JSON bool }

type CliErr struct {
	Code    string `json:"code"`
	Msg     string `json:"message"`
	Details any    `json:"details,omitempty"`
}

func (e *CliErr) Error() string { return e.Msg }

func cliFail(code, msg string, details any) error {
	return &CliErr{Code: code, Msg: msg, Details: details}
}

type Tweet struct {
	ID        string  `json:"id"`
	Content   string  `json:"content"`
	ThreadID  *string `json:"thread_id"`
	ThreadPos int     `json:"thread_pos"`
	Status    string  `json:"status"`
	TweetID   *string `json:"tweet_id"`
	PostedAt  *string `json:"posted_at"`
	CreatedAt string  `json:"created_at"`
	Tags      *string `json:"tags"`
}

type Gen struct {
	ID        string `json:"id"`
	Prompt    string `json:"prompt"`
	Output    string `json:"output"`
	Model     string `json:"model"`
	CreatedAt string `json:"created_at"`
}

type Config struct {
	Twitter struct {
		APIKey       string `json:"apiKey"`
		APISecret    string `json:"apiSecret"`
		AccessToken  string `json:"accessToken"`
		AccessSecret string `json:"accessSecret"`
	} `json:"twitter"`
	AI struct {
		Topics []string `json:"topics"`
		Tone   string   `json:"tone"`
		Avoid  []string `json:"avoid"`
	} `json:"ai"`
}

func defaultConfig() Config {
	var c Config
	c.AI.Topics = []string{"TypeScript", "AI/ML", "LLMs", "open source", "developer tools"}
	c.AI.Tone = "witty, concise, technical but accessible"
	c.AI.Avoid = []string{"engagement bait", "generic advice", "hashtag spam"}
	return c
}

func cwd() string {
	d, _ := os.Getwd()
	if d == "" {
		return "."
	}
	return d
}
func dataDir() string    { return filepath.Join(cwd(), ".twitter") }
func tweetsPath() string { return filepath.Join(dataDir(), "tweets.json") }
func gensPath() string   { return filepath.Join(dataDir(), "generations.json") }
func cfgPath() string    { return filepath.Join(dataDir(), "config.json") }

func ensureData() error { return os.MkdirAll(dataDir(), 0o755) }

func readJSON[T any](path string, fallback T) (T, error) {
	raw, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return fallback, nil
	}
	if err != nil {
		return fallback, err
	}
	if len(bytes.TrimSpace(raw)) == 0 {
		return fallback, nil
	}
	out := fallback
	if err := json.Unmarshal(raw, &out); err != nil {
		return fallback, err
	}
	return out, nil
}

func writeJSON(path string, v any) error {
	raw, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	raw = append(raw, '\n')
	return os.WriteFile(path, raw, 0o644)
}

func listTweets(status string) ([]Tweet, error) {
	if err := ensureData(); err != nil {
		return nil, err
	}
	all, err := readJSON(tweetsPath(), []Tweet{})
	if err != nil {
		return nil, err
	}
	out := make([]Tweet, 0, len(all))
	for _, t := range all {
		if status == "" || t.Status == status {
			out = append(out, t)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt > out[j].CreatedAt })
	return out, nil
}

func getTweet(id string) (*Tweet, error) {
	all, err := listTweets("")
	if err != nil {
		return nil, err
	}
	for i := range all {
		if all[i].ID == id {
			c := all[i]
			return &c, nil
		}
	}
	return nil, nil
}

func saveAllTweets(items []Tweet) error {
	if err := ensureData(); err != nil {
		return err
	}
	return writeJSON(tweetsPath(), items)
}

func createTweet(content string, threadID *string, pos int, tags *string) (Tweet, error) {
	all, err := listTweets("")
	if err != nil {
		return Tweet{}, err
	}
	t := Tweet{ID: newID(12), Content: content, ThreadID: threadID, ThreadPos: pos, Status: draftStatus, CreatedAt: time.Now().UTC().Format(time.RFC3339), Tags: tags}
	all = append(all, t)
	if err := saveAllTweets(all); err != nil {
		return Tweet{}, err
	}
	return t, nil
}

func updateTweet(id string, fn func(*Tweet)) (*Tweet, error) {
	all, err := listTweets("")
	if err != nil {
		return nil, err
	}
	for i := range all {
		if all[i].ID == id {
			fn(&all[i])
			if err := saveAllTweets(all); err != nil {
				return nil, err
			}
			c := all[i]
			return &c, nil
		}
	}
	return nil, nil
}

func deleteTweet(id string) error {
	all, err := listTweets("")
	if err != nil {
		return err
	}
	out := make([]Tweet, 0, len(all))
	for _, t := range all {
		if t.ID != id {
			out = append(out, t)
		}
	}
	return saveAllTweets(out)
}

func threadTweets(id string) ([]Tweet, error) {
	all, err := listTweets("")
	if err != nil {
		return nil, err
	}
	out := []Tweet{}
	for _, t := range all {
		if t.ThreadID != nil && *t.ThreadID == id {
			out = append(out, t)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ThreadPos < out[j].ThreadPos })
	return out, nil
}

func saveGen(prompt, output, model string) error {
	if err := ensureData(); err != nil {
		return err
	}
	all, err := readJSON(gensPath(), []Gen{})
	if err != nil {
		return err
	}
	all = append(all, Gen{ID: newID(12), Prompt: prompt, Output: output, Model: model, CreatedAt: time.Now().UTC().Format(time.RFC3339)})
	return writeJSON(gensPath(), all)
}

func parseDotEnv(raw string) map[string]string {
	out := map[string]string{}
	for _, ln := range strings.Split(raw, "\n") {
		s := strings.TrimSpace(strings.TrimSuffix(ln, "\r"))
		if s == "" || strings.HasPrefix(s, "#") {
			continue
		}
		i := strings.Index(s, "=")
		if i <= 0 {
			continue
		}
		k := strings.TrimSpace(s[:i])
		v := strings.TrimSpace(s[i+1:])
		if (strings.HasPrefix(v, "\"") && strings.HasSuffix(v, "\"")) || (strings.HasPrefix(v, "'") && strings.HasSuffix(v, "'")) {
			v = v[1 : len(v)-1]
		}
		out[k] = v
	}
	return out
}

func loadEnvFile(path string) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return
	}
	for k, v := range parseDotEnv(string(raw)) {
		if os.Getenv(k) == "" {
			_ = os.Setenv(k, v)
		}
	}
}

func loadConfig() (Config, error) {
	if err := ensureData(); err != nil {
		return Config{}, err
	}
	if p := os.Getenv("XPOSTCTL_ENV_FILE"); p != "" {
		loadEnvFile(p)
	}
	loadEnvFile(filepath.Join(cwd(), "x.env"))
	cfg := defaultConfig()
	raw, err := os.ReadFile(cfgPath())
	if errors.Is(err, os.ErrNotExist) {
		_ = writeJSON(cfgPath(), cfg)
	} else if err == nil {
		_ = json.Unmarshal(raw, &cfg)
	} else {
		return Config{}, err
	}
	if v := first(os.Getenv("X_API_KEY"), os.Getenv("TWITTER_API_KEY")); v != "" {
		cfg.Twitter.APIKey = v
	}
	if v := first(os.Getenv("X_API_SECRET"), os.Getenv("TWITTER_API_SECRET")); v != "" {
		cfg.Twitter.APISecret = v
	}
	if v := first(os.Getenv("X_ACCESS_TOKEN"), os.Getenv("TWITTER_ACCESS_TOKEN")); v != "" {
		cfg.Twitter.AccessToken = v
	}
	if v := first(os.Getenv("X_ACCESS_SECRET"), os.Getenv("TWITTER_ACCESS_SECRET")); v != "" {
		cfg.Twitter.AccessSecret = v
	}
	return cfg, nil
}

func first(v ...string) string {
	for _, s := range v {
		if s != "" {
			return s
		}
	}
	return ""
}

func newID(size int) string {
	const alpha = "0123456789abcdefghijklmnopqrstuvwxyz"
	b := make([]byte, size)
	_, _ = rand.Read(b)
	o := make([]byte, size)
	for i := 0; i < size; i++ {
		o[i] = alpha[int(b[i])%len(alpha)]
	}
	return string(o)
}

type oauthCreds struct{ APIKey, APISecret, AccessToken, AccessSecret string }

func pct(s string) string {
	e := url.QueryEscape(s)
	e = strings.ReplaceAll(e, "+", "%20")
	e = strings.ReplaceAll(e, "*", "%2A")
	e = strings.ReplaceAll(e, "%7E", "~")
	return e
}

func sign(method, rawURL string, c oauthCreds, body map[string]string, nonce, ts string) string {
	if nonce == "" {
		nonce = newID(24)
	}
	if ts == "" {
		ts = strconv.FormatInt(time.Now().Unix(), 10)
	}
	p := map[string]string{
		"oauth_consumer_key":     c.APIKey,
		"oauth_nonce":            nonce,
		"oauth_signature_method": "HMAC-SHA1",
		"oauth_timestamp":        ts,
		"oauth_token":            c.AccessToken,
		"oauth_version":          "1.0",
	}
	all := map[string]string{}
	for k, v := range p {
		all[k] = v
	}
	for k, v := range body {
		all[k] = v
	}
	ks := make([]string, 0, len(all))
	for k := range all {
		ks = append(ks, k)
	}
	sort.Strings(ks)
	pr := make([]string, 0, len(ks))
	for _, k := range ks {
		pr = append(pr, pct(k)+"="+pct(all[k]))
	}
	base := strings.ToUpper(method) + "&" + pct(rawURL) + "&" + pct(strings.Join(pr, "&"))
	key := pct(c.APISecret) + "&" + pct(c.AccessSecret)
	h := hmac.New(sha1.New, []byte(key))
	_, _ = h.Write([]byte(base))
	p["oauth_signature"] = base64.StdEncoding.EncodeToString(h.Sum(nil))
	oks := make([]string, 0, len(p))
	for k := range p {
		oks = append(oks, k)
	}
	sort.Strings(oks)
	out := make([]string, 0, len(oks))
	for _, k := range oks {
		out = append(out, pct(k)+"=\""+pct(p[k])+"\"")
	}
	return "OAuth " + strings.Join(out, ", ")
}

type twClient struct {
	creds oauthCreds
	dry   bool
	quiet bool
}
type postResult struct {
	ID   string `json:"id"`
	Text string `json:"text"`
}

func (c twClient) post(text string, replyTo *string) (postResult, error) {
	if c.dry {
		if !c.quiet {
			fmt.Println("  [dry-run] Would post:", strconv.Quote(text))
		}
		return postResult{ID: fmt.Sprintf("dry_%d", time.Now().UnixMilli()), Text: text}, nil
	}
	u := "https://api.x.com/2/tweets"
	body := map[string]any{"text": text}
	if replyTo != nil {
		body["reply"] = map[string]string{"in_reply_to_tweet_id": *replyTo}
	}
	raw, _ := json.Marshal(body)
	req, err := http.NewRequest(http.MethodPost, u, bytes.NewReader(raw))
	if err != nil {
		return postResult{}, err
	}
	req.Header.Set("Authorization", sign("POST", u, c.creds, nil, "", ""))
	req.Header.Set("Content-Type", "application/json")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return postResult{}, err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		b, _ := io.ReadAll(res.Body)
		return postResult{}, fmt.Errorf("Twitter API error %d: %s", res.StatusCode, strings.TrimSpace(string(b)))
	}
	var out struct {
		Data postResult `json:"data"`
	}
	if err := json.NewDecoder(res.Body).Decode(&out); err != nil {
		return postResult{}, err
	}
	return out.Data, nil
}

func (c twClient) del(tweetID string) error {
	if c.dry {
		if !c.quiet {
			fmt.Println("  [dry-run] Would delete tweet:", tweetID)
		}
		return nil
	}
	u := "https://api.x.com/2/tweets/" + tweetID
	req, err := http.NewRequest(http.MethodDelete, u, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", sign("DELETE", u, c.creds, nil, "", ""))
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		b, _ := io.ReadAll(res.Body)
		return fmt.Errorf("Twitter API error %d: %s", res.StatusCode, strings.TrimSpace(string(b)))
	}
	return nil
}

func draftCmd(args []string, ctx Ctx) (any, error) {
	if len(args) > 0 && args[0] == "--edit" {
		if len(args) < 3 {
			return nil, cliFail("INVALID_ARGS", "Usage: tweet draft --edit <id> <new text>", nil)
		}
		id := args[1]
		text := strings.TrimSpace(strings.Join(args[2:], " "))
		t, err := getTweet(id)
		if err != nil {
			return nil, err
		}
		if t == nil {
			return nil, cliFail("NOT_FOUND", "Tweet not found: "+id, nil)
		}
		if t.Status != draftStatus {
			return nil, cliFail("CONFLICT", "Can only edit drafts (current status: "+t.Status+")", nil)
		}
		var warning string
		if len(text) > 280 {
			warning = fmt.Sprintf("text is %d chars (max 280)", len(text))
			if !ctx.JSON {
				fmt.Println("  Warning:", warning)
			}
		}
		up, err := updateTweet(id, func(tt *Tweet) { tt.Content = text })
		if err != nil {
			return nil, err
		}
		if !ctx.JSON {
			fmt.Println("  Updated", id)
		}
		return map[string]any{"action": "edited", "tweet": up, "warning": nilIfEmpty(warning)}, nil
	}
	if len(args) > 0 && args[0] == "--delete" {
		if len(args) < 2 {
			return nil, cliFail("INVALID_ARGS", "Usage: tweet draft --delete <id>", nil)
		}
		id := args[1]
		t, err := getTweet(id)
		if err != nil {
			return nil, err
		}
		if t == nil {
			return nil, cliFail("NOT_FOUND", "Tweet not found: "+id, nil)
		}
		if err := deleteTweet(id); err != nil {
			return nil, err
		}
		if !ctx.JSON {
			fmt.Println("  Deleted", id)
		}
		return map[string]any{"action": "deleted", "id": id}, nil
	}
	text := strings.TrimSpace(strings.Join(args, " "))
	if text == "" {
		return nil, cliFail("INVALID_ARGS", "Usage: tweet draft <text>", map[string]any{"examples": []string{"tweet draft --edit <id> <new text>"}})
	}
	var warning string
	if len(text) > 280 {
		warning = fmt.Sprintf("text is %d chars (max 280)", len(text))
		if !ctx.JSON {
			fmt.Println("  Warning:", warning)
		}
	}
	tw, err := createTweet(text, nil, 0, nil)
	if err != nil {
		return nil, err
	}
	if !ctx.JSON {
		fmt.Println("  Created draft", tw.ID)
		fmt.Println(" ", tw.Content)
	}
	return map[string]any{"action": "created", "tweet": tw, "warning": nilIfEmpty(warning)}, nil
}

func nilIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func listCmd(args []string, ctx Ctx) (any, error) {
	f := ""
	if len(args) > 0 {
		f = args[0]
	}
	if f != "" {
		ok := map[string]bool{"draft": true, "drafts": true, "posted": true, "failed": true}
		if !ok[f] {
			return nil, cliFail("INVALID_ARGS", "Invalid filter: "+f, map[string]any{"validFilters": []string{"drafts", "posted", "failed"}})
		}
	}
	s := f
	if s == "drafts" {
		s = draftStatus
	}
	tw, err := listTweets(s)
	if err != nil {
		return nil, err
	}
	if !ctx.JSON {
		if len(tw) == 0 {
			fmt.Println("  No tweets found")
		} else {
			title := "All tweets"
			if s != "" {
				title = s
			}
			fmt.Printf("\n  %s (%d)\n\n", title, len(tw))
			for _, t := range tw {
				p := t.Content
				if len(p) > 60 {
					p = p[:60] + "..."
				}
				fmt.Printf("  %s [%s] %s\n", t.ID, t.Status, p)
			}
			fmt.Println()
		}
	}
	var out any
	if s != "" {
		out = s
	}
	return map[string]any{"status": out, "count": len(tw), "tweets": tw}, nil
}

func getCmd(args []string, ctx Ctx) (any, error) {
	if len(args) < 1 {
		return nil, cliFail("INVALID_ARGS", "Usage: tweet get <id>", nil)
	}
	t, err := getTweet(args[0])
	if err != nil {
		return nil, err
	}
	if t == nil {
		return nil, cliFail("NOT_FOUND", "Tweet not found: "+args[0], nil)
	}
	if !ctx.JSON {
		fmt.Printf("\n  %s [%s]\n", t.ID, t.Status)
		fmt.Println(" ", t.Content)
		if t.TweetID != nil {
			fmt.Println("  tweet_id:", *t.TweetID)
		}
		fmt.Println("  created:", t.CreatedAt)
		if t.PostedAt != nil {
			fmt.Println("  posted:", *t.PostedAt)
		}
		fmt.Println()
	}
	return map[string]any{"tweet": t}, nil
}

func postCmd(args []string, ctx Ctx) (any, error) {
	cfg, err := loadConfig()
	if err != nil {
		return nil, err
	}
	dry := false
	id := ""
	for _, a := range args {
		if a == "--dry" {
			dry = true
			continue
		}
		if !strings.HasPrefix(a, "--") && id == "" {
			id = a
		}
	}
	if id == "" {
		return nil, cliFail("INVALID_ARGS", "Usage: tweet post <id> [--dry]", nil)
	}
	t, err := getTweet(id)
	if err != nil {
		return nil, err
	}
	if t == nil {
		return nil, cliFail("NOT_FOUND", "Tweet not found: "+id, nil)
	}
	if t.Status == postedStatus {
		tid := ""
		if t.TweetID != nil {
			tid = *t.TweetID
		}
		return nil, cliFail("CONFLICT", "Already posted (tweet ID: "+tid+")", nil)
	}
	c := twClient{creds: oauthCreds{APIKey: cfg.Twitter.APIKey, APISecret: cfg.Twitter.APISecret, AccessToken: cfg.Twitter.AccessToken, AccessSecret: cfg.Twitter.AccessSecret}, dry: dry, quiet: ctx.JSON}
	if t.ThreadID != nil {
		thr, err := threadTweets(*t.ThreadID)
		if err != nil {
			return nil, err
		}
		if !ctx.JSON {
			fmt.Printf("  Posting thread (%d tweets)...\n", len(thr))
		}
		var last *string
		for _, it := range thr {
			r, err := c.post(it.Content, last)
			if err != nil {
				return nil, err
			}
			rid := r.ID
			_, _ = updateTweet(it.ID, func(tt *Tweet) {
				tt.Status = postedStatus
				tt.TweetID = &rid
				ts := time.Now().UTC().Format(time.RFC3339)
				tt.PostedAt = &ts
			})
			last = &rid
			if !dry {
				time.Sleep(1500 * time.Millisecond)
			}
		}
		upd, _ := threadTweets(*t.ThreadID)
		if !ctx.JSON {
			fmt.Printf("  Thread posted (%d tweets)\n", len(upd))
		}
		return map[string]any{"mode": "thread", "dryRun": dry, "count": len(upd), "tweets": upd}, nil
	}
	r, err := c.post(t.Content, nil)
	if err != nil {
		_, _ = updateTweet(t.ID, func(tt *Tweet) { tt.Status = failedStatus })
		return nil, cliFail("POST_FAILED", "Failed: "+err.Error(), map[string]any{"id": t.ID})
	}
	upd, err := updateTweet(t.ID, func(tt *Tweet) {
		tt.Status = postedStatus
		tt.TweetID = &r.ID
		ts := time.Now().UTC().Format(time.RFC3339)
		tt.PostedAt = &ts
	})
	if err != nil {
		return nil, err
	}
	if !ctx.JSON {
		fmt.Printf("  Posted %s -> %s\n", t.ID, r.ID)
	}
	return map[string]any{"mode": "single", "dryRun": dry, "tweet": upd, "post": r}, nil
}

func deleteCmd(args []string, ctx Ctx) (any, error) {
	cfg, err := loadConfig()
	if err != nil {
		return nil, err
	}
	dry := false
	id := ""
	for _, a := range args {
		if a == "--dry" {
			dry = true
			continue
		}
		if !strings.HasPrefix(a, "--") && id == "" {
			id = a
		}
	}
	if id == "" {
		return nil, cliFail("INVALID_ARGS", "Usage: tweet delete <id> [--dry]", nil)
	}
	t, err := getTweet(id)
	if err != nil {
		return nil, err
	}
	if t == nil {
		return nil, cliFail("NOT_FOUND", "Tweet not found: "+id, nil)
	}
	remote := false
	if t.TweetID != nil && *t.TweetID != "" {
		c := twClient{creds: oauthCreds{APIKey: cfg.Twitter.APIKey, APISecret: cfg.Twitter.APISecret, AccessToken: cfg.Twitter.AccessToken, AccessSecret: cfg.Twitter.AccessSecret}, dry: dry, quiet: ctx.JSON}
		if err := c.del(*t.TweetID); err != nil {
			return nil, err
		}
		remote = true
	}
	if err := deleteTweet(t.ID); err != nil {
		return nil, err
	}
	if !ctx.JSON {
		if remote {
			fmt.Printf("  Deleted %s (%s)\n", t.ID, *t.TweetID)
		} else {
			fmt.Printf("  Deleted local draft %s\n", t.ID)
		}
	}
	return map[string]any{"id": t.ID, "status": t.Status, "dryRun": dry, "remoteDeleted": remote, "remoteTweetId": t.TweetID}, nil
}

func genTemplate(mode, topic string) string {
	switch mode {
	case "ideas":
		return "1. Share one unpopular engineering tradeoff you changed your mind on.\n2. A small automation that saves your team 30 minutes daily.\n3. Why most dashboards hide the metric that matters.\n4. [THREAD] A real incident timeline and what you fixed first.\n5. A code review habit that reduced bugs in your team.\n6. How you scope features to fit one sprint.\n7. [THREAD] Lessons from replacing a legacy dependency.\n8. A practical AI workflow that actually helps coding speed.\n9. One dev-tool configuration most teams forget.\n10. What you would delete from your stack today and why."
	case "thread":
		return fmt.Sprintf("Most teams overcomplicate %s. Here is the lean approach that ships.\n---\n1) Set a single success metric before writing code.\n---\n2) Build the smallest path to prove the metric in prod.\n---\n3) Remove abstractions until pain appears, then add one layer.\n---\n4) Document tradeoffs and revisit in two weeks with real data.", topic)
	default:
		msg := fmt.Sprintf("Most wins in %s come from reducing cycle time, not adding complexity. Short feedback loops beat perfect architecture.", topic)
		if len(msg) > 280 {
			msg = msg[:280]
		}
		return msg
	}
}

func generateCmd(args []string, ctx Ctx) (any, error) {
	if len(args) == 0 {
		return nil, cliFail("INVALID_ARGS", "Usage: tweet generate <topic>", map[string]any{"examples": []string{"tweet generate thread <topic>", "tweet generate ideas"}})
	}
	if args[0] == "ideas" {
		raw := genTemplate("ideas", "")
		_ = saveGen("Generate 10 tweet ideas for this week.", raw, "template")
		if !ctx.JSON {
			fmt.Println()
			fmt.Println(raw)
			fmt.Println()
		}
		return map[string]any{"mode": "ideas", "raw": raw}, nil
	}
	if args[0] == "thread" {
		topic := strings.TrimSpace(strings.Join(args[1:], " "))
		if topic == "" {
			return nil, cliFail("INVALID_ARGS", "Usage: tweet generate thread <topic>", nil)
		}
		if !ctx.JSON {
			fmt.Println("  Generating thread about:", topic)
		}
		raw := genTemplate("thread", topic)
		_ = saveGen("Write a thread about: "+topic, raw, "template")
		parts := strings.Split(raw, "\n---\n")
		tid := newID(12)
		out := []Tweet{}
		for i, p := range parts {
			p = strings.TrimSpace(p)
			if p == "" {
				continue
			}
			if len(p) > 280 {
				p = p[:280]
			}
			th := tid
			tg := topic
			tw, err := createTweet(p, &th, i, &tg)
			if err != nil {
				return nil, err
			}
			out = append(out, tw)
			if !ctx.JSON {
				fmt.Printf("  [%d] %s\n", i+1, p)
			}
		}
		return map[string]any{"mode": "thread", "topic": topic, "tweets": out, "raw": raw}, nil
	}
	topic := strings.TrimSpace(strings.Join(args, " "))
	raw := genTemplate("single", topic)
	_ = saveGen("Write a tweet about: "+topic, raw, "template")
	tg := topic
	tw, err := createTweet(raw, nil, 0, &tg)
	if err != nil {
		return nil, err
	}
	if !ctx.JSON {
		fmt.Println("  Generated", tw.ID)
		fmt.Println(" ", tw.Content)
	}
	return map[string]any{"mode": "single", "topic": topic, "tweets": []Tweet{tw}, "raw": raw}, nil
}

var cmdHelp = map[string]string{
	"draft":    "Create, edit, or delete a local draft",
	"generate": "Generate tweet(s) about a topic",
	"post":     "Post a draft immediately",
	"list":     "List tweets by status",
	"get":      "Get one tweet by local id",
	"delete":   "Delete a tweet by local id (and remote if posted)",
}

func help() {
	fmt.Println()
	fmt.Println("  xpostctl - X Posting Toolkit")
	fmt.Println()
	for _, c := range []string{"draft", "generate", "post", "list", "get", "delete"} {
		fmt.Printf("  tweet %-20s %s\n", c, cmdHelp[c])
	}
	fmt.Println("\n  Global flags:\n    --json   machine-readable output")
	fmt.Println("\n  Examples:")
	fmt.Println("    tweet draft \"My first tweet\"")
	fmt.Println("    tweet generate \"bun runtime\"")
	fmt.Println("    tweet list drafts --json")
	fmt.Println("    tweet post abc123 --dry")
	fmt.Println("    tweet get abc123 --json")
	fmt.Println()
}

func parseArgs(argv []string) (string, []string, Ctx) {
	ctx := Ctx{}
	out := []string{}
	for _, a := range argv {
		if a == "--json" {
			ctx.JSON = true
		} else {
			out = append(out, a)
		}
	}
	if len(out) == 0 {
		return "", nil, ctx
	}
	return out[0], out[1:], ctx
}

func run(cmd string, args []string, ctx Ctx) (any, error) {
	switch cmd {
	case "draft":
		return draftCmd(args, ctx)
	case "generate":
		return generateCmd(args, ctx)
	case "post":
		return postCmd(args, ctx)
	case "list":
		return listCmd(args, ctx)
	case "get":
		return getCmd(args, ctx)
	case "delete":
		return deleteCmd(args, ctx)
	default:
		return nil, cliFail("INVALID_COMMAND", "Unknown command: "+cmd, map[string]any{"command": cmd, "available": []string{"draft", "generate", "post", "list", "get", "delete"}})
	}
}

func main() {
	cmd, args, ctx := parseArgs(os.Args[1:])
	if cmd == "" || cmd == "help" || cmd == "--help" {
		if ctx.JSON {
			_ = json.NewEncoder(os.Stdout).Encode(map[string]any{"ok": true, "data": map[string]any{"commands": cmdHelp}})
		} else {
			help()
		}
		return
	}
	data, err := run(cmd, args, ctx)
	if err != nil {
		if ce, ok := err.(*CliErr); ok {
			payload := map[string]any{"ok": false, "error": map[string]any{"code": ce.Code, "message": ce.Msg, "details": ce.Details}}
			if ctx.JSON {
				_ = json.NewEncoder(os.Stdout).Encode(payload)
			} else {
				fmt.Fprintln(os.Stderr, "Error:", ce.Msg)
			}
			os.Exit(1)
		}
		payload := map[string]any{"ok": false, "error": map[string]any{"code": "FATAL", "message": err.Error()}}
		if ctx.JSON {
			_ = json.NewEncoder(os.Stdout).Encode(payload)
		} else {
			fmt.Fprintln(os.Stderr, "Fatal:", err.Error())
		}
		os.Exit(1)
	}
	if ctx.JSON {
		_ = json.NewEncoder(os.Stdout).Encode(map[string]any{"ok": true, "data": data})
	}
}
