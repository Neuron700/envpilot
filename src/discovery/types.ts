export type ProjectKind = "node" | "python";

export interface ProjectDiscovery {
  root: string;
  name: string;
  kinds: ProjectKind[];
  markers: string[];
}
