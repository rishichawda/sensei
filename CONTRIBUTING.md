# Contributing to sensei

sensei is a Claude Code plugin. Skills and agents are markdown files; hooks and scripts are Node and shell. Fixes and ideas are welcome. Please read the [code of conduct](CODE_OF_CONDUCT.md) first.

## Set up

You need Node 22 (the version CI runs) and the `claude` CLI.

```bash
npm install
npm test
claude plugin validate . --strict
claude plugin validate .claude-plugin/plugin.json --strict
claude plugin test .
```

All four checks must pass. [dev-docs/testing.md](dev-docs/testing.md) says what each one covers and which tests skip without optional tools.

To try your change in Claude Code, run this from the repository root, then start a new session:

```bash
claude plugin marketplace add ./
claude plugin install sensei@rishichawda
```

## Where things live

| Path | Holds |
| --- | --- |
| `.claude-plugin/` | The plugin and marketplace manifests. |
| `skills/<name>/SKILL.md` | A skill: frontmatter `name` and `description`, then the instructions. |
| `agents/<name>.md` | A subagent a skill dispatches. |
| `hooks/<area>/` | Hook scripts and their tests. `hooks/hooks.json` wires them. `hooks/mod/` draws the map pane and the line above the prompt. |
| `scripts/` | The ledger, vault, render and publish scripts the skills call through `Bash`. |
| `evals/` | Prompt cases that check when a skill triggers. |

## Add a skill or agent

1. Create `skills/<name>/SKILL.md` or `agents/<name>.md`.
2. Write the `description` as the trigger: what the user says or needs when it applies, and when it does not.
3. Run `claude plugin validate .claude-plugin/plugin.json --strict`. It checks the skills.
4. Add a line for it to the README.

## Open a pull request

- Keep one change per pull request.
- A change to a hook or script needs a test in the same pull request, in a `<module>.test.mjs` file next to the module.
- Run the four checks above before you push.
