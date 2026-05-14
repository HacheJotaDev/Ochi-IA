// ─── Tool Definitions & Registry ──────────────────────────────────

import { ToolDefinition, ToolResult, SandboxSession } from "./types";

// ─── Execute Code Tool ───────────────────────────────────────────

const executeCodeTool: ToolDefinition = {
  name: "execute_code",
  description: "Execute code in a sandboxed environment. Supports Python, JavaScript, TypeScript, R, Java, and Bash. Returns stdout, stderr, errors, and any generated charts/images.",
  parameters: {
    language: {
      type: "string",
      description: "Programming language: python, javascript, typescript, r, java, bash",
      required: true,
    },
    code: {
      type: "string",
      description: "The code to execute",
      required: true,
    },
  },
  execute: async (params, _sandbox) => {
    const { language, code } = params;
    if (!language || !code) {
      return { success: false, output: "", error: "language and code are required" };
    }
    try {
      const { Sandbox } = await import("@e2b/code-interpreter");
      const sandbox = await Sandbox.create({ timeoutMs: 60_000 });
      try {
        const execution = await sandbox.runCode(code, {
          language: language as any,
          timeoutMs: 60_000,
        });
        const stdout = execution.logs?.stdout?.join("\n") || "";
        const stderr = execution.logs?.stderr?.join("\n") || "";
        const text = execution.text || "";
        const artifacts: ToolResult["artifacts"] = [];
        if (execution.results?.length) {
          for (const r of execution.results) {
            artifacts.push({
              type: r.type || "text",
              text: r.text || "",
              png: r.png || undefined,
              svg: r.svg || undefined,
            });
          }
        }
        let output = "";
        if (text) output += text;
        if (stdout) output += (output ? "\n" : "") + stdout;
        if (stderr && !execution.error) output += (output ? "\n" : "") + "[stderr] " + stderr;
        const error = execution.error
          ? typeof execution.error === "string" ? execution.error : JSON.stringify(execution.error)
          : stderr && !stdout && !text ? stderr : undefined;
        return {
          success: !execution.error,
          output: output || "(no output)",
          error: error || undefined,
          artifacts: artifacts.length > 0 ? artifacts : undefined,
        };
      } finally {
        try { await sandbox.close(); } catch {}
      }
    } catch (e: any) {
      return { success: false, output: "", error: `Sandbox error: ${e.message}` };
    }
  },
};

// ─── Write File Tool ─────────────────────────────────────────────

const writeFileTool: ToolDefinition = {
  name: "write_file",
  description: "Create or overwrite a file with the given content in the sandbox. The file persists for the duration of the agent session.",
  parameters: {
    path: {
      type: "string",
      description: "File path (e.g. 'script.py', 'src/index.js')",
      required: true,
    },
    content: {
      type: "string",
      description: "The content to write to the file",
      required: true,
    },
  },
  execute: async (params, _sandbox) => {
    const { path: filePath, content } = params;
    if (!filePath || content === undefined) {
      return { success: false, output: "", error: "path and content are required" };
    }
    try {
      const { Sandbox } = await import("e2b");
      const sandbox = await Sandbox.create({ timeoutMs: 30_000 });
      try {
        // Create directory structure if needed
        const dir = filePath.includes("/") ? filePath.substring(0, filePath.lastIndexOf("/")) : "";
        if (dir) {
          await sandbox.commands.run(`mkdir -p /home/user/${dir}`);
        }
        // Write the file using heredoc to handle special characters
        const escapedContent = content.replace(/'/g, "'\\''");
        const cmd = `cat > /home/user/${filePath} << 'HACHE_EOF'\n${content}\nHACHE_EOF`;
        const result = await sandbox.commands.run(cmd);
        // Verify
        const verify = await sandbox.commands.run(`cat /home/user/${filePath} | head -5`);
        return {
          success: true,
          output: `File written to /home/user/${filePath}\nPreview:\n${verify.stdout}`,
        };
      } finally {
        try { await sandbox.close(); } catch {}
      }
    } catch (e: any) {
      return { success: false, output: "", error: `Write file error: ${e.message}` };
    }
  },
};

// ─── Read File Tool ──────────────────────────────────────────────

const readFileTool: ToolDefinition = {
  name: "read_file",
  description: "Read the contents of a file from the sandbox. Returns the full file content.",
  parameters: {
    path: {
      type: "string",
      description: "File path to read (e.g. 'script.py', 'src/index.js')",
      required: true,
    },
  },
  execute: async (params, _sandbox) => {
    const { path: filePath } = params;
    if (!filePath) {
      return { success: false, output: "", error: "path is required" };
    }
    try {
      const { Sandbox } = await import("e2b");
      const sandbox = await Sandbox.create({ timeoutMs: 30_000 });
      try {
        const result = await sandbox.commands.run(`cat /home/user/${filePath} 2>&1`);
        if (result.exitCode !== 0) {
          return { success: false, output: "", error: `File not found: ${filePath}` };
        }
        return {
          success: true,
          output: result.stdout,
        };
      } finally {
        try { await sandbox.close(); } catch {}
      }
    } catch (e: any) {
      return { success: false, output: "", error: `Read file error: ${e.message}` };
    }
  },
};

// ─── Edit File Tool ──────────────────────────────────────────────

const editFileTool: ToolDefinition = {
  name: "edit_file",
  description: "Edit a file by replacing a specific string with a new string. Use this for making targeted changes to existing files.",
  parameters: {
    path: {
      type: "string",
      description: "File path to edit",
      required: true,
    },
    old_string: {
      type: "string",
      description: "The exact string to find and replace",
      required: true,
    },
    new_string: {
      type: "string",
      description: "The replacement string",
      required: true,
    },
  },
  execute: async (params, _sandbox) => {
    const { path: filePath, old_string, new_string } = params;
    if (!filePath || old_string === undefined || new_string === undefined) {
      return { success: false, output: "", error: "path, old_string, and new_string are required" };
    }
    try {
      const { Sandbox } = await import("e2b");
      const sandbox = await Sandbox.create({ timeoutMs: 30_000 });
      try {
        // Check file exists
        const check = await sandbox.commands.run(`test -f /home/user/${filePath} && echo "exists" || echo "not_found"`);
        if (check.stdout.trim() !== "exists") {
          return { success: false, output: "", error: `File not found: ${filePath}` };
        }
        // Use Python for reliable string replacement
        const pythonCode = `
import sys
path = "/home/user/${filePath}"
with open(path, 'r') as f:
    content = f.read()
old = ${JSON.stringify(old_string)}
new = ${JSON.stringify(new_string)}
if old not in content:
    print("ERROR: old_string not found in file")
    sys.exit(1)
count = content.count(old)
content = content.replace(old, new)
with open(path, 'w') as f:
    f.write(content)
print(f"Replaced {count} occurrence(s)")
`;
        const result = await sandbox.commands.run(`python3 -c ${JSON.stringify(pythonCode)}`);
        if (result.exitCode !== 0 || result.stdout.includes("ERROR")) {
          return { success: false, output: "", error: result.stderr || result.stdout };
        }
        return {
          success: true,
          output: `Edited /home/user/${filePath}: ${result.stdout.trim()}`,
        };
      } finally {
        try { await sandbox.close(); } catch {}
      }
    } catch (e: any) {
      return { success: false, output: "", error: `Edit file error: ${e.message}` };
    }
  },
};

// ─── Run Command Tool ────────────────────────────────────────────

const runCommandTool: ToolDefinition = {
  name: "run_command",
  description: "Execute a bash command in the sandbox. Use for installing packages, running scripts, listing files, etc.",
  parameters: {
    command: {
      type: "string",
      description: "The bash command to execute",
      required: true,
    },
  },
  execute: async (params, _sandbox) => {
    const { command } = params;
    if (!command) {
      return { success: false, output: "", error: "command is required" };
    }
    try {
      const { Sandbox } = await import("e2b");
      const sandbox = await Sandbox.create({ timeoutMs: 60_000 });
      try {
        const result = await sandbox.commands.run(command, { timeoutMs: 60_000 });
        let output = "";
        if (result.stdout) output += result.stdout;
        if (result.stderr) output += (output ? "\n" : "") + "[stderr] " + result.stderr;
        return {
          success: result.exitCode === 0,
          output: output || `(exit code: ${result.exitCode})`,
          error: result.exitCode !== 0 ? `Exit code: ${result.exitCode}` : undefined,
        };
      } finally {
        try { await sandbox.close(); } catch {}
      }
    } catch (e: any) {
      return { success: false, output: "", error: `Command error: ${e.message}` };
    }
  },
};

// ─── List Files Tool ─────────────────────────────────────────────

const listFilesTool: ToolDefinition = {
  name: "list_files",
  description: "List files and directories in the sandbox. Useful for exploring the workspace.",
  parameters: {
    path: {
      type: "string",
      description: "Directory path to list (default: /home/user)",
      required: false,
    },
  },
  execute: async (params, _sandbox) => {
    const dirPath = params.path || "/home/user";
    try {
      const { Sandbox } = await import("e2b");
      const sandbox = await Sandbox.create({ timeoutMs: 30_000 });
      try {
        const result = await sandbox.commands.run(`ls -la ${dirPath}`);
        return {
          success: result.exitCode === 0,
          output: result.stdout || result.stderr,
          error: result.exitCode !== 0 ? `Cannot list ${dirPath}` : undefined,
        };
      } finally {
        try { await sandbox.close(); } catch {}
      }
    } catch (e: any) {
      return { success: false, output: "", error: `List files error: ${e.message}` };
    }
  },
};

// ─── Tool Registry ───────────────────────────────────────────────

export const ALL_TOOLS: ToolDefinition[] = [
  executeCodeTool,
  writeFileTool,
  readFileTool,
  editFileTool,
  runCommandTool,
  listFilesTool,
];

export function getToolByName(name: string): ToolDefinition | undefined {
  return ALL_TOOLS.find((t) => t.name === name);
}

export function getToolsDescription(): string {
  return ALL_TOOLS.map((tool) => {
    const params = Object.entries(tool.parameters)
      .map(([key, p]) => `    - ${key} (${p.type}${p.required ? ", required" : ""}): ${p.description}`)
      .join("\n");
    return `- ${tool.name}: ${tool.description}\n  Parameters:\n${params}`;
  }).join("\n\n");
}
