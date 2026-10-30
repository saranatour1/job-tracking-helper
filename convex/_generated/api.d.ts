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
import type * as api_features_applications_trash from "../api/features/applications/trash.js";
import type * as api_features_applications_validators from "../api/features/applications/validators.js";
import type * as api_features_auth_index from "../api/features/auth/index.js";
import type * as api_features_auth_internal from "../api/features/auth/internal.js";
import type * as api_features_auth_public from "../api/features/auth/public.js";
import type * as api_features_automations_actions from "../api/features/automations/actions.js";
import type * as api_features_automations_counts from "../api/features/automations/counts.js";
import type * as api_features_automations_describe from "../api/features/automations/describe.js";
import type * as api_features_automations_engine from "../api/features/automations/engine.js";
import type * as api_features_automations_fire from "../api/features/automations/fire.js";
import type * as api_features_automations_models from "../api/features/automations/models.js";
import type * as api_features_automations_public from "../api/features/automations/public.js";
import type * as api_features_automations_validators from "../api/features/automations/validators.js";
import type * as api_features_booking_models from "../api/features/booking/models.js";
import type * as api_features_booking_public from "../api/features/booking/public.js";
import type * as api_features_booking_slots from "../api/features/booking/slots.js";
import type * as api_features_calendar_models from "../api/features/calendar/models.js";
import type * as api_features_calendar_public from "../api/features/calendar/public.js";
import type * as api_features_email_cloudflare from "../api/features/email/cloudflare.js";
import type * as api_features_email_inbound from "../api/features/email/inbound.js";
import type * as api_features_email_index from "../api/features/email/index.js";
import type * as api_features_email_internal from "../api/features/email/internal.js";
import type * as api_features_email_match from "../api/features/email/match.js";
import type * as api_features_email_models from "../api/features/email/models.js";
import type * as api_features_email_public from "../api/features/email/public.js";
import type * as api_features_email_sort from "../api/features/email/sort.js";
import type * as api_features_email_validators from "../api/features/email/validators.js";
import type * as api_features_goals_actions from "../api/features/goals/actions.js";
import type * as api_features_goals_models from "../api/features/goals/models.js";
import type * as api_features_goals_public from "../api/features/goals/public.js";
import type * as api_features_jobs_actions from "../api/features/jobs/actions.js";
import type * as api_features_jobs_boards from "../api/features/jobs/boards.js";
import type * as api_features_jobs_index from "../api/features/jobs/index.js";
import type * as api_features_jobs_internal from "../api/features/jobs/internal.js";
import type * as api_features_jobs_models_boards from "../api/features/jobs/models/boards.js";
import type * as api_features_jobs_models_index from "../api/features/jobs/models/index.js";
import type * as api_features_jobs_models_jobs from "../api/features/jobs/models/jobs.js";
import type * as api_features_jobs_public from "../api/features/jobs/public.js";
import type * as api_features_jobs_validators from "../api/features/jobs/validators.js";
import type * as api_features_loops_catalog from "../api/features/loops/catalog.js";
import type * as api_features_loops_index from "../api/features/loops/index.js";
import type * as api_features_loops_internal from "../api/features/loops/internal.js";
import type * as api_features_loops_link from "../api/features/loops/link.js";
import type * as api_features_loops_models_index from "../api/features/loops/models/index.js";
import type * as api_features_loops_models_leads from "../api/features/loops/models/leads.js";
import type * as api_features_loops_models_loops from "../api/features/loops/models/loops.js";
import type * as api_features_loops_models_runs from "../api/features/loops/models/runs.js";
import type * as api_features_loops_models_usage from "../api/features/loops/models/usage.js";
import type * as api_features_loops_public from "../api/features/loops/public.js";
import type * as api_features_loops_schedule from "../api/features/loops/schedule.js";
import type * as api_features_loops_validators from "../api/features/loops/validators.js";
import type * as api_features_notifications_kinds from "../api/features/notifications/kinds.js";
import type * as api_features_notifications_public from "../api/features/notifications/public.js";
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
import type * as api_features_views_models from "../api/features/views/models.js";
import type * as api_features_views_public from "../api/features/views/public.js";
import type * as api_features_workflows_actions from "../api/features/workflows/actions.js";
import type * as api_features_workflows_findJobs from "../api/features/workflows/findJobs.js";
import type * as api_features_workflows_fit from "../api/features/workflows/fit.js";
import type * as api_features_workflows_index from "../api/features/workflows/index.js";
import type * as api_features_workflows_judge from "../api/features/workflows/judge.js";
import type * as api_features_workflows_manager from "../api/features/workflows/manager.js";
import type * as api_features_workflows_sources_contextDev from "../api/features/workflows/sources/contextDev.js";
import type * as api_features_workflows_sources_firecrawl from "../api/features/workflows/sources/firecrawl.js";
import type * as api_features_workflows_sources_index from "../api/features/workflows/sources/index.js";
import type * as api_features_workflows_sources_source from "../api/features/workflows/sources/source.js";
import type * as api_features_workflows_validators from "../api/features/workflows/validators.js";
import type * as applications from "../applications.js";
import type * as auth from "../auth.js";
import type * as automations from "../automations.js";
import type * as booking from "../booking.js";
import type * as calendar from "../calendar.js";
import type * as crons from "../crons.js";
import type * as email from "../email.js";
import type * as goals from "../goals.js";
import type * as http from "../http.js";
import type * as inbox from "../inbox.js";
import type * as jobs from "../jobs.js";
import type * as lib_ark from "../lib/ark.js";
import type * as lib_functions from "../lib/functions.js";
import type * as lib_log from "../lib/log.js";
import type * as lib_markdown from "../lib/markdown.js";
import type * as lib_secrets from "../lib/secrets.js";
import type * as loops from "../loops.js";
import type * as preferences from "../preferences.js";
import type * as users from "../users.js";
import type * as views from "../views.js";
import type * as workflows from "../workflows.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "api/features/applications/index": typeof api_features_applications_index;
  "api/features/applications/models": typeof api_features_applications_models;
  "api/features/applications/public": typeof api_features_applications_public;
  "api/features/applications/trash": typeof api_features_applications_trash;
  "api/features/applications/validators": typeof api_features_applications_validators;
  "api/features/auth/index": typeof api_features_auth_index;
  "api/features/auth/internal": typeof api_features_auth_internal;
  "api/features/auth/public": typeof api_features_auth_public;
  "api/features/automations/actions": typeof api_features_automations_actions;
  "api/features/automations/counts": typeof api_features_automations_counts;
  "api/features/automations/describe": typeof api_features_automations_describe;
  "api/features/automations/engine": typeof api_features_automations_engine;
  "api/features/automations/fire": typeof api_features_automations_fire;
  "api/features/automations/models": typeof api_features_automations_models;
  "api/features/automations/public": typeof api_features_automations_public;
  "api/features/automations/validators": typeof api_features_automations_validators;
  "api/features/booking/models": typeof api_features_booking_models;
  "api/features/booking/public": typeof api_features_booking_public;
  "api/features/booking/slots": typeof api_features_booking_slots;
  "api/features/calendar/models": typeof api_features_calendar_models;
  "api/features/calendar/public": typeof api_features_calendar_public;
  "api/features/email/cloudflare": typeof api_features_email_cloudflare;
  "api/features/email/inbound": typeof api_features_email_inbound;
  "api/features/email/index": typeof api_features_email_index;
  "api/features/email/internal": typeof api_features_email_internal;
  "api/features/email/match": typeof api_features_email_match;
  "api/features/email/models": typeof api_features_email_models;
  "api/features/email/public": typeof api_features_email_public;
  "api/features/email/sort": typeof api_features_email_sort;
  "api/features/email/validators": typeof api_features_email_validators;
  "api/features/goals/actions": typeof api_features_goals_actions;
  "api/features/goals/models": typeof api_features_goals_models;
  "api/features/goals/public": typeof api_features_goals_public;
  "api/features/jobs/actions": typeof api_features_jobs_actions;
  "api/features/jobs/boards": typeof api_features_jobs_boards;
  "api/features/jobs/index": typeof api_features_jobs_index;
  "api/features/jobs/internal": typeof api_features_jobs_internal;
  "api/features/jobs/models/boards": typeof api_features_jobs_models_boards;
  "api/features/jobs/models/index": typeof api_features_jobs_models_index;
  "api/features/jobs/models/jobs": typeof api_features_jobs_models_jobs;
  "api/features/jobs/public": typeof api_features_jobs_public;
  "api/features/jobs/validators": typeof api_features_jobs_validators;
  "api/features/loops/catalog": typeof api_features_loops_catalog;
  "api/features/loops/index": typeof api_features_loops_index;
  "api/features/loops/internal": typeof api_features_loops_internal;
  "api/features/loops/link": typeof api_features_loops_link;
  "api/features/loops/models/index": typeof api_features_loops_models_index;
  "api/features/loops/models/leads": typeof api_features_loops_models_leads;
  "api/features/loops/models/loops": typeof api_features_loops_models_loops;
  "api/features/loops/models/runs": typeof api_features_loops_models_runs;
  "api/features/loops/models/usage": typeof api_features_loops_models_usage;
  "api/features/loops/public": typeof api_features_loops_public;
  "api/features/loops/schedule": typeof api_features_loops_schedule;
  "api/features/loops/validators": typeof api_features_loops_validators;
  "api/features/notifications/kinds": typeof api_features_notifications_kinds;
  "api/features/notifications/public": typeof api_features_notifications_public;
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
  "api/features/views/models": typeof api_features_views_models;
  "api/features/views/public": typeof api_features_views_public;
  "api/features/workflows/actions": typeof api_features_workflows_actions;
  "api/features/workflows/findJobs": typeof api_features_workflows_findJobs;
  "api/features/workflows/fit": typeof api_features_workflows_fit;
  "api/features/workflows/index": typeof api_features_workflows_index;
  "api/features/workflows/judge": typeof api_features_workflows_judge;
  "api/features/workflows/manager": typeof api_features_workflows_manager;
  "api/features/workflows/sources/contextDev": typeof api_features_workflows_sources_contextDev;
  "api/features/workflows/sources/firecrawl": typeof api_features_workflows_sources_firecrawl;
  "api/features/workflows/sources/index": typeof api_features_workflows_sources_index;
  "api/features/workflows/sources/source": typeof api_features_workflows_sources_source;
  "api/features/workflows/validators": typeof api_features_workflows_validators;
  applications: typeof applications;
  auth: typeof auth;
  automations: typeof automations;
  booking: typeof booking;
  calendar: typeof calendar;
  crons: typeof crons;
  email: typeof email;
  goals: typeof goals;
  http: typeof http;
  inbox: typeof inbox;
  jobs: typeof jobs;
  "lib/ark": typeof lib_ark;
  "lib/functions": typeof lib_functions;
  "lib/log": typeof lib_log;
  "lib/markdown": typeof lib_markdown;
  "lib/secrets": typeof lib_secrets;
  loops: typeof loops;
  preferences: typeof preferences;
  users: typeof users;
  views: typeof views;
  workflows: typeof workflows;
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
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
  readPool: import("@convex-dev/workpool/_generated/component.js").ComponentApi<"readPool">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
  automationRunCounts: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"automationRunCounts">;
  automationChoices: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"automationChoices">;
  cloudflareEmail: import("../cloudflareEmail/_generated/component.js").ComponentApi<"cloudflareEmail">;
  notifications: import("../notifications/_generated/component.js").ComponentApi<"notifications">;
};
