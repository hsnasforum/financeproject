import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  getCorpIndexStatus,
  invalidateCorpIndexCache,
  resolveCorpCodesIndexPath,
  type CorpIndexStatus,
} from "./corpIndex";

const execFileAsync = promisify(execFile);
const MAX_TAIL_LENGTH = 2_000;

type BuildResult = { ok: true; stdout: string; stderr: string } | { ok: false; message: string; stdout: string; stderr: string };
type ExecFileFailure = Error & { code?: string; stdout?: string | Buffer; stderr?: string | Buffer };
type ExecFileAsync = (
  file: string,
  args: readonly string[],
  options: { cwd: string; timeout: number; maxBuffer: number },
) => Promise<{ stdout?: string | Buffer; stderr?: string | Buffer }>;

export type CorpCodesIndexBuildPayload =
  | { ok: true; outPath: string; tookMs: number; status: CorpIndexStatus }
  | { ok: false; message: string; stdoutTail?: string; stderrTail: string };

export type CorpCodesIndexBuildServiceResult =
  | { ok: true; status: 200; payload: CorpCodesIndexBuildPayload }
  | { ok: false; status: 500; payload: CorpCodesIndexBuildPayload };

export type CorpCodesIndexBuildEnv = {
  DART_CORPCODES_INDEX_PATH?: string;
  DART_E2E_BUILD_STUB?: string;
};

export type CorpCodesIndexBuildOptions = {
  root?: string;
  env?: CorpCodesIndexBuildEnv;
  execFileAsync?: ExecFileAsync;
  getStatus?: () => CorpIndexStatus;
  now?: () => number;
  scriptPath?: string;
  stubFixturePath?: string;
};

export async function buildCorpCodesIndex(
  options: CorpCodesIndexBuildOptions = {},
): Promise<CorpCodesIndexBuildServiceResult> {
  const root = options.root ?? process.cwd();
  const env = options.env ?? process.env;
  const now = options.now ?? Date.now;
  const start = now();
  const outPath = resolveCorpCodesIndexPath(root, env.DART_CORPCODES_INDEX_PATH).primary;
  const useBuildStub = (env.DART_E2E_BUILD_STUB ?? "").trim() === "1";

  if (useBuildStub) {
    try {
      const stubFixturePath = options.stubFixturePath
        ?? path.join(root, "tests", "fixtures", "dart", "corpCodes.index.sample.json");
      await runBuildStub(stubFixturePath, outPath);
      invalidateCorpIndexCache();
      return buildSuccessPayload(outPath, now() - start, options.getStatus);
    } catch (error) {
      return {
        ok: false,
        status: 500,
        payload: {
          ok: false,
          message: "stub 인덱스 생성에 실패했습니다.",
          stderrTail: error instanceof Error ? sanitizeTail(error.message) : "unknown",
        },
      };
    }
  }

  const scriptPath = options.scriptPath ?? path.join(root, "scripts", "dart_corpcode_build.py");
  const built = await runBuild(scriptPath, outPath, root, options.execFileAsync ?? defaultExecFileAsync);
  if (!built.ok) {
    return {
      ok: false,
      status: 500,
      payload: {
        ok: false,
        message: built.message,
        stdoutTail: sanitizeTail(built.stdout),
        stderrTail: sanitizeTail(built.stderr),
      },
    };
  }

  invalidateCorpIndexCache();
  return buildSuccessPayload(outPath, now() - start, options.getStatus);
}

export function sanitizeTail(input: string): string {
  const masked = input
    .replace(/crtfc_key=[^&\s]+/gi, "crtfc_key=***")
    .replace(/opendart_api_key\s*=\s*[^\s]+/gi, "OPENDART_API_KEY=***")
    .trim();

  if (masked.length <= MAX_TAIL_LENGTH) return masked;
  return masked.slice(-MAX_TAIL_LENGTH);
}

async function defaultExecFileAsync(
  file: string,
  args: readonly string[],
  options: { cwd: string; timeout: number; maxBuffer: number },
): Promise<{ stdout?: string | Buffer; stderr?: string | Buffer }> {
  return execFileAsync(file, [...args], options);
}

async function runBuildStub(fixturePath: string, outPath: string): Promise<void> {
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.copyFile(fixturePath, outPath);
}

async function runBuild(
  scriptPath: string,
  outPath: string,
  root: string,
  execFileRunner: ExecFileAsync,
): Promise<BuildResult> {
  try {
    const result = await execFileRunner("python3", [scriptPath, "--out", outPath], {
      cwd: root,
      timeout: 120_000,
      maxBuffer: 1024 * 1024,
    });
    return {
      ok: true,
      stdout: bufferToString(result.stdout),
      stderr: bufferToString(result.stderr),
    };
  } catch (error) {
    const failure = error as ExecFileFailure;
    if (failure.code === "ENOENT") {
      return {
        ok: false,
        message: "python3를 찾을 수 없습니다.",
        stdout: "",
        stderr: "python3 executable not found",
      };
    }

    return {
      ok: false,
      message: "corpCodes 인덱스 생성에 실패했습니다.",
      stdout: bufferToString(failure.stdout),
      stderr: bufferToString(failure.stderr ?? failure.message),
    };
  }
}

function buildSuccessPayload(
  outPath: string,
  tookMs: number,
  getStatus = getCorpIndexStatus,
): CorpCodesIndexBuildServiceResult {
  return {
    ok: true,
    status: 200,
    payload: {
      ok: true,
      outPath,
      tookMs,
      status: getStatus(),
    },
  };
}

function bufferToString(value: string | Buffer | undefined): string {
  if (typeof value === "string") return value;
  if (Buffer.isBuffer(value)) return value.toString("utf8");
  return "";
}
