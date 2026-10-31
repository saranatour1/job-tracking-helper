/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as applications from "../applications.js";
import type * as auth from "../auth.js";
import type * as automations from "../automations.js";
import type * as booking from "../booking.js";
import type * as calendar from "../calendar.js";
import type * as crons from "../crons.js";
import type * as email from "../email.js";
import type * as features_applications_index from "../features/applications/index.js";
import type * as features_applications_models from "../features/applications/models.js";
import type * as features_applications_public from "../features/applications/public.js";
import type * as features_applications_trash from "../features/applications/trash.js";
import type * as features_applications_utils from "../features/applications/utils.js";
import type * as features_applications_validators from "../features/applications/validators.js";
import type * as features_auth_index from "../features/auth/index.js";
import type * as features_auth_internal from "../features/auth/internal.js";
import type * as features_auth_public from "../features/auth/public.js";
import type * as features_auth_validators from "../features/auth/validators.js";
import type * as features_automations_actions from "../features/automations/actions.js";
import type * as features_automations_counts from "../features/automations/counts.js";
import type * as features_automations_describe from "../features/automations/describe.js";
import type * as features_automations_engine from "../features/automations/engine.js";
import type * as features_automations_fire from "../features/automations/fire.js";
import type * as features_automations_models from "../features/automations/models.js";
import type * as features_automations_public from "../features/automations/public.js";
import type * as features_automations_utils from "../features/automations/utils.js";
import type * as features_automations_validators from "../features/automations/validators.js";
import type * as features_booking_models from "../features/booking/models.js";
import type * as features_booking_public from "../features/booking/public.js";
import type * as features_booking_slots from "../features/booking/slots.js";
import type * as features_booking_utils from "../features/booking/utils.js";
import type * as features_booking_validators from "../features/booking/validators.js";
import type * as features_calendar_models from "../features/calendar/models.js";
import type * as features_calendar_public from "../features/calendar/public.js";
import type * as features_calendar_utils from "../features/calendar/utils.js";
import type * as features_calendar_validators from "../features/calendar/validators.js";
import type * as features_email_cloudflare from "../features/email/cloudflare.js";
import type * as features_email_inbound from "../features/email/inbound.js";
import type * as features_email_index from "../features/email/index.js";
import type * as features_email_internal from "../features/email/internal.js";
import type * as features_email_match from "../features/email/match.js";
import type * as features_email_models from "../features/email/models.js";
import type * as features_email_public from "../features/email/public.js";
import type * as features_email_sort from "../features/email/sort.js";
import type * as features_email_utils from "../features/email/utils.js";
import type * as features_email_validators from "../features/email/validators.js";
import type * as features_goals_actions from "../features/goals/actions.js";
import type * as features_goals_models from "../features/goals/models.js";
import type * as features_goals_public from "../features/goals/public.js";
import type * as features_goals_utils from "../features/goals/utils.js";
import type * as features_goals_validators from "../features/goals/validators.js";
import type * as features_jobs_actions from "../features/jobs/actions.js";
import type * as features_jobs_boards from "../features/jobs/boards.js";
import type * as features_jobs_index from "../features/jobs/index.js";
import type * as features_jobs_internal from "../features/jobs/internal.js";
import type * as features_jobs_models_boards from "../features/jobs/models/boards.js";
import type * as features_jobs_models_index from "../features/jobs/models/index.js";
import type * as features_jobs_models_jobs from "../features/jobs/models/jobs.js";
import type * as features_jobs_public from "../features/jobs/public.js";
import type * as features_jobs_utils from "../features/jobs/utils.js";
import type * as features_jobs_validators from "../features/jobs/validators.js";
import type * as features_loops_catalog from "../features/loops/catalog.js";
import type * as features_loops_index from "../features/loops/index.js";
import type * as features_loops_internal from "../features/loops/internal.js";
import type * as features_loops_link from "../features/loops/link.js";
import type * as features_loops_models_index from "../features/loops/models/index.js";
import type * as features_loops_models_leads from "../features/loops/models/leads.js";
import type * as features_loops_models_loops from "../features/loops/models/loops.js";
import type * as features_loops_models_runs from "../features/loops/models/runs.js";
import type * as features_loops_models_usage from "../features/loops/models/usage.js";
import type * as features_loops_public from "../features/loops/public.js";
import type * as features_loops_schedule from "../features/loops/schedule.js";
import type * as features_loops_utils from "../features/loops/utils.js";
import type * as features_loops_validators from "../features/loops/validators.js";
import type * as features_notifications_kinds from "../features/notifications/kinds.js";
import type * as features_notifications_public from "../features/notifications/public.js";
import type * as features_notifications_utils from "../features/notifications/utils.js";
import type * as features_notifications_validators from "../features/notifications/validators.js";
import type * as features_preferences_index from "../features/preferences/index.js";
import type * as features_preferences_models_entries from "../features/preferences/models/entries.js";
import type * as features_preferences_models_index from "../features/preferences/models/index.js";
import type * as features_preferences_models_settings from "../features/preferences/models/settings.js";
import type * as features_preferences_models_tags from "../features/preferences/models/tags.js";
import type * as features_preferences_public from "../features/preferences/public.js";
import type * as features_preferences_resume from "../features/preferences/resume.js";
import type * as features_preferences_resumeRules from "../features/preferences/resumeRules.js";
import type * as features_preferences_rows from "../features/preferences/rows.js";
import type * as features_preferences_utils from "../features/preferences/utils.js";
import type * as features_preferences_validators from "../features/preferences/validators.js";
import type * as features_prefilled_actions from "../features/prefilled/actions.js";
import type * as features_prefilled_draft from "../features/prefilled/draft.js";
import type * as features_prefilled_firecrawl from "../features/prefilled/firecrawl.js";
import type * as features_prefilled_index from "../features/prefilled/index.js";
import type * as features_prefilled_internal from "../features/prefilled/internal.js";
import type * as features_prefilled_match from "../features/prefilled/match.js";
import type * as features_prefilled_models from "../features/prefilled/models.js";
import type * as features_prefilled_public from "../features/prefilled/public.js";
import type * as features_prefilled_utils from "../features/prefilled/utils.js";
import type * as features_prefilled_validators from "../features/prefilled/validators.js";
import type * as features_users_index from "../features/users/index.js";
import type * as features_users_models from "../features/users/models.js";
import type * as features_users_public from "../features/users/public.js";
import type * as features_users_validators from "../features/users/validators.js";
import type * as features_views_models from "../features/views/models.js";
import type * as features_views_public from "../features/views/public.js";
import type * as features_views_utils from "../features/views/utils.js";
import type * as features_views_validators from "../features/views/validators.js";
import type * as features_workflows_actions from "../features/workflows/actions.js";
import type * as features_workflows_findJobs from "../features/workflows/findJobs.js";
import type * as features_workflows_fit from "../features/workflows/fit.js";
import type * as features_workflows_index from "../features/workflows/index.js";
import type * as features_workflows_judge from "../features/workflows/judge.js";
import type * as features_workflows_manager from "../features/workflows/manager.js";
import type * as features_workflows_sources_contextDev from "../features/workflows/sources/contextDev.js";
import type * as features_workflows_sources_firecrawl from "../features/workflows/sources/firecrawl.js";
import type * as features_workflows_sources_index from "../features/workflows/sources/index.js";
import type * as features_workflows_sources_source from "../features/workflows/sources/source.js";
import type * as features_workflows_utils from "../features/workflows/utils.js";
import type * as features_workflows_validators from "../features/workflows/validators.js";
import type * as goals from "../goals.js";
import type * as http from "../http.js";
import type * as inbox from "../inbox.js";
import type * as jobs from "../jobs.js";
import type * as lib_ark from "../lib/ark.js";
import type * as lib_functions from "../lib/functions.js";
import type * as lib_jev from "../lib/jev.js";
import type * as lib_log from "../lib/log.js";
import type * as lib_markdown from "../lib/markdown.js";
import type * as lib_secrets from "../lib/secrets.js";
import type * as loops from "../loops.js";
import type * as preferences from "../preferences.js";
import type * as prefilled from "../prefilled.js";
import type * as resume from "../resume.js";
import type * as users from "../users.js";
import type * as views from "../views.js";
import type * as workflows from "../workflows.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  applications: typeof applications;
  auth: typeof auth;
  automations: typeof automations;
  booking: typeof booking;
  calendar: typeof calendar;
  crons: typeof crons;
  email: typeof email;
  "features/applications/index": typeof features_applications_index;
  "features/applications/models": typeof features_applications_models;
  "features/applications/public": typeof features_applications_public;
  "features/applications/trash": typeof features_applications_trash;
  "features/applications/utils": typeof features_applications_utils;
  "features/applications/validators": typeof features_applications_validators;
  "features/auth/index": typeof features_auth_index;
  "features/auth/internal": typeof features_auth_internal;
  "features/auth/public": typeof features_auth_public;
  "features/auth/validators": typeof features_auth_validators;
  "features/automations/actions": typeof features_automations_actions;
  "features/automations/counts": typeof features_automations_counts;
  "features/automations/describe": typeof features_automations_describe;
  "features/automations/engine": typeof features_automations_engine;
  "features/automations/fire": typeof features_automations_fire;
  "features/automations/models": typeof features_automations_models;
  "features/automations/public": typeof features_automations_public;
  "features/automations/utils": typeof features_automations_utils;
  "features/automations/validators": typeof features_automations_validators;
  "features/booking/models": typeof features_booking_models;
  "features/booking/public": typeof features_booking_public;
  "features/booking/slots": typeof features_booking_slots;
  "features/booking/utils": typeof features_booking_utils;
  "features/booking/validators": typeof features_booking_validators;
  "features/calendar/models": typeof features_calendar_models;
  "features/calendar/public": typeof features_calendar_public;
  "features/calendar/utils": typeof features_calendar_utils;
  "features/calendar/validators": typeof features_calendar_validators;
  "features/email/cloudflare": typeof features_email_cloudflare;
  "features/email/inbound": typeof features_email_inbound;
  "features/email/index": typeof features_email_index;
  "features/email/internal": typeof features_email_internal;
  "features/email/match": typeof features_email_match;
  "features/email/models": typeof features_email_models;
  "features/email/public": typeof features_email_public;
  "features/email/sort": typeof features_email_sort;
  "features/email/utils": typeof features_email_utils;
  "features/email/validators": typeof features_email_validators;
  "features/goals/actions": typeof features_goals_actions;
  "features/goals/models": typeof features_goals_models;
  "features/goals/public": typeof features_goals_public;
  "features/goals/utils": typeof features_goals_utils;
  "features/goals/validators": typeof features_goals_validators;
  "features/jobs/actions": typeof features_jobs_actions;
  "features/jobs/boards": typeof features_jobs_boards;
  "features/jobs/index": typeof features_jobs_index;
  "features/jobs/internal": typeof features_jobs_internal;
  "features/jobs/models/boards": typeof features_jobs_models_boards;
  "features/jobs/models/index": typeof features_jobs_models_index;
  "features/jobs/models/jobs": typeof features_jobs_models_jobs;
  "features/jobs/public": typeof features_jobs_public;
  "features/jobs/utils": typeof features_jobs_utils;
  "features/jobs/validators": typeof features_jobs_validators;
  "features/loops/catalog": typeof features_loops_catalog;
  "features/loops/index": typeof features_loops_index;
  "features/loops/internal": typeof features_loops_internal;
  "features/loops/link": typeof features_loops_link;
  "features/loops/models/index": typeof features_loops_models_index;
  "features/loops/models/leads": typeof features_loops_models_leads;
  "features/loops/models/loops": typeof features_loops_models_loops;
  "features/loops/models/runs": typeof features_loops_models_runs;
  "features/loops/models/usage": typeof features_loops_models_usage;
  "features/loops/public": typeof features_loops_public;
  "features/loops/schedule": typeof features_loops_schedule;
  "features/loops/utils": typeof features_loops_utils;
  "features/loops/validators": typeof features_loops_validators;
  "features/notifications/kinds": typeof features_notifications_kinds;
  "features/notifications/public": typeof features_notifications_public;
  "features/notifications/utils": typeof features_notifications_utils;
  "features/notifications/validators": typeof features_notifications_validators;
  "features/preferences/index": typeof features_preferences_index;
  "features/preferences/models/entries": typeof features_preferences_models_entries;
  "features/preferences/models/index": typeof features_preferences_models_index;
  "features/preferences/models/settings": typeof features_preferences_models_settings;
  "features/preferences/models/tags": typeof features_preferences_models_tags;
  "features/preferences/public": typeof features_preferences_public;
  "features/preferences/resume": typeof features_preferences_resume;
  "features/preferences/resumeRules": typeof features_preferences_resumeRules;
  "features/preferences/rows": typeof features_preferences_rows;
  "features/preferences/utils": typeof features_preferences_utils;
  "features/preferences/validators": typeof features_preferences_validators;
  "features/prefilled/actions": typeof features_prefilled_actions;
  "features/prefilled/draft": typeof features_prefilled_draft;
  "features/prefilled/firecrawl": typeof features_prefilled_firecrawl;
  "features/prefilled/index": typeof features_prefilled_index;
  "features/prefilled/internal": typeof features_prefilled_internal;
  "features/prefilled/match": typeof features_prefilled_match;
  "features/prefilled/models": typeof features_prefilled_models;
  "features/prefilled/public": typeof features_prefilled_public;
  "features/prefilled/utils": typeof features_prefilled_utils;
  "features/prefilled/validators": typeof features_prefilled_validators;
  "features/users/index": typeof features_users_index;
  "features/users/models": typeof features_users_models;
  "features/users/public": typeof features_users_public;
  "features/users/validators": typeof features_users_validators;
  "features/views/models": typeof features_views_models;
  "features/views/public": typeof features_views_public;
  "features/views/utils": typeof features_views_utils;
  "features/views/validators": typeof features_views_validators;
  "features/workflows/actions": typeof features_workflows_actions;
  "features/workflows/findJobs": typeof features_workflows_findJobs;
  "features/workflows/fit": typeof features_workflows_fit;
  "features/workflows/index": typeof features_workflows_index;
  "features/workflows/judge": typeof features_workflows_judge;
  "features/workflows/manager": typeof features_workflows_manager;
  "features/workflows/sources/contextDev": typeof features_workflows_sources_contextDev;
  "features/workflows/sources/firecrawl": typeof features_workflows_sources_firecrawl;
  "features/workflows/sources/index": typeof features_workflows_sources_index;
  "features/workflows/sources/source": typeof features_workflows_sources_source;
  "features/workflows/utils": typeof features_workflows_utils;
  "features/workflows/validators": typeof features_workflows_validators;
  goals: typeof goals;
  http: typeof http;
  inbox: typeof inbox;
  jobs: typeof jobs;
  "lib/ark": typeof lib_ark;
  "lib/functions": typeof lib_functions;
  "lib/jev": typeof lib_jev;
  "lib/log": typeof lib_log;
  "lib/markdown": typeof lib_markdown;
  "lib/secrets": typeof lib_secrets;
  loops: typeof loops;
  preferences: typeof preferences;
  prefilled: typeof prefilled;
  resume: typeof resume;
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
  applyPool: import("@convex-dev/workpool/_generated/component.js").ComponentApi<"applyPool">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
  automationRunCounts: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"automationRunCounts">;
  automationChoices: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"automationChoices">;
  cloudflareEmail: import("../components/cloudflareEmail/_generated/component.js").ComponentApi<"cloudflareEmail">;
  notifications: import("../components/notifications/_generated/component.js").ComponentApi<"notifications">;
};
