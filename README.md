# MicrotonalVibecode

MicrotonalVibecode is a React + TypeScript + Vite application for editing and playing microtonal music using just intonation. It features a piano roll interface for note editing, selection, and playback, with support for custom tuning maps and sample-based audio.

## Features

- **Piano Roll UI:** Edit notes, select areas, drag to move/resize, and set the fundamental note.
- **Microtonal Tuning:** Supports custom tuning maps with rational frequency ratios.
- **Sample-Based Playback:** Uses a CC0-licensed upright piano sample set for realistic sound.
- **Transport Controls:** Play, pause, stop, and loop time selections.
- **Undo/Redo:** Step through project history.
- **Local Storage:** Project state is saved in the browser.

## Getting Started

### Prerequisites

- Node.js (v18+ recommended)
- npm

### Installation

```sh
npm install
```

### Development

Start the development server:

```sh
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Build

```sh
npm run build
```

### Lint

```sh
npm run lint
```

## Project Structure

- [`src/app/App.tsx`](src/app/App.tsx): Main app component, manages project state and history.
- [`src/components/PianoRoll.tsx`](src/components/PianoRoll.tsx): Piano roll UI and interaction logic.
- [`src/audio/engine.ts`](src/audio/engine.ts): Audio playback engine using Web Audio API and piano samples.
- [`src/model/project.ts`](src/model/project.ts): Data models for notes, ratios, channels, and projects.
- [`src/model/example-project.ts`](src/model/example-project.ts): Example project data.
- [`src/utils/ratio.ts`](src/utils/ratio.ts): Utility functions for ratio math.
- [`src/assets/UprightPianoKW-SFZ+FLAC-20220221/`](src/assets/UprightPianoKW-SFZ+FLAC-20220221/): CC0 piano sample set.

## Usage

- **Left click:** Add notes.
- **Right drag:** Area selection (marquee).
- **Middle click:** Set fundamental note (affects grid display).
- **Drag notes:** Move or resize notes.
- **Double click note:** Play note.
- **Spacebar:** Play/pause.
- **Delete/Backspace:** Delete selected notes.

## License

- Code: MIT License.
- Piano samples: [CC0 1.0 Universal](src/assets/UprightPianoKW-SFZ+FLAC-20220221/UprightPianoKW-SFZ+FLAC-20220221/cc0.txt).

## Credits

- Upright piano samples by Gonzalo & Roberto,