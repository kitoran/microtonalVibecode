import React from "react";
import type { Project } from "../model/project";
import { ratioToFloat } from "../utils/ratio";
import { playTone } from "../audio/engine";

interface PianoRollProps {
  project: Project; 
  channelId: string;
}

export default function PianoRoll({ project, channelId }: PianoRollProps) {
  const channel = project.channels.find(c => c.id === channelId);
  if (!channel) return <div>Channel not found</div>;

  const notes = [...channel.notes];

  // 1. Sort notes by start
  notes.sort((a, b) => a.start - b.start);

  // 2. Map unique pitches to vertical rows
  const pitchRows = Array.from(
    new Map(
      notes
        .map(n => [ratioToFloat(n.ratio), n.ratio] as const)
        .sort((a, b) => b[0] - a[0]) // Highest pitch = top
    ).values()
  );

  const getY = (ratio: typeof pitchRows[number]) =>
    pitchRows.findIndex(r => r.num === ratio.num && r.den === ratio.den);

  const rowHeight = 2.5; // em
  const beatWidth = 4;   // em

  return (
    <div>
      <div className="text-neutral-400 text-sm mb-2 font-mono">
        {pitchRows.map((r, i) => (
          <div key={i} style={{ height: `${rowHeight}em` }}>
            {r.num}/{r.den}
          </div>
        ))}
      </div>

      <div
        className="relative border border-neutral-700 bg-neutral-800 overflow-auto rounded"
        style={{
          height: `${pitchRows.length * rowHeight}em`,
          minHeight: "10em",
        }}
      >
        {notes.map((note, i) => {
          const y = getY(note.ratio);
          const x = note.start * beatWidth;
          const w = note.duration * beatWidth;

          return (
            <button
              key={i}
              className="absolute bg-blue-600 hover:bg-blue-400 text-sm text-white rounded px-1 py-0.5"
              style={{
                top: `${y * rowHeight}em`,
                left: `${x}em`,
                width: `${w}em`,
              }}
              onClick={() =>
                playTone(
                  project.tuningRootHz,
                  note.ratio,
                  note.duration,
                  note.velocity
                )
              }
            >
              {note.ratio.num}/{note.ratio.den}
            </button>
          );
        })}
      </div>
    </div>
  );
}
