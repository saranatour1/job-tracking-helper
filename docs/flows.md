# Flows

Every way someone uses the app, and everything the app does by itself, one section per
feature. "You" is the person signed in. "The app" covers the parts that act without
anyone pressing a button: crons, workflows, the batch worker, the inbound email hook, and
Jev, the model that judges roles, sorts mail and answers workflow questions.

Each section has the same parts:

- **Stories:** who wants what, and why.
- **Flows:** the steps, what you see, and the function that does the work.
- **By itself:** what the app does without you.
- **Rules:** limits, switches and checks.
- **Files:** where it lives.

Keep this page current: a PR that changes how a feature behaves updates its section.
Workflows have their own page, [workflows.md](workflows.md).

## Contents

1. [Across the app](#across-the-app)
2. [Signing in](#signing-in)
3. [The shell](#the-shell)
4. [Preferences](#preferences)
5. [Resume](#resume)
6. [Applications](#applications)
7. [Views and goals](#views-and-goals)
8. [Jobs](#jobs)
9. [Auto-apply and Activity](#auto-apply-and-activity)
10. [Loops](#loops)
11. [Inbox](#inbox)
12. [Email](#email)
13. [Calendar](#calendar)
14. [Booking pages](#booking-pages)
15. [Account](#account)
16. [Workflows](#workflows)
17. [Known gaps](#known-gaps)

## Across the app

### Who acts

| Actor                         | What it does                                                                                                                                | Where                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| You                           | Everything in the pages below                                                                                                               | `src/features/*`                                                                |
| A guest on a booking page     | Books time with you, signed in or not                                                                                                       | `/book/$slug`                                                                   |
| Crons                         | Start due loops (every 15 minutes), start due workflows (every 5 minutes), refresh job boards (hourly), sweep the Archive and Trash (daily) | `convex/crons.ts`                                                               |
| The inbound email hook        | Takes mail your Cloudflare Worker forwards                                                                                                  | `POST /email/inbound/<id>`, `convex/http.ts`                                    |
| Jev                           | Judges roles for loops and pasted links, sorts mail, answers Ask Jev, drafts workflows from a sentence                                      | `convex/features/workflows/judge.ts`, `email/sort.ts`, `automations/actions.ts` |
| The batch worker (`readPool`) | Fetches job boards and runs Jev's judgments, 8 at a time, retrying each up to 3 times                                                       | `convex/features/workflows/manager.ts`                                          |
| Workflows                     | Runs the steps people build                                                                                                                 | `convex/features/automations/engine.ts`                                         |

### Events that start workflows

`fireEvent` (`convex/features/automations/fire.ts`) is called when:

- the sorter files an email (`internal.email.record`);
- an application changes status (`changeStatus`), except a move a workflow made;
- someone books time (`api.booking.book`).

It only schedules a check when you have an active workflow with that kind of trigger.

### Secrets

- Email details, the Cloudflare token, every email, mail notes and send errors are
  sealed with AES-256-GCM, bound to their owner and purpose (`convex/lib/secrets.ts`).
- Keys come from `SECRETS_KEYS` (`v1:<base64>,v2:…`): the last one seals, any one opens.
  `npx convex run email:resealAll` reseals everything with the newest key.
- Without `SECRETS_KEYS`, email features say "Email isn't set up on this server yet:
  SECRETS_KEYS is missing."

### Optional keys

`FIRECRAWL_API_KEY` and `CONTEXT_DEV_API_KEY` let loops search for new job boards and read
pasted links that aren't on a known board. A source without a key is skipped.

## Signing in

**Stories**

- As a new person, I want to make an account with a username and password, or Google or
  GitHub, so my search is saved.
- As someone trying it out, I want to continue as a guest without making an account.
- As a returning person, I want to land on my applications.

**Flows**

1. **Username and password.** `/sign-up` or `/sign-in` posts to
   `api.auth.signUpWithUsernamePassword` or `signInWithUsernamePassword`. Errors read
   "Wrong username or password.", "That username is taken.", "Password is too common.",
   "Too many attempts. Try again in a minute."
2. **Google or GitHub.** "Continue with Google/GitHub" starts the sign-in and returns to
   the app. Redirects only go to `SITE_URL`. Errors: "Sign-in was cancelled.", "Sign-in
   took too long. Try again."
3. **Guest.** "Continue as guest" signs in anonymously. The sidebar shows "Guest" until
   a name is set.
4. **First run.** The first time you open `/`, you go to Preferences until you save them
   or press "Skip for now".
5. **Sign out.** From the sidebar's user menu, or Account.

**By itself:** the first sign-in creates your `users` row
(`internal.auth.createUser`); Google and GitHub fill in your name and email.

**Rules:** signed-out visits to app pages go to `/sign-in`; signed-in visits to
`/sign-in` go to `/`.

**Files:** `src/features/auth/sign-in.tsx`, `src/routes/_auth*.tsx`,
`src/routes/_app.tsx`, `convex/features/auth/`.

## The shell

**Stories**

- As anyone, I want one sidebar to every page, with how many Inbox lines I haven't read.
- As anyone, I want the sidebar to stay as I left it when I open an application or a job.
- As anyone, I want light, dark, or my system's theme.

**Flows**

1. The sidebar groups the pages by what you do with them: Inbox (with its unread
   count), Applications and Calendar on top; **Find roles** with Jobs and Loops; **Done
   for you** with Workflows and Activity; **Tracker** with Goals and Views; **You** with
   Preferences and Resume. The pencil opens New application.
2. The header's sidebar button opens and closes the app sidebar. Side panels (an
   application, insights, a job from a loop) open beside it and leave it alone; on the
   board, the panel button at the right of the toolbar opens insights or closes an open
   application. On phones an application or a loop's job covers the page, and insights
   isn't shown.
3. The theme switch in the sidebar's footer (also under Account) is kept in the
   browser, with no server.

**Files:** `src/features/shell/`.

## Preferences

**Stories**

- As a job seeker, I want to say what I'm after in my own words, so loops and Jev judge
  roles against it.
- As someone who'd rather talk it through, I want my own AI assistant to interview me
  and fill the form.
- As someone filling in application forms, I want my usual answers ready to copy.
- As anyone, I want to keep my resume here, and check that it reads well to the systems
  and people who screen it, without it being rewritten for me.

**Flows**

1. **Ten steps** (`/preferences?tab=edit&step=n`): Start, what you're drawn to, where you
   want to grow, where you want to work, companies you'd like, red flags, who you are,
   important questions, your own questions, resume. The side panel sums up each step.
2. **Tags** are typed and kept with Enter: interests, things to avoid, skills to build,
   places, companies, red-flag companies. Plus a work mode (open to all, remote,
   hybrid, on-site), free text, fixed questions (pay, visa, start date and more) and up
   to 20 questions of your own.
3. **Save** (`api.preferences.save`) writes only what changed and marks you onboarded.
   "Some answers need fixing." jumps to the first step with a problem.
4. **With your own AI assistant:** "Copy prompt", paste it into ChatGPT, Claude or another
   assistant, answer its questions, paste its reply, and press "Fill the form". The reply
   is checked in the browser ("That reply isn't valid JSON…") and fills the form;
   nothing is saved until Save.
5. **Resume:** upload a PDF, Word or text file up to 10 MB
   (`api.preferences.setResume`). One at a time; a new one replaces the old.
6. **Overview** shows every answer; clicking one opens that step.
7. **Prefilled** keeps form fields to copy into applications. "Fill" suggests them from
   your answers, each field has a copy button, and Save keeps them
   (`api.preferences.savePrefilled`). Under a field auto-apply has put in a form, "Used
   3× · last Oct 30". Opening the tab with `?add=<question>` (Activity's **Add to
   Prefilled**) adds that question to "Your questions", empty, for you to answer and
   save.

**By itself:** loops and pasted links read your Preferences (`profileFor`) along with
the roles you liked and dismissed, and loop templates start from your tags. Auto-apply
fills forms from Prefilled, your custom questions and your account name and email.

**Rules:** each tag is 1 to 60 characters, 40 per list; Prefilled has up to 20 sections
of 50 fields, with no names twice.

**Files:** `src/features/preferences/`, `convex/features/preferences/`.

## Resume

**Stories**

- As anyone, I want to keep my resume here, and check that it reads well to the systems
  and people who screen it, without it being rewritten for me.

**Flows**

1. **Resume** in the sidebar (`/resume`): the upload Preferences' last step has (a PDF,
   Word or text file up to 10 MB, one at a time), a preview of a PDF on the right on
   wide screens (drawn page by page with pdf.js in a worker shipped with the app: nothing
   in the file runs, and it goes to no other service), and **Review** (`api.resume.review`,
   a Node action). It pulls the text out of a PDF with `unpdf` (plain text files read as
   they are; Word files can't be reviewed), then:
   - **ATS check**, by rules in code: email and phone at the top, the headings
     Experience, Education and Skills, one column with no tables, dates in one format,
     one or two pages. Each failure says what to change.
   - **Suggestions**: Jev answers fixed yes-or-no questions about the writing (does the
     summary say the role, do bullets give results, is the newest role first, do bullets
     start with verbs, is it free of filler) and, for up to 12 of your skills and
     interests, whether the resume shows each. A yes needs 0.7 and a no 0.3; between them
     Jev couldn't tell, and a tag shows as unsure. Every sure "no" becomes one line of advice,
     written in code; Jev never writes the advice or the resume.
   - The contact details and sections found, and which of your tags the resume shows.

   The text and the review stay on your preferences until the file changes. 10 reviews
   a day.

**Files:** `src/features/preferences/resume.tsx`, `convex/features/preferences/`
(`resumeRules.ts` for the checks and advice, `resume.ts` for the action).

## Applications

**Stories**

- As a job seeker, I want every application on a board by status, so I see where each
  one stands.
- As a job seeker, I want to add one in seconds from its posting link, and have the rest
  filled in for me.
- As a job seeker, I want notes, tasks and labels on each, and the emails about it.
- As a job seeker, I want to archive what's done and delete what I don't want, with a
  Trash that empties itself.
- As someone with many applications, I want to filter, group and sort them, and get back
  to the same view from a link.

**Flows**

1. **Add one.** New application asks for role, company, posting link and notes
   (`api.applications.add`). It starts at Applied and gets a number (`APP-12`). With a
   link, Jev checks the posting and fills in what's empty: priority, location, a Remote
   label, the description.
2. **See them.** `/` is a board or list, grouped by status, priority or goal, sorted by
   priority, date or company, with Active, Saved and All tabs. Filters, display and the
   open application live in the address (`?tab=`, `?filters=`, `?display=`, `?app=`), so
   a link opens the same view.
   Each card shows the company, the role, and badges: its status, how well it fits
   (when a loop found it or Jev checked its link, from `api.loops.fits`), Active or
   Quiet for open applications (no news in two weeks), then priority, labels,
   location, mail and tasks done.
3. **Move one.** Drag a card to another column, use "Move to" on right-click, or the
   Status picker. All go through `api.applications.setStatus`, which adds to the
   history and may start workflows.
4. **Open one.** Click a card for the side panel (`?app=`); click again, or Cmd-click,
   for the full page (`/pipeline/$id`). Esc closes the panel.
5. **Edit one.** Status, priority, labels, how you applied, company and location
   (`api.applications.update`). Tasks: type and press Enter, click to check off. Notes:
   "Leave a note…" (`api.applications.addNote`).
6. **Its activity:** status changes, notes and emails in one timeline.
7. **Its job:** if a loop found it or Jev checked its link, its fit, why, and the
   posting.
8. **Its emails:** each with a "Read" toggle, a portal link if there is one, and the
   sorter's suggestion ("The email “X” suggests moving this to Y." Yes or No), or Jev's
   move with an Undo. "N unsorted" in the toolbar lets you file mail by hand
   (`api.email.assign`).
9. **Right-click:** a card offers Open, Move to, Archive, Move to Trash, "Roles at
   <company> in Jobs", "Roles like this in Jobs", Open posting, Copy link. The board
   offers "Save as a view" and Clear filters.
10. **Archive one:** Archive (on the card's menu, or the box icon in its panel) takes it off
    the board into the **Archived** tab (`api.applications.archive`); "Back to the board"
    undoes it.
11. **Delete one:** Move to Trash (or the bin icon in its panel) puts it in the **Trash**
    tab, out of everything else: the board, mail matching, bookings and workflows
    (`api.applications.trash`). In the Trash, Restore puts it back on the board, Delete
    forever removes it now, and Empty the Trash removes them all, a batch at a time.

**By itself:** a status change fires the `status` event for workflows; a sorted email
can suggest a move, or make it when you let Jev (see [Email](#email)). Each day
(`internal.applications.sweep`), applications archived 30 days ago move to the Trash, and
ones in the Trash longer than you keep them (90 days unless you change it) are deleted
for good. Deleting one leaves its mail unfiled, its events on the calendar, and its job
lead marked tracked, so loops never offer the role again.

**Rules:** 20 labels, 50 tasks, the last 100 notes and 100 history entries per
application.

**Files:** `src/features/tracker/`, `convex/features/applications/`.

## Views and goals

**Stories**

- As a job seeker, I want to save a filtered board as a view and open it from a tab.
- As a job seeker, I want goals for my search and to see how each is going.

**Flows**

1. **Save a view:** filter Applications, then "+" by the tabs, or right-click → "Save as a
   view", name it, and Create view (`api.views.create`). It opens at `/?view=<id>`.
2. **Open a view:** its tab on Applications, or `/views`.
3. **Delete a view:** right-click its tab → "Delete view", and confirm.
4. **Make a goal:** on **Goals** (`/goals`), **New goal**: a name, a summary, a priority,
   start and target dates, one of your loops (optional), and milestones one per line,
   each with a date at the end if it has one. Create goal saves it (`api.goals.create`).
   The page lists goals newest first under **Yours**, each with its dates, milestone and
   application counts, status (Upcoming or Active), progress, and Edit and Delete.
   Completed and missed ones move under **Past**.
5. **Retry a missed goal:** a goal whose target date passed with milestones unticked
   shows as Missed, with **Retry**. That makes a fresh goal with the same name, summary,
   priority, loop and milestones, unticked, starting today for the same length, with
   milestone dates moved along (`api.goals.retry`). The old one stays.
6. **Open a goal** (`/goals/$id`): its applications on the board, with a summary panel
   showing progress, interviews and offers, and its milestones. Click a milestone to tick
   it or untick it (`api.goals.update`). **Edit** changes the fields; **Delete** asks
   first, then removes the goal and its applications leave it (`api.goals.remove`).
   Under the milestones, **Activity** gathers what happened on the goal's applications
   between its start and target dates, newest first: company mail, status changes, notes
   and calendar events, with their open tasks on top. Up to 50 items.
7. **Put an application on a goal:** open it and pick the goal in its properties
   (`api.applications.setGoal`). The board can filter, group and count by goal. A goal
   that names a loop takes roles by itself: adding one to the board from that loop's
   shortlist puts it on the goal (`api.loops.track`). A workflow's **Put on goal** step
   does the same, and **An application joins a goal** can start one; see
   [workflows.md](workflows.md).
8. **Re-evaluate:** on a goal's page, **Re-evaluate** asks Jev, in one request, for each of your
   applications, whether it counts toward the goal, from the goal's name, summary and
   milestones and the application's role, company, status, location, labels and
   description (`api.goals.evaluate`). Only a sure answer counts (0.7 for yes, 0.3 for
   no); the panel then lists ones to **Add** and ones to **Take off**, and nothing
   changes until you press one. 10 re-evaluations a day, over your newest 30
   applications.

**Rules:** 50 views, 50 goals, 20 milestones a goal. Progress is the share of milestones
ticked; a goal with none is complete once its target date has passed. Only your own goals
and loops can be picked, edited or deleted.

**Files:** `src/features/tracker/views.tsx`, `goals.tsx`, `convex/features/views/`,
`convex/features/goals/`.

## Jobs

**Stories**

- As a job seeker, I want to search open roles from company job boards, newest first or
  by what I type.
- As a job seeker, I want to see which roles a loop already judged for me.

**Flows**

1. `/jobs` says how many roles are in the shared catalog, from how many boards.
2. Search by words (`?q=`), or pick a "Try" chip from your Preferences (interests,
   places, companies). Narrow it down with Remote only, Fits me (only roles Jev said fit
   you, best first), Posted (past day, week or month) and a company (`api.jobs.companies`,
   the boards with the most roles). Every filter is in the address, so a link opens the
   same list; Clear filters resets them (`api.jobs.search`, 25 at a time).
3. Each role shows its company, title, where, how long ago it was posted, and badges:
   Jev's verdict for you ("Fits you · 69%", "Not a fit"), New (posted in the last two
   days) and Remote. Compact turns them into one line each.
4. "More like this" searches by a role's title; the link icon opens the posting.
   Applications link here too.
5. **Auto-apply** puts the role in your auto-apply pile (`api.autoApply.queue`); see
   [Auto-apply and Activity](#auto-apply-and-activity). A role already in the pile
   shows where it is instead: Queued, Applying, Needs you, Previewed or Applied.

**By itself:** every hour (`internal.jobs.refreshDue`) up to 25 boards not fetched in 20
hours go to the batch worker (`internal.jobs.fetchBoard`). It reads each public feed
(Greenhouse, Lever, Ashby, Personio), saves the roles, and drops ones the board no
longer lists. A board that answers 4xx is noted and not retried. Loops and pasted links
add new boards.

**Postings:** a board's HTML is parsed with rehype, cleaned with rehype-sanitize (no
scripts, styles, event handlers, `javascript:` links or images) and kept as Markdown, at
most 3,500 characters (`convex/lib/markdown.ts`). The app draws it with react-markdown,
which never draws raw HTML and sanitizes the tree again (`src/components/markdown.tsx`).
Previews are the same text as plain words.

**Rules:** the catalog is shared by everyone; what Jev thought of a role is yours alone.

**Files:** `src/features/jobs/`, `convex/features/jobs/`.

## Auto-apply and Activity

**Stories**

- As a job seeker, I want the app to apply to roles I pick, with my saved answers and
  resume, and to tell me what it couldn't answer.
- As a job seeker, I want to see what it did, which answers it used, and what to add.

**Flows**

1. **Turn it on** under Account → Auto-apply (`api.autoApply.setSwitch`). It needs a
   resume on the Resume page, your email under Profile, and a Firecrawl key on the
   deployment. **Fill, but don't send yet** makes every run a dry run: filled and
   reported, nothing sent.
2. **Queue a role** with **Auto-apply** on Jobs. Only Greenhouse, Lever, Ashby and
   Personio postings; one row per posting and person, 10 a day. A posting that was ever
   sent can't be queued again. The row goes to the `applyPool` Workpool: 2 at a time,
   never retried by itself.
3. **The run** (`internal.autoApply.run`): Firecrawl opens the posting (`/v2/scrape`) and
   runs Playwright scripts in that browser (`/v2/scrape/{id}/interact`):
   - **Read the form:** every field with its label, type, options and whether it's
     required. A password field or a sign-in address stops it as Needs you ("wants you to
     sign in"); a visible CAPTCHA frame does too.
   - **Match** (`autoApply/match.ts`): plain fields by synonym (name, first and last from
     your full name, email, phone, LinkedIn, website, location, work authorization, visa,
     salary, start date, pronouns). Gender, race, veteran, disability and other EEO
     questions, and cover letters, are left blank. Everything else goes to Jev in one call:
     per question, which saved answer fits, or which option on a pick list, or none; a
     pick counts only when Jev is at least 60% sure. Jev never writes an answer; the text
     that reaches the form is always yours, verbatim. A required question nobody
     answered stops the run as Needs you, with the questions listed.
   - **Fill:** the resume first (fetched inside the browser from a short-lived storage
     link), then each field; required consent boxes ("I agree to the privacy policy") are
     ticked. Anything that wouldn't take its value stops it as Needs you.
   - **Submit:** a dry run stops here as Previewed. Otherwise the row is marked
     `submittedAt` first, then Submit is clicked and the page watched for 25 seconds: a
     "thank you for applying" line or a confirmation address means Applied; a field error
     means Needs you; a CAPTCHA on submit means Needs you with the link; nothing at all
     means Failed ("check your email before applying again"), and that posting stays
     closed to auto-apply.
   - The browser session is always closed at the end. Each run costs Firecrawl credits
     (counted on `sourceUsage`) and one Jev call.
4. **Applied** makes an `applications` row at Applied with the posting's company, role
   and link (or moves the application a loop already made), stamps each used Prefilled
   answer's usage, and sends an Inbox line (`apply.done`). Needs you sends `apply.needsYou`.
5. **Activity** in the sidebar (`/activity`): one tile per run, newest first, with its
   status, when, "Used: Full name, Email, Phone…", the questions with no saved answer
   (each with **Add to Prefilled**), the posting link, the application, **Try again** for a
   stopped run that wasn't sent, and **Take out** for a queued one. A line on top: last
   run, applied in 30 days, saved answers used.

**Rules:** nothing is ever guessed or written for you; a question without a saved answer
stops the run. Demographic questions are always left blank. Try again follows the Account
switch, so a dry run stays a dry run. A location list that doesn't have your saved city
tries your saved country. No logins and no stored job-site passwords. A posting is submitted at
most once, even if a run dies mid-way. Answers' values never go in the log, only their
labels.

**Files:** `src/features/activity/`, `src/features/jobs/jobs.tsx`,
`src/features/account/account.tsx`, `convex/features/autoApply/` (`match.ts` the
matcher and Jev's questions, `firecrawl.ts` the calls and scripts, `actions.ts` the run,
`public.ts` the queue, `internal.ts` claim, the submit fence and finish).

## Loops

**Stories**

- As a job seeker, I want a loop that each morning finds roles and has Jev keep only the
  ones that fit me, a few at a time.
- As a job seeker, I want to tell it "more like this" or "less like this".
- As a job seeker, I want to change a loop's answers without starting a new one.
- As someone who found a role myself, I want to paste its link and have Jev check it.
- As a job seeker, I want a role I like to go straight onto my board.
- As someone paying for search credits, I want to see what each run cost.

**Flows**

1. **Start a loop.** Pick a template on `/loops` (Remote roles that fit, Close to home,
   Dream companies watch, Stretch roles, Fresh this morning, or My loop). It fills its
   answers from Preferences: when it runs, the job in your words, what it searches for,
   how many it checks and shows, and what it leaves out. "Start loop"
   (`api.loops.create`). Up to 3 loops.
2. **Each loop's tile:** Run now (`api.loops.runNow`, 3 a day), Stop this run, Pause or
   Resume daily runs, Edit, Use in a workflow (opens Morning job search with this loop),
   and Remove (its runs and roles stay).
3. **Edit a loop:** Edit opens the same setup with the loop's answers filled in
   (`?edit=<loopId>`). "Save changes" (`api.loops.update`) runs the same checks as
   starting one and moves its next run to the new time; a run already going keeps the
   answers it started with.
4. **Your shortlist** ("For you", "Saved"): open a role for its fit, Jev's checks and the
   posting. Save it, favorite it ("Tomorrow's runs will look for more like it."), dismiss
   it ("…less like it."), or add it to Applications as Saved (`api.loops.track`).
5. **Check a link.** Paste a posting's link and press "Check it" (`api.loops.checkLink`).
   A known board is read for free; another page costs one Firecrawl credit. Jev judges
   it and it opens on your shortlist. 10 a day; a link you checked before opens straight
   away.
6. **Runs tab:** each run's source, judged, fit, saved and credits, and totals.
7. **Sources tab:** each search source's credits this month, and when runs move on to
   the next one.

**By itself**

1. Every 15 minutes, loops whose morning has come start (`internal.loops.startDue`) and
   move to the next morning.
2. A run (`internal.workflows.findJobs`):
   1. Builds searches from your Preferences.
   2. Searches for new job boards with the first source that has credits left, and
      fetches them.
   3. Picks catalog roles you haven't been shown that pass your hard rules.
   4. Hands them all to the batch worker for Jev, and waits for every verdict.
3. **Jev's judgment per role:** how well it matches (unrelated to strong), then whether
   each need holds: the place, pay, visa, things to avoid, interests and skills. A role
   fits when the match is good enough, no need fails, and every must-have is confirmed.
4. **The end of a run:** fits wait, and the best go on your shortlist up to the loop's
   size. Your Inbox gets "N new roles fit" (`loop.found`).
5. **Failures:** a failed or canceled run says so on the Runs tab.

**Rules:** 3 loops; checks 25, 50 or 100 roles a run and shows 3, 5 or 10; Run now 3 a
day; links 10 a day; a source moves on at 90% of its monthly credits.

**Files:** `src/features/loops/`, `convex/features/loops/`,
`convex/features/workflows/` (the run, Jev's judging, search sources).

## Inbox

**Stories**

- As a job seeker, I want one list of what happened (mail about my applications, mail to
  file, bookings, workflow messages, new roles), each opening where I act on it.
- As anyone, I want to turn off kinds I don't care about.

**Flows**

1. `/inbox` shows the 100 newest, Unread first (`?tab=`), grouped by nothing, status or
   company (`?group=`).
2. Opening one marks it read (`?id=`). Each has a button to where it came from: Open
   applications, Open calendar, Open loops, or Open the run.
3. Mark as read or unread, or Mark all as read.

**Kinds**

| Kind                | What                         | Made by           |
| ------------------- | ---------------------------- | ----------------- |
| `mail.news`         | Interview invites and offers | The email sorter  |
| `mail.rejection`    | Rejections                   | The email sorter  |
| `mail.update`       | Other company mail           | The email sorter  |
| `mail.unsorted`     | Mail that needs filing       | The email sorter  |
| `booking.new`       | New bookings                 | A booking         |
| `automation.notify` | Messages from your workflows | A Notify me step  |
| `loop.found`        | New roles from loops         | A loop run        |
| `apply.done`        | Applications sent for you    | An auto-apply run |
| `apply.needsYou`    | Applications that need you   | An auto-apply run |

**Rules:** a kind turned off under Account is never recorded. A line whose source is gone
isn't shown. Email lines are opened from their sealed note only when you look.

**Files:** `src/features/inbox/`, `convex/features/notifications/`,
`convex/components/notifications/`.

## Email

**Stories**

- As a job seeker, I want company mail to land on the right application by itself, so I
  never file it by hand.
- As someone careful with access, I want each thing the app does with my mail behind its
  own switch, and my token never shown again.
- As a job seeker, I want an interview email to move its card to Interviewing, with an
  undo.

**Flows** (Account → Email)

1. **Connect Cloudflare:** account ID, send-from address, API token (`api.email.connect`).
   The app checks the token and the domain, then seals both. The token can't be viewed
   again: "Locked. Added <date>. It can't be viewed or copied, only replaced." 10 tries
   an hour.
2. **Switches, all off at first** (`api.email.setAllow`):
   - Send email: test emails and workflow emails.
   - Set up Cloudflare for you.
   - Keep incoming mail.
   - Let Jev read your mail.
   - Let Jev move cards (needs Jev reading first).
3. **Send a test email** to yourself (5 an hour).
4. **Set up incoming mail** (`api.email.setUpInbound`). The app uploads a small Worker
   and a routing rule for your address. Email Routing must already be on for the
   domain; the app won't turn it on, since that changes the domain's MX records.
   "Stop incoming mail" removes both.
5. **Recent mail:** the 10 newest, opened for you.
6. **Disconnect:** removes the Worker, the rule and the saved token. Your emails stay.

**By itself**

1. **Mail arrives.** Cloudflare passes mail to your Worker, which posts it to
   `/email/inbound/<id>` with its secret.
   - The hook refuses a wrong secret (401) and mail you've stopped (403).
   - Past the limit it answers 503, so Cloudflare tries again.
   - Otherwise it seals the email, keeps only ids, and sorts it.
2. **Sorting** (`internal.email.sortMail`):
   1. A reply joins the application its thread is on.
   2. Otherwise a company named in the sender or subject picks the application.
   3. Rules guess the kind: confirmation, interview, rejection, offer, portal or other.
   4. If you let Jev read your mail, Jev answers which application and what kind. Only
      answers it's at least 50% sure of count.
   5. The sorter also keeps any portal link and interview time.
3. **Filing** (`internal.email.record`):
   - It suggests a move (an interview suggests Interviewing).
   - When you let Jev move cards and Jev is at least 80% sure, it moves the card itself,
     with an Undo.
   - Then it adds an Inbox line and fires the `mail` event for workflows.

**Rules:** each switch is checked on the server before it acts. Mail is sealed per
person. Only the kind, the suggestion and the move are kept in the clear.

**Sending:** a send Cloudflare refuses with a 429 or 503 is tried again, up to 3 attempts
over a few seconds. Nothing else is, since it may already have gone out. An address that
bounced or is suppressed counts as failed, even though Cloudflare calls that request a
success. An email still "queued" after 15 minutes means its send died, so it's marked
failed, and Account says it couldn't confirm the email went out.

**Files:** `src/features/account/email.tsx`, `convex/features/email/`,
`convex/components/cloudflareEmail/`, `convex/lib/secrets.ts`.

## Calendar

**Stories**

- As a job seeker, I want my search on a calendar: when I applied, emails, interviews,
  and when to follow up.
- As a job seeker, I want my own events, linked to the application they're about.
- As someone talking to companies abroad, I want my time zone and a few others side by
  side.
- As someone with another calendar, I want to import and export `.ics` files.

**Flows**

1. `/calendar` shows applied and status changes, every email, interview times read from
   emails, a follow-up a week after an application goes quiet at Applied, and your own
   events. The view and date live in the address (`?view=`, `?date=`).
2. **Your events:** add, drag or edit (`api.calendar.save`). A title naming one company
   links the event to that application, and the title sets its kind (interview,
   follow-up, reminder).
3. **Events the app made:** editing one saves your version over it; deleting one hides
   it.
4. **By application:** a lane per application in the timeline view; drag an event to
   another lane to relink it.
5. **Import or export:** "Import .ics" adds the file's events (importing again doesn't
   double them); "Export" downloads what's shown.
6. **Filters:** "Kinds to show" (`?hide=`), and the list by day or by application.
7. **Settings** (Account → Calendar): your zone, up to 3 more, the 12 or 24 hour clock,
   the first day of the week, and the hours shown.

**Rules:** 500 events of your own. No live sync with Google or other calendars.

**Files:** `src/features/calendar/`, `convex/features/calendar/`.

## Booking pages

**Stories**

- As a job seeker, I want a link recruiters can book time with, showing only when I'm
  free.
- As a recruiter or anyone I send it to, I want to pick a time in my own zone and get it
  on my calendar.
- As a job seeker, I want the booking on my calendar, linked to the right application.

**Flows (yours, Account → Booking pages)**

1. New booking page: title, length, hours, days, notice, how far ahead it opens, which
   application (or "By the guest's email"), and where (`api.booking.savePage`). Up to 20.
2. Open or close it, Copy link, Edit, or Delete ("Its link stops working.").

**Flows (the guest, `/book/<slug>`)**

1. The page shows free times in the guest's zone, with yours beside it. Busy times come
   from your events and interview times read from your mail; nothing else about you is
   shown.
2. The guest picks a time (`?at=`), adds their name, email and a note, and books
   (`api.booking.book`). The server checks the time again: "That time isn't open any
   more. Pick another."
3. "You're booked." with "Add to your calendar".

**By itself:** a booking becomes an interview on your calendar, linked to the page's
application or one matched by the guest's email domain. It adds an Inbox line
(`booking.new`) and fires the `booking` event for workflows.

**Rules:** one upcoming booking per guest email per page; 50 upcoming per page; times on
the quarter hour.

**Files:** `src/features/booking/`, `src/routes/book.$slug.tsx`,
`convex/features/booking/`.

## Account

**Stories**

- As anyone, I want to change my name, username, email and picture.
- As anyone, I want to choose which Inbox kinds I get.
- As anyone, I want to delete my account and everything in it.

**Flows** (`/account`: Profile, Email, Notifications, Calendar, Booking pages,
Interface and theme, Account)

1. **Profile** fields save when you leave them (`api.users.updateProfile`). A picture is
   an image up to 5 MB.
2. **Notifications:** a switch per kind; a kind that's off isn't recorded.
3. **Applications:** how long the Trash keeps applications before deleting them: 30, 90
   (the default), 180 or 365 days, or never (`api.applications.setTrashDays`). Changing it
   moves the date for what's already in the Trash.
4. **Auto-apply:** the switch that lets the app submit applications for you, and "Fill,
   but don't send yet" (`api.autoApply.setSwitch`); see
   [Auto-apply and Activity](#auto-apply-and-activity).
5. **Delete account:** confirm, then everything goes: applications, Preferences and
   resume, loops and their runs and roles, email connection and mail, notifications,
   views, goals, auto-apply runs, calendar, booking pages and workflows. Your username is
   freed.

**Files:** `src/features/account/`, `convex/features/users/`.

## Workflows

Steps you build from blocks that run for you: on a schedule, when an email or a booking
comes in, when an application moves, or when you press Run now. Start from scratch,
from one of eleven templates (job search, follow-ups, each kind of email, bookings), or
describe it in a sentence and let Jev draft it. The full story is in
[workflows.md](workflows.md).

## Known gaps

- Deleting an account doesn't remove the Cloudflare Worker and routing rule; mail sent
  afterwards is refused.
- Deleting an account doesn't stop a loop run that's in progress; it finds nothing to
  save and stops.
- A guest with no Calendar time zone gets workflow calendar events in UTC.
