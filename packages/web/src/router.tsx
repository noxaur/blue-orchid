import { ViewerQuery } from "@blue-orchid/graphql/operations";
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Link,
  Outlet,
  useNavigate,
} from "@tanstack/react-router";

import { query } from "./api.ts";
import { run } from "./runtime.ts";
import { isTimeZone, localTimeZone } from "./schedule/days.ts";
import { loadWeek } from "./schedule/loadWeek.ts";
import { SchedulePage } from "./schedule/SchedulePage.tsx";

/** Sign-in lives in the app, which owns Better Auth. The website only asks for it. */
export interface Auth {
  readonly signIn: () => Promise<unknown>;
  readonly signOut: () => Promise<unknown>;
}

interface RouterContext {
  readonly auth: Auth;
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  loader: () => run(query(ViewerQuery)),
  component: function Layout() {
    const { viewer } = rootRoute.useLoaderData();
    const { auth } = rootRoute.useRouteContext();
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <header className="mb-8 flex items-center justify-between">
          <Link to="/" className="text-lg font-semibold">
            Airing this week
          </Link>
          {viewer === null ? (
            <button type="button" className="text-sm underline" onClick={() => void auth.signIn()}>
              Sign in with Discord
            </button>
          ) : (
            <button type="button" className="text-sm underline" onClick={() => void auth.signOut()}>
              Sign out {viewer.name}
            </button>
          )}
        </header>
        <Outlet />
        {/* TheTVDB's licence asks for this credit, with a link, wherever its data is shown. */}
        <footer className="mt-12 text-xs text-zinc-500">
          Metadata provided by{" "}
          <a className="underline" href="https://thetvdb.com/">
            TheTVDB
          </a>
          . Please consider adding missing information or{" "}
          <a className="underline" href="https://thetvdb.com/subscribe">
            subscribing
          </a>
          .
        </footer>
      </div>
    );
  },
});

const scheduleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  validateSearch: (search: Record<string, unknown>): { tz?: string } =>
    typeof search["tz"] === "string" && isTimeZone(search["tz"]) ? { tz: search["tz"] } : {},
  loaderDeps: ({ search }) => ({ timeZone: search.tz ?? localTimeZone() }),
  loader: ({ deps }) => run(loadWeek(deps.timeZone)).then((rows) => ({ rows, timeZone: deps.timeZone })),
  component: function Schedule() {
    const { rows, timeZone } = scheduleRoute.useLoaderData();
    const navigate = useNavigate({ from: "/" });
    return (
      <main>
        <label className="mb-6 flex items-center gap-2 text-sm text-zinc-500">
          Times in
          <select
            className="rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700"
            value={timeZone}
            onChange={(event) => void navigate({ search: { tz: event.target.value } })}
          >
            {Intl.supportedValuesOf("timeZone").map((zone) => (
              <option key={zone}>{zone}</option>
            ))}
          </select>
        </label>
        <SchedulePage rows={rows} timeZone={timeZone} />
      </main>
    );
  },
});

/** Every page. Add a route here and the router's types follow. */
const routeTree = rootRoute.addChildren([scheduleRoute]);

export const makeRouter = (auth: Auth) => createRouter({ routeTree, context: { auth } });

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof makeRouter>;
  }
}
