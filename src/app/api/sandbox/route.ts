import { NextRequest } from "next/server";

const E2B_API_KEY = process.env.E2B_API_KEY || "";

// Supported languages for E2B Code Interpreter
type SupportedLanguage = "python" | "javascript" | "typescript" | "r" | "java" | "bash";

const LANGUAGE_MAP: Record<string, SupportedLanguage> = {
  python: "python",
  py: "python",
  javascript: "javascript",
  js: "javascript",
  typescript: "typescript",
  ts: "typescript",
  r: "r",
  java: "java",
  bash: "bash",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
};

export async function POST(req: NextRequest) {
  try {
    if (!E2B_API_KEY) {
      return new Response(
        JSON.stringify({ error: "E2B_API_KEY no configurada" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const { code, language: rawLanguage } = await req.json();

    if (!code || typeof code !== "string") {
      return new Response(
        JSON.stringify({ error: "Código requerido" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const language = LANGUAGE_MAP[rawLanguage?.toLowerCase() || ""] || null;

    if (!language) {
      return new Response(
        JSON.stringify({
          error: `Lenguaje no soportado: ${rawLanguage}. Lenguajes soportados: python, javascript, typescript, r, java, bash`,
          supported: Object.keys(LANGUAGE_MAP),
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Dynamic import to avoid loading E2B at module level if not needed
    const { Sandbox } = await import("@e2b/code-interpreter");

    let sandbox;
    try {
      sandbox = await Sandbox.create({ timeoutMs: 30_000 });
    } catch (e: any) {
      console.error("[Hache IA Sandbox] Failed to create sandbox:", e.message);
      return new Response(
        JSON.stringify({
          error: "No se pudo crear el sandbox. Verifica tu API key de E2B o intenta de nuevo.",
          details: e.message,
        }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      );
    }

    try {
      const execution = await sandbox.runCode(code, {
        language,
        timeoutMs: 30_000,
      });

      // Build response
      const result: {
        stdout: string;
        stderr: string;
        text: string;
        error: string | null;
        artifacts: any[];
      } = {
        stdout: execution.logs?.stdout?.join("\n") || "",
        stderr: execution.logs?.stderr?.join("\n") || "",
        text: execution.text || "",
        error: null,
        artifacts: [],
      };

      // Check for execution errors
      if (execution.error) {
        result.error = typeof execution.error === "string"
          ? execution.error
          : execution.error.toString();
      }

      // Include any results/artifacts (charts, images, etc.)
      if (execution.results && execution.results.length > 0) {
        result.artifacts = execution.results.map((r: any) => ({
          type: r.type || "text",
          text: r.text || "",
          // If it's an image/chart, include base64 data
          ...(r.png && { png: r.png }),
          ...(r.jpeg && { jpeg: r.jpeg }),
          ...(r.svg && { svg: r.svg }),
          ...(r.extra && { extra: r.extra }),
        }));
      }

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } finally {
      // Always close the sandbox to avoid resource leaks
      try {
        await sandbox.close();
      } catch {
        // Ignore close errors
      }
    }
  } catch (error: any) {
    console.error("[Hache IA Sandbox] Error:", error);
    return new Response(
      JSON.stringify({
        error: "Error ejecutando el código en el sandbox",
        details: error.message,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
