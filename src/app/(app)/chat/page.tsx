"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Loader2, Sparkles, Mail, Users } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import {
  sendChatMessage,
  subscribeToChatMessages,
  extractMentions,
  type ChatMessage,
} from "@/lib/chatClient";
import { listAuthorizedUsers, type AuthorizedUser } from "@/lib/users";

export default function ChatPage() {
  const { user, authorizedUser, role } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [users, setUsers] = useState<AuthorizedUser[]>([]);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Broadcast state (super_admin only)
  const isSuperAdmin = role === "super_admin";
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [broadcastSubject, setBroadcastSubject] = useState("");
  const [broadcastBody, setBroadcastBody] = useState("");
  const [broadcastPrompt, setBroadcastPrompt] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeToChatMessages(100, setMessages);
    listAuthorizedUsers().then(setUsers).catch(() => {});
    return unsub;
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    if (!text.trim() || !user || !authorizedUser) return;
    setSending(true);
    const mentions = extractMentions(text);
    await sendChatMessage({
      text: text.trim(),
      mentions,
    });
    setText("");
    setSending(false);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === "@") {
      setShowMentions(true);
      setMentionFilter("");
    }
    if (showMentions && e.key === "Escape") setShowMentions(false);
  }

  function insertMention(email: string) {
    setText((t) => {
      const atIdx = t.lastIndexOf("@");
      if (atIdx >= 0) return t.slice(0, atIdx) + `@${email} `;
      return t + `@${email} `;
    });
    setShowMentions(false);
    inputRef.current?.focus();
  }

  function handleInputChange(val: string) {
    setText(val);
    const atIdx = val.lastIndexOf("@");
    if (atIdx >= 0 && !val.slice(atIdx).includes(" ")) {
      setShowMentions(true);
      setMentionFilter(val.slice(atIdx + 1).toLowerCase());
    } else {
      setShowMentions(false);
    }
  }

  async function handleAIDraft() {
    if (!broadcastPrompt.trim()) return;
    setDrafting(true);
    try {
      const { getClientJsonAuthHeaders } = await import("@/lib/clientAuthHeaders");
      const res = await fetch("/api/broadcast/draft", {
        method: "POST",
        headers: await getClientJsonAuthHeaders(),
        body: JSON.stringify({ prompt: broadcastPrompt }),
      });
      const data = await res.json();
      if (data.subject) setBroadcastSubject(data.subject);
      if (data.body) setBroadcastBody(data.body);
    } catch { /* ignore */ }
    setDrafting(false);
  }

  async function handleBroadcastSend() {
    if (!broadcastSubject.trim() || !broadcastBody.trim()) return;
    setBroadcastSending(true);
    setBroadcastResult(null);
    try {
      const { getClientJsonAuthHeaders } = await import("@/lib/clientAuthHeaders");
      const res = await fetch("/api/broadcast/send", {
        method: "POST",
        headers: await getClientJsonAuthHeaders(),
        body: JSON.stringify({
          subject: broadcastSubject,
          body: broadcastBody,
          senderName: authorizedUser?.displayName ?? user?.email ?? "Admin",
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setBroadcastResult(`Sent to ${data.sentTo} team member${data.sentTo !== 1 ? "s" : ""}`);
        setBroadcastSubject("");
        setBroadcastBody("");
        setBroadcastPrompt("");
      } else {
        setBroadcastResult(data.error ?? "Failed to send");
      }
    } catch {
      setBroadcastResult("Failed to send");
    }
    setBroadcastSending(false);
  }

  const filteredUsers = users.filter(
    (u) =>
      u.email !== user?.email &&
      (u.email.toLowerCase().includes(mentionFilter) ||
        (u.displayName ?? "").toLowerCase().includes(mentionFilter))
  );

  function formatTime(ts: ChatMessage["createdAt"]) {
    if (ts == null) return "";
    const d = new Date(ts);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    return d.toLocaleDateString([], { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  function renderText(msg: string) {
    return msg.split(/(@[\w.+-]+@[\w.-]+)/g).map((part, i) =>
      part.startsWith("@") ? (
        <span key={i} className="text-[var(--primary)] font-medium">{part}</span>
      ) : (
        <span key={i}>{part}</span>
      )
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] md:h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3 md:px-6 shrink-0">
        <div>
          <h1 className="font-[var(--font-public-sans)] text-xl font-bold text-[var(--text)]">Team Chat</h1>
          <p className="text-xs text-[var(--muted)]">{users.length} team members · @mention to notify via email</p>
        </div>
        {isSuperAdmin && (
          <button
            onClick={() => setShowBroadcast((v) => !v)}
            className="flex items-center gap-2 px-3 py-2 rounded-md border border-[var(--border)] text-sm text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-high)] transition-colors"
          >
            <Mail className="w-4 h-4" />
            Broadcast
          </button>
        )}
      </div>

      {/* Broadcast panel (super_admin only) */}
      {showBroadcast && isSuperAdmin && (
        <div className="border-b border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-4 md:px-6 shrink-0">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-[var(--primary)]" />
            <h3 className="text-sm font-semibold text-[var(--text)]">Send to all team members</h3>
          </div>

          {/* AI draft */}
          <div className="flex gap-2 mb-3">
            <input
              value={broadcastPrompt}
              onChange={(e) => setBroadcastPrompt(e.target.value)}
              placeholder="Tell AI what to write… e.g. 'announce the new duplicate detection feature'"
              className="flex-1 rounded border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-slate-500 outline-none focus:border-[var(--primary)]"
              onKeyDown={(e) => e.key === "Enter" && handleAIDraft()}
            />
            <button
              onClick={handleAIDraft}
              disabled={drafting || !broadcastPrompt.trim()}
              className="flex items-center gap-1.5 px-3 py-2 rounded border border-violet-800/50 bg-violet-900/20 text-violet-400 text-sm font-medium hover:bg-violet-900/40 disabled:opacity-50 transition-colors"
            >
              {drafting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              AI Draft
            </button>
          </div>

          <input
            value={broadcastSubject}
            onChange={(e) => setBroadcastSubject(e.target.value)}
            placeholder="Subject line"
            className="w-full rounded border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-slate-500 outline-none focus:border-[var(--primary)] mb-2"
          />
          <textarea
            value={broadcastBody}
            onChange={(e) => setBroadcastBody(e.target.value)}
            placeholder="Email body…"
            rows={5}
            className="w-full rounded border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-slate-500 outline-none focus:border-[var(--primary)] resize-none mb-2"
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-[var(--muted)]">
              {broadcastResult ? (
                <span className={broadcastResult.startsWith("Sent") ? "text-teal-400" : "text-red-400"}>{broadcastResult}</span>
              ) : (
                `Will send to ${users.filter((u) => u.status === "active").length} active users`
              )}
            </p>
            <button
              onClick={handleBroadcastSend}
              disabled={broadcastSending || !broadcastSubject.trim() || !broadcastBody.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {broadcastSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Send to All
            </button>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 md:px-6 space-y-1">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-[var(--muted)]">
            <p className="text-sm">No messages yet. Start the conversation!</p>
          </div>
        )}
        {messages.map((msg, i) => {
          const isMe = msg.senderEmail === user?.email;
          const showAvatar = i === 0 || messages[i - 1].senderEmail !== msg.senderEmail;
          return (
            <div key={msg.id} className={`flex gap-2.5 ${isMe ? "flex-row-reverse" : ""}`}>
              {showAvatar ? (
                <div className="w-8 h-8 rounded-full bg-[var(--surface-high)] border border-[var(--border)] flex items-center justify-center text-xs font-semibold text-[var(--muted)] shrink-0 overflow-hidden">
                  {msg.senderPhoto ? (
                    <img src={msg.senderPhoto} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    msg.senderName.charAt(0).toUpperCase()
                  )}
                </div>
              ) : (
                <div className="w-8 shrink-0" />
              )}
              <div className={`max-w-[75%] flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                {showAvatar && (
                  <div className={`flex items-baseline gap-2 mb-0.5 ${isMe ? "flex-row-reverse" : ""}`}>
                    <span className="text-xs font-medium text-[var(--text)]">{isMe ? "You" : msg.senderName}</span>
                    <span className="text-[10px] text-[var(--muted)]">{formatTime(msg.createdAt)}</span>
                  </div>
                )}
                <div className={`rounded-lg px-3 py-2 text-sm leading-relaxed ${
                  isMe
                    ? "bg-[var(--primary)] text-white rounded-tr-sm"
                    : "bg-[var(--surface-elevated)] text-[var(--text)] border border-[var(--border)] rounded-tl-sm"
                }`}>
                  {renderText(msg.text)}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-[var(--border)] px-4 py-3 md:px-6 shrink-0 relative">
        {/* Mention dropdown */}
        {showMentions && filteredUsers.length > 0 && (
          <div className="absolute bottom-full left-4 right-4 md:left-6 md:right-auto md:w-80 mb-1 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] shadow-xl max-h-48 overflow-y-auto">
            {filteredUsers.slice(0, 8).map((u) => (
              <button
                key={u.email}
                onClick={() => insertMention(u.email)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-[var(--surface-high)] transition-colors"
              >
                <span className="w-6 h-6 rounded-full bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center text-[10px] font-semibold text-[var(--muted)]">
                  {(u.displayName ?? u.email).charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="text-[var(--text)] truncate">{u.displayName ?? u.email}</p>
                  <p className="text-xs text-[var(--muted)] truncate">{u.email}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message… (@ to mention)"
            rows={1}
            className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)] placeholder:text-slate-500 outline-none focus:border-[var(--primary)] resize-none max-h-32"
            style={{ minHeight: "42px" }}
          />
          <button
            onClick={handleSend}
            disabled={sending || !text.trim()}
            className="flex items-center justify-center w-10 h-10 rounded-lg bg-[var(--primary)] text-white hover:opacity-90 disabled:opacity-50 transition-opacity shrink-0"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
