# Testing

Four checks cover the repository.

| Command | Covers |
| --- | --- |
| `npm test` | Every `*.test.mjs` file: the hooks in `hooks/teach/` and `hooks/vault/`, the scripts in `scripts/`, and the mod's layout code in `hooks/mod/`. |
| `claude plugin validate . --strict` | The marketplace manifest, `.claude-plugin/marketplace.json`. |
| `claude plugin validate .claude-plugin/plugin.json --strict` | The plugin manifest, the skills' frontmatter and `hooks/hooks.json`. |
| `claude plugin test .` | The map pane, the line above the prompt and the toasts, in `hooks/mod/map-ui.test.ts`. |

## Why `npm test` does not run the mod UI test

`npm test` runs `node --test "**/*.test.mjs"`. `hooks/mod/map-ui.test.ts` imports the `claude-code` package, which Node cannot resolve. Node alone fails on it with `Cannot find package 'claude-code'`.

## Tests that skip

- `scripts/render-mermaid.test.mjs` skips when `node_modules/.bin/mmdc` is missing. `npm install` installs it.
- `scripts/render-svg.test.mjs` skips when neither `rsvg-convert` nor `magick` is installed. CI installs `librsvg2-bin` for `rsvg-convert`.

A skipped test is not a pass. Install the tool if your change touches rendering.

## Writing a test

- Name the file `<module>.test.mjs` and put it next to the module.
- Tests write only to temporary folders. Those that write ledgers or vault notes also set `CLAUDE_CONFIG_DIR` to one, so a test never touches your own Claude Code data. The existing tests in `hooks/teach/`, `hooks/vault/` and `scripts/` show the pattern.
