"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  User,
  Sparkles,
  Trash2,
  Moon,
  Sun,
  Loader2,
  Zap,
  Copy,
  Check,
  Crown,
  Brain,
  Plus,
  MessageSquare,
  ChevronDown,
  RotateCcw,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import Image from "next/image";

// ─── Types ───────────────────────────────────────────────────────

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  model?: string;
}

interface OchiModel {
  id: string;
  name: string;
  tagline: string;
  icon: React.ElementType;
  color: string;
  gradient: string;
  description: string;
}

// ─── Ochi Models ─────────────────────────────────────────────────

const OCHI_MODELS: OchiModel[] = [
  {
    id: "ochi-flash",
    name: "Ochi Flash",
    tagline: "Rápido",
    icon: Zap,
    color: "text-amber-400",
    gradient: "from-amber-500 to-orange-500",
    description: "Respuestas ultrarrápidas. Ideal para preguntas directas y tareas simples.",
  },
  {
    id: "ochi-plus",
    name: "Ochi Plus",
    tagline: "Rápido + Razonamiento",
    icon: Sparkles,
    color: "text-violet-400",
    gradient: "from-violet-500 to-purple-500",
    description: "Velocidad y razonamiento. El modelo equilibrado para todo.",
  },
  {
    id: "ochi-thinking",
    name: "Ochi Thinking",
    tagline: "Razonamiento",
    icon: Brain,
    color: "text-cyan-400",
    gradient: "from-cyan-500 to-blue-500",
    description: "Razonamiento profundo paso a paso. Para problemas complejos.",
  },
];

// ─── Main Chat ───────────────────────────────────────────────────

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState<OchiModel>(OCHI_MODELS[1]); // Ochi Plus default
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Focus textarea on load
  useEffect(() => {
    if (mounted) textareaRef.current?.focus();
  }, [mounted]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage].map((m) => ({
            role: m.role,
            content: m.content,
          })),
          model: selectedModel.id,
        }),
      });

      if (!response.ok) {
        throw new Error("Error del servidor");
      }

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
        timestamp: new Date(),
        model: selectedModel.name,
      };

      setMessages((prev) => [...prev, assistantMessage]);

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No se pudo leer la respuesta");

      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;

          const data = trimmed.slice(6);
          if (data === "[DONE]") break;

          try {
            const parsed = JSON.parse(data);
            if (parsed.content) {
              accumulated += parsed.content;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessage.id
                    ? { ...m, content: accumulated }
                    : m
                )
              );
            }
          } catch {
            // Skip
          }
        }
      }
    } catch (error) {
      console.error("Chat error:", error);
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content:
          "Lo siento, hubo un error. Intenta de nuevo en unos segundos.",
        timestamp: new Date(),
        model: selectedModel.name,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const textarea = e.target;
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + "px";
  };

  const clearChat = () => {
    setMessages([]);
    textareaRef.current?.focus();
  };

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (!mounted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasMessages = messages.length > 0;

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* ─── Top Bar ─── */}
      <header className="flex-shrink-0 border-b border-border/30 bg-background/90 backdrop-blur-xl">
        <div className="max-w-3xl mx-auto px-4 h-12 flex items-center justify-between">
          {/* Left: Logo + Name */}
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg overflow-hidden ring-1 ring-white/10">
              <Image
                src="/ochi-ia-logo.png"
                alt="Ochi"
                width={28}
                height={28}
                className="w-full h-full object-cover"
              />
            </div>
            <span className="font-bold text-sm tracking-tight bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
              Ochi IA
            </span>
          </div>

          {/* Center: Model Picker */}
          <div className="relative">
            <button
              onClick={() => setShowModelPicker(!showModelPicker)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-muted/60 transition-colors"
            >
              <selectedModel.icon className={`w-3.5 h-3.5 ${selectedModel.color}`} />
              <span className="text-sm font-semibold">{selectedModel.name}</span>
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            </button>

            <AnimatePresence>
              {showModelPicker && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowModelPicker(false)}
                  />
                  <motion.div
                    initial={{ opacity: 0, y: -4, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.97 }}
                    transition={{ duration: 0.15 }}
                    className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-80 bg-popover border border-border/50 rounded-xl shadow-2xl overflow-hidden z-50"
                  >
                    <div className="p-1.5">
                      {OCHI_MODELS.map((model) => {
                        const Icon = model.icon;
                        const isSelected = selectedModel.id === model.id;
                        return (
                          <button
                            key={model.id}
                            onClick={() => {
                              setSelectedModel(model);
                              setShowModelPicker(false);
                            }}
                            className={`w-full flex items-start gap-3 p-3 rounded-lg transition-colors text-left ${
                              isSelected
                                ? "bg-muted/80"
                                : "hover:bg-muted/40"
                            }`}
                          >
                            <div
                              className={`w-8 h-8 rounded-lg bg-gradient-to-br ${model.gradient} flex items-center justify-center flex-shrink-0 shadow-lg`}
                            >
                              <Icon className="w-4 h-4 text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-sm">
                                  {model.name}
                                </span>
                                <span className={`text-[10px] font-bold uppercase tracking-wider ${model.color}`}>
                                  {model.tagline}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                                {model.description}
                              </p>
                            </div>
                            {isSelected && (
                              <div className="w-2 h-2 rounded-full bg-foreground mt-2 flex-shrink-0" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg"
                    onClick={() =>
                      setTheme(theme === "dark" ? "light" : "dark")
                    }
                  >
                    {theme === "dark" ? (
                      <Sun className="w-4 h-4" />
                    ) : (
                      <Moon className="w-4 h-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Tema</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
                    onClick={clearChat}
                    disabled={!hasMessages}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Nuevo chat</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </header>

      {/* ─── Chat Area ─── */}
      <main
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto"
      >
        <div className="max-w-3xl mx-auto px-4">
          {!hasMessages ? (
            <WelcomeScreen
              selectedModel={selectedModel}
              onSuggestionClick={setInput}
            />
          ) : (
            <div className="py-6 space-y-6">
              {messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  copiedId={copiedId}
                  onCopy={copyToClipboard}
                />
              ))}

              {isLoading &&
                messages[messages.length - 1]?.role === "user" && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-3"
                  >
                    <div className="w-7 h-7 rounded-lg overflow-hidden ring-1 ring-white/10 flex-shrink-0">
                      <Image
                        src="/ochi-ia-logo.png"
                        alt="Ochi"
                        width={28}
                        height={28}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <motion.div
                        animate={{ opacity: [0.2, 1, 0.2] }}
                        transition={{ duration: 1, repeat: Infinity, delay: 0 }}
                        className="w-1 h-1 rounded-full bg-foreground"
                      />
                      <motion.div
                        animate={{ opacity: [0.2, 1, 0.2] }}
                        transition={{ duration: 1, repeat: Infinity, delay: 0.15 }}
                        className="w-1 h-1 rounded-full bg-foreground"
                      />
                      <motion.div
                        animate={{ opacity: [0.2, 1, 0.2] }}
                        transition={{ duration: 1, repeat: Infinity, delay: 0.3 }}
                        className="w-1 h-1 rounded-full bg-foreground"
                      />
                    </div>
                  </motion.div>
                )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </main>

      {/* ─── Input Area ─── */}
      <footer className="flex-shrink-0 bg-background">
        <div className="max-w-3xl mx-auto px-4 pb-4 pt-2">
          <div className="relative flex items-end bg-muted/40 rounded-2xl border border-border/30 focus-within:border-border/60 transition-colors">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              placeholder="Envía un mensaje a Ochi..."
              className="flex-1 min-h-[48px] max-h-[200px] resize-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-sm py-3.5 px-4 placeholder:text-muted-foreground/40"
              rows={1}
              disabled={isLoading}
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              size="icon"
              className="h-8 w-8 rounded-lg mr-2 mb-2.5 bg-foreground text-background hover:bg-foreground/80 disabled:opacity-20 transition-all"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
          <p className="text-[10px] text-center text-muted-foreground/30 mt-2">
            Ochi IA puede cometer errores. Verifica la información importante.
          </p>
        </div>
      </footer>
    </div>
  );
}

// ─── Welcome Screen ──────────────────────────────────────────────

function WelcomeScreen({
  selectedModel,
  onSuggestionClick,
}: {
  selectedModel: OchiModel;
  onSuggestionClick: (text: string) => void;
}) {
  const suggestions = [
    "Explícame la computación cuántica de forma simple",
    "Escribe una función Python para ordenar una lista",
    "¿Cuáles son las tendencias tech de 2026?",
    "Ayúdame a escribir un email profesional",
  ];

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-200px)]">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", duration: 0.8, bounce: 0.3 }}
        className="mb-6"
      >
        <div className="w-16 h-16 rounded-2xl overflow-hidden ring-1 ring-white/10 shadow-xl shadow-violet-500/10">
          <Image
            src="/ochi-ia-logo.png"
            alt="Ochi IA"
            width={64}
            height={64}
            className="w-full h-full object-cover"
          />
        </div>
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="text-2xl font-bold mb-1"
      >
        ¿En qué puedo ayudarte?
      </motion.h1>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="flex items-center gap-1.5 mb-8"
      >
        <selectedModel.icon className={`w-3 h-3 ${selectedModel.color}`} />
        <span className="text-xs text-muted-foreground">{selectedModel.name}</span>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="grid grid-cols-2 gap-2 w-full max-w-xl"
      >
        {suggestions.map((text, index) => (
          <motion.button
            key={index}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 + index * 0.05 }}
            onClick={() => onSuggestionClick(text)}
            className="text-left px-3.5 py-3 rounded-xl border border-border/30 hover:bg-muted/40 transition-colors text-xs text-muted-foreground hover:text-foreground leading-relaxed"
          >
            {text}
          </motion.button>
        ))}
      </motion.div>
    </div>
  );
}

// ─── Message Bubble ──────────────────────────────────────────────

function MessageBubble({
  message,
  copiedId,
  onCopy,
}: {
  message: Message;
  copiedId: string | null;
  onCopy: (text: string, id: string) => void;
}) {
  const isUser = message.role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex gap-3 ${isUser ? "justify-end" : ""}`}
    >
      {/* Avatar */}
      {!isUser && (
        <div className="w-7 h-7 rounded-lg overflow-hidden ring-1 ring-white/10 flex-shrink-0 mt-0.5">
          <Image
            src="/ochi-ia-logo.png"
            alt="Ochi"
            width={28}
            height={28}
            className="w-full h-full object-cover"
          />
        </div>
      )}

      <div className={`min-w-0 ${isUser ? "max-w-[75%]" : "max-w-[85%]"}`}>
        {/* Content */}
        {isUser ? (
          <div className="bg-foreground text-background rounded-2xl rounded-tr-md px-4 py-2.5">
            <p className="text-sm whitespace-pre-wrap leading-relaxed">
              {message.content}
            </p>
          </div>
        ) : (
          <div className="group">
            <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed">
              <ReactMarkdown
                components={{
                  code(props) {
                    const { children, className, ...rest } = props;
                    const match = /language-(\w+)/.exec(className || "");
                    const isInline = !match;

                    if (isInline) {
                      return (
                        <code
                          className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono"
                          {...rest}
                        >
                          {children}
                        </code>
                      );
                    }

                    return (
                      <div className="relative my-3 rounded-lg overflow-hidden border border-border/30">
                        <div className="flex items-center justify-between bg-muted/50 px-3 py-1.5 border-b border-border/20">
                          <span className="text-[10px] font-mono text-muted-foreground">
                            {match[1]}
                          </span>
                          <button
                            onClick={() =>
                              onCopy(
                                String(children).replace(/\n$/, ""),
                                message.id + "-code"
                              )
                            }
                            className="text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {copiedId === message.id + "-code" ? (
                              <Check className="w-3 h-3 text-emerald-500" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                        <SyntaxHighlighter
                          style={oneDark}
                          language={match[1]}
                          PreTag="div"
                          customStyle={{
                            margin: 0,
                            borderRadius: 0,
                            fontSize: "12px",
                          }}
                        >
                          {String(children).replace(/\n$/, "")}
                        </SyntaxHighlighter>
                      </div>
                    );
                  },
                  p({ children }) {
                    return (
                      <p className="mb-3 last:mb-0 leading-relaxed">
                        {children}
                      </p>
                    );
                  },
                  ul({ children }) {
                    return (
                      <ul className="mb-3 list-disc pl-5 space-y-1">
                        {children}
                      </ul>
                    );
                  },
                  ol({ children }) {
                    return (
                      <ol className="mb-3 list-decimal pl-5 space-y-1">
                        {children}
                      </ol>
                    );
                  },
                  h1({ children }) {
                    return (
                      <h1 className="text-lg font-bold mb-3 mt-5 first:mt-0">
                        {children}
                      </h1>
                    );
                  },
                  h2({ children }) {
                    return (
                      <h2 className="text-base font-bold mb-2 mt-4 first:mt-0">
                        {children}
                      </h2>
                    );
                  },
                  h3({ children }) {
                    return (
                      <h3 className="text-sm font-bold mb-2 mt-3 first:mt-0">
                        {children}
                      </h3>
                    );
                  },
                  blockquote({ children }) {
                    return (
                      <blockquote className="border-l-2 border-border pl-3 my-3 italic text-muted-foreground">
                        {children}
                      </blockquote>
                    );
                  },
                  a({ children, href }) {
                    return (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-violet-400 hover:text-violet-300 underline underline-offset-2"
                      >
                        {children}
                      </a>
                    );
                  },
                  table({ children }) {
                    return (
                      <div className="overflow-x-auto my-3">
                        <table className="text-xs border border-border/30 rounded-lg">
                          {children}
                        </table>
                      </div>
                    );
                  },
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => onCopy(message.content, message.id)}
                className="flex items-center gap-1 text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
              >
                {copiedId === message.id ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-500" /> Copiado
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" /> Copiar
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
