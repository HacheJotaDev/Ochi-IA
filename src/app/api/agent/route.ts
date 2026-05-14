import { NextRequest } from "next/server";
import { runAgentLoop } from "@/lib/agent/orchestrator";

export async function POST(req: NextRequest) {
  try {
    const { message, model, history } = await req.json();

    if (!message || typeof message !== "string") {
      return new Response(
        JSON.stringify({ error: "Message is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const agentModel = model || "hache-plus";
    const chatHistory = Array.isArray(history) ? history : [];

    // Create SSE stream
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (event: any) => {
          try {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
            );
          } catch {
            // Controller may be closed
          }
        };

        try {
          await runAgentLoop(message, agentModel, chatHistory, sendEvent);
        } catch (error: any) {
          console.error("[Hache Agent] Loop error:", error);
          sendEvent({ type: "error", content: `Error del agente: ${error.message}` });
          sendEvent({ type: "done" });
        } finally {
          try {
            controller.close();
          } catch {
            // Already closed
          }
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
  } catch (error: any) {
    console.error("[Hache Agent] API error:", error);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
