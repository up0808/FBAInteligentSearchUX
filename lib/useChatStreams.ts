"use client";
import { useState, useCallback, useRef, useEffect } from "react";
import { 
  ChatSession, 
  Message, 
  StreamEvent, 
  createNewSession, 
  addMessageToSession, 
  updateSessionMessage,
  getChatSessions,
  saveChatSessions
} from "./chatSessions";

interface UseChatStreamOptions {
  apiKey: string;
  currentSessionId: string | null;
  onSessionChange: (sessionId: string) => void;
  debug?: boolean;
}

export function useChatStream({ apiKey, currentSessionId, onSessionChange, debug = false }: UseChatStreamOptions) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>(getChatSessions());
  const [checkpointId, setCheckpointId] = useState<string | null>(null); // Track checkpoint per session
  const endRef = useRef<HTMLDivElement>(null>();
  const abortControllerRef = useRef<AbortController | null>(null);

  const currentSession = sessions.find(s => s.id === currentSessionId);
  const messages = currentSession?.messages || [];

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const handleStorageChange = () => {
      setSessions(getChatSessions());
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isStreaming) return;

    let sessionId = currentSessionId;

    if (!sessionId) {
      const newSession = createNewSession();
      sessionId = newSession.id;
      setSessions(prev => [...prev, newSession]);
      saveChatSessions([...sessions, newSession]);
      onSessionChange(sessionId);
      setCheckpointId(null); // Reset checkpoint for new session
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      content,
      isUser: true,
      type: "user",
      createdAt: Date.now(),
    };

    addMessageToSession(sessionId, userMessage);
    setSessions(getChatSessions());

    const aiMessageId = (Date.now() + 1).toString();
    const aiMessage: Message = {
      id: aiMessageId,
      content: "",
      isUser: false,
      type: "assistant",
      isLoading: true,
      createdAt: Date.now(),
      searchInfo: {
        stages: [],
        query: "",
        urls: []
      }
    };

    addMessageToSession(sessionId, aiMessage);
    setSessions(getChatSessions());

    setIsStreaming(true);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      // Build URL with checkpoint_id for conversation continuity
      let url = `/api/chat/${encodeURIComponent(content)}`;
      if (checkpointId) {
        url += `?checkpoint_id=${encodeURIComponent(checkpointId)}`;
      }

      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error("Network error or invalid stream response");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let contentBuffer = "";
      let searchInfo = {
        stages: [] as string[],
        query: "",
        urls: [] as string[]
      };
      let sourcesBuffer: string[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
          if (line.startsWith('data:')) {
            const jsonPart = line.substring(5).trim();
            if (!jsonPart) continue;

            try {
              const event: any = JSON.parse(jsonPart);

              switch (event.type) {
                case "checkpoint":
                  // Save checkpoint_id for conversation continuity
                  const newCheckpointId = event.data?.checkpoint_id;
                  if (newCheckpointId) {
                    setCheckpointId(newCheckpointId);
                    if (debug) console.log("Checkpoint ID received:", newCheckpointId);
                  }
                  break;

                case "content":
                  const textContent = event.content ?? "";
                  if (textContent.trim()) {
                    contentBuffer += textContent;
                  }
                  break;

                case "search_start":
                  searchInfo.stages = [...new Set([...searchInfo.stages, "searching"])];
                  searchInfo.query = event.data?.query || searchInfo.query;
                  if (debug) console.log("Search started:", searchInfo.query);
                  break;

                case "search_results":
                  searchInfo.stages = [...new Set([...searchInfo.stages, "reading"])];
                  searchInfo.urls = event.data?.urls || searchInfo.urls;
                  sourcesBuffer = searchInfo.urls;
                  if (debug) console.log("Search results:", searchInfo.urls);
                  break;

                case "end":
                  searchInfo.stages = [...new Set([...searchInfo.stages, "writing"])];
                  if (debug) console.log("Stream ended");
                  break;

                case "error":
                  console.error("Stream error:", event.error);
                  break;

                default:
                  if (debug) console.log("Unknown event type:", event.type);
                  break;
              }

              // Update the AI message with current content and search info
              updateSessionMessage(sessionId, aiMessageId, {
                content: contentBuffer,
                sources: sourcesBuffer,
                searchInfo: { ...searchInfo }
              });
              setSessions(getChatSessions());

            } catch (error) {
              if (debug) {
                console.warn("Failed to parse streaming event:", jsonPart, error);
              }
            }
          }
        }
      }

      // Mark as complete
      updateSessionMessage(sessionId, aiMessageId, {
        isLoading: false
      });
      setSessions(getChatSessions());

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }

      console.error("Streaming error:", error);

      updateSessionMessage(sessionId, aiMessageId, {
        content: "",
        error: "Sorry, I encountered an error. Please try again.",
        isLoading: false
      });
      setSessions(getChatSessions());
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  }, [apiKey, currentSessionId, checkpointId, isStreaming, sessions, onSessionChange, debug]);

  const createNewChat = useCallback(() => {
    const newSession = createNewSession();
    setSessions(prev => [...prev, newSession]);
    saveChatSessions([...sessions, newSession]);
    onSessionChange(newSession.id);
    setCheckpointId(null); // Reset checkpoint for new chat
  }, [sessions, onSessionChange]);

  const selectSession = useCallback((sessionId: string) => {
    onSessionChange(sessionId);
    setCheckpointId(null); // Reset checkpoint when switching sessions
  }, [onSessionChange]);

  return {
    messages,
    isStreaming,
    sendMessage,
    createNewChat,
    selectSession,
    endRef,
    sessions
  };
}