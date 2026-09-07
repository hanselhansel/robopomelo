import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
export function Preview({ id, name }: { id: string; name: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setFailed(false);
    void (async () => {
      const response = await api.raw(
        `/api/attachments/previews/${encodeURIComponent(id)}`,
        undefined,
        true,
        undefined,
        controller.signal,
      );
      if (!response.ok || !response.headers.get('content-type')?.startsWith('image/png'))
        throw new Error('Preview unavailable');
      const bitmap = await createImageBitmap(await response.blob());
      try {
        if (controller.signal.aborted || !canvas.current) return;
        canvas.current.width = bitmap.width;
        canvas.current.height = bitmap.height;
        const context = canvas.current.getContext('2d');
        if (!context) throw new Error('Preview unavailable');
        context.drawImage(bitmap, 0, 0);
      } finally {
        bitmap.close();
      }
    })().catch(() => {
      if (!controller.signal.aborted) setFailed(true);
    });
    return () => controller.abort();
  }, [id]);
  return failed ? (
    <p className="help">Preview unavailable. The selected file is retained.</p>
  ) : (
    <canvas className="intake-preview" ref={canvas} role="img" aria-label={`Local preview of ${name}`} />
  );
}
