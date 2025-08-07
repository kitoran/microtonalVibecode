import { useState } from "react";
import PianoRoll from "../components/PianoRoll";
import { exampleProject } from "../model/example-project";
import type { Project } from "../model/project";

export default function App() {
  const [project, setProject] = useState<Project>(exampleProject);

  return (
    <div className="min-h-screen min-w-full bg-neutral-900 text-white p-4">
      <header className="mb-4">
        <h1 className="text-2xl font-bold">{project.name}</h1>
        <p className="text-sm text-neutral-400">Just Intonation · Multichannel</p>
      </header>

      <main>
        <PianoRoll
          project={project}
          setProject={setProject}
          channelId="ch1"
        />
      </main>
    </div>
  );
}
