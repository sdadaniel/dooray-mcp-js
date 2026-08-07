#!/usr/bin/env node

import process from "node:process";
import readline from "node:readline";
import { createWriteStream } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Transform, Readable } from "node:stream";
import { tmpdir } from "node:os";
import path from "node:path";

const SERVER_NAME = "dooray";
const SERVER_VERSION = "0.1.0";
const DEFAULT_ENDPOINT = "https://api.dooray.com";
const DEFAULT_MODE = "full";
const READ_ONLY_MODE = "read-only";
const WRITE_TOOL_NAMES = new Set([
  "dooray_messenger",
  "dooray_calendar_post_event",
  "dooray_post_log_create",
  "dooray_post_log_update"
]);

const args = parseArgs(process.argv.slice(2));
const token = args.token || process.env.DOORAY_TOKEN;
const endpoint = (args.endpoint || process.env.DOORAY_ENDPOINT || DEFAULT_ENDPOINT).replace(/\/+$/, "");

if (args.help) {
  printHelp();
  process.exit(0);
}

if (!token) {
  console.error("token must be set. Use --token <token> or DOORAY_TOKEN.");
  process.exit(1);
}

const mode = normalizeMode(args.mode || process.env.DOORAY_MCP_MODE || DEFAULT_MODE);
const requestTimeoutMs = parsePositiveInteger(process.env.DOORAY_REQUEST_TIMEOUT_MS, 30000);
const downloadDirectory = path.resolve(process.env.DOORAY_DOWNLOAD_DIR || path.join(tmpdir(), "dooray-mcp"));

const tools = [
  {
    name: "dooray_messenger",
    description: "send message to dooray messenger",
    inputSchema: objectSchema({
      operation: enumSchema(["send"], "The operation to perform"),
      to: stringSchema("recipient organizationMemberId"),
      message: stringSchema("message to send")
    }, ["operation", "to", "message"])
  },
  {
    name: "dooray_calendar_calendars",
    description: "find dooray calendars",
    inputSchema: objectSchema({
      operation: enumSchema(["find_calendars"], "The operation to perform")
    }, ["operation"])
  },
  {
    name: "dooray_calendar_events",
    description: "find dooray events of calendars",
    inputSchema: objectSchema({
      operation: enumSchema(["find_events"], "The operation to perform"),
      calendars: stringSchema("calendar ids separated by commas"),
      timeMin: stringSchema("inclusive start time in ISO 8601, e.g. 2025-04-11T00:00:00+09:00"),
      timeMax: stringSchema("exclusive end time in ISO 8601, e.g. 2025-04-12T00:00:00+09:00")
    }, ["operation", "timeMin", "timeMax"])
  },
  {
    name: "dooray_calendar_post_event",
    description: "register dooray events on a calendar",
    inputSchema: objectSchema({
      operation: enumSchema(["create_event"], "The operation to perform"),
      calendarId: stringSchema("calendar id to register an event"),
      subject: stringSchema("event subject"),
      content: stringSchema("event content"),
      startedAt: stringSchema("event start time in ISO 8601"),
      endedAt: stringSchema("event end time in ISO 8601"),
      wholeDayFlag: booleanSchema("set true for whole day event"),
      recurrenceFrequency: enumSchema(["", "daily", "weekly", "monthly", "yearly"], "recurrence frequency"),
      recurrenceInterval: numberSchema("recurrence interval, default is 1"),
      recurrenceUntil: stringSchema("recurrence end date in ISO 8601"),
      recurrenceByday: stringSchema("recurrence by day, e.g. MO,TU,WE"),
      recurrenceBymonth: stringSchema("recurrence by month, 1-12"),
      recurrenceBymonthday: stringSchema("recurrence by day of month, 1-31"),
      recurrenceTimezoneName: stringSchema("timezone for recurrence rule, default Asia/Seoul")
    }, ["operation", "subject", "content", "startedAt", "endedAt"])
  },
  {
    name: "dooray_account_members",
    description: "find dooray account members by name or userCode",
    inputSchema: objectSchema({
      operation: enumSchema(["find_member_id"], "The operation to perform"),
      member_name: stringSchema("member name"),
      user_code: stringSchema("user code")
    }, ["operation", "member_name"])
  },
  {
    name: "dooray_account_member",
    description: "find dooray account members by id",
    inputSchema: objectSchema({
      operation: enumSchema(["find_member_details"], "The operation to perform"),
      member_id: stringSchema("member id")
    }, ["operation", "member_id"])
  },
  {
    name: "dooray_project",
    description: "find Dooray projects or get a project by id",
    inputSchema: objectSchema({
      operation: enumSchema(["find_projects", "find_project"], "The operation to perform"),
      projectId: stringSchema("project id for find_project"),
      type: enumSchema(["public", "private"], "project type"),
      state: enumSchema(["active", "archived"], "project state"),
      scope: enumSchema(["private", "public"], "project scope")
    }, ["operation"])
  },
  {
    name: "dooray_posts",
    description: "find dooray posts in projects",
    inputSchema: objectSchema({
      operation: enumSchema(["find_posts"], "The operation to perform"),
      projectId: stringSchema("project id, or comma separated project ids"),
      page: numberSchema("page number, default is 0"),
      size: numberSchema("number of posts per page, default is 20, max is 100"),
      fromEmailAddress: stringSchema("filter posts by sender email address"),
      fromMemberIds: stringSchema("filter posts by creator member ids, comma separated"),
      toMemberIds: stringSchema("filter posts by assignee member ids, comma separated"),
      toMemberSize: numberSchema("filter by number of assignees"),
      ccMemberIds: stringSchema("filter posts by cc member ids, comma separated"),
      tagIds: stringSchema("filter posts by tag ids, comma separated"),
      parentPostId: stringSchema("filter sub-tasks of a parent post"),
      postNumber: stringSchema("filter by post number"),
      postWorkflowClasses: stringSchema("backlog, registered, working, closed"),
      postWorkflowIds: stringSchema("filter by workflow ids, comma separated"),
      milestoneIds: stringSchema("filter by milestone ids, comma separated"),
      subjects: stringSchema("filter by post subject keyword"),
      createdAt: stringSchema("date filter: today, thisweek, prev-{N}d, next-{N}d, or ISO8601~ISO8601"),
      updatedAt: stringSchema("date filter: today, thisweek, prev-{N}d, next-{N}d, or ISO8601~ISO8601"),
      dueAt: stringSchema("date filter: today, thisweek, prev-{N}d, next-{N}d, or ISO8601~ISO8601"),
      order: stringSchema("sort order: postDueAt, postUpdatedAt, createdAt, prefix '-' for descending")
    }, ["operation", "projectId"])
  },
  {
    name: "dooray_post_logs",
    description: "find comments and activity logs of a Dooray post",
    inputSchema: objectSchema({
      operation: enumSchema(["find_logs"], "The operation to perform"),
      projectId: stringSchema("project id"),
      postId: stringSchema("post id"),
      page: numberSchema("page number, default is 0"),
      size: numberSchema("number of logs per page, default is 20"),
      order: enumSchema(["createdAt", "-createdAt"], "log sort order")
    }, ["operation", "projectId", "postId"])
  },
  {
    name: "dooray_post_log",
    description: "find a specific comment or activity log of a Dooray post",
    inputSchema: objectSchema({
      operation: enumSchema(["find_log"], "The operation to perform"),
      projectId: stringSchema("project id"),
      postId: stringSchema("post id"),
      logId: stringSchema("log id, or comment id")
    }, ["operation", "projectId", "postId", "logId"])
  },
  {
    name: "dooray_post_log_create",
    description: "add a comment to a Dooray post",
    inputSchema: objectSchema({
      operation: enumSchema(["create_log"], "The operation to perform"),
      projectId: stringSchema("project id"),
      postId: stringSchema("post id"),
      body: objectSchema({
        mimeType: enumSchema(["text/x-markdown"], "comment body MIME type"),
        content: stringSchema("comment content")
      }, ["mimeType", "content"])
    }, ["operation", "projectId", "postId", "body"])
  },
  {
    name: "dooray_post_log_update",
    description: "update a comment or activity log of a Dooray post",
    inputSchema: objectSchema({
      operation: enumSchema(["update_log"], "The operation to perform"),
      projectId: stringSchema("project id"),
      postId: stringSchema("post id"),
      logId: stringSchema("log id, or comment id"),
      body: objectSchema({
        mimeType: enumSchema(["text/x-markdown"], "comment body MIME type"),
        content: stringSchema("updated comment content")
      }, ["mimeType", "content"])
    }, ["operation", "projectId", "postId", "logId", "body"])
  },
  {
    name: "dooray_post_files",
    description: "find attachments of a Dooray post",
    inputSchema: objectSchema({
      operation: enumSchema(["find_files"], "The operation to perform"),
      projectId: stringSchema("project id"),
      postId: stringSchema("post id")
    }, ["operation", "projectId", "postId"])
  },
  {
    name: "dooray_post_file_download",
    description: "download raw content of a Dooray post attachment through authenticated redirects to a local temporary directory",
    inputSchema: objectSchema({
      operation: enumSchema(["download"], "The operation to perform"),
      projectId: stringSchema("project id"),
      postId: stringSchema("post id"),
      fileId: stringSchema("file id"),
      fileName: stringSchema("optional file name used when the response does not provide one")
    }, ["operation", "projectId", "postId", "fileId"])
  },
  {
    name: "os",
    description: "get os time date",
    inputSchema: objectSchema({
      operation: enumSchema(["get_date_time"], "The operation to get date time")
    }, ["operation"])
  }
];

const visibleTools = mode === READ_ONLY_MODE ? tools.filter((tool) => !WRITE_TOOL_NAMES.has(tool.name)) : tools;
const visibleToolNames = new Set(visibleTools.map((tool) => tool.name));
const toolHandlersByName = new Map();

const toolHandlers = {
  async dooray_messenger(input) {
    requireOperation(input, "send");
    return doorayRequest("POST", "/messenger/v1/channels/direct-send", {
      body: {
        text: requireString(input, "message"),
        organizationMemberId: requireString(input, "to")
      }
    });
  },

  async dooray_calendar_calendars(input) {
    requireOperation(input, "find_calendars");
    return doorayRequest("GET", "/calendar/v1/calendars");
  },

  async dooray_calendar_events(input) {
    requireOperation(input, "find_events");
    return doorayRequest("GET", "/calendar/v1/calendars/*/events", {
      query: {
        calendars: input.calendars,
        timeMin: requireString(input, "timeMin"),
        timeMax: requireString(input, "timeMax")
      }
    });
  },

  async dooray_calendar_post_event(input) {
    requireOperation(input, "create_event");
    const recurrenceRule = buildRecurrenceRule(input);
    const calendarId = input.calendarId || "*";

    return doorayRequest("POST", `/calendar/v1/calendars/${encodeURIComponent(calendarId)}/events`, {
      body: {
        users: {},
        subject: requireString(input, "subject"),
        body: {
          mimeType: "text/html",
          content: requireString(input, "content")
        },
        startedAt: requireString(input, "startedAt"),
        endedAt: requireString(input, "endedAt"),
        wholeDayFlag: Boolean(input.wholeDayFlag),
        location: "",
        ...(recurrenceRule ? { recurrenceRule } : {})
      }
    });
  },

  async dooray_account_members(input) {
    requireOperation(input, "find_member_id");
    return doorayRequest("GET", "/common/v1/members", {
      query: {
        name: requireString(input, "member_name"),
        userCode: input.user_code
      }
    });
  },

  async dooray_account_member(input) {
    requireOperation(input, "find_member_details");
    return doorayRequest("GET", `/common/v1/members/${encodeURIComponent(requireString(input, "member_id"))}`);
  },

  async dooray_project(input) {
    if (input.operation === "find_project") {
      return doorayRequest("GET", `/project/v1/projects/${encodeURIComponent(requireString(input, "projectId"))}`);
    }

    requireOperation(input, "find_projects");
    return doorayRequest("GET", "/project/v1/projects", {
      query: {
        member: "me",
        size: "100",
        type: requireString(input, "type"),
        scope: requireString(input, "scope"),
        state: requireString(input, "state")
      }
    });
  },

  async dooray_posts(input) {
    requireOperation(input, "find_posts");
    const query = pick(input, [
      "page",
      "size",
      "fromEmailAddress",
      "fromMemberIds",
      "toMemberIds",
      "toMemberSize",
      "ccMemberIds",
      "tagIds",
      "parentPostId",
      "postNumber",
      "postWorkflowClasses",
      "postWorkflowIds",
      "milestoneIds",
      "subjects",
      "createdAt",
      "updatedAt",
      "dueAt",
      "order"
    ]);

    return doorayRequest("GET", `/project/v1/projects/${encodeURIComponent(requireString(input, "projectId"))}/posts`, {
      query
    });
  },

  async dooray_post_logs(input) {
    requireOperation(input, "find_logs");
    const projectId = encodeURIComponent(requireString(input, "projectId"));
    const postId = encodeURIComponent(requireString(input, "postId"));
    const query = pick(input, ["page", "size", "order"]);

    return doorayRequest("GET", `/project/v1/projects/${projectId}/posts/${postId}/logs`, {
      query
    });
  },

  async dooray_post_log(input) {
    requireOperation(input, "find_log");
    const projectId = encodeURIComponent(requireString(input, "projectId"));
    const postId = encodeURIComponent(requireString(input, "postId"));
    const logId = encodeURIComponent(requireString(input, "logId"));

    return doorayRequest("GET", `/project/v1/projects/${projectId}/posts/${postId}/logs/${logId}`);
  },

  async dooray_post_log_create(input) {
    requireOperation(input, "create_log");
    const projectId = encodeURIComponent(requireString(input, "projectId"));
    const postId = encodeURIComponent(requireString(input, "postId"));
    const body = input.body;

    if (!body || typeof body !== "object") {
      throw new Error("body must be an object with mimeType and content");
    }

    return doorayRequest("POST", `/project/v1/projects/${projectId}/posts/${postId}/logs`, {
      body: {
        body: {
          mimeType: requireString(body, "mimeType"),
          content: requireString(body, "content")
        }
      }
    });
  },

  async dooray_post_log_update(input) {
    requireOperation(input, "update_log");
    const projectId = encodeURIComponent(requireString(input, "projectId"));
    const postId = encodeURIComponent(requireString(input, "postId"));
    const logId = encodeURIComponent(requireString(input, "logId"));
    const body = input.body;

    if (!body || typeof body !== "object") {
      throw new Error("body must be an object with mimeType and content");
    }

    return doorayRequest("PUT", `/project/v1/projects/${projectId}/posts/${postId}/logs/${logId}`, {
      body: {
        body: {
          mimeType: requireString(body, "mimeType"),
          content: requireString(body, "content")
        }
      }
    });
  },

  async dooray_post_files(input) {
    requireOperation(input, "find_files");
    const projectId = encodeURIComponent(requireString(input, "projectId"));
    const postId = encodeURIComponent(requireString(input, "postId"));
    return doorayRequest("GET", `/project/v1/projects/${projectId}/posts/${postId}/files`);
  },

  async dooray_post_file_download(input) {
    requireOperation(input, "download");
    const projectId = encodeURIComponent(requireString(input, "projectId"));
    const postId = encodeURIComponent(requireString(input, "postId"));
    const fileId = encodeURIComponent(requireString(input, "fileId"));
    return doorayDownload(`/project/v1/projects/${projectId}/posts/${postId}/files/${fileId}?media=raw`, input.fileName, fileId);
  },

  async os(input) {
    requireOperation(input, "get_date_time");
    return JSON.stringify({ time: formatLocalDateTime(new Date()) });
  }
};

for (const [name, handler] of Object.entries(toolHandlers)) {
  if (visibleToolNames.has(name)) {
    toolHandlersByName.set(name, handler);
  }
}

async function doorayRequest(method, path, options = {}) {
  const url = new URL(endpoint + path);
  for (const [key, value] of Object.entries(options.query || {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetchWithTimeout(url, {
    method,
    headers: {
      Authorization: `dooray-api ${token}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json;charset=utf-8" } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Dooray API ${response.status} ${response.statusText}: ${text}`);
  }

  return text || "{}";
}

async function doorayDownload(requestPath, requestedFileName, fallbackFileName) {
  const headers = {
    Authorization: `dooray-api ${token}`,
    Accept: "application/octet-stream"
  };
  let response = await fetchWithTimeout(endpoint + requestPath, { headers, redirect: "manual" });

  for (let redirectCount = 0; redirectCount < 3 && [301, 302, 307, 308].includes(response.status); redirectCount += 1) {
    const location = response.headers.get("location");
    if (!location) {
      throw new Error("Dooray download redirect did not provide a Location header.");
    }
    response = await fetchWithTimeout(new URL(location, response.url), { headers, redirect: "manual" });
  }

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(`Dooray API ${response.status} ${response.statusText}: ${responseText}`);
  }

  await mkdir(downloadDirectory, { recursive: true });

  const responseFileName = getContentDispositionFileName(response.headers.get("content-disposition"));
  const fileName = sanitizeFileName(responseFileName || requestedFileName || fallbackFileName);
  const filePath = path.join(downloadDirectory, fileName);
  let size = 0;
  const counter = new Transform({
    transform(chunk, encoding, callback) {
      size += chunk.length;
      callback(null, chunk);
    }
  });

  try {
    if (!response.body) {
      throw new Error("Dooray download response did not contain a body.");
    }
    await pipeline(Readable.fromWeb(response.body), counter, createWriteStream(filePath));
  } catch (error) {
    await unlink(filePath, { force: true });
    throw error;
  }

  return JSON.stringify({
    filePath,
    fileName,
    mimeType: response.headers.get("content-type") || "application/octet-stream",
    size,
    temporary: true
  });
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Dooray request timed out after ${requestTimeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function getContentDispositionFileName(contentDisposition) {
  if (!contentDisposition) {
    return "";
  }

  const encodedMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (encodedMatch) {
    return decodeURIComponent(encodedMatch[1]);
  }

  const plainMatch = contentDisposition.match(/filename=(?:"([^"]+)"|([^;\s]+))/i);
  return plainMatch ? (plainMatch[1] || plainMatch[2]) : "";
}

function sanitizeFileName(fileName) {
  const baseName = path.basename(fileName).replace(/[\\/:*?"<>|\u0000-\u001F]/g, "_");
  return baseName || "dooray-attachment";
}

function buildRecurrenceRule(input) {
  if (!input.recurrenceFrequency) {
    return null;
  }

  return {
    frequency: input.recurrenceFrequency,
    interval: Number(input.recurrenceInterval || 1),
    until: input.recurrenceUntil || "",
    byday: input.recurrenceByday || "",
    bymonth: input.recurrenceBymonth || "",
    bymonthday: input.recurrenceBymonthday || "",
    timezoneName: input.recurrenceTimezoneName || "Asia/Seoul"
  };
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    } else if (arg === "--token") {
      parsed.token = argv[++index];
    } else if (arg.startsWith("--token=")) {
      parsed.token = arg.slice("--token=".length);
    } else if (arg === "--endpoint") {
      parsed.endpoint = argv[++index];
    } else if (arg.startsWith("--endpoint=")) {
      parsed.endpoint = arg.slice("--endpoint=".length);
    } else if (arg === "--mode") {
      parsed.mode = argv[++index];
    } else if (arg.startsWith("--mode=")) {
      parsed.mode = arg.slice("--mode=".length);
    }
  }
  return parsed;
}

function normalizeMode(value) {
  if (value === DEFAULT_MODE || value === READ_ONLY_MODE) {
    return value;
  }

  throw new Error(`DOORAY_MCP_MODE or --mode must be one of: ${DEFAULT_MODE}, ${READ_ONLY_MODE}`);
}

function parsePositiveInteger(value, fallback) {
  if (value === undefined || value === "") {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("DOORAY_REQUEST_TIMEOUT_MS must be a positive integer");
  }
  return parsed;
}

function printHelp() {
  console.log(`Usage: dooray-mcp --token <dooray-token> [--endpoint ${DEFAULT_ENDPOINT}] [--mode ${DEFAULT_MODE}|${READ_ONLY_MODE}]

Environment:
  DOORAY_TOKEN       Dooray personal API token
  DOORAY_ENDPOINT    Dooray API endpoint, default ${DEFAULT_ENDPOINT}
  DOORAY_MCP_MODE    tool exposure mode: ${DEFAULT_MODE} or ${READ_ONLY_MODE}, default ${DEFAULT_MODE}
  DOORAY_REQUEST_TIMEOUT_MS  request timeout, default 30000
  DOORAY_DOWNLOAD_DIR        attachment directory, default system temp directory
`);
}

function objectSchema(properties, required = []) {
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false
  };
}

function stringSchema(description) {
  return { type: "string", description };
}

function numberSchema(description) {
  return { type: "number", description };
}

function booleanSchema(description) {
  return { type: "boolean", description };
}

function enumSchema(values, description) {
  return { type: "string", enum: values, description };
}

function requireOperation(input, expected) {
  if (input.operation !== expected) {
    throw new Error(`operation must be ${expected}`);
  }
}

function requireString(input, key) {
  const value = input[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${key} must be a non-empty string`);
  }
  return value;
}

function pick(input, keys) {
  const result = {};
  for (const key of keys) {
    if (input[key] !== undefined && input[key] !== null && input[key] !== "") {
      result[key] = input[key];
    }
  }
  return result;
}

function formatLocalDateTime(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    "-",
    pad(date.getMonth() + 1),
    "-",
    pad(date.getDate()),
    " ",
    pad(date.getHours()),
    ":",
    pad(date.getMinutes()),
    ":",
    pad(date.getSeconds())
  ].join("");
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function success(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function failure(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

async function handleRequest(message) {
  if (!message || message.jsonrpc !== "2.0") {
    return;
  }

  const { id, method, params } = message;
  const isNotification = id === undefined || id === null;

  try {
    if (method === "initialize") {
      success(id, {
        protocolVersion: params?.protocolVersion || "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION }
      });
      return;
    }

    if (method === "notifications/initialized") {
      return;
    }

    if (method === "ping") {
      if (!isNotification) success(id, {});
      return;
    }

    if (method === "tools/list") {
      success(id, { tools: visibleTools });
      return;
    }

    if (method === "tools/call") {
      const name = params?.name;
      const input = params?.arguments || {};
      if (!visibleToolNames.has(name)) {
        throw new Error(`tool is not available: ${name}`);
      }
      const handler = toolHandlersByName.get(name);
      if (!handler) {
        throw new Error(`unknown tool: ${name}`);
      }

      const text = await handler(input);
      success(id, { content: [{ type: "text", text }] });
      return;
    }

    if (method === "resources/list") {
      success(id, { resources: [] });
      return;
    }

    if (method === "prompts/list") {
      success(id, { prompts: [] });
      return;
    }

    if (!isNotification) {
      failure(id, -32601, `method not found: ${method}`);
    }
  } catch (error) {
    if (!isNotification) {
      failure(id, -32000, error instanceof Error ? error.message : String(error));
    }
  }
}

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity
});

rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let message;
  try {
    message = JSON.parse(trimmed);
  } catch (error) {
    failure(null, -32700, `parse error: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  void handleRequest(message);
});
