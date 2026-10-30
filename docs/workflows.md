# Workflows

Workflows are steps that run for you. You build one from blocks; the app stores it as
data and one interpreter runs every workflow anyone builds, so a workflow never runs
code. This page covers what a person does with workflows, what the app does by itself,
and the rules both go by. For the rest of the app, see [flows.md](flows.md).

## Words

- **Workflow:** a name, a trigger, an on/off switch and up to 20 steps
  (`automations` table).
- **Trigger:** what starts a run: Run now, a schedule, an email being sorted, an
  application moving, someone booking time, or an application joining a goal.
- **Block:** one thing to do: Notify me, Find roles, Send email, Add note, Move
  application, Put on goal, Add calendar event, Only go on if, Wait.
- **Branch:** a step that holds 2 to 4 paths of blocks, one level deep. A **split** runs
  every path side by side; **Ask Jev** runs only the path for Jev's answer.
- **Run:** one go through the steps (`automationRuns`). It copies the steps when it
  starts, so editing a workflow never changes a run already going. Each step's outcome
  is kept by its place: `"2"` is the third step, `"2.1.0"` the first block on the second
  path of that branch.
- **Placeholders:** names in curly braces, like `{application.company}`, filled in as
  plain text when the step runs.

## What a person does

### Start a workflow

1. Open **Workflows** in the sidebar (`/workflows`). The list shows each workflow's
   trigger, its number of steps, and how its runs went.
2. Press **New workflow** and pick:
   - **Start from scratch:** a Run now trigger and one Notify me step.
   - **A template** (`src/features/workflows/templates.ts`), which opens as an unsaved
     draft (`/workflows/new?template=…`):

     | Group           | Template                  | What it does                                                                   |
     | --------------- | ------------------------- | ------------------------------------------------------------------------------ |
     | Find roles      | Morning job search        | Runs a loop each weekday; tells you only when something fits                   |
     | Find roles      | Weekly review             | Half an hour each Monday to go over your board                                 |
     | After you apply | Follow up after applying  | A week after you apply, if it's still at Applied: a follow-up on your calendar |
     | After you apply | Note when it goes quiet   | Three weeks with no news: a note, and a nudge                                  |
     | After you apply | Interview prep            | Research time when an application moves to Interviewing                        |
     | Email           | Interview email           | Moves it to Interviewing and plans prep time                                   |
     | Email           | Thank whoever invites you | Ask Jev whether a person wrote it; if so, replies                              |
     | Email           | Offer email               | Moves it to Offer, tells you everywhere, and sets time to decide               |
     | Email           | Rejection email           | Moves it to Rejected and notes why                                             |
     | Email           | Portal email              | Time today to check the company's portal                                       |
     | Bookings        | New booking               | Tells you everywhere, and notes it on its application                          |

     Every template checks what it needs before acting: one started by an email goes on
     only if the email matched an application, and a reminder after a wait goes on only
     if the application hasn't moved meanwhile.
3. Or, on the **Loops** page, press a loop's **Use in a workflow**. That opens Morning
   job search with the loop already picked (`?template=jobSearch&loop=…`).
4. Or **Describe one** on the Workflows page: write what it should do in a sentence and
   press **Draft it** (`api.automations.describe`). Jev answers fixed questions about the
   sentence (what starts it, which blocks, how long to wait, which status), and the
   draft is built from those answers, with the same checks the templates have. Jev never
   writes a step's text, so nothing typed becomes part of a step. The draft opens unsaved
   (`?draft=…`) for you to check. 20 drafts a day.

### Build it

1. The builder has three parts: the blocks on the left, the canvas in the middle, and
   the selected step's settings on the right.
2. Add a step: drag a block onto a line's **+**, press the **+** and pick one, or click a
   block on the left to add it at the end. Branches only go at the top level.
3. Click a card to open its settings. The address keeps the selection (`?step=2`, or
   `?step=2.1.0` on a path), so a reload or a shared link opens the same step.
4. Click the trigger card to change what starts the workflow:
   - **Run now:** only when you press Run now.
   - **On a schedule:** a time, some weekdays, and a time zone.
   - **An email comes in:** when the sorter files an email of some kinds (none picked
     means any kind).
   - **An application moves:** to some statuses (none picked means any).
   - **Someone books time:** on any of your booking pages.
   - **An application joins a goal:** when you pick a goal on an application, a loop's
     role lands on its goal, or Jev's suggestion is added, for some goals (none picked
     means any).
5. Placeholder buttons under each text box add a name to the end of the text. Which
   names show depends on the trigger, and on whether a Find roles step comes first.
6. Remove a step with its trash button or **Remove** in its settings. Removing the last
   block on a split's path removes the path; a split left with one path turns back into
   plain steps. An Ask Jev answer keeps its path even when it's empty.

### Save it

1. Press **Save**. The builder checks the workflow first and shows the first problem
   next to the button, for example:
   - "Pick a loop to find roles with."
   - "Pick an application, or start the workflow from an email, a status change or a
     booking."
   - "Send it to one email address, or a placeholder like {email.from}."
   - "Give each of Jev's answers a different name."
2. The server checks it again (`api.automations.save`). It refuses an application or
   loop that isn't yours, and a 31st workflow.
3. A new workflow moves to its own address. **Run now** stays off while there are
   unsaved edits, because a run uses the saved steps.

### Run it and watch it

1. Press **Run now** (in the builder or on the list). It opens **History** on the new
   run. You can run workflows by hand 50 times a day.
2. History draws the run on the same canvas. Each card has a dot: running, waiting,
   done or failed. Click a card to see what that step did ("Moved Frontend Engineer at
   Hooli to Offer", "Jev answered “Yes”", "Jev judged 50 roles: 1 fit.").
3. The lines under an Ask Jev step show how often Jev picked each answer, across all
   runs. The counts stay with the step when it moves; renaming an answer starts its
   count again.
4. **Stop run** stops a run that's still going. Steps still running or waiting are
   marked failed with "Stopped.", and a loop run that Find roles started stops too.
5. A Notify me line in the **Inbox** opens its run.

### Change it

- **Edit** on a workflow's row (or its name) opens it in the builder. Changes apply from
  the next run; a run already going keeps the steps it started with.

### Turn it off or delete it

- The switch on the list or in the builder turns a workflow off. It then never starts on
  its own; Run now still works.
- **Delete** asks first, stops its runs, and removes them with their Inbox lines.

## What the app does by itself

### Starting runs

- **Schedule:** a cron calls `internal.automations.startDue` every 5 minutes, so one set
  for 09:00 starts by 09:05. It starts each workflow that's due and sets its next time.
- **Events:** five places call `fireEvent` (`convex/features/automations/fire.ts`):
  - the email sorter, after it files an email (`email/sort.ts`);
  - `changeStatus`, when an application moves (`applications/public.ts`);
  - `book`, when someone books time (`booking/public.ts`);
  - `setGoal`, when an application is put on a goal (`applications/public.ts`), and
    `track`, when a role from a goal's loop lands on the board (`loops/public.ts`).

  `fireEvent` only schedules `internal.automations.onEvent` when the person has an
  active workflow with that kind of trigger. `onEvent` starts each one the event
  matches, up to 200 event runs a day.

- A run started by an event keeps only ids (`context`): the application, the email
  event, the booking, and the old and new status. An email's subject and sender stay
  sealed until a step needs them.
- A workflow's own **Move application** and **Put on goal** never fire an event, so one
  workflow can't set off another, or itself.

### Running the steps

`internal.automations.run` is a workflow on the Convex workflow component. For each step:

- **A block** is one mutation (`runStep`). It records the step's outcome before
  anything else happens.
- **Wait** sleeps inside the workflow. A sleeping run costs nothing.
- **Notify me by email** and **Send email** go out from an action (`sendMail`), through
  the person's own Cloudflare connection, then record how it went. The action isn't
  retried, so an email never goes out twice; only a send Cloudflare refused with a 429
  or 503, which never went out, is tried again, up to 3 attempts over a few seconds.
  An address that bounced or is suppressed fails the step, even though Cloudflare
  calls that request a success.
- **Find roles** inserts a loop run, then runs the loop's own `findJobs` workflow as a
  child: it searches for boards, picks catalog roles, has Jev judge them on the batch
  worker, waits for every verdict, and saves the fits to the shortlist. The loop's Runs
  tab shows it like any other run. Afterwards `foundRoles` records "Jev judged N roles:
  M fit." and later steps can name `{roles.fits}`.
- **Ask Jev** calls Jev (`askJev`) with the question, the answers, and every fact the
  run knows, and tries once more after a second if the call fails. Jev picks one
  answer; the answer is counted in the `automationChoices` aggregate, and that path's
  blocks run in order.
- **Only go on if** checks one fact in the same mutation as the step, with no call out.
  If it doesn't hold, the run ends there as done ("Stopped here: {application.status} is
  “Interviewing”"); on a split's path, only that path ends.
- **A split** starts each path as its own child workflow (`runPath`), so a wait on one
  path never holds back another. The run goes on once every path is done.
- **A step that can't run** is recorded as failed with its reason, and the run stops
  there. The reason is the error you see in History.

When the run's workflow ends, `ended` marks the run done, failed or canceled, and the
workflow's journal is cleaned up. Each workflow keeps its newest 50 runs.

## Blocks

| Block              | What it does                                                                                 | Needs                                                   |
| ------------------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Notify me          | A line in your Inbox, an email to you, or both                                               | For email: a Cloudflare connection with “Send email” on |
| Find roles         | Runs one of your loops now                                                                   | A loop that isn't already running; 5 a day              |
| Send email         | Emails one address from your Cloudflare address                                              | “Send email” on; 20 a day                               |
| Add note           | Adds a note to an application                                                                | An application picked, or one from the trigger          |
| Move application   | Moves an application to a status                                                             | The same                                                |
| Put on goal        | Puts an application on one of your goals                                                     | The same, and a goal picked                             |
| Add calendar event | An event some days after the run, at a time, in your Calendar's zone (UTC if none)           | 0 to 60 days later, 5 minutes to 8 hours long           |
| Wait               | Waits before the next step                                                                   | 1 minute to 30 days                                     |
| Split into paths   | Runs 2 to 4 paths side by side                                                               | Every path has a step                                   |
| Ask Jev            | Jev answers a question with one of 2 to 4 answers; that path runs                            | A question, and different answer names                  |
| Only go on if      | Goes on only if a fact has a value, is empty, is or isn't something, or is at least a number | A fact the trigger or a Find roles step brings          |

## Placeholders

| Names                                                                                       | When they're there                                                                  |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `{workflow.name}`, `{run.date}`                                                             | Always                                                                              |
| `{application.company}`, `{application.role}`, `{application.status}`, `{application.goal}` | The trigger is about an application, or (in Add note) one is picked                 |
| `{status.from}`, `{status.to}`                                                              | An application moves                                                                |
| `{goal.name}`                                                                               | An application joins a goal                                                         |
| `{email.subject}`, `{email.from}`, `{email.kind}`                                           | An email comes in                                                                   |
| `{booking.title}`, `{booking.when}`                                                         | Someone books time; the time is in your Calendar's zone, or else the booking page's |
| `{loop.name}`, `{roles.judged}`, `{roles.fits}`                                             | After a Find roles step                                                             |

Dates and times are in your Calendar's zone. A name the run doesn't know stays as
written. Placeholders are only ever replaced with
text; nothing in them runs.

## Limits

| What                                        | Limit     |
| ------------------------------------------- | --------- |
| Workflows per person                        | 30        |
| Steps per workflow, counting those on paths | 20        |
| Paths per branch                            | 2 to 4    |
| Runs by hand                                | 50 a day  |
| Runs started by events                      | 200 a day |
| Find roles                                  | 5 a day   |
| Send email                                  | 20 a day  |
| Drafts from Describe one                    | 20 a day  |
| Runs kept per workflow                      | 50        |

## Files

- `convex/features/automations/validators.ts`: blocks, triggers, limits and the
  checks a workflow must pass. Shared with the frontend.
- `convex/features/automations/engine.ts`: the interpreter, each block, events and
  the schedule.
- `convex/features/automations/actions.ts`: Ask Jev, sending email, and Describe one.
- `convex/features/automations/describe.ts`: Describe one's questions, and the draft
  built from Jev's answers.
- `convex/features/automations/public.ts`: what the app calls.
- `convex/features/automations/counts.ts`: run and answer counts.
- `convex/features/automations/fire.ts`: the event hook.
- `src/features/workflows/`: the list, builder, canvas, settings and templates.
