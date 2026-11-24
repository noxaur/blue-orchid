import { defineConfig } from "vite-plus";

const generated = [
  "**/dist/**",
  "**/.void/**",
  "**/.void-wrangler.jsonc",
  "**/void.lock.json",
  "**/.cloudflare/**",
  "**/.alchemy/**",
  "**/db/migrations/**",
];
/** Skills installed from another repo and pinned in skills-lock.json. Change them upstream, not here. */
const vendored = ["**/.agents/skills/**"];
const tests = ["**/*.test.ts", "**/*.test.tsx"];

/** Wiring code: the only places that may run Effects or provide layers. Keep this list short. */
const compositionRoots = [
  "apps/tracker/server/**",
  "apps/tracker/routes/**",
  "apps/tracker/crons/**",
  "apps/tracker/scripts/**",
  "packages/web/src/runtime.ts",
];

const orchidRules = {
  "orchid/no-effect-run": "error",
  "orchid/no-throw": "error",
  "orchid/no-try-catch": "error",
  "orchid/no-async": "error",
  "orchid/no-type-assertion": "error",
  "orchid/no-any": "error",
  "orchid/prefer-effect-fn": "error",
  "orchid/service-style": "error",
  "orchid/schema-errors": "error",
  "orchid/no-json-parse": "error",
  "orchid/time-through-effect": "error",
  "orchid/no-process-env": "error",
  "orchid/infra-owns-extras-only": "error",
} as const;

const off = (rules: Record<string, unknown>): Record<string, "off"> =>
  Object.fromEntries(Object.keys(rules).map((rule) => [rule, "off"]));

export default defineConfig({
  // Lint, format and test config lives only here. vite-plus ignores these blocks in package configs.
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }, "./tools/lint/orchid.ts"],
    ignorePatterns: generated,
    options: { typeAware: true, typeCheck: false },
    categories: { correctness: "error", suspicious: "error" },
    rules: {
      "vite-plus/prefer-vite-plus-imports": "error",
      eqeqeq: "error",
      curly: "error",
      "no-console": "error",
      "prefer-const": "error",
      "typescript/consistent-type-imports": "error",
      "typescript/no-floating-promises": "error",
      "typescript/switch-exhaustiveness-check": "error",
      "typescript/strict-boolean-expressions": "error",
      // Effect's tagged unions use `_tag`.
      "no-underscore-dangle": ["error", { allow: ["_tag"] }],
      // An Effect generator leaves early with `return yield* failure`, which this rule reads as a missing value.
      "typescript/consistent-return": "off",
      ...orchidRules,
    },
    overrides: [
      { files: compositionRoots, rules: { "orchid/no-effect-run": "off" } },
      { files: ["apps/tracker/env.ts", "apps/tracker/scripts/**"], rules: { "orchid/no-process-env": "off" } },
      // The website shows times with the browser's clock and Intl. The server and bot go through Effect's Clock.
      { files: ["packages/web/**"], rules: { "orchid/time-through-effect": "off" } },
      {
        files: tests,
        rules: {
          "orchid/no-effect-run": "off",
          "orchid/no-type-assertion": "off",
          "orchid/no-any": "off",
          "orchid/no-async": "off",
        },
      },
      // Build config and repo tooling are plain Node scripts, not app code.
      { files: ["tools/**", "**/vite.config.ts", "**/void.config.ts", "**/*.cjs"], rules: off(orchidRules) },
    ],
  },
  fmt: {
    printWidth: 120,
    ignorePatterns: [...generated, ...vendored],
  },
  staged: {
    "*": "vp check --fix",
  },
  test: {
    include: ["{apps,packages}/*/{src,test}/**/*.test.{ts,tsx}", "tools/**/*.test.ts"],
    // Unit tests run in memory. One that needs more than this is waiting on something real and belongs elsewhere.
    testTimeout: 5_000,
    hookTimeout: 5_000,
    pool: "threads",
    // graphql ships a CJS and an ESM build. Inlining its users makes the tests load one, as the worker bundle does.
    server: { deps: { inline: [/@pothos\//, /graphql-yoga/, /@graphql-tools\//, /@graphql-yoga\//] } },
  },
  run: {
    cache: true,
    tasks: {
      // The one gate, run by `pnpm check`. The pre-commit hook, the Claude Code Stop hook and CI all run it.
      gate: {
        command: [
          "vp check --deny-warnings",
          "vp run -r typecheck",
          "depcruise apps packages infra --config tools/lint/dependency-cruiser.cjs --output-type err-long",
          "knip",
          "sherif",
          "node tools/scripts/docs.ts",
          "node tools/scripts/skills.ts",
          "vp test run",
        ],
        cache: false,
      },
    },
  },
});
