export type SnapshotSelection =
  | { mode: "latest" }
  | { mode: "history"; id: string };
