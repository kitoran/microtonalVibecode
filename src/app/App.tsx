import { useState } from "react";
import PianoRoll from "../components/PianoRoll";
import { exampleProject } from "../model/example-project";
import type { Project } from "../model/project";
 
export default function App() {
  const [project, setProject] = useState<Project>(exampleProject);

  return (
    <div className="h-screen w-full bg-neutral-900 text-white flex flex-col">
      <header className="p-4 border-b border-neutral-700">
        {/*  <h1 className="text-2xl font-bold"> */}
        {project.name}
        {/* </header></h1``> */}
        {/* { <p className="text-sm text-neutral-400">Just Intonation · Multichannel</p>  */}
      </header>

      <main className="flex-1 min-h-0 p-4 flex flex-col">
        <PianoRoll project={project} setProject={setProject} channelId="ch1" />
      </main>
    </div>
  );
}
