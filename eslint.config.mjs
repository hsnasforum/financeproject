import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const LEGACY_OBJECTS = ["response", "payload", "result", "data"];
const LEGACY_FIELDS = ["stage", "financialStatus", "stageDecision"];
const LEGACY_HELPER_ALLOWLIST = ["src/lib/planning/api/contracts.ts"];

const legacyTopLevelPropertyRules = LEGACY_OBJECTS.flatMap((objectName) =>
  LEGACY_FIELDS.map((property) => ({
    object: objectName,
    property,
    message: `Use ${objectName}.engine.${property} via normalizePlanningResponse()/getEngineEnvelope().`,
  }))
);

const legacyDestructureSelectors = LEGACY_OBJECTS.flatMap((objectName) =>
  LEGACY_FIELDS.map((field) => ({
    selector: `VariableDeclarator[init.type='Identifier'][init.name='${objectName}'] > ObjectPattern > Property[key.name='${field}']`,
    message: `Do not destructure legacy top-level ${field} from ${objectName}; use ${objectName}.engine.${field}.`,
  }))
);

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/lib/planning/**/*.{ts,tsx}", "src/app/api/planning/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/planner/*", "**/lib/planner/*"],
              message: "신규 금융 계산 로직은 src/lib/planning/engine/* 를 사용하세요.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "**/*.test.*",
      ...LEGACY_HELPER_ALLOWLIST,
    ],
    rules: {
      "no-restricted-properties": ["error", ...legacyTopLevelPropertyRules],
      "no-restricted-syntax": ["error", ...legacyDestructureSelectors],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "**/.next/**",
    ".dist/**",
    "out/**",
    "build/**",
    "coverage/**",
    "tmp/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
