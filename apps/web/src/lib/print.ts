import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
export function usePrintMode(enabled: boolean) {
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const before = () => flushSync(() => setPrinting(true)),
      after = () => flushSync(() => setPrinting(false));
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    const media = typeof window.matchMedia === 'function' ? window.matchMedia('print') : null;
    const change = () => (media?.matches ? before() : after());
    media?.addEventListener('change', change);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
      media?.removeEventListener('change', change);
    };
  }, [enabled]);
  return printing;
}
