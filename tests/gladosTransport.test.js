import { describe, expect, it } from 'vitest';
import { createGladosUpstreamRequest } from '../server/gladosTransport.js';

describe('GLaDOS upstream transport', () => {
  it('adapts the R2D2FISH GET synthesize endpoint and escapes user text', () => {
    const result = createGladosUpstreamRequest('http://127.0.0.1:8124/synthesize/', 'Hello GLaDOS? #1');
    expect(result.options.method).toBe('GET');
    expect(result.url).toBe('http://127.0.0.1:8124/synthesize/Hello%20GLaDOS%3F%20%231');
  });

  it('preserves POST/JSON for Alice-compatible sidecars', () => {
    const result = createGladosUpstreamRequest('http://127.0.0.1:9000/tts', 'Hello');
    expect(result.options.method).toBe('POST');
    expect(JSON.parse(result.options.body)).toEqual({ text: 'Hello', language: 'en', provider: 'glados' });
  });

  it('preserves request cancellation', () => {
    const signal = new AbortController().signal;
    const result = createGladosUpstreamRequest('http://127.0.0.1:8124/synthesize', 'Ready', { signal });
    expect(result.options.signal).toBe(signal);
  });

  it('rejects non-http upstream protocols', () => {
    expect(() => createGladosUpstreamRequest('file:///etc/passwd', 'Hello')).toThrow('glados-invalid-url-protocol');
  });
});
