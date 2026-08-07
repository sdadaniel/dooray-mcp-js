# dooray-mcp-js

Dooray MCP server implemented in Node.js. It follows the tool names and API behavior of `dooray-go/dooray-mcp`, but does not require Go or Homebrew.

## Requirements

- Node.js 18 or newer
- Dooray personal API token

## Official Documentation

- [Dooray API official documentation](https://helpdesk.dooray.com/share/pages/9wWo-xwiR66BO5LGshgVTg/2939987729788437786)

## Scope

This MCP server does not wrap every Dooray API. It focuses on frequently used account, calendar, project, post, attachment, and messenger APIs.

Most `/admin/v1` and `/admin/v2` administration APIs are intentionally not exposed by default, especially write-capable administration endpoints.

## Read-only mode

Dooray personal API tokens are not issued with separate read-only and write permissions. A token that can call write APIs may still have those permissions at the Dooray API level.

For safer installations, this server provides a read-only mode at the MCP tool layer. In read-only mode, write-capable tools are not exposed in `tools/list` and cannot be called through `tools/call`.

## Run

```bash
npx -y dooray-mcp-js --token "{personal-token}"
```

You can also use an environment variable:

```bash
DOORAY_TOKEN="{personal-token}" npx -y dooray-mcp-js
```

Run with only read-only tools exposed:

```bash
DOORAY_TOKEN="{personal-token}" npx -y dooray-mcp-js --mode read-only
```

## Codex

Register the package directly with Codex:

```bash
codex mcp add dooray-mcp-js --env DOORAY_TOKEN="$DOORAY_TOKEN" -- npx -y dooray-mcp-js
```

If the token is not already in `DOORAY_TOKEN`, pass it when registering:

```bash
codex mcp add dooray-mcp-js --env DOORAY_TOKEN="{personal-token}" -- npx -y dooray-mcp-js
```

The server reads `DOORAY_TOKEN` when Codex starts it, so the token does not need to be included in the command arguments.

### Codex read-only registration

Register a second MCP server with the same package and token, but expose only read-only tools:

```bash
codex mcp add dooray-mcp-js-read-only --env DOORAY_TOKEN="$DOORAY_TOKEN" -- npx -y dooray-mcp-js --mode read-only
```

You can also set the mode through an environment variable:

```bash
codex mcp add dooray-mcp-js-read-only --env DOORAY_TOKEN="$DOORAY_TOKEN" --env DOORAY_MCP_MODE=read-only -- npx -y dooray-mcp-js
```

## Claude Desktop

```json
{
  "mcpServers": {
    "dooray-mcp-js": {
      "command": "npx",
      "args": ["-y", "dooray-mcp-js"],
      "env": {
        "DOORAY_TOKEN": "{personal-token}"
      }
    }
  }
}
```

Read-only Claude Desktop configuration:

```json
{
  "mcpServers": {
    "dooray-mcp-js-read-only": {
      "command": "npx",
      "args": ["-y", "dooray-mcp-js", "--mode", "read-only"],
      "env": {
        "DOORAY_TOKEN": "{personal-token}"
      }
    }
  }
}
```

## Claude Code

```bash
claude mcp add dooray-mcp-js --env DOORAY_TOKEN="{personal-token}" -- npx -y dooray-mcp-js
```

Read-only registration:

```bash
claude mcp add dooray-mcp-js-read-only --env DOORAY_TOKEN="{personal-token}" -- npx -y dooray-mcp-js --mode read-only
```

## Project Structure

```text
dooray-mcp-js/
├── src/
│   └── index.js      # MCP server entry point
├── package.json
└── README.md
```

## Local development

When working from a cloned repository, run the local entry point directly:

```bash
DOORAY_TOKEN="{personal-token}" node ./src/index.js
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

### Read-only mode tools

When `--mode read-only` or `DOORAY_MCP_MODE=read-only` is set, write-capable Dooray tools are not exposed in `tools/list` and cannot be called through `tools/call`.

Exposed in read-only mode:

- `dooray_calendar_calendars`
- `dooray_calendar_events`
- `dooray_account_members`
- `dooray_account_member`
- `dooray_project`
- `dooray_posts`
- `dooray_post_logs`
- `dooray_post_log`
- `dooray_post_files`
- `dooray_post_file_download`
- `os`

Hidden in read-only mode:

- `dooray_messenger`
- `dooray_calendar_post_event`
- `dooray_post_log_create`
- `dooray_post_log_update`

## Options

- `--token`: Dooray personal API token. Defaults to `DOORAY_TOKEN`.
- `--endpoint`: Dooray API endpoint. Defaults to `https://api.dooray.com`.
- `--mode`: tool exposure mode. Use `full` or `read-only`. Defaults to `DOORAY_MCP_MODE` or `full`.
