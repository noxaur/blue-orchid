import type { ChatCommand } from "../command.ts";
import { follow } from "./follow.ts";
import { following } from "./following.ts";
import { schedule } from "./schedule.ts";
import { unfollow } from "./unfollow.ts";

/** Every chat command, by name. Each lives in its own file; adding one is a file and a line here. */
export const commands = { schedule, follow, unfollow, following } satisfies Record<string, ChatCommand>;

export type CommandName = keyof typeof commands;

export const isCommandName = (name: string): name is CommandName => Object.hasOwn(commands, name);
