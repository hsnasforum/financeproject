import { requireGithubEnv } from "./env";

export type GitHubRepoConfig = {
  token: string;
  owner: string;
  repo: string;
};

export type GitHubConfigResult =
  | {
      ok: true;
      data: GitHubRepoConfig;
      missing: [];
    }
  | {
      ok: false;
      data: null;
      missing: string[];
    };

type RequestInitLike = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

export type GithubClient = {
  request<T>(path: string, init?: RequestInit): Promise<T>;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizePath(path: string): string {
  const value = asString(path);
  return value.startsWith("/") ? value : `/${value}`;
}

function parseErrorMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = asString((payload as { message?: unknown }).message);
    if (message) return message;
  }
  return `GitHub API request failed (status ${status})`;
}

export function readGitHubRepoConfig(env: NodeJS.ProcessEnv = process.env): GitHubConfigResult {
  const token = asString(env.GITHUB_TOKEN) || asString(env.GITHUB_TOKEN_DISPATCH);
  const owner = asString(env.GITHUB_OWNER) || asString(env.GITHUB_REPO_OWNER);
  const repo = asString(env.GITHUB_REPO) || asString(env.GITHUB_REPO_NAME);
  const missing: string[] = [];

  if (!token) missing.push("GITHUB_TOKEN");
  if (!owner) missing.push("GITHUB_OWNER");
  if (!repo) missing.push("GITHUB_REPO");

  if (missing.length > 0) {
    return { ok: false, data: null, missing };
  }

  return {
    ok: true,
    data: {
      token,
      owner,
      repo,
    },
    missing: [],
  };
}

export function getGithubClient(): GithubClient {
  if (typeof window !== "undefined") {
    throw new Error("GitHub client is server-only.");
  }

  const config = requireGithubEnv();
  const baseHeaders = createGitHubHeaders(config.token, "finance-github-client");

  return {
    async request<T>(path: string, init?: RequestInit): Promise<T> {
      const endpoint = `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}${sanitizePath(path)}`;
      const headers = new Headers(init?.headers);
      for (const [key, value] of Object.entries(baseHeaders)) {
        if (!headers.has(key)) headers.set(key, value);
      }

      const response = await fetch(endpoint, {
        ...init,
        headers,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message = parseErrorMessage(payload, response.status);
        throw new Error(message);
      }

      if (response.status === 204) {
        return null as T;
      }

      return (await response.json()) as T;
    },
  };
}

export function createGitHubHeaders(token: string, userAgent: string, extra?: Record<string, string>): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": userAgent,
    ...(extra ?? {}),
  };
}

export async function githubRequest(
  config: GitHubRepoConfig,
  endpointPath: string,
  userAgent: string,
  init?: RequestInitLike,
): Promise<Response> {
  const path = endpointPath.startsWith("/") ? endpointPath : `/${endpointPath}`;
  const endpoint = `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}${path}`;
  const headers = createGitHubHeaders(config.token, userAgent, init?.headers);

  return fetch(endpoint, {
    method: init?.method ?? "GET",
    headers,
    ...(typeof init?.body === "string" ? { body: init.body } : {}),
  });
}
