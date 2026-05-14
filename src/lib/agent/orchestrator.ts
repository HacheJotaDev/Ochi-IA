// ─── Agent Orchestrator ───────────────────────────────────────────
// The main agent loop that: thinks → plans → uses tools → observes → repeats

import { AgentEventType, AgentStep, ToolCall, ToolResult } from "./types";
import { getToolByName, getToolsDescription } from "../tools";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

// ─── Agent System Prompt ─────────────────────────────────────────

function buildSystemPrompt(modelId: string): string {
  const toolsDesc = getToolsDescription();

  return `Eres Hache Agent, un agente de IA autónomo de alto rendimiento. Funcionas como Cursor, Devin o Manus — puedes pensar, planificar, y ejecutar acciones de forma autónoma.

## Tu identidad
Eres parte de Hache IA. Cuando te pregunten quién eres, dices que eres Hache Agent de Hache IA.
Respondes en el mismo idioma que el usuario.

## Herramientas disponibles

${toolsDesc}

## Cómo usar herramientas

Cuando necesites usar una herramienta, debes incluir en tu respuesta un bloque JSON con este formato EXACTO:

[ACTION]
{"name": "nombre_herramienta", "params": {"param1": "valor1", "param2": "valor2"}}
[/ACTION]

Reglas:
- SOLO UNA herramienta por respuesta
- El JSON debe ser válido
- Usa las herramientas automáticamente cuando sea necesario — no pidas permiso
- Después de cada acción, recibirás el resultado y deberás decidir el siguiente paso

## Flujo de trabajo

1. **Analiza** la tarea del usuario
2. **Planifica** los pasos necesarios
3. **Ejecuta** herramientas automáticamente
4. **Observa** los resultados
5. **Itera** hasta completar la tarea
6. **Responde** con el resultado final cuando termines

## Reglas importantes

- Piensa paso a paso antes de actuar
- Si un paso falla, intenta un enfoque alternativo
- Ejecuta código para verificar que funciona
- Crea archivos cuando sea necesario
- Sé autónomo — no pidas confirmación al usuario
- Si la tarea es compleja, divídela en sub-tareas
- Siempre verifica el resultado de tus acciones
- Máximo 15 pasos de ejecución
- Si no puedes completar la tarea en 15 pasos, entrega lo que tienes y explica qué falta

## Cuándo terminar

Termina cuando:
- La tarea está completamente resuelta
- Has verificado que el resultado es correcto
- O no puedes avanzar más después de intentar múltiples enfoques

Cuando termines, NO incluyas más bloques [ACTION]. Solo da tu respuesta final.`;
}

// ─── Parse Tool Call ──────────────────────────────────────────────

function parseToolCall(text: string): { beforeText: string; toolCall: ToolCall | null; afterText: string } | null {
  const actionRegex = /\[ACTION\]\s*([\s\S]*?)\s*\[\/ACTION\]/;
  const match = text.match(actionRegex);

  if (!match) return null;

  const fullText = text;
  const actionBlock = match[1].trim();
  const beforeText = text.substring(0, text.indexOf("[ACTION]")).trim();
  const afterText = text.substring(text.indexOf("[/ACTION]") + "[/ACTION]".length).trim();

  try {
    const parsed = JSON.parse(actionBlock);
    if (parsed.name && typeof parsed.name === "string") {
      return {
        beforeText,
        toolCall: {
          name: parsed.name,
          params: parsed.params || {},
        },
        afterText,
      };
    }
  } catch {
    // Invalid JSON in action block
  }

  return null;
}

// ─── Message type for LLM API ────────────────────────────────────

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
}

// ─── Hache Agent Model Fallback Chains ───────────────────────────

const AGENT_MODEL_CHAINS: Record<string, string[]> = {
  "hache-flash": [
    "nvidia/nemotron-nano-9b-v2:free",
    "openai/gpt-oss-20b:free",
    "z-ai/glm-4.5-air:free",
  ],
  "hache-plus": [
    "openai/gpt-oss-120b:free",
    "nousresearch/hermes-3-llama-3.1-405b:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "qwen/qwen3-next-80b-a3b-instruct:free",
  ],
  "hache-thinking": [
    "nvidia/nemotron-3-super-120b-a12b:free",
    "qwen/qwen3-coder:free",
    "openai/gpt-oss-120b:free",
    "nousresearch/hermes-3-llama-3.1-405b:free",
  ],
};

// ─── Call LLM ─────────────────────────────────────────────────────

async function callLLM(
  messages: ChatMessage[],
  modelId: string
): Promise<ReadableStream<Uint8Array> | null> {
  const modelChain = AGENT_MODEL_CHAINS[modelId] || AGENT_MODEL_CHAINS["hache-plus"];

  for (const model of modelChain) {
    try {
      const res = await fetch(OPENROUTER_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://hache-ia.app",
          "X-OpenRouter-Title": "Hache Agent",
        },
        body: JSON.stringify({
          model,
          messages,
          stream: true,
          temperature: 0.3,
          max_tokens: 4096,
        }),
      });

      if (res.ok) {
        return res.body;
      }

      if (res.status === 429 || res.status === 404) {
        console.log(`[Hache Agent] ${model} unavailable, trying next...`);
        continue;
      }

      console.error(`[Hache Agent] API error: ${res.status}`);
    } catch (e) {
      console.error(`[Hache Agent] LLM call failed:`, e);
    }
  }

  return null;
}

// ─── Read LLM stream and accumulate ──────────────────────────────

async function readLLMStream(
  stream: ReadableStream<Uint8Array>,
  onChunk: (text: string) => void
): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let accumulated = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data: ")) continue;

      const data = trimmed.slice(6);
      if (data === "[DONE]") continue;

      try {
        const parsed = JSON.parse(data);
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) {
          accumulated += content;
          onChunk(content);
        }
      } catch {
        // Skip invalid JSON
      }
    }
  }

  return accumulated;
}

// ─── Execute Tool ─────────────────────────────────────────────────

async function executeTool(
  toolCall: ToolCall
): Promise<ToolResult> {
  const tool = getToolByName(toolCall.name);

  if (!tool) {
    return {
      success: false,
      output: "",
      error: `Unknown tool: ${toolCall.name}. Available tools: ${getToolsDescription()}`,
    };
  }

  try {
    return await tool.execute(toolCall.params, { id: "session", isActive: true });
  } catch (e: any) {
    return {
      success: false,
      output: "",
      error: `Tool execution error: ${e.message}`,
    };
  }
}

// ─── Main Agent Loop ─────────────────────────────────────────────

export async function runAgentLoop(
  userMessage: string,
  modelId: string,
  history: ChatMessage[],
  sendEvent: (event: AgentEventType) => void
): Promise<void> {
  const systemPrompt = buildSystemPrompt(modelId);
  const MAX_STEPS = 15;

  // Build initial messages
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: userMessage },
  ];

  let step = 0;
  let isComplete = false;

  while (!isComplete && step < MAX_STEPS) {
    step++;
    sendEvent({ type: "step_start", step });

    // Call LLM
    const stream = await callLLM(messages, modelId);

    if (!stream) {
      sendEvent({ type: "error", content: "No se pudo conectar con el modelo. Intenta de nuevo." });
      return;
    }

    // Stream the thinking
    let fullResponse = "";
    sendEvent({ type: "thinking", content: "" });

    fullResponse = await readLLMStream(stream, (chunk) => {
      sendEvent({ type: "thinking", content: chunk });
    });

    if (!fullResponse.trim()) {
      sendEvent({ type: "error", content: "El modelo no generó respuesta." });
      return;
    }

    // Add assistant message to history
    messages.push({ role: "assistant", content: fullResponse });

    // Parse for tool calls
    const parsed = parseToolCall(fullResponse);

    if (parsed && parsed.toolCall) {
      // Emit tool call event
      sendEvent({ type: "tool_call", tool: parsed.toolCall, step });
      sendEvent({ type: "tool_executing", tool: parsed.toolCall.name, step });

      // Execute the tool
      const result = await executeTool(parsed.toolCall);

      // Emit tool result
      sendEvent({ type: "tool_result", result, step });

      // Add tool result to conversation
      const resultContent = result.output || result.error || "(no output)";
      messages.push({
        role: "tool",
        content: `[Result of ${parsed.toolCall.name}]:\n${resultContent}${result.error ? `\n[Error]: ${result.error}` : ""}${result.artifacts?.length ? `\n[Generated ${result.artifacts.length} artifact(s)]` : ""}`,
      } as any);

      // Continue the loop — the LLM will see the result and decide next step
    } else {
      // No tool call found — the agent is done
      isComplete = true;

      // Clean up the response (remove any [ACTION] artifacts if partial)
      const cleanResponse = fullResponse
        .replace(/\[ACTION\][\s\S]*?\[\/ACTION\]/g, "")
        .trim();

      sendEvent({
        type: "complete",
        content: cleanResponse || fullResponse,
        steps: step,
      });
    }
  }

  // If we hit max steps
  if (step >= MAX_STEPS && !isComplete) {
    sendEvent({
      type: "complete",
      content: "He alcanzado el límite de pasos. Aquí está lo que tengo hasta ahora. Puedes pedirme que continúe si necesitas más.",
      steps: step,
    });
  }

  sendEvent({ type: "done" });
}
