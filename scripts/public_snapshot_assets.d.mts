export const PUBLIC_SNAPSHOT_FILES: readonly string[];
export type SnapshotAssetOptions = {
  cwd?: string;
  standaloneServer: string;
  generatedRoot?: string;
  required?: boolean;
};
export type SnapshotAssetResult = { copied: number; removed: number; dataDir: string };
export function copyPublicSnapshots(options: SnapshotAssetOptions): SnapshotAssetResult;
export function prepareSourceSnapshotAssets(options: SnapshotAssetOptions): SnapshotAssetResult;
export function preparePublicSnapshotRuntime(options: SnapshotAssetOptions): Promise<SnapshotAssetResult & { managed: boolean }>;
export function assertManagedSnapshotEntries(dataDir: string, options?: { required?: boolean }): { count: number };
export function assertPublicSnapshotDirectory(dataDir: string, options?: { required?: boolean; operational?: boolean }): { count: number };
