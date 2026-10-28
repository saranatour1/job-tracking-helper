/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as api_features_applications_index from "../api/features/applications/index.js";
import type * as api_features_applications_models from "../api/features/applications/models.js";
import type * as api_features_applications_public from "../api/features/applications/public.js";
import type * as api_features_applications_validators from "../api/features/applications/validators.js";
import type * as api_features_auth_index from "../api/features/auth/index.js";
import type * as api_features_auth_internal from "../api/features/auth/internal.js";
import type * as api_features_auth_public from "../api/features/auth/public.js";
import type * as api_features_loops_catalog from "../api/features/loops/catalog.js";
import type * as api_features_preferences_index from "../api/features/preferences/index.js";
import type * as api_features_preferences_models_entries from "../api/features/preferences/models/entries.js";
import type * as api_features_preferences_models_index from "../api/features/preferences/models/index.js";
import type * as api_features_preferences_models_settings from "../api/features/preferences/models/settings.js";
import type * as api_features_preferences_models_tags from "../api/features/preferences/models/tags.js";
import type * as api_features_preferences_public from "../api/features/preferences/public.js";
import type * as api_features_preferences_rows from "../api/features/preferences/rows.js";
import type * as api_features_preferences_validators from "../api/features/preferences/validators.js";
import type * as api_features_users_index from "../api/features/users/index.js";
import type * as api_features_users_models from "../api/features/users/models.js";
import type * as api_features_users_public from "../api/features/users/public.js";
import type * as api_features_users_validators from "../api/features/users/validators.js";
import type * as applications from "../applications.js";
import type * as auth from "../auth.js";
import type * as lib_ark from "../lib/ark.js";
import type * as lib_functions from "../lib/functions.js";
import type * as preferences from "../preferences.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "api/features/applications/index": typeof api_features_applications_index;
  "api/features/applications/models": typeof api_features_applications_models;
  "api/features/applications/public": typeof api_features_applications_public;
  "api/features/applications/validators": typeof api_features_applications_validators;
  "api/features/auth/index": typeof api_features_auth_index;
  "api/features/auth/internal": typeof api_features_auth_internal;
  "api/features/auth/public": typeof api_features_auth_public;
  "api/features/loops/catalog": typeof api_features_loops_catalog;
  "api/features/preferences/index": typeof api_features_preferences_index;
  "api/features/preferences/models/entries": typeof api_features_preferences_models_entries;
  "api/features/preferences/models/index": typeof api_features_preferences_models_index;
  "api/features/preferences/models/settings": typeof api_features_preferences_models_settings;
  "api/features/preferences/models/tags": typeof api_features_preferences_models_tags;
  "api/features/preferences/public": typeof api_features_preferences_public;
  "api/features/preferences/rows": typeof api_features_preferences_rows;
  "api/features/preferences/validators": typeof api_features_preferences_validators;
  "api/features/users/index": typeof api_features_users_index;
  "api/features/users/models": typeof api_features_users_models;
  "api/features/users/public": typeof api_features_users_public;
  "api/features/users/validators": typeof api_features_users_validators;
  applications: typeof applications;
  auth: typeof auth;
  "lib/ark": typeof lib_ark;
  "lib/functions": typeof lib_functions;
  preferences: typeof preferences;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  auth: import("@convex-dev/auth/_generated/component.js").ComponentApi<"auth">;
  authPassword: import("@convex-dev/auth/components/password/_generated/component.js").ComponentApi<"authPassword">;
  authUsername: import("@convex-dev/auth/components/username/_generated/component.js").ComponentApi<"authUsername">;
  authAnonymous: import("@convex-dev/auth/components/anonymous/_generated/component.js").ComponentApi<"authAnonymous">;
  authGoogle: import("@convex-dev/auth/components/google/_generated/component.js").ComponentApi<"authGoogle">;
  authGithub: import("@convex-dev/auth/components/github/_generated/component.js").ComponentApi<"authGithub">;
};
