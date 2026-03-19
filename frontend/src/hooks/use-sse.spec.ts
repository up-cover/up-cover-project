import { renderHook, act } from '@testing-library/react';
import { useSSE } from './useSSE';
import { getLastMockEventSource, clearMockEventSourceInstances } from '../test/setup';

// MockEventSource is globally stubbed by setup.ts

describe('useSSE', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearMockEventSourceInstances();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ---------------------------------------------------------------------------
  describe('connection lifecycle', () => {
    it('does nothing when url is null (no EventSource created)', () => {
      renderHook(() => useSSE(null, {}));
      expect(getLastMockEventSource()).toBeUndefined();
    });

    it('creates an EventSource with the given URL on mount', () => {
      renderHook(() => useSSE('/api/sse/repositories/1', {}));
      const es = getLastMockEventSource();
      expect(es).toBeDefined();
      expect(es.url).toBe('/api/sse/repositories/1');
    });

    it('registers an event listener for each key in handlers', () => {
      const addEventSpy = vi.fn();
      // We'll verify via dispatch calling handlers
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      renderHook(() => useSSE('/api/sse', { 'repo:updated': handler1, 'scan:log': handler2 }));
      const es = getLastMockEventSource();

      act(() => { es.dispatch('repo:updated', { status: 'COMPLETE' }); });
      act(() => { es.dispatch('scan:log', { line: 'done' }); });

      expect(handler1).toHaveBeenCalledWith({ status: 'COMPLETE' });
      expect(handler2).toHaveBeenCalledWith({ line: 'done' });
    });

    it('calls handler with parsed JSON data when a named event fires', () => {
      const handler = vi.fn();
      renderHook(() => useSSE('/api/sse', { 'repo:updated': handler }));
      const es = getLastMockEventSource();

      act(() => { es.dispatch('repo:updated', { id: 42, name: 'test' }); });

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith({ id: 42, name: 'test' });
    });

    it('falls back to raw data when JSON.parse fails (non-JSON message)', () => {
      const handler = vi.fn();
      renderHook(() => useSSE('/api/sse', { 'raw:event': handler }));
      const es = getLastMockEventSource();

      act(() => { es.dispatchRaw('raw:event', 'not-json'); });

      expect(handler).toHaveBeenCalledWith('not-json');
    });

    it('closes EventSource on unmount', () => {
      const { unmount } = renderHook(() => useSSE('/api/sse', {}));
      const es = getLastMockEventSource();
      const closeSpy = vi.spyOn(es, 'close');

      unmount();

      expect(closeSpy).toHaveBeenCalled();
    });

    it('does not create EventSource after unmount (active flag prevents reconnect)', () => {
      const { unmount } = renderHook(() => useSSE('/api/sse', {}));
      clearMockEventSourceInstances();
      unmount();

      // Advance timers — no reconnect should happen since active = false on unmount
      act(() => { vi.advanceTimersByTime(5000); });

      expect(getLastMockEventSource()).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  describe('reconnect on error', () => {
    it('schedules reconnect after onerror fires (3000ms delay)', () => {
      renderHook(() => useSSE('/api/sse', {}));
      const es1 = getLastMockEventSource();

      act(() => { es1.onerror?.(); });

      // Before 3 seconds — no new instance yet
      expect(getLastMockEventSource()).toBe(es1);

      act(() => { vi.advanceTimersByTime(3000); });

      // After 3 seconds — a new EventSource should be created
      const es2 = getLastMockEventSource();
      expect(es2).not.toBe(es1);
      expect(es2.url).toBe('/api/sse');
    });

    it('cancels the retry timer on unmount even if onerror fired', () => {
      const { unmount } = renderHook(() => useSSE('/api/sse', {}));
      const es1 = getLastMockEventSource();

      act(() => { es1.onerror?.(); });
      clearMockEventSourceInstances();

      unmount();

      // Advance past the 3s timeout — should NOT reconnect since unmounted
      act(() => { vi.advanceTimersByTime(5000); });

      expect(getLastMockEventSource()).toBeUndefined();
    });

    it('creates a new EventSource on reconnect with the same URL', () => {
      renderHook(() => useSSE('/api/sse/jobs/99', {}));
      const es1 = getLastMockEventSource();

      act(() => { es1.onerror?.(); });
      act(() => { vi.advanceTimersByTime(3000); });

      const es2 = getLastMockEventSource();
      expect(es2.url).toBe('/api/sse/jobs/99');
    });

    it('removes event listeners from old EventSource on onerror', () => {
      const handler = vi.fn();
      renderHook(() => useSSE('/api/sse', { 'repo:updated': handler }));
      const es1 = getLastMockEventSource();
      const removeSpy = vi.spyOn(es1, 'removeEventListener');

      act(() => { es1.onerror?.(); });

      expect(removeSpy).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  describe('handler ref stability', () => {
    it('uses the latest handlers object on event dispatch (handlersRef pattern)', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      let currentHandler = handler1;

      const { rerender } = renderHook(() =>
        useSSE('/api/sse', { 'repo:updated': currentHandler }),
      );

      // Switch the handler reference without changing the URL
      currentHandler = handler2;
      rerender();

      const es = getLastMockEventSource();
      act(() => { es.dispatch('repo:updated', { id: 1 }); });

      // handler2 should be called (latest ref), not handler1
      expect(handler2).toHaveBeenCalledWith({ id: 1 });
      expect(handler1).not.toHaveBeenCalled();
    });

    it('does not re-create EventSource when only handlers reference changes (url unchanged)', () => {
      const { rerender } = renderHook(() =>
        useSSE('/api/sse', { 'repo:updated': vi.fn() }),
      );

      const es1 = getLastMockEventSource();
      clearMockEventSourceInstances();

      // Re-render with new handler object but same URL
      rerender();

      // No new EventSource should be created
      expect(getLastMockEventSource()).toBeUndefined();
      // The original es1 is still the active one
      expect(es1.url).toBe('/api/sse');
    });
  });

  // ---------------------------------------------------------------------------
  describe('URL changes', () => {
    it('closes EventSource and creates a new one when url changes', () => {
      let url = '/api/sse/1';
      const { rerender } = renderHook(() => useSSE(url, {}));
      const es1 = getLastMockEventSource();
      const closeSpy = vi.spyOn(es1, 'close');

      url = '/api/sse/2';
      rerender();

      expect(closeSpy).toHaveBeenCalled();
      const es2 = getLastMockEventSource();
      expect(es2).not.toBe(es1);
      expect(es2.url).toBe('/api/sse/2');
    });

    it('stops the connection when url changes to null', () => {
      let url: string | null = '/api/sse/1';
      const { rerender } = renderHook(() => useSSE(url, {}));
      const es1 = getLastMockEventSource();
      const closeSpy = vi.spyOn(es1, 'close');

      url = null;
      rerender();

      expect(closeSpy).toHaveBeenCalled();
      clearMockEventSourceInstances();
      act(() => { vi.advanceTimersByTime(5000); });
      expect(getLastMockEventSource()).toBeUndefined();
    });
  });
});
