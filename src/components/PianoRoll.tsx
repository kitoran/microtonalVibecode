import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Project, Note, Ratio } from "../model/project";
import { divideRatios, multiplyRatios, ratioToFloat } from "../utils/ratio";
import { playTone, startTone } from "../audio/engine";
import { Rnd } from "react-rnd";
import { connectSeries } from "tone";

interface PianoRollProps {
  project: Project;
  setProject: (p: Project) => void;
  channelId: string;
}

const DEFAULT_BEAT_PX = 48; // fallback pixels per beat
const DEFAULT_ROW_PX = 32;  // fallback pixels per pitch row
const DEFAULT_NOTE_H_PX = 10; // fallback note height in pixels

// Fixed absolute frequency range for the piano roll vertical axis
const MIN_FREQ_HZ = 30;
const MAX_FREQ_HZ = 3000;

export default function PianoRoll({ project, setProject, channelId }: PianoRollProps) {
  const channel = project.channels.find((c) => c.id === channelId);
  if (!channel) return <div>Channel not found</div>;

  // --- Pitch rows (use channel tuning) ---
  const tuningRows = channel.tuning;
  const [fundamental, setFundamental] = useState<Ratio | null>(null);
  const [minLog, maxLog] = useMemo(() => {
    return [Math.log(MIN_FREQ_HZ), Math.log(MAX_FREQ_HZ)] as const;
  }, []);

  // Map a ratio to a vertical unit position proportional to log(ratio),
  // normalized such that maxLog -> 0 (top) and minLog -> span (bottom).
  const getY = (ratio: Ratio) => {
    // Map absolute frequency into fixed log-Hz space [MIN_FREQ_HZ, MAX_FREQ_HZ]
    // const rel = fundamental ? multiplyRatios(ratio, fundamental) : ratio;
    const freq = project.tuningRootHz * ratioToFloat(ratio);
    const val = Math.log(freq);
    const range = maxLog - minLog || 1;
    let scaled = (maxLog - val) / range; // 0..1 where higher freq is closer to 0 (top)
    if (scaled < 0) scaled = 0; else if (scaled > 1) scaled = 1;
    const span = Math.max(tuningRows.length - 1, 1);
    return scaled * span;
  };

  // Find nearest tuning row given a Y pixel position; return snapped Y and the row's ratio
  const findNearestRowByYPx = (yPx: number, rowPx: number, noteHPx: number): { y: number; ratio: Ratio } => {
    if (tuningRows.length === 0) return { y: 0, ratio: { num: 1, den: 1 } };
    let nearestIdx = 0;
    let best = Infinity;
    tuningRows.forEach((t, idx) => {
      const rowY = getY(t.ratio) * rowPx;
      const dy = Math.abs(rowY - yPx);
      if (dy < best) { best = dy; nearestIdx = idx; }
    });
    const snappedY = getY(tuningRows[nearestIdx].ratio) * rowPx;
    return { y: snappedY, ratio: tuningRows[nearestIdx].ratio };
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

  
  // --- Transport / timeline state ---
  const [playheadBeat, setPlayheadBeat] = useState<number>(0);
  const [timeSelection, setTimeSelection] = useState<{ start: number; end: number } | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [vZoom, setVZoom] = useState<number>(1);
  const rafIdRef = useRef<number | null>(null);
  const playbackStartMsRef = useRef<number>(0);
  const playbackStartBeatRef = useRef<number>(0);
  const activePlaybackRef = useRef<Map<number, { stop: () => void }>>(new Map());

  // --- Marquee ---
  const containerRef = useRef<HTMLDivElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const notePreviewHandles = useRef<Map<number, { stop: () => void; setRatio?: (r: Ratio) => void }>>(new Map());
  const dragYOffsetRef = useRef<number | null>(null);
  const [draggingNoteIndex, setDraggingNoteIndex] = useState<number | null>(null);
  const [draggingPos, setDraggingPos] = useState<{ x: number; y: number } | null>(null);
  const [marquee, setMarquee] = useState<{ active: boolean; x: number; y: number; w: number; h: number }>(
    { active: false, x: 0, y: 0, w: 0, h: 0 }
  );
  // Preview handle for drawing new notes
  const drawingPreviewRef = useRef<{ stop: () => void; setRatio?: (r: Ratio) => void } | null>(null);

  // Track container size to compute dynamic layout (fit to screen)
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const cr = entry.contentRect;
        setContainerSize({ width: cr.width, height: cr.height });
      }
    });
    ro.observe(el);
    // initial
    const rect = el.getBoundingClientRect();
    setContainerSize({ width: rect.width, height: rect.height });
    return () => ro.disconnect();
  }, []);

  // Prevent Chrome page zoom on Ctrl+wheel and map it to vertical zoom instead
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handler = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const factor = Math.exp(-e.deltaY * 0.001);
        setVZoom((z) => Math.max(0.000025, Math.min(300000, z * factor)));
      }
    };

    el.addEventListener("wheel", handler, { passive: false });
    return () => {
      el.removeEventListener("wheel", handler as any);
    };
  }, []);

  const beginMarquee = (clientX: number, clientY: number, rowPx: number, noteHPx: number) => {
    const rect = containerRef.current!.getBoundingClientRect();
    const scrollTop = containerRef.current!.scrollTop;
    let marqueeState = { x: clientX - rect.left, y: clientY - rect.top + scrollTop, w: 0, h: 0 };
    setMarquee({ active: true, ...marqueeState });

    const onMove = (e: MouseEvent) => {
      const r = containerRef.current!.getBoundingClientRect();
      const st = containerRef.current!.scrollTop;
      marqueeState = {
        ...marqueeState,
        w: e.clientX - r.left - marqueeState.x,
        h: (e.clientY - r.top + st) - marqueeState.y
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
        const nx = note.start * beatPx;
        const nyCenter = getY(note.ratio) * rowPx;
        const nw = note.duration * beatPx;
        const nh = noteHPx;
        const ny = nyCenter - nh / 2; // top of rectangle
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

  const onContextMenu = (e: React.MouseEvent, rowPx: number, noteHPx: number) => {
    e.preventDefault();
    if (!containerRef.current) return;
    beginMarquee(e.clientX, e.clientY, rowPx, noteHPx);
  };

  // --- Timeline interaction ---
  const beginPlayheadDrag = (clientX: number) => {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const snap = (xPx: number) => Math.max(0, Math.round((xPx / (beatPx / 4))) / 4);

    const active = new Map<number, { stop: () => void }>();

    const updateForBeat = (beat: number) => {
      setPlayheadBeat(beat);
      const overlapped = new Set<number>();
      channel.notes.forEach((note, idx) => {
        if (beat >= note.start && beat < note.start + note.duration) {
          overlapped.add(idx);
          if (!active.has(idx)) {
            const handle = startTone(
              project.tuningRootHz,
              note.ratio,
              Math.max(0, Math.min(1, note.velocity))
            );
            active.set(idx, handle);
          }
        }
      });
      // Stop tones that are no longer under the playhead
      [...active.keys()].forEach((idx) => {
        if (!overlapped.has(idx)) {
          const h = active.get(idx)!;
          try { h.stop(); } catch {}
          active.delete(idx);
        }
      });
    };

    updateForBeat(snap(clientX - rect.left));

    const onMove = (e: MouseEvent) => {
      if (!timelineRef.current) return;
      const r = timelineRef.current.getBoundingClientRect();
      updateForBeat(snap(e.clientX - r.left));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove, true);
      window.removeEventListener("mouseup", onUp, true);
      // Stop any remaining active tones
      active.forEach((h) => { try { h.stop(); } catch {} });
      active.clear();
    };
    window.addEventListener("mousemove", onMove, true);
    window.addEventListener("mouseup", onUp, true);
  };

  const beginTimeSelection = (clientX: number) => {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const snap = (xPx: number) => Math.max(0, Math.round((xPx / (beatPx / 4))) / 4);
    const anchorBeat = snap(clientX - rect.left);
    let moved = false;

    const onMove = (e: MouseEvent) => {
      if (!timelineRef.current) return;
      const r = timelineRef.current.getBoundingClientRect();
      const bx = snap(e.clientX - r.left);
      if (!moved && Math.abs(bx - anchorBeat) >= 0.01) moved = true;
      if (moved) {
        const start = Math.min(anchorBeat, bx);
        const end = Math.max(anchorBeat, bx);
        setTimeSelection({ start, end });
      }
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove, true);
      window.removeEventListener("mouseup", onUp, true);
    };
    window.addEventListener("mousemove", onMove, true);
    window.addEventListener("mouseup", onUp, true);
  };

  // --- PLAYBACK ENGINE (transport) ---
  const totalBeats = Math.max(16, Math.ceil(Math.max(0, ...channel.notes.map((n) => n.start + n.duration))));

  const stopAllPlaybackTones = () => {
    activePlaybackRef.current.forEach((h) => { try { h.stop(); } catch {} });
    activePlaybackRef.current.clear();
  };

  const tick = () => {
    const tempo = project.tempo;
    const now = performance.now();
    const elapsedSec = (now - playbackStartMsRef.current) / 1000;
    let beat = playbackStartBeatRef.current + elapsedSec * (tempo / 60);

    if (timeSelection && timeSelection.end > timeSelection.start) {
      const len = timeSelection.end - timeSelection.start;
      // Loop
      if (beat >= timeSelection.end) {
        // shift anchors forward by loop length to keep continuity
        const loops = Math.floor((beat - timeSelection.start) / len);
        playbackStartBeatRef.current -= loops * len;
        beat = playbackStartBeatRef.current + (performance.now() - playbackStartMsRef.current) / 1000 * (tempo / 60);
        // Reset voices on wrap
        stopAllPlaybackTones();
      }
    } else {
      // Stop at project end
      if (beat >= totalBeats) {
        setIsPlaying(false);
        setPlayheadBeat(totalBeats);
        stopAllPlaybackTones();
        if (rafIdRef.current != null) cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
        return;
      }
    }

    setPlayheadBeat(beat);

    // Gate notes under playhead (similar to scrub behavior)
    const overlapped = new Set<number>();
    channel.notes.forEach((note, idx) => {
      if (beat >= note.start && beat < note.start + note.duration) {
        overlapped.add(idx);
        if (!activePlaybackRef.current.has(idx)) {
          const handle = startTone(
            project.tuningRootHz,
            note.ratio,
            Math.max(0, Math.min(1, note.velocity))
          );
          activePlaybackRef.current.set(idx, handle);
        }
      }
    });
    // Stop tones that are no longer under the playhead
    Array.from(activePlaybackRef.current.keys()).forEach((idx) => {
      if (!overlapped.has(idx)) {
        const h = activePlaybackRef.current.get(idx)!;
        try { h.stop(); } catch {}
        activePlaybackRef.current.delete(idx);
      }
    });

    rafIdRef.current = requestAnimationFrame(tick);
  };

  const startPlayback = (fromBeat?: number) => {
    if (isPlaying) return;
    const startBeat = Math.max(0, fromBeat ?? (timeSelection ? timeSelection.start : playheadBeat));
    setPlayheadBeat(startBeat);
    playbackStartBeatRef.current = startBeat;
    playbackStartMsRef.current = performance.now();
    setIsPlaying(true);
    rafIdRef.current = requestAnimationFrame(tick);
  };

  const pausePlayback = () => {
    if (!isPlaying) return;
    setIsPlaying(false);
    if (rafIdRef.current != null) cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = null;
    stopAllPlaybackTones();
    // Anchor next start at current playhead
    playbackStartBeatRef.current = playheadBeat;
    playbackStartMsRef.current = performance.now();
  };

  const stopPlayback = () => {
    // Stop & reset to loop start or zero
    if (rafIdRef.current != null) cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = null;
    setIsPlaying(false);
    stopAllPlaybackTones();
    const resetBeat = timeSelection ? timeSelection.start : 0;
    setPlayheadBeat(resetBeat);
    playbackStartBeatRef.current = resetBeat;
    playbackStartMsRef.current = performance.now();
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafIdRef.current != null) cancelAnimationFrame(rafIdRef.current);
      stopAllPlaybackTones();
    };
  }, []);

  // --- Draw note interaction (left mouse drag on empty grid) ---
  const [drawing, setDrawing] = useState<null | { anchorBeat: number; endBeat: number; ratio: Ratio }>(null);
  const beginDrawNote = (clientX: number, clientY: number, beatPx: number, rowPx: number, noteHPx: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const st = containerRef.current.scrollTop;
    const snapBeat = (px: number) => Math.floor(px / (beatPx / 4)) / 4;
    const anchorBeat = snapBeat(clientX - rect.left);
    const nearestStart = findNearestRowByYPx(clientY - rect.top + st, rowPx, noteHPx);
    setDrawing({ anchorBeat, endBeat: anchorBeat, ratio: nearestStart.ratio });
    // start preview tone while drawing
    try {
      drawingPreviewRef.current = startTone(
        project.tuningRootHz,
        nearestStart.ratio,
        1
      );
    } catch {}

    const onMove = (e: MouseEvent) => {
      const r = containerRef.current!.getBoundingClientRect();
      const st2 = containerRef.current!.scrollTop;
      const bx = Math.round(((e.clientX - r.left) / (beatPx / 4))) / 4;
      const nearest = findNearestRowByYPx(e.clientY - r.top + st2, rowPx, noteHPx);
      // retune preview tone to nearest row while dragging
      const h = drawingPreviewRef.current;
      if (h && h.setRatio) {
        try { h.setRatio(nearest.ratio); } catch {}
      }
      setDrawing((d) => (d ? { ...d, endBeat: bx, ratio: nearest.ratio } : d));
    };

    const onUp = (e: MouseEvent) => {
      window.removeEventListener("mousemove", onMove, true);
      window.removeEventListener("mouseup", onUp, true);
      // stop preview tone and commit note
      const preview = drawingPreviewRef.current;
      if (preview) { try { preview.stop(); } catch {} }
      drawingPreviewRef.current = null;
      setDrawing((d) => {
        if (!d) return null;
        const start = Math.min(d.anchorBeat, d.endBeat);
        const durRaw = Math.abs(d.endBeat - d.anchorBeat);
        const duration = durRaw < 0.01 ? 1 : Math.max(0.25, Math.round((durRaw) * 4) / 4);
        const newNote: Note = { start, duration, ratio: d.ratio, velocity: 1.0 };
        setProject({
          ...project,
          channels: project.channels.map((ch) =>
            ch.id === channelId ? { ...ch, notes: [...ch.notes, newNote] } : ch
          ),
        });
        return null;
      });
    };

    window.addEventListener("mousemove", onMove, true);
    window.addEventListener("mouseup", onUp, true);
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
      if (e.code === "Space") {
        e.preventDefault();
        if (isPlaying) pausePlayback(); else startPlayback();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [project, selected, channelId, setProject, isPlaying]);

  // --- Cleanup any active note previews on unmount ---
  useEffect(() => {
    return () => {
      notePreviewHandles.current.forEach((h) => {
        try { h.stop(); } catch {}
      });
      notePreviewHandles.current.clear();
    };
  }, []);

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
  const beatPx = useMemo(() => (containerSize.width > 0 ? containerSize.width / totalBeats : DEFAULT_BEAT_PX), [containerSize.width, totalBeats]);
  const rowPx = useMemo(() => {
    const rows = Math.max(tuningRows.length, 1);
    const base = containerSize.height > 0 ? containerSize.height / rows : DEFAULT_ROW_PX;
    return base * vZoom;
  }, [containerSize.height, tuningRows.length, vZoom]);
  const noteHPx = Math.max(6, Math.min(32, rowPx * 0.6));
  const widthPx = containerSize.width || totalBeats * DEFAULT_BEAT_PX;
  const heightPx = Math.max(tuningRows.length, 1) * rowPx;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Transport */}
      <div className="flex items-center gap-2 mb-2">
        <button
          className={`px-3 py-1 rounded ${isPlaying ? "bg-yellow-600 hover:bg-yellow-500" : "bg-green-700 hover:bg-green-600"}`}
          onClick={() => (isPlaying ? pausePlayback() : startPlayback())}
          title="Space: Play/Pause"
        >
          {isPlaying ? "Pause" : "Play"}
        </button>
        <button
          className="px-3 py-1 rounded bg-neutral-700 hover:bg-neutral-600"
          onClick={() => stopPlayback()}
        >
          Stop
        </button>
        <div className="text-xs text-neutral-400 ml-2">
          Tempo: {project.tempo} BPM
          {timeSelection ? ` · Loop ${timeSelection.start.toFixed(2)}–${timeSelection.end.toFixed(2)} beats` : ""}
        </div>
      </div>

      {/* Ruler */}
      <div className="flex gap-0.5 mb-1 text-xs text-neutral-400 font-mono select-none overflow-hidden">
        <div className="whitespace-nowrap" style={{ width: widthPx }}>
          {Array.from({ length: totalBeats + 1 }).map((_, i) => (
            <div key={i} className="inline-block text-center" style={{ width: beatPx }}>
              {i}
            </div>
          ))}
        </div>
      </div>

      {/* Timeline bar */}
      <div className="mb-2">
        <div
          className="relative h-6 border border-neutral-700 bg-neutral-800 rounded overflow-hidden"
          onMouseDown={(e) => {
            if (e.button === 0) {
              beginPlayheadDrag(e.clientX);
            } else if (e.button === 2) {
              e.preventDefault();
              beginTimeSelection(e.clientX);
            }
          }}
          onContextMenu={(e) => e.preventDefault()}
          title="Left-drag: move playhead. Right-drag: select time interval."
        >
          <div ref={timelineRef} className="relative" style={{ width: widthPx, height: "100%" }}>
            {/* Selection */}
            {timeSelection && (
              <div
                className="absolute pointer-events-none bg-blue-400/20"
                style={{
                  left: timeSelection.start * beatPx,
                  width: Math.max(0, (timeSelection.end - timeSelection.start)) * beatPx,
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
                style={{ left: i * beatPx, top: 0, bottom: 0, width: 1 }}
              />
            ))}
            {/* Playhead */}
            <div
              className="absolute pointer-events-none border-l-2 border-red-400"
              style={{ left: playheadBeat * beatPx, top: 0, bottom: 0 }}
            />
          </div>
        </div>
      </div>

      {/* Grid */}
      <div
        ref={containerRef}
        className="relative border border-neutral-700 bg-neutral-800 rounded overflow-x-hidden overflow-y-auto flex-1 min-h-0"
        style={{ width: "100%", height: "100%" }}
        onContextMenu={(e) => {
          // Prevent default context menu and start marquee selection
          e.preventDefault();
        }}
        onMouseDown={(e) => {
          if ((e.target as HTMLElement).closest(".note")) return; // ignore clicks on notes
          if (e.button === 2) {
            // Right mouse button starts marquee selection
            beginMarquee(e.clientX, e.clientY, rowPx, noteHPx);
          } else if (e.button === 0) {
            // Left mouse button: draw note interaction
            beginDrawNote(e.clientX, e.clientY, beatPx, rowPx, noteHPx);
          }
        }}
      >
        <div className="relative" style={{ width: widthPx, height: heightPx }}>
          {/* Horizontal pitch rows */}
        {tuningRows.map((t) => {
          let theRatio = fundamental
              ? multiplyRatios(t.ratio, fundamental)
              : t.ratio;
          return (
          <div
            key={t.name ?? `${theRatio.num}/${theRatio.den}`}
            className="absolute border-t border-neutral-700/50 text-xs text-neutral-500 pl-1 select-none"
            style={{ top: getY(theRatio) * rowPx, left: 0, width: widthPx, height: 1 }}
          >
            {`${theRatio.num}/${theRatio.den}`}
          </div>
        )})}

        {/* Vertical beat lines */}
        {Array.from({ length: totalBeats + 1 }).map((_, i) => (
          <div
            key={`v-${i}`}
            className={`absolute ${i % 4 === 0 ? "border-l-neutral-600/70" : "border-l-neutral-700/40"}`}
            style={{ left: i * beatPx, top: 0, height: heightPx, borderLeftWidth: 1 }}
          />
        ))}

        {/* Time selection overlay (grid) */}
        {timeSelection && (
          <div
            className="absolute pointer-events-none bg-blue-400/10"
            style={{
              left: timeSelection.start * beatPx,
              top: 0,
              width: Math.max(0, (timeSelection.end - timeSelection.start)) * beatPx,
              height: heightPx,
            }}
          />
        )}

        {/* Drawing note preview */}
        {drawing && (
          <div
            className="absolute bg-blue-500/70 ring-2 ring-blue-200 pointer-events-none"
            style={{
              left: Math.min(drawing.anchorBeat, drawing.endBeat) * beatPx,
              width: Math.max(beatPx / 4, Math.abs(drawing.endBeat - drawing.anchorBeat) * beatPx),
              top: getY(drawing.ratio) * rowPx - noteHPx / 2,
              height: noteHPx,
            }}
          />
        )}

        {/* Notes */}
        {channel.notes.map((note, i) => {
          const x = note.start * beatPx;
          const yCenter = getY(note.ratio) * rowPx;
          const w = Math.max(0.25 * beatPx, note.duration * beatPx);
          const h = noteHPx;
          const y = yCenter - h / 2; // top
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
              position={{ x: i === draggingNoteIndex && draggingPos ? draggingPos.x : x, y: i === draggingNoteIndex && draggingPos ? draggingPos.y : y }}
              size={{ width: w, height: h }}
              dragAxis="both"
              enableResizing={{ left: true, right: true, top: false, bottom: false }}
              dragGrid={[beatPx / 4, 1]}
              resizeGrid={[beatPx / 4, rowPx]}
              onMouseDown={(e) => {
                const me = e as MouseEvent;
                // Middle click sets fundamental
                if (me.button === 1) {
                  e.preventDefault();
                  setFundamental(note.ratio);
                }
                // Left click: start preview tone until mouse is released
                if (me.button === 0) {
                  if (!notePreviewHandles.current.has(i)) {
                    const handle = startTone(
                      project.tuningRootHz,
                      note.ratio,
                      Math.max(0, Math.min(1, note.velocity))
                    );
                    notePreviewHandles.current.set(i, handle);

                    const stopOnce = () => {
                      const h = notePreviewHandles.current.get(i);
                      if (h) {
                        try { h.stop(); } catch {}
                        notePreviewHandles.current.delete(i);
                      }
                      window.removeEventListener("mouseup", stopOnce, true);
                    };
                    window.addEventListener("mouseup", stopOnce, true);
                  }
                }
              }}
              onDragStart={(e) => {
                const me = e as MouseEvent;
                if (!isSel && me.button === 0) {
                  toggleSelect(i, me.shiftKey);
                }
                // Initialize controlled drag position
                setDraggingNoteIndex(i);
                setDraggingPos({ x, y });
                // Ensure a preview tone is active for this note while dragging
                if (!notePreviewHandles.current.has(i)) {
                  const handle = startTone(
                    project.tuningRootHz,
                    note.ratio,
                    Math.max(0, Math.min(1, note.velocity))
                  );
                  notePreviewHandles.current.set(i, handle);
                }
                // Track pointer offset from note top to improve perceived follow
                if (containerRef.current) {
                  const rect = containerRef.current.getBoundingClientRect();
                  dragYOffsetRef.current = me.clientY - (rect.top + y);
                }
              }}
              onDrag={(e, d) => {
                const snapX = Math.round(d.x / (beatPx / 4)) * (beatPx / 4);
                let snappedTop = d.y;
                let newRatio = note.ratio;
                if (containerRef.current) {
                  const me = e as MouseEvent;
                  const rect = containerRef.current.getBoundingClientRect();
                  const st = containerRef.current.scrollTop;
                  const desiredTop = me.clientY - rect.top + st - (dragYOffsetRef.current ?? 0);
                  const nearest = findNearestRowByYPx(desiredTop + noteHPx / 2, rowPx, noteHPx);
                  snappedTop = nearest.y - noteHPx / 2; // center to top
                  newRatio = nearest.ratio;
                } else {
                  const nearest = findNearestRowByYPx(d.y + noteHPx / 2, rowPx, noteHPx);
                  snappedTop = nearest.y - noteHPx / 2;
                  newRatio = nearest.ratio;
                }
                setDraggingPos({ x: snapX, y: snappedTop });
                // Retune active preview while dragging
                const hdl = notePreviewHandles.current.get(i);
                if (hdl && hdl.setRatio) {
                  try { hdl.setRatio(newRatio); } catch {}
                }
              }}
              onDragStop={(e, d) => {
                const newStart = Math.max(0, Math.round(d.x / (beatPx / 4)) / 4);
                let newRatio = note.ratio;
                if (containerRef.current) {
                  const me = e as MouseEvent;
                  const rect = containerRef.current.getBoundingClientRect();
                  const st = containerRef.current.scrollTop;
                  const desiredTop = me.clientY - rect.top + st - (dragYOffsetRef.current ?? 0);
                  newRatio = findNearestRowByYPx(desiredTop + noteHPx / 2, rowPx, noteHPx).ratio;
                } else {
                  newRatio = findNearestRowByYPx(d.y + noteHPx / 2, rowPx, noteHPx).ratio;
                }
                updateNote(i, { start: newStart, ratio: newRatio });
                setDraggingNoteIndex(null);
                setDraggingPos(null);
                dragYOffsetRef.current = null;
                // Stop the preview started for drag if it wasn't started by a press
                const h = notePreviewHandles.current.get(i);
                if (h) {
                  try { h.stop(); } catch {}
                  notePreviewHandles.current.delete(i);
                }
              }}
              onResizeStop={(_, __, ref, ___, pos) => {
                const snappedStart = Math.max(0, Math.round(pos.x / (beatPx / 4)) / 4);
                const snappedDur = Math.max(0.25, Math.round(ref.offsetWidth / (beatPx / 4)) / 4);
                updateNote(i, { start: snappedStart, duration: snappedDur });
              }}
              className={`note absolute px-1 flex items-center text-xs select-none ${
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
          style={{ left: playheadBeat * beatPx, top: 0, height: heightPx }}
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
    </div>
  );
}
