import { commands } from "@blue-orchid/core";
import { frieren, makeInMemory } from "@blue-orchid/core/testing";
import { describe, expect, it } from "@effect/vitest";
import { InteractionContextType, InteractionResponseType, InteractionType, MessageFlags } from "discord-api-types/v10";
import { Context, Effect, Layer, Option, Redacted } from "effect";
import { HttpRouter, HttpServer } from "effect/http";

import { applicationCommands } from "./applicationCommands.ts";
import { DiscordConfig } from "./DiscordConfig.ts";
import { DiscordRoutes, interactionsPath } from "./routes.ts";

const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");

const signer = Effect.promise(async () => {
  const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const publicKey = hex(await crypto.subtle.exportKey("raw", pair.publicKey));
  const sign = async (timestamp: string, body: string) =>
    hex(await crypto.subtle.sign({ name: "Ed25519" }, pair.privateKey, new TextEncoder().encode(timestamp + body)));
  return { publicKey, sign };
});

const post = (body: unknown, headers: Record<string, string>) =>
  new Request(`https://tracker.test${interactionsPath}`, { method: "POST", body: JSON.stringify(body), headers });

const setup = Effect.gen(function* () {
  const { publicKey, sign } = yield* signer;
  const memory = yield* makeInMemory({ shows: [frieren] });
  const config = Layer.succeed(
    DiscordConfig,
    Option.some({ applicationId: "1", publicKey, botToken: Redacted.make("token") }),
  );
  const { handler, dispose } = HttpRouter.toWebHandler(
    DiscordRoutes.pipe(Layer.provide([memory.layer, config]), Layer.provide(HttpServer.layerServices)),
    { disableLogger: true },
  );
  yield* Effect.addFinalizer(() => Effect.promise(dispose));
  const send = (body: unknown, signature?: string) =>
    Effect.promise(async () => {
      const timestamp = "1700000000";
      const raw = JSON.stringify(body);
      const response = await handler(
        post(body, {
          "x-signature-ed25519": signature ?? (await sign(timestamp, raw)),
          "x-signature-timestamp": timestamp,
        }),
        Context.empty(),
      );
      return { status: response.status, json: response.status === 200 ? await response.json() : null };
    });
  return { send };
});

describe("DiscordRoutes", () => {
  it.effect("answers Discord's ping", () =>
    Effect.gen(function* () {
      const { send } = yield* setup;
      const answer = yield* send({ type: InteractionType.Ping });
      expect(answer).toEqual({ status: 200, json: { type: InteractionResponseType.Pong } });
    }).pipe(Effect.scoped),
  );

  it.effect("rejects a bad signature, as Discord checks", () =>
    Effect.gen(function* () {
      const { send } = yield* setup;
      const answer = yield* send({ type: InteractionType.Ping }, "00".repeat(64));
      expect(answer.status).toBe(401);
    }).pipe(Effect.scoped),
  );

  it.effect("runs /follow for the user who sent it, as a Components V2 message", () =>
    Effect.gen(function* () {
      const { send } = yield* setup;
      const answer = yield* send({
        type: InteractionType.ApplicationCommand,
        user: { id: "77" },
        data: { name: "follow", options: [{ name: "show", type: 3, value: "frieren" }] },
      });
      expect(answer.json).toMatchObject({
        type: InteractionResponseType.ChannelMessageWithSource,
        data: { flags: MessageFlags.IsComponentsV2 },
      });
      expect(JSON.stringify(answer.json)).toContain(`Now following\\n## Frieren: Beyond Journey's End`);
      expect(JSON.stringify(answer.json)).toContain(`"custom_id":"unfollow:${frieren.id}"`);
    }).pipe(Effect.scoped),
  );

  it.effect("turns the message into the unfollowed one when its Unfollow button is pressed", () =>
    Effect.gen(function* () {
      const { send } = yield* setup;
      const press = (customId: string) =>
        send({
          type: InteractionType.MessageComponent,
          user: { id: "77" },
          data: { custom_id: customId, component_type: 2 },
        });
      yield* press(`follow:${frieren.id}`);
      const answer = yield* press(`unfollow:${frieren.id}`);
      expect(answer.json).toMatchObject({
        type: InteractionResponseType.UpdateMessage,
        data: { flags: MessageFlags.IsComponentsV2 },
      });
      expect(JSON.stringify(answer.json)).toContain("You won't get messages about this show.");
      const stale = yield* press("rename:whatever");
      expect(JSON.stringify(stale.json)).toContain("That button no longer works");
    }).pipe(Effect.scoped),
  );

  it.effect("only points to DMs when a command comes from a server, and changes nothing", () =>
    Effect.gen(function* () {
      const { send } = yield* setup;
      const answer = yield* send({
        type: InteractionType.ApplicationCommand,
        context: InteractionContextType.Guild,
        member: { user: { id: "77" } },
        data: { name: "follow", options: [{ name: "show", type: 3, value: "frieren" }] },
      });
      expect(answer.json).toEqual({
        type: InteractionResponseType.ChannelMessageWithSource,
        data: {
          content: "blue-orchid works in DMs. Open a DM with the bot and try again.",
          flags: MessageFlags.Ephemeral,
        },
      });
      const list = yield* send({
        type: InteractionType.ApplicationCommand,
        context: InteractionContextType.BotDM,
        user: { id: "77" },
        data: { name: "following" },
      });
      expect(JSON.stringify(list.json)).toContain("You don't follow any shows yet");
    }).pipe(Effect.scoped),
  );

  it.effect("answers a failed press with a new message, so the controls stay for another try", () =>
    Effect.gen(function* () {
      const { send } = yield* setup;
      const answer = yield* send({
        type: InteractionType.MessageComponent,
        user: { id: "77" },
        data: { custom_id: "follow:anilist:1", component_type: 2 },
      });
      expect(answer.json).toMatchObject({ type: InteractionResponseType.ChannelMessageWithSource });
      expect(JSON.stringify(answer.json)).toContain("Something went wrong on our side");
    }).pipe(Effect.scoped),
  );

  it.effect("unfollows the shows picked in the following menu", () =>
    Effect.gen(function* () {
      const { send } = yield* setup;
      yield* send({
        type: InteractionType.MessageComponent,
        user: { id: "77" },
        data: { custom_id: `follow:${frieren.id}` },
      });
      const answer = yield* send({
        type: InteractionType.MessageComponent,
        user: { id: "77" },
        data: { custom_id: "unfollowMany", component_type: 3, values: [frieren.id] },
      });
      expect(JSON.stringify(answer.json)).toContain("You don't follow any shows yet");
    }).pipe(Effect.scoped),
  );

  it("registers every core command, for DMs only, with /schedule's shows as an optional choice", () => {
    const registered = applicationCommands(commands);
    expect(registered.map((command) => command.name)).toEqual(Object.keys(commands));
    expect(registered.find((command) => command.name === "schedule")).toMatchObject({
      contexts: [InteractionContextType.BotDM],
      options: [
        {
          name: "shows",
          required: false,
          choices: [
            { name: "Following", value: "following" },
            { name: "All", value: "all" },
          ],
        },
      ],
    });
  });
});
