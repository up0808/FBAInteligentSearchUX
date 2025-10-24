"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Message, SearchInfo, StreamEvent } from "@/lib/types";

type Options = {
  apiKey: string;
  checkpointId?: string | null;
  storageKey?: string; // prefix per-user
};

export function useChat({ apiKey, checkpointId = null, storageKey = "chat" }: Options) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentCheckpoint, setCurrentCheckpoint] = useState<string | null>(checkpointId);
  const ctrlRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  // load persisted messages
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setMessages(JSON.parse(raw));
    } catch {}
  }, [storageKey]);

  // persist messages
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(messages));
    } catch {}
  }, [messages, storageKey]);

  const scrollToEnd = useCallback(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(scrollToEnd, [messages, scrollToEnd]);

  const addUserMessage = useCallback((text: string) => {
    const m: Message = {
      id: Date.now(),
      content: text,
      isUser: true,
      type: "user",
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, m]);
  }, []);

  const send = useCallback(
    async (text: string) => {
      if (!text) return;
      addUserMessage(text);
      setIsStreaming(true);

      const botId = Date.now() + 1;
      const botBase: Message = {
        id: botId,
        content: "",
        isUser: false,
        type: "assistant",
        isLoading: true,
        createdAt: Date.now(),
        searchInfo: { stages: [], query: "", urls: [] },
      };
      setMessages((prev) => [...prev, botBase]);

      const url = `https://api.aisearch.fbadevishant.qzz.io/chat_stream/${encodeURIComponent(text)}`;
      const headers = { Authorization: `Bearer ${apiKey}` } as Record<string, string>;
      const controller = new AbortController();
      ctrlRef.current = controller;

      try {
        const res = await fetch(url, { method: "GET", headers, signal: controller.signal });
        if (!res.body) throw new Error("No stream body");
        const reader = res.body.getReader();
        const decoder = new TextDecoder();

        let contentBuffer = "";
        let searchInfo: SearchInfo = { stages: [], query: "", urls: [] };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunkText = decoder.decode(value, { stream: true });

          // API may send newline-delimited JSON events
          const parts = chunkText.split("\n").filter(Boolean);
          for (const part of parts) {
            try {
              const evt: StreamEvent | undefined = JSON.parse(part);
              if (!evt) continue;
              switch (evt.type) {
                case "content":
                  contentBuffer += (evt as any).data ?? "";
                  break;
                case "checkpoint":
                  setCurrentCheckpoint((evt as any).data?.checkpoint_id ?? null);
                  break;
                case "search_start":
                  searchInfo.stages = Array.from(new Set([...(searchInfo.stages || []), "searching"]));
                  searchInfo.query = (evt as any).data?.query ?? searchInfo.query;
                  break;
                case "search_results":
                  searchInfo.stages = Array.from(new Set([...(searchInfo.stages || []), "reading"]));
                  searchInfo.urls = (evt as any).data?.urls ?? searchInfo.urls;
                  break;
                case "search_error":
                  searchInfo.stages = Array.from(new Set([...(searchInfo.stages || []), "reading"]));
                  break;
                case "end":
                  searchInfo.stages = Array.from(new Set([...(searchInfo.stages || []), "writing"]));
                  break;
              }
            } catch {
              // If raw text chunks (not JSON), treat as content
              contentBuffer += part;
            }

            // update assistant message incrementally
            setMessages((prev) =>
              prev.map((m) =>
                m.id === botId
                  ? { ...m, content: contentBuffer, isLoading: true, searchInfo }
                  : m
              )
            );
          }
        }

        setMessages((prev) => prev.map((m) => (m.id === botId ? { ...m, isLoading: false } : m)));
      } catch (e) {
        setMessages((prev) => prev.map((m) => (m.id === botId ? { ...m, isLoading: false, content: m.content || "Error occurred." } : m)));
      } finally {
        setIsStreaming(false);
      }
    },
    [addUserMessage, apiKey]
  );

  const clear = useCallback(() => setMessages([]), []);

  return useMemo(
    () => ({ messages, isStreaming, send, clear, endRef, currentCheckpoint }),
    [messages, isStreaming, send, clear, currentCheckpoint]
  );
}


