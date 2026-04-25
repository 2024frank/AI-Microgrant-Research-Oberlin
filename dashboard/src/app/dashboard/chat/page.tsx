"use client";

import { useEffect, useRef, useState } from "react";
import { collection, onSnapshot, addDoc, orderBy, query, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";

interface ChatMessage {
  id: string;
  user: string;
  message: string;
  createdAt: string;
}

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function avatar(email: string) {
  return email[0].toUpperCase();
}

// Deterministic color per email so each user always gets the same color
const AVATAR_COLORS = [
  "bg-blue-500/30 text-blue-300",
  "bg-purple-500/30 text-purple-300",
  "bg-emerald-500/30 text-emerald-300",
  "bg-amber-500/30 text-amber-300",
  "bg-rose-500/30 text-rose-300",
  "bg-teal-500/30 text-teal-300",
];
function userColor(email: string) {
  let hash = 0;
  for (const ch of email) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffff;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export default function ChatPage() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query(
      collection(db, "chat_messages"),
      orderBy("createdAt", "asc"),
      limit(200),
    );
    const unsub = onSnapshot(q, snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as ChatMessage)));
    });
    return unsub;
  }, []);

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const msg = input.trim();
    if (!msg || !user?.email) return;
    setSending(true);
    setInput("");
    try {
      await addDoc(collection(db, "chat_messages"), {
        user: user.email,
        message: msg,
        createdAt: new Date().toISOString(),
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col h-screen max-h-screen">
      {/* Header */}
      <div className="shrink-0 px-8 py-5 border-b border-white/[0.07] flex items-center justify-between">
        <div>
          <h1 className="text-white text-2xl font-bold tracking-tight">Team Chat</h1>
          <p className="text-zinc-500 text-sm mt-0.5">Shared channel for all dashboard users.</p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-emerald-400 text-xs font-medium bg-emerald-400/10 border border-emerald-400/20 rounded-full px-3 py-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Live
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <p className="text-zinc-500 text-sm">No messages yet.</p>
            <p className="text-zinc-700 text-xs mt-1">Start the conversation below.</p>
          </div>
        )}

        {messages.map((msg, i) => {
          const isMe = msg.user === user?.email;
          const prevMsg = messages[i - 1];
          const sameSenderAsPrev = prevMsg?.user === msg.user;

          return (
            <div key={msg.id} className={`flex items-end gap-3 ${isMe ? "flex-row-reverse" : ""}`}>
              {/* Avatar — only show when sender changes */}
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                sameSenderAsPrev ? "invisible" : userColor(msg.user)
              }`}>
                {avatar(msg.user)}
              </div>

              <div className={`max-w-[70%] ${isMe ? "items-end" : "items-start"} flex flex-col gap-0.5`}>
                {!sameSenderAsPrev && (
                  <p className={`text-[10px] text-zinc-600 mb-0.5 ${isMe ? "text-right" : ""}`}>
                    {isMe ? "You" : msg.user}
                  </p>
                )}
                <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  isMe
                    ? "bg-[#C8102E] text-white rounded-br-sm"
                    : "bg-white/[0.06] text-zinc-200 rounded-bl-sm"
                }`}>
                  {msg.message}
                </div>
                <p className="text-[10px] text-zinc-700">{timeAgo(msg.createdAt)}</p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 px-8 py-5 border-t border-white/[0.07]">
        <form onSubmit={send} className="flex gap-3">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Type a message…"
            disabled={sending}
            className="flex-1 bg-white/[0.05] border border-white/[0.08] rounded-xl px-4 py-3 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-white/20 transition"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="bg-[#C8102E] hover:bg-[#a50d26] disabled:opacity-40 text-white text-sm font-semibold px-5 py-3 rounded-xl transition shrink-0"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
