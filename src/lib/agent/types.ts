// ─── Agent Types ─────────────────────────────────────────────────

export interface AgentStep {
  step: number;
  type: "thinking" | "tool_call" | "tool_result" | "planning" | "complete" | "error";
  content: string;
  toolCall?: ToolCall;
  toolResult?: ToolResult;
  timestamp: string;
}

export interface ToolCall {
  name: string;
  params: Record<string, any>;
}

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
  artifacts?: Array<{
    type: string;
    png?: string;
    svg?: string;
    text?: string;
  }>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, ToolParameter>;
  execute: (params: Record<string, any>, sandbox: SandboxSession) => Promise<ToolResult>;
}

export interface ToolParameter {
  type: string;
  description: string;
  required?: boolean;
}

export interface SandboxSession {
  id: string;
  isActive: boolean;
}

export interface AgentMemory {
  task: string;
  steps: AgentStep[];
  files: string[];
  lastAction: string | null;
  context: string;
}

export interface AgentConfig {
  maxSteps: number;
  model: string;
  systemPrompt: string;
  tools: ToolDefinition[];
}

// SSE Event types for streaming
export type AgentEventType =
  | { type: "step_start"; step: number }
  | { type: "thinking"; content: string }
  | { type: "tool_call"; tool: ToolCall; step: number }
  | { type: "tool_executing"; tool: string; step: number }
  | { type: "tool_result"; result: ToolResult; step: number }
  | { type: "planning"; content: string }
  | { type: "complete"; content: string; steps: number }
  | { type: "error"; content: string }
  | { type: "done" };

// Tool call parsing result
export interface ParsedToolCall {
  beforeText: string;
  toolCall: ToolCall | null;
  afterText: string;
}
