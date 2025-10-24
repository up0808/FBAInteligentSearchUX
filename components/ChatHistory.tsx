"use client";
import React from "react";
import { Message } from "@/lib/types";
import ChatMessage from "./ChatMessage";

type Props = {
  messages: Message[];
  endRef: React.RefObject<HTMLDivElement>;
};

export default function ChatHistory({ messages, endRef }: Props) {
  const onCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {}
  };

  return (
    <div className="flex-1 overflow-y-auto space-y-3 p-3">
      {messages.map((m) => (
        <ChatMessage key={m.id} message={m} onCopy={onCopy} />
      ))}
      <div ref={endRef} />
    </div>
  );
}


