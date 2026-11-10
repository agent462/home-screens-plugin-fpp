import { describe, expect, it } from 'vitest';
import { hmacSha256, remoteFalconKey, sha256 } from './jwt';

// Checked against the platform's own crypto, which the tests can use even
// though a wall on plain http cannot.
const hex = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b as ArrayBuffer)].map((x) => x.toString(16).padStart(2, '0')).join('');
const enc = new TextEncoder();
const platformHmac = async (key: string, message: string) => {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(message)));
};
const fromBase64url = (s: string) => atob(s.replace(/-/g, '+').replace(/_/g, '/'));

describe('sha256', () => {
  it.each(['', 'abc', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(64), 'x'.repeat(1000)])('matches the platform hash for %j', async (text) => {
    expect(hex(sha256(enc.encode(text)))).toBe(hex(await crypto.subtle.digest('SHA-256', enc.encode(text))));
  });
});

describe('hmacSha256', () => {
  it.each([['key', 'message'], ['k'.repeat(64), 'm'], ['k'.repeat(200), 'a longer message '.repeat(9)]])('matches the platform HMAC', async (key, message) => {
    expect(hex(hmacSha256(enc.encode(key), enc.encode(message)))).toBe(hex(await platformHmac(key, message)));
  });
});

describe('remoteFalconKey', () => {
  it('is an HS256 JWT carrying the access token, signed with the secret', async () => {
    const key = remoteFalconKey('token-123', 's3cret');
    const [head, body, sig] = key.split('.');
    expect(JSON.parse(fromBase64url(head))).toEqual({ alg: 'HS256', typ: 'JWT' });
    expect(JSON.parse(fromBase64url(body))).toEqual({ accessToken: 'token-123' });
    expect(hex(Uint8Array.from(fromBase64url(sig), (c) => c.charCodeAt(0)))).toBe(hex(await platformHmac('s3cret', `${head}.${body}`)));
  });
});
