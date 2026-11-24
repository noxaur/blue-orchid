/**
 * The repo's own lint rules, wired up and scoped per path in the root vite.config.ts.
 * Every message says how to fix the problem, because agents act on the message alone.
 * Import plugin helpers from vite-plus/lint/plugins so they match the bundled oxlint.
 */
import { definePlugin, defineRule, type ESTree } from "vite-plus/lint/plugins";

/** `Obj.prop` → "Obj.prop"; anything else → undefined. */
const memberPath = (node: ESTree.Node): string | undefined => {
  if (node.type !== "MemberExpression" || node.computed) {
    return undefined;
  }
  if (node.object.type !== "Identifier" || node.property.type !== "Identifier") {
    return undefined;
  }
  return `${node.object.name}.${node.property.name}`;
};

const ROOTS = "apps/tracker/{server,routes,crons,scripts} or packages/web/src/runtime.ts";

const noEffectRun = defineRule({
  create(context) {
    return {
      MemberExpression(node) {
        const path = memberPath(node);
        if (path === undefined) {
          return;
        }
        const [object = "", property = ""] = path.split(".");
        const forbidden =
          (object === "Effect" && (property.startsWith("run") || property === "provide")) ||
          (object === "Layer" && (property.startsWith("provide") || property === "launch")) ||
          object === "ManagedRuntime";
        if (!forbidden) {
          return;
        }
        context.report({
          node,
          message: `\`${path}\` runs or wires the app, which only ${ROOTS} may do. Leave the requirement in the Effect's type (R) and provide it in apps/tracker/server/AppLive.ts. Tests may provide layers.`,
        });
      },
    };
  },
});

const noThrow = defineRule({
  create(context) {
    return {
      ThrowStatement(node) {
        context.report({
          node,
          message:
            "Don't throw. Fail with a tagged error: `return yield* new MyError({ ... })`, with MyError defined with Schema.TaggedError (examples: packages/domain/src/errors.ts).",
        });
      },
    };
  },
});

const noTryCatch = defineRule({
  create(context) {
    return {
      TryStatement(node) {
        context.report({
          node,
          message:
            "Don't use try/catch. Wrap code that can throw in Effect.try or Effect.tryPromise, turn the failure into a tagged error, and handle it with Effect.catchTag.",
        });
      },
    };
  },
});

const asyncMessage =
  "Don't use async/await. Write an Effect with Effect.gen or Effect.fn and `yield*`; wrap Promise APIs with Effect.tryPromise.";

const noAsync = defineRule({
  create(context) {
    const checkFunction = (node: ESTree.Function | ESTree.ArrowFunctionExpression) => {
      if (node.async) {
        context.report({ node, message: asyncMessage });
      }
    };
    return {
      FunctionDeclaration: checkFunction,
      FunctionExpression: checkFunction,
      ArrowFunctionExpression: checkFunction,
      AwaitExpression(node) {
        context.report({ node, message: asyncMessage });
      },
      NewExpression(node) {
        if (node.callee.type !== "Identifier" || node.callee.name !== "Promise") {
          return;
        }
        context.report({ node, message: "Don't create Promises. Wrap callback APIs with Effect.callback." });
      },
    };
  },
});

const assertionMessage =
  "Don't cast with `as` or assert non-null with `!`. Decode unknown data with Schema.decodeUnknownEffect, narrow with a type guard or an `=== undefined` check, or fix the type where it is created. (`as const` and casts in *.test.ts files are allowed.)";

const noTypeAssertion = defineRule({
  create(context) {
    return {
      TSAsExpression(node) {
        const type = node.typeAnnotation;
        const isConst =
          type.type === "TSTypeReference" && type.typeName.type === "Identifier" && type.typeName.name === "const";
        if (!isConst) {
          context.report({ node, message: assertionMessage });
        }
      },
      TSTypeAssertion(node) {
        context.report({ node, message: assertionMessage });
      },
      TSNonNullExpression(node) {
        context.report({ node, message: assertionMessage });
      },
    };
  },
});

const noAny = defineRule({
  create(context) {
    return {
      TSAnyKeyword(node) {
        context.report({
          node,
          message:
            "Don't use `any`. Use `unknown` and narrow it (or decode it with Schema), or write the precise type.",
        });
      },
    };
  },
});

const preferEffectFn = defineRule({
  create(context) {
    const reported = new Set<ESTree.Node>();
    return {
      // `() => Effect.gen(...)`, or `return Effect.gen(...)` anywhere in a function's body.
      CallExpression(node) {
        if (memberPath(node.callee) !== "Effect.gen") {
          return;
        }
        // Look through `cond ? Effect.gen(...) : x` and `Effect.gen(...) satisfies T` to what returns it.
        let value: ESTree.Node = node;
        while (
          (value.parent.type === "ConditionalExpression" && value.parent.test !== value) ||
          value.parent.type === "TSSatisfiesExpression"
        ) {
          value = value.parent;
        }
        const parent = value.parent;
        const isArrowBody = parent.type === "ArrowFunctionExpression" && parent.body === value;
        if (!isArrowBody && parent.type !== "ReturnStatement") {
          return;
        }
        let fn: ESTree.Node = parent;
        while (
          fn.type !== "ArrowFunctionExpression" &&
          fn.type !== "FunctionExpression" &&
          fn.type !== "FunctionDeclaration"
        ) {
          if (fn.type === "Program") {
            return;
          }
          fn = fn.parent;
        }
        // A generator is already the body of Effect.gen or Effect.fn.
        if ((fn.type !== "ArrowFunctionExpression" && fn.generator) || reported.has(fn)) {
          return;
        }
        reported.add(fn);
        context.report({
          node: fn,
          message:
            'Don\'t wrap Effect.gen in a function. Use Effect.fn, which adds a trace span and keeps one style: `const name = Effect.fn("Area.name")(function* (arg) { ... })`. Callbacks take it too: `it.effect("does x", Effect.fn(function* () { ... }))`, `HttpRouter.use(Effect.fn("Area.addRoutes")(function* (router) { ... }))`.',
        });
      },
    };
  },
});

const serviceMessage =
  'Declare services one way: `class Name extends Context.Service<Name, { ... }>()("orchid/<package>/Name") {}` (example: packages/core/src/ports/Catalog.ts).';

const serviceStyle = defineRule({
  create(context) {
    return {
      MemberExpression(node) {
        const path = memberPath(node);
        if (path === "Context.Tag" || path === "Context.GenericTag" || path === "Effect.Service") {
          context.report({ node, message: serviceMessage });
        }
      },
      CallExpression(node) {
        if (memberPath(node.callee) !== "Context.Service") {
          return;
        }
        // The class form is `Context.Service<...>()("id")`: the inner call has no arguments.
        if (node.arguments.length > 0) {
          context.report({ node, message: serviceMessage });
          return;
        }
        const parent = node.parent;
        if (parent.type !== "CallExpression") {
          return;
        }
        const id = parent.arguments[0];
        if (id?.type === "Literal" && typeof id.value === "string" && !id.value.startsWith("orchid/")) {
          context.report({
            node,
            message: `Service id "${id.value}" must start with "orchid/<package>/", for example "orchid/core/Catalog".`,
          });
        }
      },
    };
  },
});

const schemaErrors = defineRule({
  create(context) {
    return {
      MemberExpression(node) {
        const path = memberPath(node);
        if (path !== "Data.TaggedError" && path !== "Data.Error") {
          return;
        }
        context.report({
          node,
          message:
            "Define errors with Schema.TaggedError so they can be encoded and logged (examples: packages/domain/src/errors.ts).",
        });
      },
    };
  },
});

const noJsonParse = defineRule({
  create(context) {
    return {
      MemberExpression(node) {
        if (memberPath(node) !== "JSON.parse") {
          return;
        }
        context.report({
          node,
          message:
            "Don't JSON.parse. Decode with a schema: `Schema.decodeUnknownEffect(Schema.fromJsonString(MySchema))(text)`, so bad input becomes a typed error (example: packages/chat-discord/src/interaction.ts).",
        });
      },
    };
  },
});

const timeMessage =
  "Read the time through Effect: `yield* DateTime.now`. Tests then control it with TestClock (example: packages/core/src/schedule/sync.test.ts).";

const timeThroughEffect = defineRule({
  create(context) {
    return {
      MemberExpression(node) {
        if (memberPath(node) === "Date.now") {
          context.report({ node, message: timeMessage });
        }
      },
      NewExpression(node) {
        if (node.callee.type === "Identifier" && node.callee.name === "Date" && node.arguments.length === 0) {
          context.report({ node, message: timeMessage });
        }
      },
    };
  },
});

const noProcessEnv = defineRule({
  create(context) {
    return {
      MemberExpression(node) {
        if (memberPath(node) !== "process.env") {
          return;
        }
        context.report({
          node,
          message:
            'Don\'t read process.env. Declare the value in apps/tracker/env.ts, read it with `import { env } from "void/env"` in apps/tracker/server/AppLive.ts, and pass it in as a service.',
        });
      },
    };
  },
});

/** Alchemy resources Void already creates for the app, as exports of @alchemy.run/cloudflare. */
const voidOwned = ["Worker", "Workers", "Website", "D1"];

const infraMessage = (name: string) =>
  `\`${name}\` is a resource Void owns. The app's Worker, site and D1 database belong to apps/tracker, and Void creates them on \`void deploy\`. Alchemy declares only what Void does not (see docs/internals/hosting.md).`;

const infraOwnsExtrasOnly = defineRule({
  create(context) {
    if (!context.filename.includes("/infra/")) {
      return {};
    }
    /** Local names of `import * as X from "@alchemy.run/cloudflare"`, whatever the file calls it. */
    const namespaces = new Set<string>();
    return {
      // Collect namespace names first: a module may use `Cloudflare.X` above the line that imports it.
      Program(program) {
        for (const statement of program.body) {
          if (statement.type !== "ImportDeclaration" || statement.source.value !== "@alchemy.run/cloudflare") {
            continue;
          }
          for (const specifier of statement.specifiers) {
            if (specifier.type === "ImportNamespaceSpecifier") {
              namespaces.add(specifier.local.name);
            }
          }
        }
      },
      ImportDeclaration(node) {
        const source = node.source.value;
        const subpath = source.replace(/^@alchemy\.run\/cloudflare\/?/, "");
        if (source === subpath) {
          return;
        }
        const [first = ""] = subpath.split("/");
        if (voidOwned.includes(first)) {
          context.report({ node, message: infraMessage(source) });
          return;
        }
        for (const specifier of node.specifiers) {
          if (
            specifier.type === "ImportSpecifier" &&
            specifier.imported.type === "Identifier" &&
            voidOwned.includes(specifier.imported.name)
          ) {
            context.report({ node: specifier, message: infraMessage(specifier.imported.name) });
          }
        }
      },
      MemberExpression(node) {
        const path = memberPath(node);
        if (path === undefined) {
          return;
        }
        const [object = "", property = ""] = path.split(".");
        if (namespaces.has(object) && voidOwned.includes(property)) {
          context.report({ node, message: infraMessage(path) });
        }
      },
    };
  },
});

export default definePlugin({
  meta: { name: "orchid" },
  rules: {
    "no-effect-run": noEffectRun,
    "no-throw": noThrow,
    "no-try-catch": noTryCatch,
    "no-async": noAsync,
    "no-type-assertion": noTypeAssertion,
    "no-any": noAny,
    "prefer-effect-fn": preferEffectFn,
    "service-style": serviceStyle,
    "schema-errors": schemaErrors,
    "no-json-parse": noJsonParse,
    "time-through-effect": timeThroughEffect,
    "no-process-env": noProcessEnv,
    "infra-owns-extras-only": infraOwnsExtrasOnly,
  },
});
