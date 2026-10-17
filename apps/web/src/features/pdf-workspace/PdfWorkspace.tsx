import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  ChevronLeft,
  ChevronRight,
  Eraser,
  Highlighter,
  Maximize2,
  Pencil,
  Square,
  Circle as CircleIcon,
  StickyNote,
  Minus,
  Plus,
  Trash2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { AnnotationLayer, type Tool } from '@/features/annotations/AnnotationLayer';
import { useAnnotations } from '@/features/annotations/useAnnotations';
import { Button } from '@/components/ui/Button';
import { Spinner, EmptyState } from '@/components/ui/Feedback';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

interface Props {
  fileId: string;
  fileUrl: string;
  roomId?: string | null;
  title?: string;
}

const TOOLS: { tool: Tool; label: string; Icon: LucideIcon }[] = [
  { tool: 'select', label: 'Select', Icon: Pencil },
  { tool: 'highlight', label: 'Highlight', Icon: Highlighter },
  { tool: 'underline', label: 'Underline', Icon: Minus },
  { tool: 'rect', label: 'Rectangle', Icon: Square },
  { tool: 'ellipse', label: 'Ellipse', Icon: CircleIcon },
  { tool: 'freehand', label: 'Draw', Icon: Pencil },
  { tool: 'note', label: 'Note', Icon: StickyNote },
];

const COLORS = ['#facc15', '#22c55e', '#3b82f6', '#ef4444', '#a855f7'];

export function PdfWorkspace({ fileId, fileUrl, roomId = null, title }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.2);
  const [tool, setTool] = useState<Tool>('select');
  const [color, setColor] = useState<string>(COLORS[0] ?? '#facc15');
  const [selected, setSelected] = useState<string | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [error, setError] = useState<string | null>(null);

  const { list, create, remove } = useAnnotations(fileId, roomId);

  // Load the document once.
  useEffect(() => {
    let cancelled = false;
    setDoc(null);
    setError(null);
    const task = pdfjsLib.getDocument({ url: fileUrl });
    task.promise
      .then((d) => {
        if (cancelled) return;
        setDoc(d);
        setNumPages(d.numPages);
        setPage(1);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message || 'This PDF could not be opened.');
      });
    return () => {
      cancelled = true;
      void task.destroy();
    };
  }, [fileUrl]);

  // Render the current page to the canvas.
  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    void (async () => {
      const p = await doc.getPage(page);
      const viewport = p.getViewport({ scale });
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = viewport.width * dpr;
      canvas.height = viewport.height * dpr;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      setSize({ width: viewport.width, height: viewport.height });
      await p.render({ canvasContext: ctx, viewport }).promise;
    })();
    return () => {
      cancelled = true;
    };
  }, [doc, page, scale]);

  const pageAnnotations = (list.data ?? []).filter((a) => a.page === page);

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="glass flex flex-wrap items-center gap-2 border-b border-surface-border px-3 py-2">
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <span className="text-sm tabular-nums">
            {page} / {numPages || '—'}
          </span>
          <Button size="icon" variant="ghost" aria-label="Next page" disabled={page >= numPages} onClick={() => setPage((p) => Math.min(numPages, p + 1))}>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" aria-label="Zoom out" onClick={() => setScale((s) => Math.max(0.5, s - 0.2))}>
            <ZoomOut className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button size="icon" variant="ghost" aria-label="Zoom in" onClick={() => setScale((s) => Math.min(4, s + 0.2))}>
            <ZoomIn className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Fit to width"
            onClick={() => {
              const w = wrapRef.current?.clientWidth ?? 0;
              if (w) setScale(Math.max(0.5, (w - 32) / (size.width / scale)));
            }}
          >
            <Maximize2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        <div className="mx-1 h-6 w-px bg-surface-border" />

        <div className="flex flex-wrap items-center gap-1" role="toolbar" aria-label="Annotation tools">
          {TOOLS.map(({ tool: t, label, Icon }) => (
            <button
              key={t}
              onClick={() => setTool(t)}
              aria-label={label}
              aria-pressed={tool === t}
              title={label}
              className={cn('rounded-lg p-2 transition', tool === t ? 'bg-brand-600 text-white' : 'text-content-muted hover:bg-surface-muted')}
            >
              <Icon className="h-4 w-4" aria-hidden={true} />
            </button>
          ))}
          <button
            onClick={() => {
              if (selected) remove.mutate(selected);
            }}
            disabled={!selected}
            aria-label="Delete selected annotation"
            className="rounded-lg p-2 text-content-muted hover:bg-surface-muted disabled:opacity-40"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex items-center gap-1" role="radiogroup" aria-label="Colour">
          {COLORS.map((c) => (
            <button
              key={c}
              role="radio"
              aria-checked={color === c}
              aria-label={`Colour ${c}`}
              onClick={() => setColor(c)}
              className={cn('h-5 w-5 rounded-full border-2', color === c ? 'border-content' : 'border-transparent')}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>

        <span className="ml-auto text-xs text-content-muted">{title}</span>
      </div>

      {/* Page */}
      <div ref={wrapRef} className="flex-1 overflow-auto ss-scroll bg-surface-muted/40 p-4">
        {error ? (
          <EmptyState icon={Eraser} title="Couldn't open this PDF" description={error} />
        ) : !doc ? (
          <div className="grid h-full place-items-center">
            <Spinner className="h-6 w-6" />
          </div>
        ) : (
          <div className="relative mx-auto" style={{ width: size.width, height: size.height }}>
            <canvas ref={canvasRef} className="block rounded-lg shadow-glass" />
            <AnnotationLayer
              annotations={pageAnnotations}
              tool={tool}
              color={color}
              width={size.width}
              height={size.height}
              selectedId={selected}
              onSelect={setSelected}
              onCreate={(type, geometry, text) => create.mutate({ page, type, geometry, color, text })}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default PdfWorkspace;
