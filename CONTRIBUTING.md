# Contributing

Bug reports and pull requests are welcome. For anything bigger than a small fix, open an issue first so you don't build something that won't get merged.

Security bugs go through [SECURITY.md](SECURITY.md), not an issue.

## Set up

[How to run](README.md#how-to-run) in the README covers the install and the first Convex login. You need your own Convex project. [docs/development.md](docs/development.md) covers the optional keys, and most features work without them.

## Make a change

Branch from `main`, then keep the change to one thing.

[Code rules](docs/development.md#code-rules) has the project's conventions, and `vp check` enforces some of them. A few are easy to miss:

- If you work in `convex/`, read `convex/_generated/ai/guidelines.md` first.
- Don't use `useEffect`, and avoid `useState`. Use form state, URL params, `useActionState` or refs.
- Lists people scroll through use `.paginate`, and deletes of many rows go through `startDelete`.
- Never commit `.env` files, even with only public values.

Some changes come with a doc to update:

- A new or changed flow goes in [docs/flows.md](docs/flows.md), or [docs/workflows.md](docs/workflows.md) for workflows.
- A change to the tables goes in [docs/database-design.md](docs/database-design.md).
- A change to what data the app stores or who it goes to goes on the [privacy page](src/routes/privacy.tsx), which has to stay true.
- New tools or folders go in the [README](README.md), which should stay short.

## Check it

Run these before you open a pull request:

```bash
vp check
vp run typecheck
vp test
```

New logic gets a test. Tests that run Convex functions are named `*.convex.test.ts`.

## Open a pull request

Titles and commits follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/), like `fix(mail): keep the thread open after a reply`. The scope is usually a feature folder.

Fill in the template. If people can see the change, add before and after screenshots. Say what you didn't test.

## License

This project is under the [Apache License 2.0](LICENSE). Anything you contribute is under the same license, as section 5 of the license says.

Taking part means following the [code of conduct](CODE_OF_CONDUCT.md).
