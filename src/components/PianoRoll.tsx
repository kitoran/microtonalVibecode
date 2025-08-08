import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Project, Note, Ratio } from "../model/project";
import { divideRatios } from "../utils/ratio";
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

  // --- Pitch rows (use channel tuning) ---
  const tuningRows = channel.tuning;

  const [minLog, maxLog] = useMemo(() => {
    if (tuningRows.length === 0) return [0, 1] as const;
    const logs = tuningRows.map((t) => Math.log(t.ratio.num / t.ratio.den));
    return [Math.min(...logs), Math.max(...logs)] as const;
  }, [tuningRows]);

  // Map a ratio to a vertical unit position proportional to log(ratio),
  // normalized such that maxLog -> 0 (top) and minLog -> span (bottom).
  const getY = (ratio: Ratio) => {
    const val = Math.log(ratio.num / ratio.den);
    const range = maxLog - minLog || 1;
    const scaled = (maxLog - val) / range; // 0..1 where larger ratio is closer to 0 (top)
    const span = Math.max(tuningRows.length - 1, 1);
    return scaled * span;
  };

  // --- Selection ---
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const toggleSelect = (i: number, additive: boolean) =>
    setSelected((prev) => {
      const next = new Set(additive ? prev : []);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  // --- Fundamental ---
  const [fundamental, setFundamental] = useState<Ratio | null>(null);

  // --- Transport / timeline state ---
  const [playheadBeat, setPlayheadBeat] = useState<number>(0);
  const [timeSelection, setTimeSelection] = useState<{ start: number; end: number } | null>(null);

  // --- Marquee ---
  const containerRef = useRef<HTMLDivElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const [marquee, setMarquee] = useState<{ active: boolean; x: number; y: number; w: number; h: number }>({
    active: false, x: 0, y: 0, w: 0, h: 0
  });

  const beginMarquee = (clientX: number, clientY: number) => {
    const rect = containerRef.current!.getBoundingClientRect();
    let marqueeState = { x: clientX - rect.left, y: clientY - rect.top, w: 0, h: 0 };
    setMarquee({ active: true, ...marqueeState });

    let dragStartedInside =
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom;

    const onMove = (e: MouseEvent) => {
      const r = containerRef.current!.getBoundingClientRect();
      marqueeState = {
        ...marqueeState,
        w: e.clientX - r.left - marqueeState.x,
        h: e.clientY - r.top - marqueeState.y
      };
      setMarquee((m) => ({
        ...m,
        w: marqueeState.w,
        h: marqueeState.h
      }));
    };

    const onUp = (e: MouseEvent) => {
      window.removeEventListener("mousemove", onMove, true);
      window.removeEventListener("mouseup", onUp, true);
      // Use the latest marqueeState for selection
      const rx = Math.min(marqueeState.x, marqueeState.x + marqueeState.w);
      const ry = Math.min(marqueeState.y, marqueeState.y + marqueeState.h);
      const rw = Math.abs(marqueeState.w);
      const rh = Math.abs(marqueeState.h); 
      const rRight = rx + rw;
      const rBottom = ry + rh;

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

      // Always prevent context menu after drag-select
      document.addEventListener("contextmenu", (ev) => ev.preventDefault(), { capture: true, once: true });
    };

    window.addEventListener("mousemove", onMove, true);
    window.addEventListener("mouseup", onUp, true);
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!containerRef.current) return;
    beginMarquee(e.clientX, e.clientY);
  };

  // --- Timeline interaction (playhead and time selection) ---
  const beginTimelineGesture = (clientX: number) => {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const snap = (xPx: number) => Math.max(0, Math.round((xPx / (BEAT_PX / 4))) / 4);
    const anchorBeat = snap(clientX - rect.left);
    let moved = false;
    let currentSel = { start: anchorBeat, end: anchorBeat };
    setTimeSelection(currentSel);

    const onMove = (e: MouseEvent) => {
      if (!timelineRef.current) return;
      const r = timelineRef.current.getBoundingClientRect();
      const bx = snap(e.clientX - r.left);
      moved = moved || Math.abs(bx - anchorBeat) >= 0.01;
      currentSel = { start: Math.min(anchorBeat, bx), end: Math.max(anchorBeat, bx) };
      setTimeSelection(currentSel);
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove, true);
      window.removeEventListener("mouseup", onUp, true);
      if (!moved) {
        setTimeSelection(null);
        setPlayheadBeat(anchorBeat);
      } else {
        setPlayheadBeat(currentSel.start);
      }
    };

    window.addEventListener("mousemove", onMove, true);
    window.addEventListener("mouseup", onUp, true);
  };

  // --- Add note on empty left-click ---
  const handleGridClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".note")) return; // clicked a note
    if (e.button !== 0) return; // only left click
    const rect = containerRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const yPx = e.clientY - rect.top;
    const start = Math.floor(x / (BEAT_PX / 4)) / 4;
    const yUnits = yPx / ROW_PX;
    let nearestIdx = 0;
    let best = Infinity;
    tuningRows.forEach((t, idx) => {
      const dy = Math.abs(getY(t.ratio) - yUnits);
      if (dy < best) { best = dy; nearestIdx = idx; }
    });
    const ratio = tuningRows[nearestIdx]?.ratio || { num: 1, den: 1 };

    const newNote: Note = { start, duration: 1, ratio, velocity: 1.0 };
    setProject({
      ...project,
      channels: project.channels.map((ch) =>
        ch.id === channelId ? { ...ch, notes: [...ch.notes, newNote] } : ch
      ),
    });
  };

  // --- Delete selected notes ---
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        setProject({
          ...project,
          channels: project.channels.map((ch) =>
            ch.id === channelId
              ? { ...ch, notes: ch.notes.filter((_, i) => !selected.has(i)) }
              : ch
          ),
        });
        setSelected(new Set());
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [project, selected, channelId, setProject]);

  // --- Update note helper ---
  const updateNote = (noteIndex: number, patch: Partial<Note>) => {
    setProject({
      ...project,
      channels: project.channels.map((ch) =>
        ch.id === channelId
          ? { ...ch, notes: ch.notes.map((n, i) => (i === noteIndex ? { ...n, ...patch } : n)) }
          : ch
      ),
    });
  };

  // --- Layout sizes ---
  const totalBeats = Math.max(16, Math.ceil(Math.max(0, ...channel.notes.map((n) => n.start + n.duration))));
  const widthPx = totalBeats * BEAT_PX;
  const heightPx = ROW_PX * Math.max(tuningRows.length, 4);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Ruler */}
      <div className="flex gap-0.5 mb-1 text-xs text-neutral-400 font-mono select-none overflow-x-auto">
        <div className="whitespace-nowrap" style={{ width: widthPx }}>
          {Array.from({ length: totalBeats + 1 }).map((_, i) => (
            <div key={i} className="inline-block text-center" style={{ width: BEAT_PX }}>
              {i}
            </div>
          ))}
        </div>
      </div>

      {/* Timeline bar */}
      <div className="mb-2">
        <div
          className="relative h-6 border border-neutral-700 bg-neutral-800 rounded overflow-x-auto"
          onMouseDown={(e) => beginTimelineGesture(e.clientX)}
          title="Click to set playhead. Drag to select time interval."
        >
          <div ref={timelineRef} className="relative" style={{ width: widthPx, height: "100%" }}>
            {/* Selection */}
            {timeSelection && (
              <div
                className="absolute pointer-events-none bg-blue-400/20"
                style={{
                  left: timeSelection.start * BEAT_PX,
                  width: Math.max(0, (timeSelection.end - timeSelection.start)) * BEAT_PX,
                  top: 0,
                  bottom: 0,
                }}
              />
            )}
            {/* Beat lines */}
            {Array.from({ length: totalBeats + 1 }).map((_, i) => (
              <div
                key={`tl-${i}`}
                className={`absolute ${i % 4 === 0 ? "bg-neutral-600/70" : "bg-neutral-700/40"}`}
                style={{ left: i * BEAT_PX, top: 0, bottom: 0, width: 1 }}
              />
            ))}
            {/* Playhead */}
            <div
              className="absolute pointer-events-none border-l-2 border-red-400"
              style={{ left: playheadBeat * BEAT_PX, top: 0, bottom: 0 }}
            />
          </div>
        </div>
      </div>

      {/* Grid */}
      <div
        ref={containerRef}
        className="relative border border-neutral-700 bg-neutral-800 rounded overflow-auto flex-1 min-h-0"
        style={{ width: "100%", minHeight: heightPx }}
        onContextMenu={(e) => {
          // Prevent default context menu and start marquee selection
          e.preventDefault();
        }}
        onMouseDown={(e) => {
          if (e.button === 2) {
            // Right mouse button starts marquee selection
            beginMarquee(e.clientX, e.clientY);
          } else if (e.button === 0) {
            // Left mouse button: normal grid click (add note)
            handleGridClick(e);
          }
        }}
      >
        {/* Horizontal pitch rows */}
        {tuningRows.map((t, row) => (
          <div
            key={t.name ?? `${t.ratio.num}/${t.ratio.den}`}
            className="absolute border-t border-neutral-700/50 text-xs text-neutral-500 pl-1 select-none"
            style={{ top: getY(t.ratio) * ROW_PX, left: 0, width: widthPx, height: ROW_PX }}
          >
            {fundamental
              ? `${divideRatios(t.ratio, fundamental).num}/${divideRatios(t.ratio, fundamental).den}`
              : `${t.ratio.num}/${t.ratio.den}`}
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

        {/* Time selection overlay (grid) */}
        {timeSelection && (
          <div
            className="absolute pointer-events-none bg-blue-400/10"
            style={{
              left: timeSelection.start * BEAT_PX,
              top: 0,
              width: Math.max(0, (timeSelection.end - timeSelection.start)) * BEAT_PX,
              height: heightPx,
            }}
          />
        )}

        {/* Notes */}
        {channel.notes.map((note, i) => {
          const x = note.start * BEAT_PX;
          const y = getY(note.ratio) * ROW_PX;
          const w = Math.max(0.25 * BEAT_PX, note.duration * BEAT_PX);
          const h = ROW_PX - 6;
          const isSel = selected.has(i);
          const isFundamental = fundamental
            ? (() => {
                const rel = divideRatios(note.ratio, fundamental);
                return rel.num === rel.den;
              })()
            : false;

          return (
            <Rnd
              key={i}
              bounds="parent"
              position={{ x, y }}
              size={{ width: w, height: h }}
              dragAxis="x"
              enableResizing={{ left: true, right: true, top: false, bottom: false }}
              dragGrid={[BEAT_PX / 4, ROW_PX]}
              resizeGrid={[BEAT_PX / 4, ROW_PX]}
              onMouseDown={(e) => {
                const me = e as MouseEvent;
                if (me.button === 1) { // middle click
                  setFundamental(note.ratio);
                }
              }}
              onDragStart={(e) => {
                const me = e as MouseEvent;
                if (!isSel && me.button === 0) {
                  toggleSelect(i, me.shiftKey);
                }
              }}
              onDragStop={(_, d) => {
                const newStart = Math.max(0, Math.round(d.x / (BEAT_PX / 4)) / 4);
                updateNote(i, { start: newStart });
              }}
              onResizeStop={(_, __, ref, ___, pos) => {
                const snappedStart = Math.max(0, Math.round(pos.x / (BEAT_PX / 4)) / 4);
                const snappedDur = Math.max(0.25, Math.round(ref.offsetWidth / (BEAT_PX / 4)) / 4);
                updateNote(i, { start: snappedStart, duration: snappedDur });
              }}
              className={`note absolute rounded px-1 flex items-center text-xs select-none ${
                isFundamental
                  ? "bg-white text-black ring-2 ring-yellow-400"
                  : isSel
                  ? "bg-blue-400 ring-2 ring-blue-200 text-white"
                  : "bg-blue-600 hover:bg-blue-500 text-white"
              }`}
              title={`start=${note.start} dur=${note.duration}`}
              onDoubleClick={() =>
                playTone(project.tuningRootHz, note.ratio, note.duration, note.velocity)
              }
            >
              {note.ratio.num}/{note.ratio.den}
            </Rnd>
          );
        })}

        {/* Playhead (grid) */}
        <div
          className="absolute pointer-events-none border-l-2 border-red-400 z-30"
          style={{ left: playheadBeat * BEAT_PX, top: 0, height: heightPx }}
        />

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
