import { useEffect, useRef, useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { ensurePdfjsWorker } from '@/lib/pdfjs-worker';

interface PdfThumbnailProps {
  url: string;
  alt?: string;
  className?: string;
  onClick?: () => void;
  /** Maximum width for the rendered thumbnail canvas (default 300) */
  maxWidth?: number;
}

/**
 * Renders the first page of a PDF as an image thumbnail using pdfjs-dist.
 * Falls back to a generic icon if rendering fails.
 */
export function PdfThumbnail({
  url,
  alt = 'PDF',
  className = '',
  onClick,
  maxWidth = 300,
}: PdfThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    if (!url) {
      setState('error');
      return;
    }

    let cancelled = false;

    const render = async () => {
      try {
        ensurePdfjsWorker();

        const pdfjsLib = await import('pdfjs-dist');
        const loadingTask = pdfjsLib.getDocument({ url, disableAutoFetch: true, disableStream: true });
        const pdf = await loadingTask.promise;

        if (cancelled) return;

        const page = await pdf.getPage(1);
        const unscaledViewport = page.getViewport({ scale: 1 });
        const scale = Math.min(maxWidth / unscaledViewport.width, 2); // cap at 2x for retina
        const viewport = page.getViewport({ scale });

        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          setState('error');
          return;
        }

        await page.render({ canvasContext: ctx, viewport }).promise;

        if (!cancelled) {
          setState('ready');
        }
      } catch (err) {
        console.warn('PdfThumbnail render failed:', err);
        if (!cancelled) setState('error');
      }
    };

    setState('loading');
    render();

    return () => {
      cancelled = true;
    };
  }, [url, maxWidth]);

  if (state === 'error') {
    return (
      <div
        className={`flex items-center justify-center bg-muted ${className}`}
        onClick={onClick}
        role={onClick ? 'button' : undefined}
        style={{ cursor: onClick ? 'pointer' : undefined }}
      >
        <FileText className="h-12 w-12 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div
      className={`relative ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      style={{ cursor: onClick ? 'pointer' : undefined }}
    >
      {state === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
      <canvas
        ref={canvasRef}
        className="w-full h-full object-contain"
        style={{ display: state === 'ready' ? 'block' : 'none' }}
        aria-label={alt}
      />
    </div>
  );
}
