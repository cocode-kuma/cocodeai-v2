import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

/**
 * CocodeAI Capabilities Knowledge Plugin
 *
 * Injects knowledge about CocodeAI's capabilities into the agent's system
 * prompt so it can proactively help users with:
 * - Adding AI providers (including local models via Ollama)
 * - Fixing authorized folders
 * - Enabling computer use
 * - Using CocodeAI features
 * - Finding CocodeAI docs before falling back to code
 * - Voice mode, browser, skills, automations
 */

const COCODEAI_CAPABILITIES_KNOWLEDGE = `You are running inside CocodeAI, a desktop app for agentic work developed by Cocode Studio (酷码工作室).

IMPORTANT: Always respond in Chinese (Simplified) by default, unless the user explicitly writes in another language.

CRITICAL: To navigate or control the CocodeAI app (open settings, add providers, etc.), use the cocodeai_ui_execute_action tool, NOT browser tools. For example, to open settings: cocodeai_ui_execute_action({actionId:"settings.panel.open", args:{panel:"general"}}).

For CocodeAI product questions, use cocodeai_docs_search and cocodeai_docs_read as the first source of truth. CocodeAI documentation tools answer product questions. Never use them as a substitute for performing an action against ServiceNow, Slack, Notion, Linear, Google Workspace, a marketplace, or another connected service. Read and summarize relevant docs before answering. Cite the docs path when it helps the user verify or continue. If the docs are missing, ambiguous, or appear stale, inspect the implementation code as a last resort and say that you are inferring from code.

Important docs to know:
- General docs navigation: packages/docs/docs.json
- Connect services: packages/docs/start-here/connect-your-stack/connect-services.mdx
- Cross-chat memory: packages/docs/start-here/do-work-with-it/cross-chat-memory.mdx
- Workflows and session groups: packages/docs/start-here/do-work-with-it/workflows.mdx

Here is what you can help users with:

## Adding AI Providers
- **Cloud providers**: Go to Settings > AI Providers to add Anthropic, OpenAI, Google, OpenRouter, or other providers with an API key.
- **Local models (Ollama)**: Tell the user to:
  1. Install Ollama from https://ollama.com (or \`brew install ollama\` on macOS)
  2. Run \`ollama pull <model>\` in their terminal (e.g. \`ollama pull llama3\`)
  3. The model appears automatically in Settings > AI Providers
  4. Select it from the model picker in the session composer
- **Custom provider scripts**: Users can add custom OpenAI-compatible endpoints in Settings > AI Providers by adding a provider with a custom base URL.

## Fixing Authorized Folders
- Go to Settings > Permissions to manage which folders CocodeAI can access.
- When the agent gets a "permission denied" or "not authorized" error for a file path, the user needs to add that folder (or a parent folder) to the authorized folders list.
- The agent can navigate there: use the UI control action \`settings.panel.open\` with \`{panel: "permissions"}\`.

## Enabling Computer Use
- Go to Settings > Extensions and enable the "Computer Use" extension.
- This requires macOS accessibility permissions; the app will prompt for them.
- Once enabled, the agent can take screenshots and control the mouse/keyboard on the user's desktop.

## Connecting services with CocodeAI Connect
- For Gmail, Google Calendar, Google Drive, Slack, Notion, Linear, and other managed integrations, use CocodeAI Connect as the default setup path.
- Go to Settings > Connect to browse available integrations and connect your accounts.

## Voice Mode
- Available as a side panel in sessions when the CocodeAI Voice extension is enabled.
- Uses OpenAI Realtime for real-time voice interaction.
- The voice model can control the UI on the user's behalf (same actions the agent has access to).

## Browsing the Web
- The built-in browser lets the agent navigate, click, type, and screenshot web pages.
- For reliable browser automation, first open the page with \`cocodeai_browser_open_url\`, then use the returned \`browser_url\` and \`target_id\` with browser snapshot/click/fill/eval tools.
- The browser panel is visible on the right side of the session view.

## Cross-chat Session Memory
- Two sources of cross-chat memory: (1) the durable Memory Bank — a per-user store the user can explicitly save facts to and recall; and (2) saved CocodeAI session history.
- To save or recall a durable fact the user wants remembered across sessions, use the Memory Bank capability.
- If the user asks what they said, what happened, or what was decided in another CocodeAI session, use the UI control actions: list sessions, open the matching session, then read the transcript.
- Match sessions by ID, title, workspace, or topic words. Ask a short clarifying question if multiple sessions match.
- Answer only from the returned transcript. If the returned transcript is limited or missing older context, say that directly instead of guessing.

## Skills
- Specialized instruction packs for specific workflows.
- Manageable via Settings > Skills.
- Users can install skill templates or create custom skills in \`.opencode/skills/\`.

## Creating Plugins
- Plugins extend CocodeAI with custom tools.
- Create a file in \`.opencode/plugins/my-plugin.ts\` and add it to the \`plugin\` array in \`opencode.json\`.
- Plugins are async factory functions returning a hooks object with \`tool\` definitions.
- See the \`create-plugin\` skill for the full API reference.

When users ask "what can I do?" or "what can CocodeAI do?", summarize these capabilities. When they ask how to do something specific, read the relevant docs first with cocodeai_docs_search/cocodeai_docs_read, then give direct steps. If docs do not answer it, inspect code as a last resort and clearly label that as code-derived guidance.

CocodeAI is built and maintained by Cocode Studio (酷码工作室). For more information, visit https://cocodeai.com.`;

const docsSearchArgsSchema = z.object({
  query: z.string().min(1).describe("CocodeAI docs search query, for example 'connect slack mcp'."),
  limit: z.number().int().min(1).max(10).optional().describe("Maximum number of matching docs to return."),
});

const docsReadArgsSchema = z.object({
  path: z.string().min(1).describe("Docs-relative path returned by cocodeai_docs_search, for example start-here/connect-your-stack/connect-slack-mcp.mdx."),
});

type DocsEntry = {
  path: string;
  title: string | null;
  description: string | null;
  content: string;
};

let docsCache: Promise<DocsEntry[]> | null = null;

function docsCandidates(): string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  return [
    process.env.COCODEAI_DOCS_DIR?.trim() ?? "",
    join(here, "..", "cocodeai-docs"),
    join(here, "..", "..", "cocodeai-docs"),
    resolve(here, "..", "..", "..", "..", "packages", "docs"),
    resolve(here, "..", "..", "..", "..", "..", "packages", "docs"),
  ].filter(Boolean);
}

async function existingDocsDir(): Promise<string | null> {
  for (const candidate of docsCandidates()) {
    try {
      const info = await stat(candidate);
      if (info.isDirectory()) return candidate;
    } catch {
      // Try the next layout.
    }
  }
  return null;
}

async function docsFiles(root: string, dir = root): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "images" || entry.name === "logo") continue;
      const nested = await docsFiles(root, path);
      files.push(...nested);
    } else if (entry.isFile() && /\.(md|mdx|json)$/i.test(entry.name) && entry.name !== "openapi.json") {
      files.push(path);
    }
  }
  return files;
}

function frontmatterValue(content: string, key: string): string | null {
  const prefix = `${key}:`;
  const line = content.split("\n").find((entry) => entry.startsWith(prefix));
  const raw = line?.slice(prefix.length).trim();
  if (!raw) return null;
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1).trim();
  }
  return raw;
}

async function loadDocs(): Promise<DocsEntry[]> {
  if (docsCache) return docsCache;
  docsCache = (async () => {
    const root = await existingDocsDir();
    if (!root) return [];
    const files = await docsFiles(root);
    const entries = await Promise.all(files.map(async (file) => {
      const content = await readFile(file, "utf8");
      return {
        path: relative(root, file).replace(/\\/g, "/"),
        title: frontmatterValue(content, "title"),
        description: frontmatterValue(content, "description"),
        content,
      };
    }));
    return entries.sort((a, b) => a.path.localeCompare(b.path));
  })();
  return docsCache;
}

function scoreDoc(entry: DocsEntry, query: string): number {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const path = entry.path.toLowerCase();
  const title = entry.title?.toLowerCase() ?? "";
  const description = entry.description?.toLowerCase() ?? "";
  const content = entry.content.toLowerCase();
  return terms.reduce((score, term) => {
    if (path.includes(term)) score += 8;
    if (title.includes(term)) score += 6;
    if (description.includes(term)) score += 4;
    if (content.includes(term)) score += 1;
    return score;
  }, 0);
}

function excerpt(content: string, query: string): string {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const lower = content.toLowerCase();
  const index = terms.reduce((best, term) => {
    const next = lower.indexOf(term);
    return next >= 0 && (best < 0 || next < best) ? next : best;
  }, -1);
  const start = Math.max(0, index - 160);
  const from = index >= 0 ? start : 0;
  return content.slice(from, from + 500).replace(/\s+/g, " ").trim();
}

export const CocodeAICapabilitiesKnowledge = async () => ({
  "experimental.chat.system.transform": async (_input: unknown, output: { system: string[] }) => {
    output.system.push(COCODEAI_CAPABILITIES_KNOWLEDGE);
  },
  tool: {
    cocodeai_docs_search: {
      description: "Search the bundled CocodeAI documentation. Use this first for CocodeAI product questions before inspecting implementation code.",
      args: docsSearchArgsSchema.shape,
      async execute(rawArgs: unknown) {
        const args = docsSearchArgsSchema.parse(rawArgs);
        const docs = await loadDocs();
        const matches = docs
          .map((entry) => ({ entry, score: scoreDoc(entry, args.query) }))
          .filter((match) => match.score > 0)
          .sort((a, b) => b.score - a.score || a.entry.path.localeCompare(b.entry.path))
          .slice(0, args.limit ?? 5)
          .map((match) => ({
            path: match.entry.path,
            title: match.entry.title,
            description: match.entry.description,
            excerpt: excerpt(match.entry.content, args.query),
          }));
        return JSON.stringify({ ok: true, matches }, null, 2);
      },
    },
    cocodeai_docs_read: {
      description: "Read a bundled CocodeAI documentation page by docs-relative path returned from cocodeai_docs_search.",
      args: docsReadArgsSchema.shape,
      async execute(rawArgs: unknown) {
        const args = docsReadArgsSchema.parse(rawArgs);
        const normalized = args.path.replace(/^\/+/, "");
        if (normalized.split("/").includes("..")) throw new Error("Invalid docs path");
        const docs = await loadDocs();
        const entry = docs.find((doc) => doc.path === normalized);
        if (!entry) throw new Error(`CocodeAI docs page not found: ${normalized}`);
        return JSON.stringify(entry, null, 2);
      },
    },
  },
});
