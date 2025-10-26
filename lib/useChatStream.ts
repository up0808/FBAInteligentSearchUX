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
  const [checkpointId, setCheckpointId] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
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
      setCheckpointId(null);
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
      const url = new URL(`/api/chat`, window.location.origin);
      url.searchParams.append('message', content);
      if (checkpointId) {
        url.searchParams.append('checkpoint_id', checkpointId);
      }

      if (debug) {
        console.log('[Fetch URL]', url.toString());
      }

      const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`Network error: ${response.status} ${response.statusText}`);
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
      let hasReceivedContent = false;

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

              if (debug) {
                console.log('[SSE Event]', event);
              }

              switch (event.type) {
                case "checkpoint":
                  const newCheckpointId = event.checkpoint_id;
                  if (newCheckpointId) {
                    setCheckpointId(newCheckpointId);
                    if (debug) console.log("[Checkpoint]", newCheckpointId);
                  }
                  break;

                case "content":
                  const textContent = event.content ?? "";
                  if (textContent.trim()) {
                    contentBuffer += textContent;
                    hasReceivedContent = true;
                    
                    if (debug) console.log("[Content Chunk]", textContent);
                  }
                  break;

                case "search_start":
                  searchInfo.stages = [...new Set([...searchInfo.stages, "searching"])];
                  searchInfo.query = event.query || searchInfo.query;
                  
                  if (debug) console.log("[Search Start]", searchInfo.query);
                  
                  // Update immediately to show searching state
                  updateSessionMessage(sessionId, aiMessageId, {
                    content: contentBuffer || "Searching...",
                    sources: sourcesBuffer,
                    searchInfo: { ...searchInfo }
                  });
                  setSessions(getChatSessions());
                  break;

                case "search_results":
                  searchInfo.stages = [...new Set([...searchInfo.stages, "reading"])];
                  searchInfo.urls = event.urls || searchInfo.urls;
                  sourcesBuffer = searchInfo.urls;
                  
                  if (debug) console.log("[Search Results]", searchInfo.urls);
                  
                  // Update to show found sources
                  updateSessionMessage(sessionId, aiMessageId, {
                    content: contentBuffer || "Reading sources...",
                    sources: sourcesBuffer,
                    searchInfo: { ...searchInfo }
                  });
                  setSessions(getChatSessions());
                  break;

                case "end":
                  searchInfo.stages = [...new Set([...searchInfo.stages, "writing"])];
                  
                  if (debug) console.log("[Stream End]", { 
                    hasContent: hasReceivedContent, 
                    contentLength: contentBuffer.length,
                    hasSearch: searchInfo.query !== ''
                  });
                  
                  // If we had search but no content, show a message
                  if (searchInfo.query && !hasReceivedContent) {
                    contentBuffer = "I searched for information but couldn't generate a response. Please try rephrasing your question.";
                  }
                  break;

                case "error":
                  console.error("[Stream Error]", event.error);
                  throw new Error(event.error || "Unknown streaming error");

                default:
                  if (debug) console.log("[Unknown Event]", event.type);
                  break;
              }

              // Update the AI message after each event
              if (event.type !== "checkpoint" && event.type !== "end") {
                updateSessionMessage(sessionId, aiMessageId, {
                  content: contentBuffer || (searchInfo.query ? "Processing..." : ""),
                  sources: sourcesBuffer,
                  searchInfo: { ...searchInfo }
                });
                setSessions(getChatSessions());
              }

            } catch (parseError) {
              if (debug) {
                console.warn("[Parse Error]", jsonPart, parseError);
              }
            }
          }
        }
      }

      // Mark as complete
      updateSessionMessage(sessionId, aiMessageId, {
        content: contentBuffer || "No response generated.",
        sources: sourcesBuffer,
        searchInfo: { ...searchInfo },
        isLoading: false
      });
      setSessions(getChatSessions());

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        if (debug) console.log("[Request Aborted]");
        return;
      }

      console.error("[Streaming Error]", error);

      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      updateSessionMessage(sessionId, aiMessageId, {
        content: "",
        error: `Sorry, I encountered an error: ${errorMessage}. Please try again.`,
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
    setCheckpointId(null);
  }, [sessions, onSessionChange]);

  const selectSession = useCallback((sessionId: string) => {
    onSessionChange(sessionId);
    setCheckpointId(null);
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