"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  Sparkles,
  Moon,
  Sun,
  Loader2,
  Zap,
  Copy,
  Check,
  Brain,
  Plus,
  ChevronDown,
  PanelLeftClose,
  PanelLeft,
  MessageSquare,
  Trash2,
  X,
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
  timestamp: string;
  model?: string;
}

interface Chat {
  id: string;
  title: string;
  messages: Message[];
  model: string;
  createdAt: string;
  updatedAt: string;
}

interface HacheModel {
  id: string;
  name: string;
  tagline: string;
  icon: React.ElementType;
  color: string;
  gradient: string;
  description: string;
}

// ─── Hache Models ─────────────────────────────────────────────────

const HACHE_MODELS: HacheModel[] = [
  {
    id: "hache-flash",
    name: "Hache Flash",
    tagline: "Rápido",
    icon: Zap,
    color: "text-amber-400",
    gradient: "from-amber-500 to-orange-500",
    description: "Respuestas ultrarrápidas. Ideal para preguntas directas y tareas simples.",
  },
  {
    id: "hache-plus",
    name: "Hache Plus",
    tagline: "Rápido + Razonamiento",
    icon: Sparkles,
    color: "text-violet-400",
    gradient: "from-violet-500 to-purple-500",
    description: "Velocidad y razonamiento. El modelo equilibrado para todo.",
  },
  {
    id: "hache-thinking",
    name: "Hache Thinking",
    tagline: "Razonamiento",
    icon: Brain,
    color: "text-cyan-400",
    gradient: "from-cyan-500 to-blue-500",
    description: "Razonamiento profundo paso a paso. Para problemas complejos.",
  },
];

// ─── Storage Helpers ──────────────────────────────────────────────

const STORAGE_KEY = "hache-ia-chats";
const ACTIVE_CHAT_KEY = "hache-ia-active-chat";
const MODEL_KEY = "hache-ia-model";

function loadChats(): Chat[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveChats(chats: Chat[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
  } catch {
    // Storage full or unavailable
  }
}

function loadActiveChatId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_CHAT_KEY);
  } catch {
    return null;
  }
}

function saveActiveChatId(id: string | null) {
  try {
    if (id) {
      localStorage.setItem(ACTIVE_CHAT_KEY, id);
    } else {
      localStorage.removeItem(ACTIVE_CHAT_KEY);
    }
  } catch {
    // ignore
  }
}

function loadSelectedModel(): string {
  try {
    return localStorage.getItem(MODEL_KEY) || "hache-plus";
  } catch {
    return "hache-plus";
  }
}

function saveSelectedModel(id: string) {
  try {
    localStorage.setItem(MODEL_KEY, id);
  } catch {
    // ignore
  }
}

function generateTitle(content: string): string {
  const clean = content.trim().slice(0, 60);
  return clean.length < content.trim().length ? clean + "..." : clean;
}

// ─── Main Chat ───────────────────────────────────────────────────

export default function ChatPage() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState("hache-plus");
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  const selectedModel = HACHE_MODELS.find((m) => m.id === selectedModelId) || HACHE_MODELS[1];

  const activeChat = chats.find((c) => c.id === activeChatId) || null;
  const messages = activeChat?.messages || [];

  // Load from localStorage on mount
  useEffect(() => {
    const savedChats = loadChats();
    const savedActiveId = loadActiveChatId();
    const savedModel = loadSelectedModel();

    setChats(savedChats);
    setSelectedModelId(savedModel);

    if (savedActiveId && savedChats.find((c) => c.id === savedActiveId)) {
      setActiveChatId(savedActiveId);
    } else if (savedChats.length > 0) {
      setActiveChatId(savedChats[0].id);
    }

    setMounted(true);
  }, []);

  // Persist chats whenever they change
  useEffect(() => {
    if (mounted) {
      saveChats(chats);
    }
  }, [chats, mounted]);

  // Persist active chat id
  useEffect(() => {
    if (mounted) {
      saveActiveChatId(activeChatId);
    }
  }, [activeChatId, mounted]);

  // Persist selected model
  useEffect(() => {
    if (mounted) {
      saveSelectedModel(selectedModelId);
    }
  }, [selectedModelId, mounted]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (mounted) textareaRef.current?.focus();
  }, [mounted, activeChatId]);

  const createNewChat = useCallback(() => {
    return {
      id: crypto.randomUUID(),
      title: "Nuevo chat",
      messages: [],
      model: selectedModelId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }, [selectedModelId]);

  const handleNewChat = () => {
    const newChat = createNewChat();
    setChats((prev) => [newChat, ...prev]);
    setActiveChatId(newChat.id);
    setInput("");
    textareaRef.current?.focus();
  };

  const handleSelectChat = (chatId: string) => {
    setActiveChatId(chatId);
    setInput("");
  };

  const handleDeleteChat = (chatId: string) => {
    setChats((prev) => {
      const filtered = prev.filter((c) => c.id !== chatId);
      if (activeChatId === chatId) {
        setActiveChatId(filtered.length > 0 ? filtered[0].id : null);
      }
      return filtered;
    });
    setDeleteConfirmId(null);
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    let currentChatId = activeChatId;

    // If no active chat, create one
    if (!currentChatId) {
      const newChat = createNewChat();
      currentChatId = newChat.id;
      setChats((prev) => [newChat, ...prev]);
      setActiveChatId(newChat.id);
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.trim(),
      timestamp: new Date().toISOString(),
    };

    const finalChatId = currentChatId;

    // Update chat with user message + auto-title
    setChats((prev) =>
      prev.map((c) => {
        if (c.id === finalChatId) {
          const isFirstMessage = c.messages.length === 0;
          return {
            ...c,
            messages: [...c.messages, userMessage],
            title: isFirstMessage ? generateTitle(userMessage.content) : c.title,
            model: selectedModelId,
            updatedAt: new Date().toISOString(),
          };
        }
        return c;
      })
    );

    setInput("");
    setIsLoading(true);

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    // Get all messages for API call
    const currentChat = chats.find((c) => c.id === finalChatId);
    const allMessages = [...(currentChat?.messages || []), userMessage];

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: allMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          model: selectedModelId,
        }),
      });

      if (!response.ok) {
        throw new Error("Error del servidor");
      }

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
        timestamp: new Date().toISOString(),
        model: selectedModel.name,
      };

      // Add empty assistant message
      setChats((prev) =>
        prev.map((c) => {
          if (c.id === finalChatId) {
            return {
              ...c,
              messages: [...c.messages, assistantMessage],
              updatedAt: new Date().toISOString(),
            };
          }
          return c;
        })
      );

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
              const currentAccumulated = accumulated;
              setChats((prev) =>
                prev.map((c) => {
                  if (c.id === finalChatId) {
                    return {
                      ...c,
                      messages: c.messages.map((m) =>
                        m.id === assistantMessage.id
                          ? { ...m, content: currentAccumulated }
                          : m
                      ),
                      updatedAt: new Date().toISOString(),
                    };
                  }
                  return c;
                })
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
        timestamp: new Date().toISOString(),
        model: selectedModel.name,
      };
      setChats((prev) =>
        prev.map((c) => {
          if (c.id === finalChatId) {
            return {
              ...c,
              messages: [...c.messages, errorMessage],
              updatedAt: new Date().toISOString(),
            };
          }
          return c;
        })
      );
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

  // Group chats by date
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const groupedChats: { label: string; chats: Chat[] }[] = [];
  const todayChats = chats.filter((c) => new Date(c.updatedAt).toDateString() === today.toDateString());
  const yesterdayChats = chats.filter((c) => new Date(c.updatedAt).toDateString() === yesterday.toDateString());
  const olderChats = chats.filter(
    (c) =>
      new Date(c.updatedAt).toDateString() !== today.toDateString() &&
      new Date(c.updatedAt).toDateString() !== yesterday.toDateString()
  );

  if (todayChats.length > 0) groupedChats.push({ label: "Hoy", chats: todayChats });
  if (yesterdayChats.length > 0) groupedChats.push({ label: "Ayer", chats: yesterdayChats });
  if (olderChats.length > 0) groupedChats.push({ label: "Anterior", chats: olderChats });

  return (
    <div className="h-screen bg-background flex overflow-hidden">
      {/* ─── Sidebar ─── */}
      <AnimatePresence initial={false}>
        {sidebarOpen && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 260, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="flex-shrink-0 border-r border-border/30 bg-background/95 backdrop-blur-xl flex flex-col overflow-hidden"
          >
            {/* Sidebar Header */}
            <div className="px-3 pt-3 pb-2 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg overflow-hidden ring-1 ring-white/10">
                  <Image
                    src="/hache-ia-logo.png"
                    alt="Hache"
                    width={28}
                    height={28}
                    className="w-full h-full object-cover"
                  />
                </div>
                <span className="font-bold text-sm tracking-tight bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                  Hache IA
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground"
                onClick={() => setSidebarOpen(false)}
              >
                <PanelLeftClose className="w-4 h-4" />
              </Button>
            </div>

            {/* New Chat Button */}
            <div className="px-3 pb-2 flex-shrink-0">
              <button
                onClick={handleNewChat}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border/40 hover:bg-muted/50 transition-colors text-sm"
              >
                <Plus className="w-4 h-4" />
                <span>Nuevo chat</span>
              </button>
            </div>

            {/* Chat List */}
            <div className="flex-1 overflow-y-auto px-2 space-y-1">
              {groupedChats.map((group) => (
                <div key={group.label} className="mb-2">
                  <p className="px-2 py-1 text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider">
                    {group.label}
                  </p>
                  {group.chats.map((chat) => (
                    <div
                      key={chat.id}
                      className={`group relative flex items-center rounded-lg transition-colors cursor-pointer ${
                        chat.id === activeChatId
                          ? "bg-muted/70"
                          : "hover:bg-muted/30"
                      }`}
                    >
                      <button
                        onClick={() => handleSelectChat(chat.id)}
                        className="flex-1 flex items-center gap-2 px-2.5 py-2 text-left min-w-0"
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        <span className="text-xs truncate">{chat.title}</span>
                      </button>
                      <div className="absolute right-1 opacity-0 group-hover:opacity-100 transition-opacity flex items-center">
                        {deleteConfirmId === chat.id ? (
                          <div className="flex items-center gap-0.5">
                            <button
                              onClick={() => handleDeleteChat(chat.id)}
                              className="p-1 rounded hover:bg-destructive/20 text-destructive transition-colors"
                            >
                              <Check className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => setDeleteConfirmId(null)}
                              className="p-1 rounded hover:bg-muted text-muted-foreground transition-colors"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirmId(chat.id)}
                            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
              {chats.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground/40">
                  <MessageSquare className="w-8 h-8 mb-2" />
                  <p className="text-xs">Sin conversaciones</p>
                </div>
              )}
            </div>

            {/* Sidebar Footer */}
            <div className="px-3 py-2 border-t border-border/30 flex-shrink-0">
              <div className="flex items-center gap-2 px-2 py-1.5">
                <div className="w-5 h-5 rounded-full bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center">
                  <span className="text-[8px] font-bold text-white">H</span>
                </div>
                <span className="text-[11px] text-muted-foreground">Hache IA v1.0</span>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* ─── Main Area ─── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* ─── Top Bar ─── */}
        <header className="flex-shrink-0 border-b border-border/30 bg-background/90 backdrop-blur-xl">
          <div className="max-w-3xl mx-auto px-4 h-12 flex items-center justify-between">
            {/* Left: Sidebar toggle + Logo (when sidebar hidden) */}
            <div className="flex items-center gap-2.5">
              {!sidebarOpen && (
                <>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
                          onClick={() => setSidebarOpen(true)}
                        >
                          <PanelLeft className="w-4 h-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Abrir sidebar</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <div className="w-7 h-7 rounded-lg overflow-hidden ring-1 ring-white/10">
                    <Image
                      src="/hache-ia-logo.png"
                      alt="Hache"
                      width={28}
                      height={28}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <span className="font-bold text-sm tracking-tight bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                    Hache IA
                  </span>
                </>
              )}
              {sidebarOpen && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground -ml-1"
                        onClick={() => setSidebarOpen(true)}
                      >
                        <PanelLeft className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Abrir sidebar</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
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
                        {HACHE_MODELS.map((model) => {
                          const Icon = model.icon;
                          const isSelected = selectedModelId === model.id;
                          return (
                            <button
                              key={model.id}
                              onClick={() => {
                                setSelectedModelId(model.id);
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
                      onClick={handleNewChat}
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
                          src="/hache-ia-logo.png"
                          alt="Hache"
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
                placeholder="Envía un mensaje a Hache..."
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
              Hache IA puede cometer errores. Verifica la información importante.
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}

// ─── Welcome Screen ──────────────────────────────────────────────

function WelcomeScreen({
  selectedModel,
  onSuggestionClick,
}: {
  selectedModel: HacheModel;
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
        <div className="w-16 h-16 rounded-2xl overflow-hidden ring-1 ring-white/10 shadow-xl shadow-emerald-500/10">
          <Image
            src="/hache-ia-logo.png"
            alt="Hache IA"
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
            src="/hache-ia-logo.png"
            alt="Hache"
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
                        className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2"
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
