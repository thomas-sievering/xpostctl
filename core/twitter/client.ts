/**
 * Twitter/X API v2 client.
 * Posts tweets, threads, and deletes. Supports dry-run mode.
 */

import { sign, type OAuthCredentials } from "./oauth.ts";
import { log } from "../logger.ts";
import type { TweetResponse, TweetCreateParams, TwitterErrorResponse } from "./types.ts";

const API_BASE = "https://api.x.com/2";

export type PostResult = {
  id: string;
  text: string;
};

export class TwitterClient {
  private creds: OAuthCredentials;
  private dryRun: boolean;
  private quiet: boolean;

  constructor(creds: OAuthCredentials, dryRun = false, quiet = false) {
    this.creds = creds;
    this.dryRun = dryRun;
    this.quiet = quiet;
  }

  async postTweet(text: string, replyToId?: string): Promise<PostResult> {
    const body: TweetCreateParams = { text };
    if (replyToId) {
      body.reply = { in_reply_to_tweet_id: replyToId };
    }

    if (this.dryRun) {
      const fakeId = `dry_${Date.now()}`;
      await log.info("twitter: dry-run post", { text, replyToId, fakeId });
      if (!this.quiet) {
        console.log(`  [dry-run] Would post: "${text.slice(0, 80)}${text.length > 80 ? "..." : ""}"`);
      }
      return { id: fakeId, text };
    }

    const url = `${API_BASE}/tweets`;
    const jsonBody = JSON.stringify(body);
    const authHeader = sign("POST", url, this.creds);

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: jsonBody,
    });

    if (!res.ok) {
      const errBody = (await res.json().catch(() => ({}))) as TwitterErrorResponse;
      const detail = errBody.detail ?? errBody.errors?.[0]?.detail ?? res.statusText;
      await log.error("twitter: post failed", { status: res.status, detail, text });
      throw new Error(`Twitter API error ${res.status}: ${detail}`);
    }

    const data = (await res.json()) as TweetResponse;
    await log.info("twitter: posted", { tweetId: data.data.id, text: text.slice(0, 80) });
    return { id: data.data.id, text: data.data.text };
  }

  async postThread(texts: string[]): Promise<PostResult[]> {
    const results: PostResult[] = [];
    let lastId: string | undefined;

    for (const text of texts) {
      const result = await this.postTweet(text, lastId);
      results.push(result);
      lastId = result.id;

      // Small delay between thread tweets to avoid rate limits
      if (!this.dryRun && texts.indexOf(text) < texts.length - 1) {
        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    return results;
  }

  async deleteTweet(tweetId: string): Promise<void> {
    if (this.dryRun) {
      await log.info("twitter: dry-run delete", { tweetId });
      if (!this.quiet) {
        console.log(`  [dry-run] Would delete tweet: ${tweetId}`);
      }
      return;
    }

    const url = `${API_BASE}/tweets/${tweetId}`;
    const authHeader = sign("DELETE", url, this.creds);

    const res = await fetch(url, {
      method: "DELETE",
      headers: { Authorization: authHeader },
    });

    if (!res.ok) {
      const errBody = (await res.json().catch(() => ({}))) as TwitterErrorResponse;
      const detail = errBody.detail ?? res.statusText;
      await log.error("twitter: delete failed", { status: res.status, detail, tweetId });
      throw new Error(`Twitter API error ${res.status}: ${detail}`);
    }

    await log.info("twitter: deleted", { tweetId });
  }
}
