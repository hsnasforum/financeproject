export type PlanningMigrationDefinition = {
  id: string;
  title: string;
  description: string;
  requiresVaultUnlocked: boolean;
};

export const PLANNING_MIGRATIONS: PlanningMigrationDefinition[] = [
  {
    id: "storage-schema-v2",
    title: "Storage schema v2 migration",
    description: "Legacy profile/run/snapshot file records are normalized to canonical schemaVersion=2 records.",
    requiresVaultUnlocked: false,
  },
  {
    id: "vault-config-v2",
    title: "Vault config v2 migration",
    description: "Legacy vault config(version=1) is upgraded to vaultVersion=2 during unlock flow.",
    requiresVaultUnlocked: true,
  },
];

export function getPlanningMigrationDefinition(id: string): PlanningMigrationDefinition | undefined {
  return PLANNING_MIGRATIONS.find((row) => row.id === id);
}
