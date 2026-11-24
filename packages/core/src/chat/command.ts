import type { ChatIdentity } from "@blue-orchid/domain";
import { Effect } from "effect";

import type { Catalog } from "../ports/Catalog.ts";
import type { Subscriptions } from "../ports/Subscriptions.ts";
import type { Reply } from "./Reply.ts";

export type CommandServices = Catalog | Subscriptions;

export interface OptionChoice {
  readonly value: string;
  readonly label: string;
}

export interface CommandOption {
  readonly name: string;
  readonly description: string;
  readonly required: boolean;
  /** Empty when the person types the value freely. */
  readonly choices: ReadonlyArray<OptionChoice>;
}

/** A chat command, the same on every platform. Each platform adapter turns these into its own command format. */
export interface ChatCommand {
  readonly description: string;
  readonly options: ReadonlyArray<CommandOption>;
  readonly invoke: (
    args: Readonly<Record<string, string>>,
    caller: ChatIdentity,
  ) => Effect.Effect<Reply, never, CommandServices>;
}

/** An option is required unless it has a default, and with choices only their values count. */
interface OptionSpec {
  readonly description: string;
  readonly default?: string;
  readonly choices?: ReadonlyArray<OptionChoice>;
}

/** Commands may not fail: every error becomes a reply, so the person always gets an answer. */
export const defineCommand = <const Name extends string = never>(definition: {
  readonly description: string;
  readonly options: { readonly [K in Name]: OptionSpec };
  /** `option("show")` is the trimmed value the person gave, or the option's default. It is never empty. */
  readonly run: (option: (name: Name) => string, caller: ChatIdentity) => Effect.Effect<Reply, never, CommandServices>;
}): ChatCommand => {
  const names = Object.keys(definition.options).filter((name): name is Name => name in definition.options);
  const value = (args: Readonly<Record<string, string>>, name: Name) => {
    const spec: OptionSpec = definition.options[name];
    const given = (args[name] ?? "").trim();
    const allowed = spec.choices === undefined || spec.choices.some((choice) => choice.value === given);
    return given !== "" && allowed ? given : (spec.default ?? "");
  };
  return {
    description: definition.description,
    options: names.map((name) => {
      const spec: OptionSpec = definition.options[name];
      return {
        name,
        description: spec.description,
        required: spec.default === undefined,
        choices: spec.choices ?? [],
      };
    }),
    invoke: (args, caller) => {
      const missing = names.filter((name) => value(args, name) === "");
      return missing.length > 0
        ? Effect.succeed({ _tag: "MissingOption", names: missing })
        : definition.run((name) => value(args, name), caller);
    },
  };
};
