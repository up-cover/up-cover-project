import '@testing-library/jest-dom/vitest';

/**
 * MockEventSource — replaces the browser's EventSource which jsdom doesn't implement.
 *
 * Tests can call `instance.dispatch(type, data)` to simulate a named SSE event,
 * or set `instance.onerror()` to simulate a connection error.
 */
class MockEventSource {
  static instances: MockEventSource[] = [];

  onerror: ((e?: Event) => void) | null = null;

  private listeners = new Map<string, Array<(e: MessageEvent) => void>>();

  constructor(public readonly url: string) {
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, fn: (e: MessageEvent) => void) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type)!.push(fn);
  }

  removeEventListener(type: string, fn: (e: MessageEvent) => void) {
    const fns = this.listeners.get(type);
    if (!fns) return;
    const idx = fns.indexOf(fn);
    if (idx !== -1) fns.splice(idx, 1);
  }

  close() {
    this.listeners.clear();
  }

  /** Test helper: dispatch a named SSE event with JSON-serialised data. */
  dispatch(type: string, data: unknown) {
    const fns = this.listeners.get(type) ?? [];
    const event = { data: JSON.stringify(data) } as MessageEvent;
    for (const fn of fns) fn(event);
  }

  /** Test helper: dispatch a named SSE event with raw string data. */
  dispatchRaw(type: string, rawData: string) {
    const fns = this.listeners.get(type) ?? [];
    const event = { data: rawData } as MessageEvent;
    for (const fn of fns) fn(event);
  }
}

vi.stubGlobal('EventSource', MockEventSource);

/** Helper to get the most recently created MockEventSource instance. */
export function getLastMockEventSource(): MockEventSource {
  return MockEventSource.instances[MockEventSource.instances.length - 1];
}

/** Helper to clear the MockEventSource instance list between tests. */
export function clearMockEventSourceInstances() {
  MockEventSource.instances.length = 0;
}

beforeEach(() => {
  clearMockEventSourceInstances();
});
