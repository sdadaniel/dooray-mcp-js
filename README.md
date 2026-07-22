# dooray-mcp-js

Dooray MCP server implemented in Node.js. It follows the tool names and API behavior of `dooray-go/dooray-mcp`, but does not require Go or Homebrew.

## Requirements

- Node.js 18 or newer
- Dooray personal API token

## Official Documentation

- [Dooray API 공식 문서](https://helpdesk.dooray.com/share/pages/9wWo-xwiR66BO5LGshgVTg/2939987729788437786)

## Run

```bash
node ./src/index.js --token "{personal-token}"
```

You can also use an environment variable:

```bash
DOORAY_TOKEN="{personal-token}" node ./src/index.js
```

The default profile is `write` (조회 + 생성/수정). Use the separate `dooray-mcp-js-read` package for 조회 전용 access, or select a profile explicitly with `--profile` or `DOORAY_MCP_PROFILE`.

## Codex

Publish the package once from an npm-authenticated environment:

```bash
npm publish
cd packages/dooray-mcp-js-read
npm publish
```

Then register the normal package directly with Codex:

```bash
codex mcp add dooray --env DOORAY_TOKEN="$DOORAY_TOKEN" -- npx -y dooray-mcp-js
```

For a read-only MCP, use the separate read-only package:

```bash
codex mcp add dooray-read --env DOORAY_TOKEN="$DOORAY_TOKEN" -- npx -y dooray-mcp-js-read
```

`dooray-mcp-js-read`는 `dooray-mcp-js`를 내부적으로 실행하되 `read` 프로필을 강제합니다.

The main package also supports explicit profiles for compatibility:

```bash
npx -y dooray-mcp-js --profile read
npx -y dooray-mcp-js --profile write
npx -y dooray-mcp-js --profile admin
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
├── packages/
│   └── dooray-mcp-js-read/  # read-only package wrapper
├── package.json
└── README.md
```

## Tools

The `dooray-mcp-js-read` package exposes only 조회 tools. The normal `dooray-mcp-js` package defaults to the `write` profile and exposes all currently implemented non-admin tools. The current server has no delete tool yet.

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
- `--profile`: Permission profile: `read`, `write`, or `admin`. Defaults to `read`.
- `DOORAY_MCP_PROFILE`: Environment-variable equivalent of `--profile`.
