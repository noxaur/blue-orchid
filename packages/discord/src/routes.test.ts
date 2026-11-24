import { commands } from "@blue-orchid/core";
import { frieren, makeInMemory } from "@blue-orchid/core/testing";
import { describe, expect, it } from "@effect/vitest";
import { InteractionResponseType, InteractionType } from "discord-api-types/v10";
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

  it.effect("runs /follow for the user who sent it", () =>
    Effect.gen(function* () {
      const { send } = yield* setup;
      const answer = yield* send({
        type: InteractionType.ApplicationCommand,
        user: { id: "77" },
        data: { name: "follow", options: [{ name: "show", type: 3, value: "frieren" }] },
      });
      expect(answer.json).toMatchObject({ data: { content: `You now follow Frieren: Beyond Journey's End.` } });
    }).pipe(Effect.scoped),
  );

  it("registers every core command", () => {
    expect(applicationCommands(commands).map((command) => command.name)).toEqual(Object.keys(commands));
  });
});
