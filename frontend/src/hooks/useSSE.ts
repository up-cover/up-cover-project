import { useEffect, useRef } from 'react';

/**
 * useSSE — wraps EventSource with automatic reconnection.
 *
 * @param url    SSE endpoint URL, or null to disable the connection.
 * @param handlers  Map of SSE event name → callback receiving the parsed JSON data.
 *
 * Usage:
 *   useSSE(`/api/sse/repositories/${id}`, {
 *     'repo:updated': (data) => setRepo(r => ({ ...r, ...(data as Partial<Repository>) })),
 *     'scan:log':     (data) => console.log((data as { line: string }).line),
 *   });
 */
export function useSSE(
  url: string | null,
  handlers: Record<string, (data: unknown) => void> = {},
): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!url) return;

    let active = true;
    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (!active) return;

      es = new EventSource(url);

      // Register a listener for each named event in handlers
      const registered: Array<[string, EventListenerOrEventListenerObject]> = [];
      for (const eventType of Object.keys(handlersRef.current)) {
        const listener = (e: Event) => {
          const handler = handlersRef.current[eventType];
          if (!handler) return;
          try {
            handler(JSON.parse((e as MessageEvent).data));
          } catch {
            handler((e as MessageEvent).data);
          }
        };
        es.addEventListener(eventType, listener);
        registered.push([eventType, listener]);
      }

      es.onerror = () => {
        for (const [type, fn] of registered) {
          es?.removeEventListener(type, fn);
        }
        es?.close();
        es = null;
        if (active) {
          retryTimer = setTimeout(connect, 3000);
        }
      };
    };

    connect();

    return () => {
      active = false;
      if (retryTimer !== null) clearTimeout(retryTimer);
      es?.close();
    };
  }, [url]);
}
