/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    lib: {
      list: FunctionReference<
        "query",
        "internal",
        { limit?: number; owner: string },
        Array<{
          _creationTime: number;
          _id: string;
          at: number;
          kind: string;
          owner: string;
          readAt?: number;
          ref?: string;
        }>,
        Name
      >;
      muted: FunctionReference<
        "query",
        "internal",
        { owner: string },
        Array<string>,
        Name
      >;
      notify: FunctionReference<
        "mutation",
        "internal",
        { kind: string; owner: string; ref?: string },
        string | null,
        Name
      >;
      removeOwner: FunctionReference<
        "mutation",
        "internal",
        { limit?: number; owner: string },
        boolean,
        Name
      >;
      setMuted: FunctionReference<
        "mutation",
        "internal",
        { kind: string; muted: boolean; owner: string },
        null,
        Name
      >;
      setRead: FunctionReference<
        "mutation",
        "internal",
        { ids?: Array<string>; owner: string; read: boolean },
        null,
        Name
      >;
      unreadCount: FunctionReference<
        "query",
        "internal",
        { limit?: number; owner: string },
        number,
        Name
      >;
    };
  };
