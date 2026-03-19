import { SseEmitter } from './sse-emitter.service';
import { MessageEvent } from '@nestjs/common';

describe('SseEmitter', () => {
  let emitter: SseEmitter;

  beforeEach(() => {
    emitter = new SseEmitter();
  });

  describe('subscribe', () => {
    it('returns an Observable for the given key', () => {
      const obs = emitter.subscribe('repo-1');
      expect(obs).toBeDefined();
      expect(typeof obs.subscribe).toBe('function');
    });

    it('creates a subject on first subscribe for a key', () => {
      // Should not throw; calling subscribe twice for same key returns same observable chain
      expect(() => emitter.subscribe('new-key')).not.toThrow();
    });
  });

  describe('emit', () => {
    it('delivers an event to a subscriber for the matching key', (done) => {
      const obs = emitter.subscribe('repo-1');
      obs.subscribe((event: MessageEvent) => {
        expect(event.type).toBe('repo:updated');
        expect(event.data).toEqual({ status: 'COMPLETE' });
        done();
      });

      emitter.emit('repo-1', 'repo:updated', { status: 'COMPLETE' });
    });

    it('does not deliver to a different key', () => {
      const received: MessageEvent[] = [];
      emitter.subscribe('repo-2').subscribe((e) => received.push(e));

      emitter.emit('repo-1', 'repo:updated', 'data');

      expect(received).toHaveLength(0);
    });

    it('is a no-op when no subscriber exists for the key', () => {
      expect(() => emitter.emit('nonexistent', 'event', 'data')).not.toThrow();
    });

    it('delivers string data as-is', (done) => {
      emitter.subscribe('key').subscribe((event: MessageEvent) => {
        expect(event.data).toBe('plain string');
        done();
      });

      emitter.emit('key', 'message', 'plain string');
    });

    it('delivers to multiple subscribers on the same key', () => {
      const received1: MessageEvent[] = [];
      const received2: MessageEvent[] = [];

      emitter.subscribe('key').subscribe((e) => received1.push(e));
      emitter.subscribe('key').subscribe((e) => received2.push(e));

      emitter.emit('key', 'event', { value: 42 });

      expect(received1).toHaveLength(1);
      expect(received2).toHaveLength(1);
    });
  });

  describe('subscribe (lazy creation)', () => {
    it('subscribe before emit still receives the emitted value', () => {
      const received: MessageEvent[] = [];
      emitter.subscribe('lazy').subscribe((e) => received.push(e));
      emitter.emit('lazy', 'test', 'hello');
      expect(received).toHaveLength(1);
    });

    it('emit before subscribe does not deliver (no buffering)', () => {
      emitter.emit('nobuffer', 'test', 'hello');

      const received: MessageEvent[] = [];
      emitter.subscribe('nobuffer').subscribe((e) => received.push(e));

      // No event buffered — received remains empty
      expect(received).toHaveLength(0);
    });
  });
});
