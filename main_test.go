package main

import (
	"os"
	"path/filepath"
	"regexp"
	"testing"
)

func withTempCwd(t *testing.T, fn func()) {
	t.Helper()
	wd, _ := os.Getwd()
	dir := t.TempDir()
	prevDataDir := os.Getenv("XPOSTCTL_DATA_DIR")
	_ = os.Setenv("XPOSTCTL_DATA_DIR", filepath.Join(dir, ".twitter"))
	if err := os.Chdir(dir); err != nil {
		t.Fatal(err)
	}
	defer func() {
		_ = os.Chdir(wd)
		if prevDataDir == "" {
			_ = os.Unsetenv("XPOSTCTL_DATA_DIR")
		} else {
			_ = os.Setenv("XPOSTCTL_DATA_DIR", prevDataDir)
		}
	}()
	fn()
}

func TestNewID(t *testing.T) {
	id := newID(32)
	if len(id) != 32 {
		t.Fatalf("len=%d", len(id))
	}
	if !regexp.MustCompile(`^[0-9a-z]+$`).MatchString(id) {
		t.Fatalf("bad chars: %s", id)
	}
}

func TestPercentEncodeAndSign(t *testing.T) {
	if got := pct("Ladies + Gentlemen"); got != "Ladies%20%2B%20Gentlemen" {
		t.Fatalf("pct mismatch: %s", got)
	}
	creds := oauthCreds{
		APIKey:       "xvz1evFS4wEEPTGEFPHBog",
		APISecret:    "kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw",
		AccessToken:  "370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb",
		AccessSecret: "test_access_secret",
	}
	a := sign("POST", "https://api.x.com/2/tweets", creds, nil, "testnonce123", "1700000000")
	b := sign("POST", "https://api.x.com/2/tweets", creds, nil, "testnonce123", "1700000000")
	if a != b {
		t.Fatal("signature not deterministic")
	}
}

func TestTweetCRUD(t *testing.T) {
	withTempCwd(t, func() {
		a, err := createTweet("one", nil, 0, nil)
		if err != nil {
			t.Fatal(err)
		}
		b, err := createTweet("two", nil, 0, nil)
		if err != nil {
			t.Fatal(err)
		}
		got, err := getTweet(a.ID)
		if err != nil || got == nil || got.Content != "one" {
			t.Fatalf("get failed: %+v %v", got, err)
		}
		_, err = updateTweet(a.ID, func(tw *Tweet) { tw.Content = "uno"; tw.Status = postedStatus })
		if err != nil {
			t.Fatal(err)
		}
		got, _ = getTweet(a.ID)
		if got.Content != "uno" || got.Status != postedStatus {
			t.Fatalf("update failed: %+v", got)
		}
		all, err := listTweets("")
		if err != nil {
			t.Fatal(err)
		}
		if len(all) != 2 {
			t.Fatalf("len all=%d", len(all))
		}
		if err := deleteTweet(b.ID); err != nil {
			t.Fatal(err)
		}
		all, _ = listTweets("")
		if len(all) != 1 {
			t.Fatalf("len after delete=%d", len(all))
		}
		if _, err := os.Stat(filepath.Join(dataDir(), "tweets.json")); err != nil {
			t.Fatal(err)
		}
	})
}
