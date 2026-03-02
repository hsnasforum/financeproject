import fs from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";
import { shouldBlockOpsPageInCurrentRuntime } from "@/lib/ops/pageAccess";
import { getVaultStatus } from "@/lib/planning/security/vaultState";
import { resolveDataDir } from "@/lib/planning/storage/dataDir";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function readPackageVersion(): Promise<string> {
  const fromEnv = asString(process.env.APP_VERSION)
    || asString(process.env.NEXT_PUBLIC_APP_VERSION)
    || asString(process.env.npm_package_version);
  if (fromEnv) return fromEnv;

  try {
    const packageJsonPath = path.resolve(process.cwd(), "package.json");
    const raw = JSON.parse(await fs.readFile(packageJsonPath, "utf-8")) as Record<string, unknown>;
    const fromFile = asString(raw.version);
    return fromFile || "unknown";
  } catch {
    return "unknown";
  }
}

function engineVersion(): string {
  return asString(process.env.PLANNING_ENGINE_VERSION) || "planning-v2";
}

export default async function OpsAboutPage() {
  if (shouldBlockOpsPageInCurrentRuntime()) {
    notFound();
  }

  const [appVersion, vaultStatus] = await Promise.all([
    readPackageVersion(),
    getVaultStatus(),
  ]);

  const dataDir = resolveDataDir();

  return (
    <PageShell>
      <PageHeader
        title="Ops About"
        description="로컬 런타임/버전/데이터 경로 상태를 확인합니다."
        action={(
          <div className="flex items-center gap-2">
            <Link href="/ops/backup">
              <Button type="button" size="sm" variant="outline">백업 열기</Button>
            </Link>
            <Link href="/ops/doctor">
              <Button type="button" size="sm" variant="outline">Doctor 열기</Button>
            </Link>
          </div>
        )}
      />

      <Card className="mb-4 border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        업데이트 전 백업 권장.{" "}
        <Link className="font-semibold underline" href="/ops/backup">
          /ops/backup
        </Link>
      </Card>

      <Card className="p-4">
        <h2 className="text-base font-black text-slate-900">Runtime Info</h2>
        <div className="mt-3 grid gap-2 text-sm">
          <p>appVersion: <span className="font-semibold">{appVersion}</span></p>
          <p>engineVersion: <span className="font-semibold">{engineVersion()}</span></p>
          <p>dataDir: <span className="font-semibold">{dataDir}</span></p>
          <p>vault configured: <span className="font-semibold">{vaultStatus.configured ? "true" : "false"}</span></p>
          <p>vault unlocked: <span className="font-semibold">{vaultStatus.unlocked ? "true" : "false"}</span></p>
          <p>vault autoLockMinutes: <span className="font-semibold">{vaultStatus.autoLockMinutes}</span></p>
          <p>vault failedAttempts: <span className="font-semibold">{vaultStatus.failedAttempts}</span></p>
        </div>
      </Card>
    </PageShell>
  );
}

