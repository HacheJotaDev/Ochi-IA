import { NextResponse } from "next/server";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";

export async function GET() {
  try {
    if (!OPENROUTER_API_KEY) {
      return NextResponse.json(
        { error: "OPENROUTER_API_KEY no configurada", models: [] },
        { status: 500 }
      );
    }

    const response = await fetch("https://openrouter.ai/api/v1/models", {
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to fetch models", models: [] },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Filter free models
    const freeModels = data.data
      .filter((model: { id: string }) => model.id.includes(":free"))
      .map((model: { id: string; name: string; description?: string }) => ({
        id: model.id,
        name: model.name || model.id,
        description: model.description || "",
      }))
      .sort((a: { name: string }, b: { name: string }) =>
        a.name.localeCompare(b.name)
      );

    return NextResponse.json({ models: freeModels });
  } catch (error) {
    console.error("Models API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch models", models: [] },
      { status: 500 }
    );
  }
}
