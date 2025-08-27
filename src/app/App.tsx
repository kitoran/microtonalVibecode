import { useState, useCallback } from "react";
import PianoRoll from "../components/PianoRoll";
import { exampleProject } from "../model/example-project";
import type { Project } from "../model/project";

export default function App() {
  const [project, setProject] = useState<Project>(exampleProject);
  const [history, setHistory] = useState<Project[]>([]);
  const [future, setFuture] = useState<Project[]>([]);

  // Wrap setProject to push to history
  const setProjectWithHistory = useCallback((next: Project) => {
    setHistory((h) => [...h, project]);
    setFuture([]); // clear redo stack
    setProject(next);
  }, [project]);

  const undo = useCallback(() => {
    setHistory((h) => {
      if (h.length === 0) return h;
      setFuture((f) => [project, ...f]);
      setProject(h[h.length - 1]);
      return h.slice(0, -1);
    });
  }, [project]);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f;
      setHistory((h) => [...h, project]);
      setProject(f[0]);
      return f.slice(1);
    });
  }, [project]);


  return (
    <div className="h-screen w-full bg-neutral-900 text-white flex flex-col">
      <header className="p-4 border-b border-neutral-700">
        {/*  <h1 className="text-2xl font-bold"> */}
        {project.name}
        {/* </header></h1``> */}
        {/* { <p className="text-sm text-neutral-400">Just Intonation · Multichannel</p>  */}
      </header>

      <main className="flex-1 min-h-0 p-4 flex flex-col">
        <div className="flex gap-2 mb-2">
          <button onClick={undo} disabled={history.length === 0}>Undo</button>
          <button onClick={redo} disabled={future.length === 0}>Redo</button>
        </div>
        <PianoRoll project={project} setProject={setProjectWithHistory} channelId="ch1" />
      </main>
    </div>
  );
}
