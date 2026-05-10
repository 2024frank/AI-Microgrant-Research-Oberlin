"use client";

import { useState, useRef, useEffect } from "react";
import {
  Send, Loader2, Bot, User, Zap, TestTube, Rocket,
  Globe, CheckCircle, XCircle, ChevronDown, ChevronUp,
  Plus, History,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import type { SourceConfig, NormalizedEvent } from "@/lib/sourceConfig";
import {
  createChatSession,
  appendChatMessage,
  getChatSession,
  listChatSessions,
  type ChatSession,
  type ChatMsg,
} from "@/lib/sourceConfigStore";

type Message = {
  role: "user" | "assistant";
  content: string;
  config?: SourceConfig;
  testResult?: TestResult;
  deployResult?: { success: boolean; id?: string; error?: string; github?: { committed: boolean; url?: string; error?: string } };
  probeResult?: { status: number; contentType: string; structure?: unknown; sample?: string; error?: string };
};

type TestResult = {
  success: boolean;
  eventCount: number;
  events: NormalizedEvent[];
  error?: string;
};

export default function SourceBuilderPage() {
  const { user, authorizedUser, role } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [pendingConfig, setPendingConfig] = useState<SourceConfig | null>(null);
  const [testing, setTesting] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [probing, setProbing] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const isAdmin = role === "super_admin" || role === "admin";

  useEffect(() => {
    if (user?.email) {
      listChatSessions(user.email, 10).then(setSessions).catch(() => {});
    }
  }, [user?.email]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function startNewSession() {
    if (!user?.email) return;
    const id = await createChatSession(user.email, "New source");
    setSessionId(id);
    setMessages([]);
    setPendingConfig(null);
    setShowHistory(false);
  }

  async function loadSession(session: ChatSession) {
    setSessionId(session.id);
    setMessages(
      session.messages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))
    );
    setPendingConfig(null);
    setShowHistory(false);
  }

  async function sendMessage() {
    if (!input.trim() || loading) return;

    const userMsg: Message = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    // Persist
    if (!sessionId && user?.email) {
      const id = await createChatSession(user.email, input.trim().slice(0, 50));
      setSessionId(id);
      await appendChatMessage(id, { role: "user", content: userMsg.content, timestamp: Date.now() });
    } else if (sessionId) {
      await appendChatMessage(sessionId, { role: "user", content: userMsg.content, timestamp: Date.now() });
    }

    try {
      const chatMsgs = newMessages.map((m) => ({ role: m.role, content: m.content }));
      const res = await fetch("/api/source-builder/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: chatMsgs, sessionId }),
      });
      const data = await res.json();

      const assistantMsg: Message = { role: "assistant", content: data.reply };
      if (data.generatedConfig) {
        assistantMsg.config = data.generatedConfig;
        setPendingConfig(data.generatedConfig);
      }

      setMessages([...newMessages, assistantMsg]);

      if (sessionId) {
        await appendChatMessage(sessionId, { role: "assistant", content: data.reply, timestamp: Date.now() });
      }
    } catch {
      setMessages([...newMessages, { role: "assistant", content: "Sorry, something went wrong. Please try again." }]);
    }

    setLoading(false);
    inputRef.current?.focus();
  }

  async function handleProbe(url: string) {
    setProbing(true);
    try {
      const res = await fetch("/api/source-builder/probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();

      const probeMsg: Message = { role: "assistant", content: "", probeResult: data };
      setMessages((prev) => [...prev, probeMsg]);

      // Send probe results back to AI for analysis
      const summary = JSON.stringify(data.structure ?? data.sample ?? data, null, 2).slice(0, 2000);
      const userAnalysis: Message = {
        role: "user",
        content: `I probed ${url} and got this response structure:\n\`\`\`json\n${summary}\n\`\`\`\nPlease analyze this and generate a source config with the correct field mappings.`,
      };
      setMessages((prev) => [...prev, userAnalysis]);
      setLoading(true);

      const chatRes = await fetch("/api/source-builder/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, probeMsg, userAnalysis].map((m) => ({ role: m.role, content: m.probeResult ? JSON.stringify(m.probeResult) : m.content })),
          sessionId,
        }),
      });
      const chatData = await chatRes.json();
      const aiReply: Message = { role: "assistant", content: chatData.reply };
      if (chatData.generatedConfig) {
        aiReply.config = chatData.generatedConfig;
        setPendingConfig(chatData.generatedConfig);
      }
      setMessages((prev) => [...prev, aiReply]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Failed to probe the URL." }]);
    }
    setProbing(false);
    setLoading(false);
  }

  async function handleTest(config: SourceConfig) {
    setTesting(true);
    try {
      const res = await fetch("/api/source-builder/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });
      const data = await res.json();
      const testMsg: Message = { role: "assistant", content: "", testResult: data };
      setMessages((prev) => [...prev, testMsg]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Test failed — could not reach the API." }]);
    }
    setTesting(false);
  }

  async function handleDeploy(config: SourceConfig) {
    setDeploying(true);
    try {
      const res = await fetch("/api/source-builder/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: { ...config, createdBy: user?.email ?? "" } }),
      });
      const data = await res.json();
      const deployMsg: Message = { role: "assistant", content: "", deployResult: data };
      setMessages((prev) => [...prev, deployMsg]);
      if (data.success) setPendingConfig(null);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Deployment failed." }]);
    }
    setDeploying(false);
  }

  if (!isAdmin) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-[var(--text)]">Source Builder</h1>
        <p className="mt-2 text-[var(--muted)]">Only admins can add new sources.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3 md:px-6 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded-md bg-violet-900/30 border border-violet-800/40">
            <Bot className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h1 className="font-[var(--font-public-sans)] text-lg font-bold text-[var(--text)]">Source Builder AI</h1>
            <p className="text-xs text-[var(--muted)]">Describe a source and I'll configure, test, and deploy it</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-[var(--border)] text-sm text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-high)] transition-colors"
          >
            <History className="w-4 h-4" />
            History
          </button>
          <button
            onClick={startNewSession}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-violet-900/30 border border-violet-800/40 text-sm text-violet-400 hover:bg-violet-900/50 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New
          </button>
        </div>
      </div>

      {/* History panel */}
      {showHistory && (
        <div className="border-b border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-3 md:px-6 max-h-48 overflow-y-auto">
          {sessions.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No previous sessions.</p>
          ) : (
            <div className="space-y-1">
              {sessions.map((s) => (
                <button key={s.id} onClick={() => loadSession(s)} className="w-full text-left px-3 py-2 rounded hover:bg-[var(--surface-high)] text-sm transition-colors">
                  <span className="text-[var(--text)]">{s.title}</span>
                  <span className="text-xs text-[var(--muted)] ml-2">{new Date(s.createdAt).toLocaleDateString()}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 md:px-6 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <Bot className="w-12 h-12 text-violet-400/50" />
            <div className="text-center max-w-md">
              <p className="text-[var(--text)] font-medium mb-2">What source do you want to add?</p>
              <p className="text-sm text-[var(--muted)]">Tell me about the calendar or event feed you want to integrate. I'll probe the API, generate the config, test it, and deploy it.</p>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {[
                "Add Oberlin City events from their website",
                "Integrate an iCal feed",
                "Add events from an Eventbrite API",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => { setInput(suggestion); }}
                  className="px-3 py-1.5 rounded-full border border-[var(--border)] text-xs text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-high)] transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i}>
            {/* Probe result */}
            {msg.probeResult && (
              <ProbeResultCard result={msg.probeResult} />
            )}

            {/* Test result */}
            {msg.testResult && (
              <TestResultCard result={msg.testResult} />
            )}

            {/* Deploy result */}
            {msg.deployResult && (
              <DeployResultCard result={msg.deployResult} />
            )}

            {/* Regular message */}
            {msg.content && (
              <div className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                  msg.role === "user" ? "bg-[var(--surface-high)] border border-[var(--border)]" : "bg-violet-900/30 border border-violet-800/40"
                }`}>
                  {msg.role === "user" ? <User className="w-4 h-4 text-[var(--muted)]" /> : <Bot className="w-4 h-4 text-violet-400" />}
                </div>
                <div className={`max-w-[80%] rounded-lg px-4 py-3 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-[var(--primary)] text-white"
                    : "bg-[var(--surface-elevated)] text-[var(--text)] border border-[var(--border)]"
                }`}>
                  <RenderContent text={msg.content} onProbe={handleProbe} probing={probing} />
                </div>
              </div>
            )}

            {/* Config card with action buttons */}
            {msg.config && (
              <ConfigCard
                config={msg.config}
                onTest={() => handleTest(msg.config!)}
                onDeploy={() => handleDeploy(msg.config!)}
                testing={testing}
                deploying={deploying}
              />
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-violet-900/30 border border-violet-800/40 flex items-center justify-center">
              <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />
            </div>
            <div className="bg-[var(--surface-elevated)] border border-[var(--border)] rounded-lg px-4 py-3 text-sm text-[var(--muted)]">
              Thinking...
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Pending config actions bar */}
      {pendingConfig && (
        <div className="border-t border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-2.5 md:px-6 flex items-center gap-3 shrink-0">
          <Zap className="w-4 h-4 text-amber-400" />
          <span className="text-sm text-[var(--text)] flex-1 truncate">Config ready: <strong>{pendingConfig.name}</strong></span>
          <button onClick={() => handleTest(pendingConfig)} disabled={testing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-teal-900/30 text-teal-400 border border-teal-800/40 hover:bg-teal-900/50 disabled:opacity-50 transition-colors">
            {testing ? <Loader2 className="w-3 h-3 animate-spin" /> : <TestTube className="w-3 h-3" />} Test
          </button>
          <button onClick={() => handleDeploy(pendingConfig)} disabled={deploying}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-violet-900/30 text-violet-400 border border-violet-800/40 hover:bg-violet-900/50 disabled:opacity-50 transition-colors">
            {deploying ? <Loader2 className="w-3 h-3 animate-spin" /> : <Rocket className="w-3 h-3" />} Deploy
          </button>
        </div>
      )}

      {/* Input */}
      <div className="border-t border-[var(--border)] px-4 py-3 md:px-6 shrink-0">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder="Describe the source you want to add..."
            rows={1}
            className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)] placeholder:text-slate-500 outline-none focus:border-violet-500 resize-none max-h-32"
            style={{ minHeight: "42px" }}
          />
          <button onClick={sendMessage} disabled={loading || !input.trim()}
            className="flex items-center justify-center w-10 h-10 rounded-lg bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-50 transition shrink-0">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

// Sub-components

function RenderContent({ text, onProbe, probing }: { text: string; onProbe: (url: string) => void; probing: boolean }) {
  // Detect URLs in text and add probe buttons
  const urlRegex = /(https?:\/\/[^\s)]+)/g;
  const parts = text.split(urlRegex);

  return (
    <div className="whitespace-pre-wrap">
      {parts.map((part, i) => {
        if (urlRegex.test(part)) {
          urlRegex.lastIndex = 0;
          return (
            <span key={i}>
              <span className="text-violet-400 break-all">{part}</span>
              <button
                onClick={() => onProbe(part)}
                disabled={probing}
                className="inline-flex items-center gap-1 ml-1 px-1.5 py-0.5 rounded text-[10px] bg-violet-900/30 text-violet-400 border border-violet-800/40 hover:bg-violet-900/50 disabled:opacity-50"
              >
                {probing ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Globe className="w-2.5 h-2.5" />}
                Probe
              </button>
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </div>
  );
}

function ConfigCard({ config, onTest, onDeploy, testing, deploying }: {
  config: SourceConfig;
  onTest: () => void;
  onDeploy: () => void;
  testing: boolean;
  deploying: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="ml-11 rounded-lg border border-violet-800/40 bg-violet-900/10 p-4 my-2">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-semibold text-[var(--text)]">{config.name}</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-violet-900/30 text-violet-400 border border-violet-800/30">{config.type}</span>
        </div>
        <button onClick={() => setExpanded(!expanded)} className="text-[var(--muted)] hover:text-[var(--text)]">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>
      <p className="text-xs text-[var(--muted)] mb-3">{config.url}</p>

      {expanded && (
        <pre className="text-xs text-[var(--muted)] bg-black/30 rounded p-3 mb-3 overflow-x-auto max-h-64">
          {JSON.stringify(config, null, 2)}
        </pre>
      )}

      <div className="flex gap-2">
        <button onClick={onTest} disabled={testing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-teal-900/30 text-teal-400 border border-teal-800/40 hover:bg-teal-900/50 disabled:opacity-50 transition-colors">
          {testing ? <Loader2 className="w-3 h-3 animate-spin" /> : <TestTube className="w-3 h-3" />} Test Config
        </button>
        <button onClick={onDeploy} disabled={deploying}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-violet-900/30 text-violet-400 border border-violet-800/40 hover:bg-violet-900/50 disabled:opacity-50 transition-colors">
          {deploying ? <Loader2 className="w-3 h-3 animate-spin" /> : <Rocket className="w-3 h-3" />} Deploy Source
        </button>
      </div>
    </div>
  );
}

function TestResultCard({ result }: { result: TestResult }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`ml-11 rounded-lg border p-4 my-2 ${result.success ? "border-teal-800/40 bg-teal-900/10" : "border-red-800/40 bg-red-900/10"}`}>
      <div className="flex items-center gap-2 mb-2">
        {result.success ? <CheckCircle className="w-4 h-4 text-teal-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
        <span className={`text-sm font-semibold ${result.success ? "text-teal-400" : "text-red-400"}`}>
          {result.success ? `Test passed — ${result.eventCount} events found` : "Test failed"}
        </span>
      </div>
      {result.error && <p className="text-xs text-red-400 mb-2">{result.error}</p>}
      {result.events.length > 0 && (
        <>
          <button onClick={() => setExpanded(!expanded)} className="text-xs text-[var(--muted)] hover:text-[var(--text)] mb-2 flex items-center gap-1">
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {expanded ? "Hide" : "Show"} sample events
          </button>
          {expanded && (
            <div className="space-y-2">
              {result.events.slice(0, 5).map((evt, i) => (
                <div key={i} className="bg-black/20 rounded p-2.5 text-xs">
                  <p className="font-medium text-[var(--text)]">{evt.title}</p>
                  <p className="text-[var(--muted)] mt-0.5 line-clamp-2">{evt.description}</p>
                  <div className="flex gap-3 mt-1 text-[var(--muted)]">
                    {evt.startTime && <span>{new Date(evt.startTime * 1000).toLocaleDateString()}</span>}
                    {evt.location && <span>{evt.location}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ProbeResultCard({ result }: { result: { status: number; contentType: string; structure?: unknown; sample?: string; error?: string } }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="ml-11 rounded-lg border border-blue-800/40 bg-blue-900/10 p-4 my-2">
      <div className="flex items-center gap-2 mb-2">
        <Globe className="w-4 h-4 text-blue-400" />
        <span className="text-sm font-semibold text-blue-400">
          Probe result — {result.contentType} (HTTP {result.status})
        </span>
      </div>
      {result.error && <p className="text-xs text-red-400 mb-2">{result.error}</p>}
      {result.structure != null && (
        <>
          <button onClick={() => setExpanded(!expanded)} className="text-xs text-[var(--muted)] hover:text-[var(--text)] flex items-center gap-1">
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {expanded ? "Hide" : "Show"} response structure
          </button>
          {expanded && (
            <pre className="text-xs text-[var(--muted)] bg-black/30 rounded p-3 mt-2 overflow-x-auto max-h-64">
              {JSON.stringify(result.structure, null, 2)}
            </pre>
          )}
        </>
      )}
    </div>
  );
}

function DeployResultCard({ result }: { result: { success: boolean; id?: string; error?: string; github?: { committed: boolean; url?: string; error?: string } } }) {
  return (
    <div className={`ml-11 rounded-lg border p-4 my-2 ${result.success ? "border-teal-800/40 bg-teal-900/10" : "border-red-800/40 bg-red-900/10"}`}>
      <div className="flex items-center gap-2">
        {result.success ? <Rocket className="w-4 h-4 text-teal-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
        <span className={`text-sm font-semibold ${result.success ? "text-teal-400" : "text-red-400"}`}>
          {result.success ? `Source deployed! (${result.id})` : `Deploy failed: ${result.error}`}
        </span>
      </div>
      {result.success && (
        <p className="text-xs text-[var(--muted)] mt-1">Registered in Firestore — will appear on the Sources page.</p>
      )}
      {result.github && (
        <div className={`mt-2 flex items-center gap-2 text-xs rounded px-2 py-1.5 ${result.github.committed ? "bg-teal-900/20 text-teal-400" : "bg-yellow-900/20 text-yellow-400"}`}>
          {result.github.committed ? (
            <>
              <CheckCircle className="w-3 h-3 shrink-0" />
              <span>Committed to GitHub — </span>
              {result.github.url && (
                <a href={result.github.url} target="_blank" rel="noopener noreferrer" className="underline hover:opacity-80 truncate">
                  view file
                </a>
              )}
            </>
          ) : (
            <>
              <XCircle className="w-3 h-3 shrink-0" />
              <span>GitHub commit skipped: {result.github.error}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
