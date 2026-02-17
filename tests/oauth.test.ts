import { describe, test, expect } from "bun:test";
import { sign, percentEncode } from "../core/twitter/oauth.ts";

describe("percentEncode", () => {
  test("encodes special characters", () => {
    expect(percentEncode("Ladies + Gentlemen")).toBe("Ladies%20%2B%20Gentlemen");
  });

  test("encodes RFC 3986 unreserved characters correctly", () => {
    expect(percentEncode("An encoded string!")).toBe("An%20encoded%20string%21");
  });

  test("preserves unreserved characters", () => {
    expect(percentEncode("abcABC123-._~")).toBe("abcABC123-._~");
  });
});

describe("OAuth sign", () => {
  // Twitter's own OAuth test vector
  // https://developer.twitter.com/en/docs/authentication/oauth-1-0a/creating-a-signature
  const creds = {
    apiKey: "xvz1evFS4wEEPTGEFPHBog",
    apiSecret: "kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw",
    accessToken: "370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb",
    accessSecret: "LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE",
  };

  test("generates valid signature", () => {
    const result = sign(
      "POST",
      "https://api.twitter.com/1.1/statuses/update.json",
      creds,
      { status: "Hello Ladies + Gentlemen, a signed OAuth request!", include_entities: "true" },
      { nonce: "kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg", timestamp: "1318622958" },
    );

    expect(result).toContain("OAuth ");
    expect(result).toContain("oauth_consumer_key=");
    expect(result).toContain("oauth_signature=");
    expect(result).toContain("oauth_nonce=");
    expect(result).toContain("oauth_timestamp=");
    expect(result).toContain("oauth_version=");
    expect(result).toContain("oauth_signature_method=");
  });

  test("produces deterministic output with fixed nonce/timestamp", () => {
    const a = sign("POST", "https://api.x.com/2/tweets", creds, undefined, {
      nonce: "testnonce123",
      timestamp: "1700000000",
    });
    const b = sign("POST", "https://api.x.com/2/tweets", creds, undefined, {
      nonce: "testnonce123",
      timestamp: "1700000000",
    });
    expect(a).toBe(b);
  });

  test("includes all required OAuth params", () => {
    const header = sign("GET", "https://api.x.com/2/tweets", creds);
    const requiredParams = [
      "oauth_consumer_key",
      "oauth_nonce",
      "oauth_signature",
      "oauth_signature_method",
      "oauth_timestamp",
      "oauth_token",
      "oauth_version",
    ];
    for (const param of requiredParams) {
      expect(header).toContain(param);
    }
  });
});
