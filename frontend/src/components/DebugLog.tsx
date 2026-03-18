import { useEffect, useRef, useState } from 'react';

interface DebugLogProps {
  lines: string[];
}

export function DebugLog({ lines }: DebugLogProps) {
  const [open, setOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-expand on first log line
  useEffect(() => {
    if (lines.length === 1) {
      setOpen(true);
    }
  }, [lines.length]);

  // Auto-scroll to bottom when new lines arrive
  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [lines, open]);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-xs text-gray-400 hover:text-gray-600 select-none"
      >
        {open ? '▾' : '▸'} Debug log ({lines.length} lines)
      </button>
      {open && (
        <div className="mt-1 rounded bg-black max-h-64 overflow-y-auto">
          <div className="p-2 space-y-0.5">
            {lines.map((line, i) => (
              <p key={i} className="font-mono text-xs text-green-400 whitespace-pre-wrap leading-snug">
                &gt; {line}
              </p>
            ))}
            <div ref={bottomRef} />
          </div>
        </div>
      )}
    </div>
  );
}
