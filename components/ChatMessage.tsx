"use client";
import React from "react";
import { Message } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";

type Props = {
  message: Message;
  onCopy?: (text: string) => void;
};

export default function ChatMessage({ message, onCopy }: Props) {
  const isUser = message.isUser;
  return (
    <div
      className={cn(
        "flex w-full",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      <div
        className={cn(
          "relative max-w-[80%] rounded-2xl px-4 py-3 text-sm shadow-sm whitespace-pre-wrap",
          isUser
            ? "bg-blue-600 text-white"
            : "bg-muted text-foreground/90 border border-border"
        )}
      >
        <div className="leading-6">
          {message.content || (message.isLoading ? "Thinking…" : "")}
        </div>
        {message.searchInfo && !isUser && (
          <div className="mt-2 text-xs text-foreground/70">
            <div className="mb-1">Stages: {message.searchInfo.stages.join(" → ")}</div>
            {message.searchInfo.query && <div>Query: {message.searchInfo.query}</div>}
            {message.searchInfo.urls?.length ? (
              <div className="mt-1 flex flex-wrap gap-2">
                {message.searchInfo.urls.map((u, i) => (
                  <a key={i} className="underline text-blue-300 hover:text-blue-200" href={u} target="_blank" rel="noreferrer">
                    Source {i + 1}
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        )}
        {!isUser && (
          <div className="mt-2 flex justify-end">
            <Button size="sm" variant="ghost" onClick={() => onCopy?.(message.content)}>
              Copy
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}


