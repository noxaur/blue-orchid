import { Effect } from "effect";

const hexBytes = (hex: string): Uint8Array<ArrayBuffer> | null =>
  /^(?:[0-9a-f]{2})+$/i.test(hex) ? Uint8Array.from(hex.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16)) : null;

/** Discord signs `timestamp + body` with Ed25519. Anything malformed counts as a bad signature. */
export const verifySignature = Effect.fn("Discord.verifySignature")(function* (input: {
  readonly publicKey: string;
  readonly signature: string;
  readonly timestamp: string;
  readonly body: string;
}) {
  const key = hexBytes(input.publicKey);
  const signature = hexBytes(input.signature);
  if (key === null || signature === null) {
    return false;
  }
  return yield* Effect.tryPromise(() =>
    crypto.subtle
      .importKey("raw", key, { name: "Ed25519" }, false, ["verify"])
      .then((imported) =>
        crypto.subtle.verify(
          { name: "Ed25519" },
          imported,
          signature,
          new TextEncoder().encode(input.timestamp + input.body),
        ),
      ),
  ).pipe(Effect.orElseSucceed(() => false));
});
