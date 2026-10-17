import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { boxFromPoints, boxToPixels, pointsToPath, toNormalised, toPixels, type Point } from './geometry';
import type { AnnotationType } from '@studyspace/shared';

export interface Annotation {
  id: string;
  page: number;
  type: AnnotationType;
  geometry: Record<string, unknown>;
  color: string;
  text: string | null;
  author_id: string;
  author?: { display_name: string } | null;
}

export type Tool = 'select' | 'highlight' | 'underline' | 'rect' | 'ellipse' | 'freehand' | 'note';

interface Props {
  annotations: Annotation[];
  tool: Tool;
  color: string;
  width: number;
  height: number;
  /** Called with the geometry for a finished annotation. */
  onCreate: (type: AnnotationType, geometry: Record<string, unknown>, text?: string) => void;
  onSelect?: (id: string | null) => void;
  selectedId?: string | null;
  readOnly?: boolean;
}

/**
 * A transparent SVG overlay that renders and captures annotations for a page or
 * image. It is presentation-only: persistence and authorization live in the
 * caller, and the same component backs both the PDF and image workspaces.
 */
export function AnnotationLayer({
  annotations,
  tool,
  color,
  width,
  height,
  onCreate,
  onSelect,
  selectedId,
  readOnly,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [start, setStart] = useState<Point | null>(null);
  const [current, setCurrent] = useState<Point | null>(null);
  const [stroke, setStroke] = useState<Point[]>([]);
  const [noteAt, setNoteAt] = useState<Point | null>(null);
  const [noteText, setNoteText] = useState('');

  const rect = { width, height };

  function normaliseEvent(e: React.PointerEvent): Point | null {
    const svg = svgRef.current;
    if (!svg) return null;
    return toNormalised(e.clientX, e.clientY, svg.getBoundingClientRect());
  }

  function onPointerDown(e: React.PointerEvent) {
    if (readOnly || tool === 'select') {
      if (tool === 'select' && e.target !== svgRef.current) onSelect?.(null);
      return;
    }
    const p = normaliseEvent(e);
    if (!p) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    if (tool === 'freehand') {
      setStroke([p]);
      setCurrent(p);
    } else if (tool === 'note') {
      setNoteAt(p);
    } else {
      setStart(p);
      setCurrent(p);
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!start && !stroke.length) return;
    const p = normaliseEvent(e);
    if (!p) return;
    if (tool === 'freehand') setStroke((s) => [...s, p]);
    setCurrent(p);
  }

  function onPointerUp() {
    if (tool === 'freehand' && stroke.length > 1) {
      onCreate('freehand', { points: stroke });
    } else if (start && current) {
      const box = boxFromPoints(start, current);
      if (box.w > 0.005 && box.h > 0.005) {
        // In this branch the tool is always one of the box shapes.
        const boxType: AnnotationType =
          tool === 'underline' ? 'underline' : tool === 'highlight' ? 'highlight' : tool === 'rect' ? 'rect' : 'ellipse';
        onCreate(boxType, { x: box.x, y: box.y, w: box.w, h: box.h });
      }
    }
    setStart(null);
    setCurrent(null);
    setStroke([]);
  }

  const draftBox = start && current ? boxToPixels(boxFromPoints(start, current), rect) : null;

  return (
    <div className="absolute inset-0">
      <svg
        ref={svgRef}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className={cn('absolute inset-0 touch-none', tool !== 'select' && !readOnly && 'cursor-crosshair')}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        role="application"
        aria-label="Annotation layer"
      >
        {annotations.map((a) => (
          <AnnotationShape
            key={a.id}
            annotation={a}
            rect={rect}
            selected={a.id === selectedId}
            onSelect={() => onSelect?.(a.id)}
          />
        ))}

        {/* Live draft while drawing */}
        {draftBox && (
          <rect
            x={draftBox.x}
            y={draftBox.y}
            width={draftBox.w}
            height={draftBox.h}
            fill={tool === 'highlight' ? color : 'transparent'}
            fillOpacity={tool === 'highlight' ? 0.3 : 0}
            stroke={color}
            strokeWidth={2}
            strokeDasharray="4 3"
          />
        )}
        {stroke.length > 1 && (
          <path d={pointsToPath(stroke, rect)} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
        )}
        {noteAt && (
          <circle cx={toPixels(noteAt, rect).x} cy={toPixels(noteAt, rect).y} r={6} fill={color} opacity={0.7} />
        )}
      </svg>

      {/* Note composer */}
      {noteAt && (
        <div
          className="glass-strong absolute z-10 w-56 rounded-xl p-3 shadow-glass"
          style={{ left: toPixels(noteAt, rect).x, top: toPixels(noteAt, rect).y }}
        >
          <textarea
            autoFocus
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Add a note…"
            className="ss-input min-h-[60px] text-sm"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              className="text-xs text-content-muted"
              onClick={() => {
                setNoteAt(null);
                setNoteText('');
              }}
            >
              Cancel
            </button>
            <button
              className="text-xs font-medium text-brand-500"
              onClick={() => {
                onCreate('note', { x: noteAt.x, y: noteAt.y }, noteText.trim());
                setNoteAt(null);
                setNoteText('');
              }}
            >
              Save note
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AnnotationShape({
  annotation,
  rect,
  selected,
  onSelect,
}: {
  annotation: Annotation;
  rect: { width: number; height: number };
  selected: boolean;
  onSelect: () => void;
}) {
  const stroke = annotation.color;
  const common = { onPointerDown: (e: React.PointerEvent) => { e.stopPropagation(); onSelect(); }, style: { cursor: 'pointer' as const } };

  if (annotation.type === 'freehand') {
    const points = (annotation.geometry as { points?: Point[] }).points ?? [];
    return <path d={pointsToPath(points, rect)} fill="none" stroke={stroke} strokeWidth={selected ? 3 : 2} strokeLinecap="round" {...common} />;
  }
  if (annotation.type === 'note') {
    const p = toPixels({ x: Number(annotation.geometry.x ?? 0), y: Number(annotation.geometry.y ?? 0) }, rect);
    return <circle cx={p.x} cy={p.y} r={7} fill={stroke} stroke={selected ? '#fff' : 'none'} strokeWidth={2} {...common} />;
  }
  const box = boxToPixels(
    {
      x: Number(annotation.geometry.x ?? 0),
      y: Number(annotation.geometry.y ?? 0),
      w: Number(annotation.geometry.w ?? 0),
      h: Number(annotation.geometry.h ?? 0),
    },
    rect,
  );
  if (annotation.type === 'ellipse') {
    return (
      <ellipse
        cx={box.x + box.w / 2}
        cy={box.y + box.h / 2}
        rx={box.w / 2}
        ry={box.h / 2}
        fill="none"
        stroke={stroke}
        strokeWidth={selected ? 3 : 2}
        {...common}
      />
    );
  }
  if (annotation.type === 'highlight') {
    return <rect x={box.x} y={box.y} width={box.w} height={box.h} fill={stroke} fillOpacity={0.3} {...common} />;
  }
  if (annotation.type === 'underline') {
    return <line x1={box.x} y1={box.y + box.h} x2={box.x + box.w} y2={box.y + box.h} stroke={stroke} strokeWidth={selected ? 3 : 2} {...common} />;
  }
  return (
    <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="none" stroke={stroke} strokeWidth={selected ? 3 : 2} {...common} />
  );
}
