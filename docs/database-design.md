# Database design

A plan for growing the schema from `users` + `applications` into a full job-search tracker. Nothing here is built yet.

## When something gets its own table

Every table adds a schema, indexes, delete rules and an extra lookup when reading. A wish list item gets a table only when it passes at least one of these:

1. **It grows without a limit.** Convex caps a document at 1 MiB and an array at 8192 items. Audit rows, synced emails and applications grow forever, while a person's resumes or a company's offices don't.
2. **Several records point at it by id.** A resume sent with ten applications, or a company that many users apply to.
3. **It has its own owner or lifetime.** Shared companies stay after the user who added them deletes their account.
4. **You query it on its own, across parents.** "All emails I got this week" without loading every application.

Otherwise it is a field on its parent, either an object or an array with a cap.

Signs there are too many tables:

- A table that always has exactly one row per parent. Make it a field.
- A table that you only ever read together with its parent.
- A table that stores a number you could compute from other tables.
- Two tables recording the same event.

Applying that to the first draft removed three of its ten tables and kept a fourth from being added. `preferences` would also fold into `users` by these rules, but it stays a table on purpose: `users` holds only account details.

| First draft        | Fails because                                              | Now                                         |
| ------------------ | ---------------------------------------------------------- | ------------------------------------------- |
| `preferences`      | always one row per user                                    | kept as a table so `users` stays basic      |
| `companyLocations` | a few offices per company, only read with the company      | `companies.locations` array, capped at 200  |
| `statusEvents`     | a handful per application, only read with it               | `applications.history` array, capped at 100 |
| `reports`          | stores numbers computed from `applications.history`        | computed on demand                          |
| `interviews`       | never added, since rounds and dates fit in `history` notes | revisit if interviews need reminders        |

Six tables are left, counting `users`. `users` and `preferences` exist today, and phase 1 needs three more.

| Table          | Passes rule                    | Phase |
| -------------- | ------------------------------ | ----- |
| `users`        | exists                         | now   |
| `applications` | 1, 4                           | 1     |
| `companies`    | 2, 3                           | 1     |
| `auditLogs`    | 1, 4                           | 1     |
| `preferences`  | exception: keeps `users` basic | now   |
| `emails`       | 1, 4                           | 3     |

## Where each wish list item lives

| Wish list item                            | Where it lives                                                                |
| ----------------------------------------- | ----------------------------------------------------------------------------- |
| company                                   | `companies`, a catalog shared by all users once verified                      |
| company locations                         | `companies.locations`, and each application copies the one it is for          |
| role / job posting, custom links          | `applications.role`, `postingUrl`, `links`                                    |
| status                                    | `applications.status`, with every change appended to `applications.history`   |
| method of application                     | `applications.method`                                                         |
| previous runs, snapshots from the past    | `applications.history`, which gives any application's status on any past date |
| resumes                                   | one file on `preferences`, kept to attach to applications and never read      |
| user preferences, locations, custom roles | `preferences` table, one row per user                                         |
| auto fill, prefilled applications         | `preferences.answers`, which an AI assistant's reply can fill                 |
| rate limits / monthly                     | a monthly target on `preferences` later, count from `applications.appliedAt`  |
| emails / method of tracking               | `emails` table in phase 3, which needs a Gmail connection                     |
| acceptance rate, interview rate           | computed from `applications.history`                                          |
| recent reports                            | computed for any month on demand                                              |
| recommendations, "what to do?"            | computed from stale applications, the monthly target and the best methods     |
| audit logs                                | `auditLogs` table, one row per write to any table                             |

## Tables

```mermaid
erDiagram
    users |o--o{ companies : "added"
    users ||--o{ applications : tracks
    users ||--o| preferences : "has one"
    users ||--o{ auditLogs : "made changes"
    companies ||--o{ applications : "applied to"
    applications |o--o{ emails : "matched to"

    users {
        string name
        string email
        string userName
        id imageId "_storage"
        number onboardedAt "optional, set when Preferences is saved or skipped"
    }
    companies {
        string name
        string domain "optional, unique, e.g. stripe.com"
        enum status "private | pending | verified | rejected"
        string rejectReason "optional"
        object[] locations "city, region, country, key; max 200"
        id createdBy "optional, cleared on account deletion"
    }
    applications {
        id userId
        id companyId
        string role
        enum status
        object[] history "to, at, note; max 100"
        enum method "site | linkedin | referral | email | recruiter"
        enum workMode "remote | hybrid | onsite"
        object location "optional, copied from the company"
        string postingUrl
        number appliedAt
        object[] links "label + url"
        string notes
    }
    preferences {
        id userId "unique"
        string[] interests "also avoid, skillsToBuild, locations, companies, redFlagCompanies"
        enum workMode "any | remote | hybrid | onsite"
        string identity "also growthGoal, companyTraits, redFlags"
        object answers "offer, leave, goodWeek, pay, visa, start"
        id resumeId "optional, _storage"
        string resumeName "optional"
    }
    emails {
        id userId
        id applicationId "optional until matched"
        string messageId
        string subject
        string from
        enum kind "confirmation | interview | rejection | offer | other"
        number receivedAt
    }
    auditLogs {
        id userId "optional, who made the change"
        enum actor "user | system | gmailSync | migration"
        string table "applications, companies, ..."
        string docId
        enum op "insert | update | delete"
        object changes "field, before, after"
    }
```

`companies` is the only shared table. Everything else belongs to one user. Your notes about a company live on your applications, not on the shared company, so nothing personal ends up in the catalog.

### Relationships

Convex stores references as typed ids (`v.id("companies")`) but does not enforce them or cascade deletes. The "on delete" column is code the delete mutation must run.

| From           | To             | Kind        | Field                            | When the "to" record is deleted                                             |
| -------------- | -------------- | ----------- | -------------------------------- | --------------------------------------------------------------------------- |
| `companies`    | `users`        | many to one | `createdBy`, optional            | delete the company if it is private and unused, otherwise clear `createdBy` |
| `applications` | `users`        | many to one | `userId`                         | delete the application                                                      |
| `applications` | `companies`    | many to one | `companyId`, required            | refuse while any user's application points at the company                   |
| `preferences`  | `users`        | one to one  | `userId`, unique                 | delete the row and its resume file                                          |
| `emails`       | `applications` | many to one | `applicationId`, optional        | clear `applicationId` and keep the email                                    |
| `emails`       | `users`        | many to one | `userId`                         | delete the email                                                            |
| `auditLogs`    | `users`        | many to one | `userId`, optional               | delete the audit row                                                        |
| `auditLogs`    | any table      | loose       | `table` + `docId` (plain string) | keep the audit row after the record it describes is gone                    |

An application copies its location (`{ city, region, country }`) instead of pointing at an office by id. Nobody edits a location after adding it, so the copy never goes stale, and removing an office from a company can't break anyone's application.

### Indexes

| Table          | Index                                      | For                                              |
| -------------- | ------------------------------------------ | ------------------------------------------------ |
| `companies`    | `by_domain`                                | dedupe, one company per domain                   |
| `companies`    | `by_createdBy_and_name`                    | my private companies, dedupe ones with no domain |
| `companies`    | search index on `name`, filter `status`    | the company picker searches verified ones        |
| `applications` | `by_userId_and_status`                     | board columns, replacing `by_userId`             |
| `applications` | `by_userId_and_appliedAt`                  | "this month" count, recent list                  |
| `applications` | `by_companyId`                             | company page, per-company rates, delete check    |
| `preferences`  | `by_userId`, `by_resumeId`                 | load mine, check who owns an uploaded file       |
| `emails`       | `by_userId_and_receivedAt`, `by_messageId` | inbox view, skip already-synced mail             |
| `auditLogs`    | `by_userId`                                | my activity, newest first                        |
| `auditLogs`    | `by_docId`                                 | history of one record                            |

`auditLogs` has no time field. `_creationTime` holds the time, and Convex adds it to every index as the last key, so both indexes return rows in time order.

## Shared companies

One user adds a company, and once it passes the website check, every user can pick it instead of typing it again. The website domain identifies the company, so `stripe.com` is one company whether someone typed "Stripe", "Stripe Inc." or "stripe".

### Is it real?

Until the scrape methods exist, "real" means "has a website that answers". That is a low bar, but it filters typos, made-up names and pasted job-board links, and it costs one request.

```mermaid
stateDiagram-v2
    [*] --> private : added without a domain
    [*] --> pending : added with a domain
    private --> pending : creator adds a domain
    pending --> verified : site answers
    pending --> rejected : no answer after one retry
    rejected --> pending : creator fixes the domain
    verified --> [*]
```

| Status     | Who can see and pick it                            | Who can edit it                        |
| ---------- | -------------------------------------------------- | -------------------------------------- |
| `private`  | its creator only                                   | its creator                            |
| `pending`  | its creator, and anyone who enters the same domain | its creator                            |
| `verified` | everyone, in search                                | nobody yet, until an admin role exists |
| `rejected` | its creator only, with the reason                  | its creator                            |

The checks run in this order.

1. **On input.** The shared arktype validator turns what you typed into a bare domain, so `https://www.Stripe.com/jobs` becomes `stripe.com`. It refuses IP addresses, `localhost` and names without a dot. It also refuses domains that are never a company's own site, such as job boards and ATSs like `linkedin.com`, `indeed.com`, `greenhouse.io`, `lever.co` and `workday.com`, free mail like `gmail.com` and `outlook.com`, and site hosts like `github.io` and `notion.site`. The error reads "That looks like a job board link. Enter the company's own website."
2. **After the add commits.** An internal action fetches `https://<domain>` with a 5 second timeout. Any HTTP answer, even a 403 from a bot blocker, shows the site exists, and the action marks the company `verified`. After a DNS or connection failure, the action tries once more an hour later, then marks the company `rejected` with the reason.
3. **Later, with scraping.** The scraper compares the site's title with the name, pulls the logo, and finds the careers page and offices.

A company with no website, such as a local shop or a stealth startup, stays `private`. Only the person who added it can see or pick it.

### Locations

`companies.locations` is an array of offices. Each office has a city, an optional region and an ISO country code from a fixed list, plus a normalized `key` like `us|ca|san francisco`. Adding a location whose key already exists reuses the existing entry. Anyone can add a location to a company they can see. Remote isn't a location, so it goes in `applications.workMode`.

`preferences.locations` is free-text tags for now, such as "Berlin" or "anywhere in the EU". Matching them to company offices needs geocoding, which can come with the scrape phase.

## Adding records that depend on each other

An application needs a company, and may need a location on that company. The user should not have to create them on separate screens in the right order.

One mutation creates all of them. A Convex mutation is a single transaction. If any step throws, Convex writes nothing, so a failed add never leaves an orphan company behind.

```mermaid
sequenceDiagram
    actor U as User
    participant F as Add form
    participant M as applications.add mutation
    participant DB as Database
    participant S as Scheduler
    participant V as companies.verify action

    U->>F: pick a company or type a new one, same for location
    F->>M: { company: id or {name, domain}, location: key or {city, country}, role, ... }
    M->>DB: company by id, or find by domain, or insert as pending or private
    M->>DB: add the location to the company if its key is new
    M->>DB: insert application with history [{ to: status, at: now }]
    M->>S: if a company was inserted with a domain, run verify
    M-->>F: application id
    Note over M,DB: all or nothing, any throw rolls every write back
    S->>V: runs only if the mutation committed
    V->>DB: set verified or rejected
```

Rules for every "pick existing or create new" field:

- The argument is a union of `{ id }` to reuse or the draft fields to create. One arktype validator covers both, and the form and the mutation share it.
- Always look up before inserting. Find companies by `domain` when they have one and by `createdBy` plus name when they don't, and find locations by `key`. That keeps one record per real thing.
- Two users adding the same domain at the same moment is safe. Convex runs mutations as if one after the other, so the second one finds the first one's row.
- Check that the user may use a passed id, meaning the company is verified or theirs.
- Schedule follow-up work, such as verification and later the scraper, from inside the mutation with `ctx.scheduler.runAfter`. It then runs only if the add succeeded.

Files are the one exception. The browser uploads a resume to storage before the mutation that links it runs, so an abandoned form can leave an unused file. A daily cron deletes storage files that no `preferences` row has pointed at for a day.

In the form, the company field is a combobox. It searches verified companies plus your own, and its last option is "Add "what you typed"", which opens name and website fields in place. The location field works the same way and lists the chosen company's offices. The form saves nothing until you submit it.

## Audit logs

One `auditLogs` table covers every other table, rather than a log table per feature. Each row records who changed which record, when, and the values before and after. The "who" is a user, the system (the verify action), the Gmail sync or a migration.

It does not replace `applications.history`. An application keeps its history for as long as it exists, and the rates read it. Audit rows are generic, you read them rarely, for an activity page or when debugging why something changed, and a cron deletes them after a year.

```mermaid
flowchart LR
    M[any mutation] --> W[ctx.db write]
    W --> T{trigger on the table}
    T --> L[(auditLogs row with before and after values)]
```

How rows get written:

- `convex-helpers`, which is already installed, has triggers. A trigger registered on a table receives the old and new document on every insert, update and delete, inside the same transaction. Registering them once in the builders in `convex/lib/functions.ts` means every mutation logs without extra code.
- `actor` defaults to `user`, with `userId` set. The verify action, the Gmail sync and migrations pass their own `actor` and leave `userId` empty.

Rules:

- Store only the fields that changed, not whole documents.
- For `preferences` answers and profile fields, log the field names but not the values, since those include phone, salary and work authorization. The log should never be a second copy of private data.
- Deleting an account deletes that user's audit rows too, like everything else they own.
- Keep rows for one year. A monthly cron deletes older rows in batches.

## Status flow

The plan adds two statuses to today's four: `saved`, for a posting you found but haven't applied to, and `withdrawn`. Every arrow appends `{ to, at, note }` to `applications.history` in the same write that changes `applications.status`. One helper does both, so status and history always match.

```mermaid
stateDiagram-v2
    [*] --> saved
    saved --> applied
    applied --> interviewing
    applied --> rejected
    interviewing --> interviewing : next round
    interviewing --> offer
    interviewing --> rejected
    offer --> [*]
    saved --> withdrawn
    applied --> withdrawn
    interviewing --> withdrawn
    rejected --> [*]
    withdrawn --> [*]
```

The rates come from the history:

- The interview rate is the number of applications whose history reaches `interviewing`, divided by the number that reach `applied`.
- The acceptance rate is the number that reach `offer`, divided by the number that reach `applied`.
- Grouping either rate by `companyId` or `method` shows which kind of application works best.

## Where the numbers come from

```mermaid
flowchart LR
    A[applications + history] --> Q[queries]
    P[preferences] --> Q
    Q --> D[dashboard: rates, this month vs target]
    Q --> R[recommendations: follow up after 14 days quiet, under target, best method]
    Q --> RP[report for any past month]
    G[Gmail sync] --> M[(emails)] --> X[suggest status change] --> A
```

Reports and rates read all of one user's applications. That works up to a few thousand applications per user, far more than a normal job search. Past that, a table of saved monthly numbers would be worth adding back.

## Build order

```mermaid
flowchart TD
    subgraph P1[Phase 1: richer applications]
        S0[auditLogs + triggers, first so every later change is logged]
        S1[saved + withdrawn statuses, history array]
        S3[shared companies with locations, migrate company strings]
        S3b[add form: pick or create company and location in one submit]
        S3c[domain check action]
        S4[method, postingUrl, workMode, appliedAt, links, notes]
    end
    subgraph P2[Phase 2: about me]
        S5[preferences table: answers, AI prefill, one resume file - built]
        S6[monthly target]
        S8[dashboard + recommendations]
    end
    subgraph P3[Phase 3: automation]
        S9[emails via Gmail]
        S11[company scrape methods]
    end
    P1 --> P2 --> P3
```

Phase 1 needs a migration, because `applications.company` is a string today. For each user, the migration creates one `private` company per distinct name, sets `companyId`, then drops `company`. Old companies have no domain, so they stay private until their owner adds a website. Existing rows also get `history: [{ to: status, at: _creationTime }]`.

## Open questions

- **Interviews.** Are notes in `history` enough, or do you want dates, rounds and calendar reminders? Reminders would make interviews pass rule 4 and need their own table.
- **Autofill.** Is this for a browser extension that fills forms, or answers you copy from the app? An extension needs the answers in a different shape.
- **Rate limits.** Do you mean a personal monthly target, as above, or a hard limit on something costly like AI-written cover letters? The second would use the `@convex-dev/rate-limiter` component, which brings its own tables.
- **Audit scope.** Should the log cover data changes only, as above, or also sign-ins, sign-outs and failed sign-ins? Auth events come from Convex Auth, not table writes, so they'd need their own hook.
- **Postings.** Will one posting ever need more than one application, for example when reapplying later? If yes, a `postings` table passes rule 2.
- **Fixing shared data.** Users can't edit a verified company with a wrong name, or a junk location someone added. Who fixes it, an admin role or a "suggest a change" queue?
- **Subsidiaries and regional sites.** Are `stripe.com` and `stripe.co.uk`, or Instagram and Meta, one company or several? This design treats each domain as its own company.
