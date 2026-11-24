// @ts-check
/**
 * The package graph (see AGENTS.md). Every rule's `comment` is the fix: depcruise prints it on violation.
 * Adding a package: ask the user first, then add it to `packages` below and give it an AGENTS.md.
 */

/**
 * @typedef {{ dir: string, workspace: string[], npm: string[] | "any", node: boolean, hint: string }} PackageRule
 * @type {Record<string, PackageRule>}
 */
const packages = {
  domain: {
    dir: "packages/domain",
    workspace: [],
    npm: ["effect"],
    node: false,
    hint: "domain is the innermost layer: schemas, branded ids, tagged errors and pure functions. Code that needs other packages goes in core.",
  },
  core: {
    dir: "packages/core",
    workspace: ["domain"],
    npm: ["effect"],
    node: false,
    hint: "core never touches the network, the database or a platform. Define a port (Context.Service) in packages/core/src/ports and implement it in an adapter package or apps/tracker/server.",
  },
  graphql: {
    dir: "packages/graphql",
    workspace: ["core", "domain"],
    npm: ["effect", "graphql", "graphql-yoga", "@pothos/core"],
    node: false,
    hint: "graphql turns core's use cases into the private API. It never runs Effects: resolvers hand them to context.run, which the app supplies.",
  },
  "chat-discord": {
    dir: "packages/chat-discord",
    workspace: ["core", "domain"],
    npm: ["effect", "discord-api-types"],
    node: false,
    hint: "chat-discord adapts core's commands and Messenger port to Discord. Platform-neutral logic belongs in core.",
  },
  "source-anilist": {
    dir: "packages/source-anilist",
    workspace: ["core", "domain"],
    npm: ["effect"],
    node: false,
    hint: "source-anilist implements core's CatalogSource for AniList. Import logic belongs in core.",
  },
  web: {
    dir: "packages/web",
    workspace: ["domain", "graphql"],
    npm: ["effect", "react", "react-dom", "@tanstack/react-router"],
    node: false,
    hint: "web is the browser app. It reads data only through the GraphQL operations in @blue-orchid/graphql/operations, never from core or the server.",
  },
  tracker: {
    dir: "apps/tracker",
    workspace: ["chat-discord", "core", "domain", "graphql", "source-anilist", "web"],
    npm: "any",
    node: true,
    hint: "tracker is the Void app: it wires packages together and deploys them. Logic goes in a package.",
  },
  infra: {
    dir: "infra",
    workspace: [],
    npm: "any",
    node: true,
    hint: "infra is the Alchemy stack for resources Void does not own. It never imports app code.",
  },
};

const npmTypes = ["npm", "npm-dev", "npm-optional", "npm-peer", "npm-bundled", "npm-no-pkg", "npm-unknown"];
const tests = "\\.test\\.tsx?$";
const allDirs = Object.values(packages).map((p) => p.dir);
const escape = (/** @type {string} */ name) => name.replace(/[/.]/g, (char) => `\\${char}`);

/** @type {import("dependency-cruiser").IForbiddenRuleType[]} */
const perPackage = Object.entries(packages).flatMap(([name, p]) => {
  const allowedDirs = [p.dir, ...p.workspace.map((w) => packages[w]?.dir ?? `packages/${w}`)];
  const allowedList =
    p.workspace.length === 0 ? "nothing from the workspace" : p.workspace.map((w) => `@blue-orchid/${w}`).join(", ");
  /** @type {import("dependency-cruiser").IForbiddenRuleType[]} */
  const rules = [
    {
      name: `${name}-workspace-imports`,
      severity: "error",
      comment: `${name} may import ${allowedList}. ${p.hint}`,
      from: { path: `^${p.dir}/` },
      to: { path: `^(${allDirs.join("|")})/`, pathNot: `^(${allowedDirs.join("|")})/` },
    },
  ];
  if (p.npm !== "any") {
    rules.push({
      name: `${name}-npm-imports`,
      severity: "error",
      comment: `${name} may only import these npm packages: ${p.npm.join(", ")}. Ask the user before adding one, then add it here. ${p.hint}`,
      from: { path: `^${p.dir}/`, pathNot: tests },
      to: { dependencyTypes: npmTypes, pathNot: `node_modules/(${p.npm.map(escape).join("|")})/` },
    });
  }
  if (!p.node) {
    rules.push({
      name: `${name}-no-node`,
      severity: "error",
      comment: `${name} may not import node:* modules: it runs in a Worker or a browser. ${p.hint}`,
      from: { path: `^${p.dir}/`, pathNot: tests },
      to: { dependencyTypes: ["core"] },
    });
  }
  return rules;
});

/** @type {import("dependency-cruiser").IConfiguration} */
module.exports = {
  forbidden: [
    ...perPackage,
    {
      name: "unknown-package",
      severity: "error",
      comment: `Not an approved package. Approved: ${allDirs.join(", ")}. Put the code in one of them (see AGENTS.md). A new package needs the user's approval and an entry in tools/lint/dependency-cruiser.cjs. Never add "shared" or "utils" packages.`,
      from: { path: "^(apps|packages)/", pathNot: `^(${allDirs.join("|")})/` },
      to: {},
    },
    {
      name: "web-operations-only",
      severity: "error",
      comment:
        'web may import only "@blue-orchid/graphql/operations". Add the query there; its test checks it against the schema.',
      from: { path: "^packages/web/" },
      to: { path: "^packages/graphql/src/", pathNot: "^packages/graphql/src/operations\\.ts$" },
    },
    {
      name: "testing-only-in-tests",
      severity: "error",
      comment: '"@blue-orchid/core/testing" holds in-memory fakes. Import it only from *.test.ts files.',
      from: { pathNot: [tests, "^packages/core/src/testing/"] },
      to: { path: "^packages/core/src/testing/" },
    },
    {
      name: "env-in-one-place",
      severity: "error",
      comment:
        "Read server values only in apps/tracker/server/AppLive.ts, and pass them on as services. Declare new ones in apps/tracker/env.ts.",
      from: { path: "^apps/tracker/", pathNot: "^apps/tracker/(server/AppLive|env)\\.ts$" },
      to: { path: "node_modules/void/dist/.*env", dependencyTypes: npmTypes },
    },
    {
      name: "no-relative-cross-package",
      severity: "error",
      comment:
        'Import other workspace packages by name ("@blue-orchid/core"), never by relative path. Add it to package.json with "workspace:*" if it is missing.',
      from: { path: "^(apps|packages)/([^/]+)/" },
      to: { path: "^(apps|packages|infra)/", pathNot: "^$1/$2/", dependencyTypes: ["local"] },
    },
    {
      name: "no-circular",
      severity: "error",
      comment:
        "Circular import. Move the shared piece to the module both depend on (often packages/domain), or invert it with a port in packages/core/src/ports.",
      from: {},
      to: { circular: true },
    },
    {
      name: "not-to-unresolvable",
      severity: "error",
      comment:
        'Cannot resolve this import. Workspace package? Add "@blue-orchid/<name>": "workspace:*" to this package\'s package.json and run pnpm install. Deep import? Use what the package\'s "exports" offers.',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: "not-to-undeclared",
      severity: "error",
      comment:
        "This npm package isn't in the importing package's package.json. Add it there with \"catalog:\", and its version to the catalog in pnpm-workspace.yaml.",
      from: {},
      to: { dependencyTypes: ["npm-no-pkg", "npm-unknown"] },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: "^(apps/[^/]+|packages/[^/]+|infra)/(dist|\\.void|\\.cloudflare|\\.alchemy)/" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.base.json" },
    combinedDependencies: false,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      mainFields: ["module", "main", "types"],
      extensions: [".ts", ".tsx", ".js", ".mjs", ".cjs", ".d.ts"],
    },
    reporterOptions: { text: { highlightFocused: true } },
  },
};
