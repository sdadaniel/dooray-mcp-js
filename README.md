# dooray-mcp-js

Dooray MCP server implemented in Node.js. It follows the tool names and API behavior of `dooray-go/dooray-mcp`, but does not require Go or Homebrew.

## Requirements

- Node.js 18 or newer
- Dooray personal API token

## Official Documentation

- [Dooray API official documentation](https://helpdesk.dooray.com/share/pages/9wWo-xwiR66BO5LGshgVTg/2939987729788437786)

## Run

```bash
node ./src/index.js --token "{personal-token}"
```

You can also use an environment variable:

```bash
DOORAY_TOKEN="{personal-token}" node ./src/index.js
```

## Codex

Register the package directly with Codex:

```bash
codex mcp add dooray --env DOORAY_TOKEN="$DOORAY_TOKEN" -- npx -y dooray-mcp-js
```

If the token is not already in `DOORAY_TOKEN`, pass it when registering:

```bash
codex mcp add dooray --env DOORAY_TOKEN="{personal-token}" -- npx -y dooray-mcp-js
```

The server reads `DOORAY_TOKEN` when Codex starts it, so the token does not need to be included in the command arguments.

## Claude Desktop

```json
{
  "mcpServers": {
    "dooray": {
      "command": "npx",
      "args": ["-y", "dooray-mcp-js"],
      "env": {
        "DOORAY_TOKEN": "{personal-token}"
      }
    }
  }
}
```

## Claude Code

```bash
claude mcp add dooray --env DOORAY_TOKEN="{personal-token}" -- npx -y dooray-mcp-js
```

## Project Structure

```text
dooray-mcp-js/
├── src/
│   └── index.js      # MCP server entry point
├── package.json
└── README.md
```

## Tools

The `dooray-mcp-js` package exposes all currently implemented tools. The current server has no delete tool yet.

- `dooray_messenger`
- `dooray_calendar_calendars`
- `dooray_calendar_events`
- `dooray_calendar_post_event`
- `dooray_account_members`
- `dooray_account_member`
- `dooray_project`
- `dooray_posts`
- `dooray_post_logs` (find comments and activity logs for a post)
- `dooray_post_log` (find one comment or activity log by ID)
- `dooray_post_log_create` (add a comment to a post; body is `{ "mimeType": "text/x-markdown", "content": "..." }`)
- `dooray_post_log_update` (update a comment or activity log with the same body format)
- `dooray_post_files`
- `dooray_post_file_download` (downloads project attachment content with `media=raw`, follows authenticated redirects, and streams it to the system temporary directory)
- `os`

## Options

- `--token`: Dooray personal API token. Defaults to `DOORAY_TOKEN`.
- `--endpoint`: Dooray API endpoint. Defaults to `https://api.dooray.com`.
