import type { Show, SourceUnavailable } from "@blue-orchid/domain";
import type { Effect } from "effect";
import { Context } from "effect";

export type CatalogSlice =
  | { readonly _tag: "Airing" }
  | { readonly _tag: "Upcoming" }
  | { readonly _tag: "Year"; readonly year: number }
  | { readonly _tag: "Undated" };

/** Where the catalog's shows come from, such as Wikidata. */
export class CatalogSource extends Context.Service<
  CatalogSource,
  {
    readonly name: string;
    readonly fetch: (slice: CatalogSlice) => Effect.Effect<ReadonlyArray<Show>, SourceUnavailable>;
  }
>()("orchid/core/CatalogSource") {}
