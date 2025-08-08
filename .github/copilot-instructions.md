# Copilot Instructions for microtonalVibecode

## Project Overview
- This is a React + TypeScript + Vite project for microtonal music editing and playback.
- Main UI logic is in `src/components/PianoRoll.tsx`, which implements a piano roll for note editing, selection, and interaction.
- State management is local to components, with `project` and `setProject` passed as props from `App.tsx`.
- Audio playback is handled via `src/audio/engine.ts` using the Web Audio API.
- Data models (notes, ratios, projects) are defined in `src/model/project.ts` and `src/model/example-project.ts`.

## Key Patterns & Conventions
- **Note selection and editing:** Use right mouse drag for area selection, left click to add notes, middle click to set fundamental note.
- **Selection logic:** Selected notes are tracked by index in a `Set<number>`. Marquee selection is implemented in `PianoRoll.tsx`.
- **Fundamental note:** The last middle-clicked note is tracked and can affect UI rendering (e.g., color, ratio labels).
- **Component structure:** Main UI is in `App.tsx` and `PianoRoll.tsx`. Utility functions are in `src/utils/ratio.ts`.
- **Styling:** Uses CSS modules in `src/App.css` and `src/index.css`.

## Developer Workflows
- **Start dev server:** `npm run dev` (uses Vite)
- **Build:** `npm run build`
- **Lint:** `npm run lint` (ESLint config in `eslint.config.js`)
- **No test suite is present by default.**
- **GitHub Issues:** When resolving issues, include the issue number in commit messages (e.g., `Fix area selection (#2): ...`).

## Integration Points
- **External dependencies:**
  - `react-rnd` for draggable/resizable notes
  - Vite for build/dev
  - Web Audio API for sound
- **No backend or server-side code.**

## Examples
- See `src/components/PianoRoll.tsx` for selection, drag, and note logic.
- See `src/audio/engine.ts` for tone playback.
- See `src/model/example-project.ts` for sample data structure.

## Special Instructions
- Always prevent the context menu after drag-select in the piano roll.
- When a commit resolves a GitHub issue, include the issue number in the commit message.
- If you add new features, follow the UI/interaction conventions in `PianoRoll.tsx`.

---

If any section is unclear or missing, please provide feedback to improve these instructions.
