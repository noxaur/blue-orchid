import type { CommandServices, Reply } from "@blue-orchid/core";
import { actions, commands, isActionName, isCommandName } from "@blue-orchid/core";
import { ChatIdentity, ShowId } from "@blue-orchid/domain";
import { InteractionContextType, InteractionResponseType, InteractionType, MessageFlags } from "discord-api-types/v10";
import type {
  APIContainerComponent,
  APIInteractionResponse,
  APIInteractionResponseCallbackData,
} from "discord-api-types/v10";
import { Effect, Option, Schema } from "effect";

import { renderReply } from "./render.ts";
import { accent, notice } from "./views/blocks.ts";

const Interaction = Schema.Struct({
  type: Schema.Enum(InteractionType),
  data: Schema.optionalKey(
    Schema.Struct({
      /** Slash commands. */
      name: Schema.optionalKey(Schema.String),
      options: Schema.optionalKey(Schema.Array(Schema.Struct({ name: Schema.String, value: Schema.Unknown }))),
      /** Buttons and menus. */
      custom_id: Schema.optionalKey(Schema.String),
      values: Schema.optionalKey(Schema.Array(Schema.String)),
    }),
  ),
  /** Where the interaction happened. Older payloads leave it out; `member` is only set in servers. */
  context: Schema.optionalKey(Schema.Enum(InteractionContextType)),
  user: Schema.optionalKey(Schema.Struct({ id: Schema.String })),
  member: Schema.optionalKey(Schema.Struct({ user: Schema.Struct({ id: Schema.String }) })),
});
type Interaction = typeof Interaction.Type;

export const InteractionFromJson = Schema.fromJsonString(Interaction);

/** Every answer is a Components V2 message that mentions no one. Commands run only in DMs, so no one else sees it. */
const message = (components: Array<APIContainerComponent>): APIInteractionResponseCallbackData => ({
  components,
  allowed_mentions: { parse: [] },
  flags: MessageFlags.IsComponentsV2,
});

const reply = (answer: Reply): APIInteractionResponse => ({
  type: InteractionResponseType.ChannelMessageWithSource,
  data: message(renderReply(answer)),
});

/**
 * A button or menu press replaces the message it was on, so the message always shows where you stand. A failure
 * comes as a new message instead, so the controls stay for another try.
 */
const update = (answer: Reply): APIInteractionResponse =>
  answer._tag === "Trouble"
    ? reply(answer)
    : { type: InteractionResponseType.UpdateMessage, data: message(renderReply(answer)) };

/**
 * Commands are registered for the bot's DMs only, but Discord keeps showing older registrations for up to an
 * hour. Elsewhere a reply could show someone's follows to a whole server, so the bot only points to its DMs.
 */
const onlyInDms: APIInteractionResponse = {
  type: InteractionResponseType.ChannelMessageWithSource,
  data: { content: "blue-orchid works in DMs. Open a DM with the bot and try again.", flags: MessageFlags.Ephemeral },
};

const say = (heading: string): APIInteractionResponse => ({
  type: InteractionResponseType.ChannelMessageWithSource,
  data: message([notice(accent.neutral, heading, "Try /schedule, /follow, /unfollow or /following.")]),
});

const ShowIds = Schema.Array(ShowId);

/** A control's custom id is `action` or `action:showId`; a menu sends its chosen show ids as values. */
const readControl = (customId: string, values: ReadonlyArray<string> | undefined) => {
  const split = customId.indexOf(":");
  const name = split === -1 ? customId : customId.slice(0, split);
  const ids = Schema.decodeUnknownOption(ShowIds)(values ?? (split === -1 ? [] : [customId.slice(split + 1)]));
  return isActionName(name) && Option.isSome(ids) ? Option.some({ name, shows: ids.value }) : Option.none();
};

export const respond = Effect.fn("Discord.respond")(function* (
  interaction: Interaction,
): Effect.fn.Return<APIInteractionResponse, never, CommandServices> {
  if (interaction.type === InteractionType.Ping) {
    return { type: InteractionResponseType.Pong };
  }
  const userId = interaction.user?.id ?? interaction.member?.user.id;
  if (userId === undefined) {
    return say("This bot only answers people");
  }
  if (
    interaction.member !== undefined ||
    (interaction.context ?? InteractionContextType.BotDM) !== InteractionContextType.BotDM
  ) {
    return onlyInDms;
  }
  const caller = new ChatIdentity({ platform: "discord", userId });
  const data = interaction.data;
  if (interaction.type === InteractionType.MessageComponent && data?.custom_id !== undefined) {
    const control = readControl(data.custom_id, data.values);
    if (Option.isNone(control)) {
      return say("That button no longer works");
    }
    return update(yield* actions[control.value.name].invoke(control.value.shows, caller));
  }
  const name = data?.name;
  if (interaction.type !== InteractionType.ApplicationCommand || name === undefined) {
    return say("This bot only answers slash commands");
  }
  if (!isCommandName(name)) {
    return say(`Unknown command /${name}`);
  }
  const args = Object.fromEntries(
    (data?.options ?? []).map((option) => [option.name, typeof option.value === "string" ? option.value : ""]),
  );
  return reply(yield* commands[name].invoke(args, caller));
});
