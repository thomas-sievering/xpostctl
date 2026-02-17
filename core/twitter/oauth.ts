/**
 * OAuth 1.0a HMAC-SHA1 signing for Twitter API.
 * Zero dependencies — uses Bun's native CryptoHasher.
 */

export type OAuthCredentials = {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessSecret: string;
};

/** Percent-encode per RFC 3986 */
export function percentEncode(str: string): string {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) => {
    return "%" + c.charCodeAt(0).toString(16).toUpperCase();
  });
}

/** Generate OAuth 1.0a Authorization header */
export function sign(
  method: string,
  url: string,
  creds: OAuthCredentials,
  body?: Record<string, string>,
  overrides?: { nonce?: string; timestamp?: string },
): string {
  const nonce = overrides?.nonce ?? generateNonce();
  const timestamp = overrides?.timestamp ?? Math.floor(Date.now() / 1000).toString();

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: creds.apiKey,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: timestamp,
    oauth_token: creds.accessToken,
    oauth_version: "1.0",
  };

  // Combine all params (oauth + body) for signature base
  const allParams: Record<string, string> = { ...oauthParams, ...body };
  const sortedKeys = Object.keys(allParams).sort();
  const paramString = sortedKeys
    .map((k) => `${percentEncode(k)}=${percentEncode(allParams[k]!)}`)
    .join("&");

  // Signature base string
  const baseString = [
    method.toUpperCase(),
    percentEncode(url),
    percentEncode(paramString),
  ].join("&");

  // Signing key
  const signingKey = `${percentEncode(creds.apiSecret)}&${percentEncode(creds.accessSecret)}`;

  // HMAC-SHA1
  const hasher = new Bun.CryptoHasher("sha1", signingKey);
  hasher.update(baseString);
  const signature = hasher.digest("base64");

  oauthParams.oauth_signature = signature;

  // Build Authorization header
  const header = Object.keys(oauthParams)
    .sort()
    .map((k) => `${percentEncode(k)}="${percentEncode(oauthParams[k]!)}"`)
    .join(", ");

  return `OAuth ${header}`;
}

function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(36))
    .join("")
    .slice(0, 32);
}
