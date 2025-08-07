import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Project, Note, Ratio } from "../model/project";
import { ratioToFloat } from "../utils/ratio";
import { playTone } from "../audio/engine";
import { Rnd } from "react-rnd";

interface PianoRollProps {
  project: Project;
  setProject: (p: Project) => void;
  channelId: string;
}

const BEAT_PX = 48; // pixels per beat
const ROW_PX = 32;  // pixels per pitch row

export default function PianoRoll({ project, setProject, channelId }: PianoRollProps) {
  const channel = project.channels.find((c) => c.id === channelId);
  if (!channel) return <div>Channel not found</div>;

  // Unique pitch rows (highest ratio -> top)
  const pitchRows: Ratio[] = useMemo(() => {
    const uniq = new Map<number, Ratio>();
    for (const n of channel.notes) {
      uniq.set(ratioToFloat(n.ratio), n.ratio);
    }
    return [...uniq.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, r]) => r);
  }, [channel.notes]);

  const getY = (ratio: Ratio) =>
    pitchRows.findIndex((r) => r.num === ratio.num && r.den === ratio.den);

  // --- Selection state ---
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const toggleSelect = (i: number, additive: boolean) =>
    setSelected((prev) => {
      const next = new Set(additive ? prev : []);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  // --- Marquee (right mouse) ---
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [marquee, setMarquee] = useState<{ active: boolean; x: number; y: number; w: number; h: number }>({
    active: false,
    x: 0,
    y: 0,
    w: 0,
    h: 0,
  });

  const beginMarquee = (clientX: number, clientY: number) => {
    const rect = containerRef.current!.getBoundingClientRect();
    setMarquee({ active: true, x: clientX - rect.left, y: clientY - rect.top, w: 0, h: 0 });
    const onMove = (e: MouseEvent) => {
      const r = containerRef.current!.getBoundingClientRect();
      const w = e.clientX - r.left - marquee.x;
      const h = e.clientY - r.top - marquee.y;
      setMarquee((m) => ({ ...m, w, h }));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove, true);
      window.removeEventListener("mouseup", onUp, true);
      // Compute selection
      const rx = Math.min(marquee.x, marquee.x + marquee.w);
      const ry = Math.min(marquee.y, marquee.y + marquee.h);
      const rw = Math.abs(marquee.w);
      const rh = Math.abs(marquee.h);
      const rRight = rx + rw;
      const rBottom = ry + rh;

      // pick notes whose rect intersects the marquee
      const hits = new Set<number>();
      channel.notes.forEach((note, i) => {
        const nx = note.start * BEAT_PX;
        const ny = getY(note.ratio) * ROW_PX;
        const nw = note.duration * BEAT_PX;
        const nh = ROW_PX - 6;
        const nRight = nx + nw;
        const nBottom = ny + nh;
        const overlap = !(nRight < rx || nx > rRight || nBottom < ry || ny > rBottom);
        if (overlap) hits.add(i);
      });
      setSelected(hits);
      setMarquee({ active: false, x: 0, y: 0, w: 0, h: 0 });
    };
    window.addEventListener("mousemove", onMove, true);
    window.addEventListener("mouseup", onUp, true);
  };

  const onContainerContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!containerRef.current) return;
    beginMarquee(e.clientX, e.clientY);
  };

  // Expose project for dev
  useEffect(() => {
    (window as any).project = project;
  }, [project]);

  // --- Updates ---
  const updateNote = (noteIndex: number, patch: Partial<Note>) => {
    setProject({
      ...project,
      channels: project.channels.map((ch) =>
        ch.id === channelId
          ? {
              ...ch,
              notes: ch.notes.map((n, i) => (i === noteIndex ? { ...n, ...patch } : n)),
            }
          : ch
      ),
    });
  };

  const moveOrResizeSelected = (mutate: (n: Note) => Note) => {
    setProject({
      ...project,
      channels: project.channels.map((ch) =>
        ch.id === channelId
          ? {
              ...ch,
              notes: ch.notes.map((n, i) => (selected.has(i) ? mutate(n) : n)),
            }
          : ch
      ),
    });
  };

  // Grid ruler (simple)
  const totalBeats =
    Math.max(16, Math.ceil(Math.max(0, ...channel.notes.map((n) => n.start + n.duration))));
  const widthPx = totalBeats * BEAT_PX;
  const heightPx = Math.max(ROW_PX * Math.max(pitchRows.length, 4), 200);

  return (
    <div>
      {/* Ruler */}
      <div className="flex gap-0.5 mb-2 text-xs text-neutral-400 font-mono select-none overflow-x-auto">
        <div style={{ width: widthPx }}>
          {Array.from({ length: totalBeats + 1 }).map((_, i) => (
            <div
              key={i}
              className="inline-block text-center"
              style={{ width: BEAT_PX }}
              title={`Beat ${i}`}
            >
              {i}
            </div>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div
        ref={containerRef}
        className="relative border border-neutral-700 bg-neutral-800 rounded overflow-auto cursor-default"
        style={{ width: "100%", height: heightPx }}
        onContextMenu={onContainerContextMenu}
      >
        {/* Horizontal rows */}
        {pitchRows.map((r, row) => (
          <div
            key={`${r.num}/${r.den}`}
            className="absolute border-t border-neutral-700/50 text-xs text-neutral-500 pl-1 select-none"
            style={{ top: row * ROW_PX, left: 0, width: widthPx, height: ROW_PX }}
          >
            {r.num}/{r.den}
          </div>
        ))}

        {/* Vertical beat lines */}
        {Array.from({ length: totalBeats + 1 }).map((_, i) => (
          <div
            key={`v-${i}`}
            className={`absolute ${i % 4 === 0 ? "border-l-neutral-600/70" : "border-l-neutral-700/40"}`}
            style={{ left: i * BEAT_PX, top: 0, height: heightPx, borderLeftWidth: 1 }}
          />
        ))}

        {/* Notes */}
        {channel.notes.map((note, i) => {
          const x = note.start * BEAT_PX;
          const y = getY(note.ratio) * ROW_PX;
          const w = Math.max(0.25 * BEAT_PX, note.duration * BEAT_PX);
          const h = ROW_PX - 6;
          const isSel = selected.has(i);

          return (
            <Rnd
              key={i}
              bounds="parent"
              position={{ x, y }}
              size={{ width: w, height: h }}
              dragAxis="x"
              enableResizing={{ left: true, right: true, top: false, bottom: false }}
              dragGrid={[BEAT_PX / 4, ROW_PX]}       // 16th notes & whole rows
              resizeGrid={[BEAT_PX / 4, ROW_PX]}
              onDragStart={(e) => {
                // left click to select / shift-add
                if ((e as MouseEvent).button === 0) {
                  toggleSelect(i, (e as MouseEvent).shiftKey);
                }
              }}
              onDragStop={(_, d) => {
                const newStart = Math.max(0, Math.round(d.x / (BEAT_PX / 4)) / 4);
                if (selected.size > 1 && selected.has(i)) {
                  // Move all selected by delta (snap already applied)
                  const delta = newStart - note.start;
                  moveOrResizeSelected((n) => ({ ...n, start: Math.max(0, n.start + delta) }));
                } else {
                  updateNote(i, { start: newStart });
                }
              }}
              onResizeStop={(_, __, ref, ___, pos) => {
                const snappedStart = Math.max(0, Math.round(pos.x / (BEAT_PX / 4)) / 4);
                const snappedDur = Math.max(0.25, Math.round(ref.offsetWidth / (BEAT_PX / 4)) / 4);
                if (selected.size > 1 && selected.has(i)) {
                  // Resize by delta width at right edge; left resize handled per‑note
                  const deltaDur = snappedDur - note.duration;
                  moveOrResizeSelected((n) => ({ ...n, duration: Math.max(0.25, n.duration + deltaDur) }));
                } else {
                  updateNote(i, { start: snappedStart, duration: snappedDur });
                }
              }}
              className={`absolute rounded px-1 flex items-center text-xs select-none ${
                isSel ? "bg-blue-400 ring-2 ring-blue-200" : "bg-blue-600 hover:bg-blue-500"
              } text-white`}
              title={`start=${note.start} dur=${note.duration}`}
              onDoubleClick={() =>
                playTone(project.tuningRootHz, note.ratio, note.duration, note.velocity)
              }
            >
              {note.ratio.num}/{note.ratio.den}
            </Rnd>
          );
        })}

        {/* Marquee rectangle */}
        {marquee.active && (
          <div
            className="absolute pointer-events-none border border-blue-300/80 bg-blue-400/10"
            style={{
              left: Math.min(marquee.x, marquee.x + marquee.w),
              top: Math.min(marquee.y, marquee.y + marquee.h),
              width: Math.abs(marquee.w),
              height: Math.abs(marquee.h),
            }}
          />
        )}
      </div>
    </div>
  );
}
