import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolveAvatarSelection } from '../src/xr/avatarCatalog.js';
import { RealtimeChannel } from '../src/core/realtime.js';

describe('Alice diagnostic regressions', () => {
  it('does not default to an unapproved avatar candidate', () => {
    const manifest = JSON.parse(readFileSync('public/ALICE_CHARACTER_MANIFEST.json', 'utf8'));
    expect(manifest.fallbackPolicy.defaultMayUseCandidateWithoutApproval).toBe(false);
    expect(manifest.approval.status).not.toBe('approved');

    const selected = resolveAvatarSelection('');
    expect(selected.status).not.toBe('candidate');
    expect(selected.provenance?.approved).not.toBe(false);
  });

  describe('Realtime failure cleanup', () => {
    beforeEach(() => {
      vi.useFakeTimers();

      class FakeChannel extends EventTarget {
        constructor() {
          super();
          this.readyState = 'connecting';
        }
        close() {
          this.readyState = 'closed';
          this.dispatchEvent(new Event('close'));
        }
        send() {}
      }

      class FakePeer {
        createDataChannel() { return new FakeChannel(); }
        async createOffer() { return { type: 'offer', sdp: 'fake-offer' }; }
        async setLocalDescription() {}
        async setRemoteDescription() {}
        addTrack() {}
        close() {}
      }

      vi.stubGlobal('RTCPeerConnection', FakePeer);
      vi.stubGlobal('cancelAnimationFrame', () => {});
      vi.stubGlobal('navigator', {
        mediaDevices: {
          getUserMedia: async () => ({
            getAudioTracks: () => [{ stop() {} }],
            getTracks: () => [{ stop() {} }],
          }),
        },
      });
      vi.stubGlobal('document', {
        createElement: () => ({
          autoplay: false,
          playsInline: false,
          srcObject: null,
          play: async () => {},
        }),
      });
      vi.stubGlobal('fetch', async () => ({
        ok: false,
        status: 429,
        text: async () => '{"error":"quota"}',
      }));
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    });

    it('clears the data-channel timeout when session creation fails early', async () => {
      const channel = new RealtimeChannel({ onError: () => {} });
      await expect(channel.connect()).rejects.toThrow(/realtime-session-429/);
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
