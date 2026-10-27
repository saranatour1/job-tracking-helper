/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as applications from "../applications.js"
import type * as auth from "../auth.js"
import type * as features_applications_functions from "../features/applications/functions.js"
import type * as features_applications_validators from "../features/applications/validators.js"
import type * as features_auth_methods from "../features/auth/methods.js"
import type * as features_auth_providers from "../features/auth/providers.js"
import type * as features_users_create from "../features/users/create.js"
import type * as lib_functions from "../lib/functions.js"
import type * as users from "../users.js"

import type { ApiFromModules, FilterApi, FunctionReference } from "convex/server"

declare const fullApi: ApiFromModules<{
  applications: typeof applications
  auth: typeof auth
  "features/applications/functions": typeof features_applications_functions
  "features/applications/validators": typeof features_applications_validators
  "features/auth/methods": typeof features_auth_methods
  "features/auth/providers": typeof features_auth_providers
  "features/users/create": typeof features_users_create
  "lib/functions": typeof lib_functions
  users: typeof users
}>

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<typeof fullApi, FunctionReference<any, "public">>

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<typeof fullApi, FunctionReference<any, "internal">>

export declare const components: {
  auth: import("@convex-dev/auth/_generated/component.js").ComponentApi<"auth">
  authPassword: import("@convex-dev/auth/components/password/_generated/component.js").ComponentApi<"authPassword">
  authUsername: import("@convex-dev/auth/components/username/_generated/component.js").ComponentApi<"authUsername">
  authAnonymous: import("@convex-dev/auth/components/anonymous/_generated/component.js").ComponentApi<"authAnonymous">
  authGoogle: import("@convex-dev/auth/components/google/_generated/component.js").ComponentApi<"authGoogle">
  authGithub: import("@convex-dev/auth/components/github/_generated/component.js").ComponentApi<"authGithub">
}
