import { useState, useContext, createContext } from "react";
import { type Project } from "./model/project";
import { exampleProject } from "./model/example-project";
const ProjectContext = createContext<{
  project: Project;
  setProject: React.Dispatch<React.SetStateAction<Project>>;
} | null>(null);

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [project, setProject] = useState<Project>(exampleProject);
  return (
    <ProjectContext.Provider value={{ project, setProject }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProject must be inside ProjectProvider");
  return ctx;
}
