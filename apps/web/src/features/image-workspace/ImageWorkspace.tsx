import { useRef, useState } from 'react';
import {
  Circle as CircleIcon,
  Highlighter,
  Maximize2,
  Minus,
  Pencil,
  Square,
  StickyNote,
  Trash2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { AnnotationLayer, type Tool } from '@/features/annotations/AnnotationLayer';
import { useAnnotations } from '@/features/annotations/useAnnotations';
import { Button } from '@/components/ui/Button';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

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

/**
 * Image study workspace. Annotations use the same normalised coordinate system
 * as the PDF workspace, so they stay aligned when the image is zoomed or the
 * viewport is resized.
 */
export function ImageWorkspace({ fileId, fileUrl, roomId = null, title }: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [color, setColor] = useState<string>(COLORS[0] ?? '#facc15');
  const [selected, setSelected] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [size, setSize] = useState({ width: 0, height: 0 });

  const { list, create, remove } = useAnnotations(fileId, roomId);

  return (
    <div className="flex h-full flex-col">
      <div className="glass flex flex-wrap items-center gap-2 border-b border-surface-border px-3 py-2">
        <Button size="icon" variant="ghost" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}>
          <ZoomOut className="h-4 w-4" aria-hidden="true" />
        </Button>
        <span className="text-sm tabular-nums">{Math.round(zoom * 100)}%</span>
        <Button size="icon" variant="ghost" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(5, z + 0.25))}>
          <ZoomIn className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button size="icon" variant="ghost" aria-label="Reset zoom" onClick={() => setZoom(1)}>
          <Maximize2 className="h-4 w-4" aria-hidden="true" />
        </Button>

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
            onClick={() => selected && remove.mutate(selected)}
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

      <div className="flex-1 overflow-auto ss-scroll bg-surface-muted/40 p-4">
        <div className="relative mx-auto" style={{ width: size.width * zoom, height: size.height * zoom }}>
          <img
            ref={imgRef}
            src={fileUrl}
            alt={title ?? 'Study image'}
            onLoad={(e) => {
              const el = e.currentTarget;
              setSize({ width: el.naturalWidth, height: el.naturalHeight });
            }}
            className="block max-w-full rounded-lg shadow-glass"
            style={{ width: size.width * zoom, height: size.height * zoom }}
          />
          {size.width > 0 && (
            <AnnotationLayer
              annotations={list.data ?? []}
              tool={tool}
              color={color}
              width={size.width * zoom}
              height={size.height * zoom}
              selectedId={selected}
              onSelect={setSelected}
              onCreate={(type, geometry, text) => create.mutate({ page: 1, type, geometry, color, text })}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default ImageWorkspace;
