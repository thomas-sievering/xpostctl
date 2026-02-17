import { describe, test, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  getTestDb,
  newId,
  createTweet,
  getTweet,
  listTweets,
  updateTweet,
  deleteTweetRow,
  getThread,
  saveGeneration,
} from "../core/db.ts";

let db: Database;

beforeEach(() => {
  db = getTestDb();
});

describe("newId", () => {
  test("generates IDs of specified length", () => {
    const id = newId(12);
    expect(id).toHaveLength(12);
  });

  test("generates unique IDs", () => {
    const ids = new Set(Array.from({ length: 100 }, () => newId()));
    expect(ids.size).toBe(100);
  });

  test("uses only alphanumeric chars", () => {
    const id = newId(100);
    expect(id).toMatch(/^[0-9a-z]+$/);
  });
});

describe("tweet CRUD", () => {
  test("create and get", () => {
    const tweet = createTweet(db, { content: "Hello world" });
    expect(tweet.id).toBeTruthy();
    expect(tweet.content).toBe("Hello world");
    expect(tweet.status).toBe("draft");
    expect(tweet.thread_id).toBeNull();
    expect(tweet.thread_pos).toBe(0);

    const fetched = getTweet(db, tweet.id);
    expect(fetched).toEqual(tweet);
  });

  test("create with all fields", () => {
    const tweet = createTweet(db, {
      content: "Thread tweet",
      thread_id: "thread123",
      thread_pos: 2,
      status: "posted",
      tags: "typescript,bun",
    });
    expect(tweet.thread_id).toBe("thread123");
    expect(tweet.thread_pos).toBe(2);
    expect(tweet.status).toBe("posted");
    expect(tweet.tags).toBe("typescript,bun");
  });

  test("list all", () => {
    createTweet(db, { content: "one" });
    createTweet(db, { content: "two" });
    createTweet(db, { content: "three", status: "posted" });

    const all = listTweets(db);
    expect(all).toHaveLength(3);
  });

  test("list by status", () => {
    createTweet(db, { content: "draft1" });
    createTweet(db, { content: "draft2" });
    createTweet(db, { content: "posted1", status: "posted" });

    const drafts = listTweets(db, "draft");
    expect(drafts).toHaveLength(2);

    const posted = listTweets(db, "posted");
    expect(posted).toHaveLength(1);
  });

  test("update", () => {
    const tweet = createTweet(db, { content: "original" });
    updateTweet(db, tweet.id, { content: "updated", status: "posted" });

    const fetched = getTweet(db, tweet.id)!;
    expect(fetched.content).toBe("updated");
    expect(fetched.status).toBe("posted");
  });

  test("delete", () => {
    const tweet = createTweet(db, { content: "to delete" });
    deleteTweetRow(db, tweet.id);
    expect(getTweet(db, tweet.id)).toBeNull();
  });

  test("get nonexistent returns null", () => {
    expect(getTweet(db, "nonexistent")).toBeNull();
  });
});

describe("threads", () => {
  test("groups by thread_id and orders by position", () => {
    const threadId = "test-thread";
    createTweet(db, { content: "third", thread_id: threadId, thread_pos: 2 });
    createTweet(db, { content: "first", thread_id: threadId, thread_pos: 0 });
    createTweet(db, { content: "second", thread_id: threadId, thread_pos: 1 });

    const thread = getThread(db, threadId);
    expect(thread).toHaveLength(3);
    expect(thread[0]!.content).toBe("first");
    expect(thread[1]!.content).toBe("second");
    expect(thread[2]!.content).toBe("third");
  });
});

describe("generations", () => {
  test("saves and retrieves generation", () => {
    const gen = saveGeneration(db, "test prompt", "test output", "sonnet");
    expect(gen.id).toBeTruthy();
    expect(gen.prompt).toBe("test prompt");
    expect(gen.output).toBe("test output");
    expect(gen.model).toBe("sonnet");
    expect(gen.created_at).toBeTruthy();
  });
});
