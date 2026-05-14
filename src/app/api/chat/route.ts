import { NextRequest } from "next/server";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

// Hache model mapping: each Hache model has a primary + fallback chain
const HACHE_MODELS: Record<string, string[]> = {
  "hache-flash": [
    "nvidia/nemotron-nano-9b-v2:free",
    "openai/gpt-oss-20b:free",
    "z-ai/glm-4.5-air:free",
    "google/gemma-4-26b-a4b-it:free",
    "meta-llama/llama-3.2-3b-instruct:free",
    "liquid/lfm-2.5-1.2b-instruct:free",
  ],
  "hache-plus": [
    "openai/gpt-oss-120b:free",
    "nousresearch/hermes-3-llama-3.1-405b:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "google/gemma-4-31b-it:free",
    "qwen/qwen3-next-80b-a3b-instruct:free",
    "minimax/minimax-m2.5:free",
  ],
  "hache-thinking": [
    "nvidia/nemotron-3-super-120b-a12b:free",
    "arcee-ai/trinity-large-thinking:free",
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    "qwen/qwen3-coder:free",
    "openai/gpt-oss-120b:free",
    "nousresearch/hermes-3-llama-3.1-405b:free",
  ],
};

const HACHE_SYSTEM_PROMPTS: Record<string, string> = {
  "hache-flash":
    "Eres Hache Flash, un asistente de IA ultra rápido y eficiente. Respondes en el mismo idioma que el usuario. Eres directo, preciso y conciso. No uses palabras de más. Entregas la respuesta correcta de la forma más breve posible sin perder calidad. Cuando te pregunten quién eres, dices que eres Hache Flash de Hache IA.",
  "hache-plus":
    "Eres Hache Plus, un asistente de IA avanzado y versátil. Respondes en el mismo idioma que el usuario. Combinas velocidad con razonamiento profundo. Explicas de forma clara y completa, con ejemplos cuando es útil. Eres el modelo equilibrado perfecto para cualquier tarea. Cuando te pregunten quién eres, dices que eres Hache Plus de Hache IA.",
  "hache-thinking":
    "Eres Hache Thinking, un modelo de IA especializado en razonamiento profundo. Respondes en el mismo idioma que el usuario. Antes de responder, piensas paso a paso, analizas el problema desde múltiples ángulos y solo entonces construyes tu respuesta. Eres experto en matemáticas, lógica, programación compleja y problemas que requieren análisis cuidadoso. Muestra tu proceso de razonamiento cuando sea relevante. Cuando te pregunten quién eres, dices que eres Hache Thinking de Hache IA.",
};

async function tryModel(
  model: string,
  messages: { role: string; content: string }[],
  systemPrompt: string
) {
  return fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://hache-ia.app",
      "X-OpenRouter-Title": "Hache IA",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
      stream: true,
    }),
  });
}

export async function POST(req: NextRequest) {
  try {
    if (!OPENROUTER_API_KEY) {
      return new Response(
        JSON.stringify({ error: "OPENROUTER_API_KEY no configurada" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const { messages, model: hacheModel } = await req.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: "Messages are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const selectedHacheModel = hacheModel || "hache-plus";
    const modelChain = HACHE_MODELS[selectedHacheModel] || HACHE_MODELS["hache-plus"];
    const systemPrompt =
      HACHE_SYSTEM_PROMPTS[selectedHacheModel] || HACHE_SYSTEM_PROMPTS["hache-plus"];

    let response: Response | null = null;

    // Try models in the chain until one works
    for (const modelId of modelChain) {
      const res = await tryModel(modelId, messages, systemPrompt);

      if (res.ok) {
        response = res;
        break;
      }

      const errorText = await res.text();

      if (res.status === 429 || res.status === 404) {
        console.log(`[Hache IA] ${modelId} unavailable, trying next...`);
        continue;
      }

      console.error("[Hache IA] API error:", res.status, errorText);
      return new Response(
        JSON.stringify({
          error: `Error de API: ${res.status}`,
          details: errorText,
        }),
        { status: res.status, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!response) {
      return new Response(
        JSON.stringify({
          error:
            "Todos los modelos están temporalmente saturados. Intenta en unos segundos.",
        }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      );
    }

    // Stream the response
    const encoder = new TextEncoder();
    const reader = response.body?.getReader();

    if (!reader) {
      return new Response(
        JSON.stringify({ error: "No response body" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const stream = new ReadableStream({
      async start(controller) {
        const decoder = new TextDecoder();
        let buffer = "";

        try {
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
              if (data === "[DONE]") {
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                continue;
              }

              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) {
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({ content })}\n\n`
                    )
                  );
                }
              } catch {
                // Skip invalid JSON
              }
            }
          }
        } catch (error) {
          console.error("[Hache IA] Stream error:", error);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("[Hache IA] Chat error:", error);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
