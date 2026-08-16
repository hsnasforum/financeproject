import fs from "node:fs";
import { resolvePlanningOpenApiPaths } from "./planning_runtime_paths.mjs";

const { root: outDir, contract: outPath } = resolvePlanningOpenApiPaths({ cwd: process.cwd() });

const doc = {
  openapi: "3.0.3",
  info: {
    title: "Planning v2 Internal API Contract",
    version: "1.0.0",
    description: "Internal response contract baseline for planning/ops APIs.",
  },
  paths: {},
  components: {
    schemas: {
      ApiError: {
        type: "object",
        required: ["code", "message"],
        properties: {
          code: { type: "string" },
          message: { type: "string" },
          fixHref: { type: "string" },
          issues: { type: "array", items: { type: "string" } },
          details: {},
        },
      },
      ApiErrorResponse: {
        type: "object",
        required: ["ok", "error"],
        properties: {
          ok: { type: "boolean", enum: [false] },
          error: { $ref: "#/components/schemas/ApiError" },
          meta: { type: "object", additionalProperties: true },
        },
      },
      ApiOkBaseResponse: {
        type: "object",
        required: ["ok"],
        properties: {
          ok: { type: "boolean", enum: [true] },
          meta: { type: "object", additionalProperties: true },
        },
        additionalProperties: true,
      },
    },
  },
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
console.log(outPath);
