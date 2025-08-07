import React from "react";
import PianoRoll from "../components/PianoRoll";
import { exampleProject } from "../model/example-project";

export default function App() {
  return (
    <div className="min-h-screen min-w-full bg-neutral-900 text-white p-4">
      <header className="mb-4">
        <h1 className="text-2xl font-bold">{exampleProject.name}</h1>
        <p className="text-sm text-neutral-400">Just Intonation · Multichannel</p>
      </header>

      <main>
        <PianoRoll project={exampleProject} channelId="ch1" />
      </main>
    </div>
  );
}
