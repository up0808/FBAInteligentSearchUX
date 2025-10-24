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
  const endRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Get current session messages
  const currentSession = sessions.find(s => s.id === currentSessionId);
  const messages = currentSession?.messages || [];

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Refresh sessions when localStorage changes
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
    
    // Create new session if none exists
    if (!sessionId) {
      const newSession = createNewSession();
      sessionId = newSession.id;
      setSessions(prev => [...prev, newSession]);
      saveChatSessions([...sessions, newSession]);
      onSessionChange(sessionId);
    }

    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      content,
      isUser: true,
      type: "user",
      createdAt: Date.now(),
    };
    
    addMessageToSession(sessionId, userMessage);
    setSessions(getChatSessions());

    // Create AI message placeholder
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

    // Abort any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const url = `https://api.aisearch.fbadevishant.qzz.io/chat_stream/${encodeURIComponent(content)}`;
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
          // Skip lines that start with "data:" prefix (SSE format)
          if (line.startsWith('data:')) {
            const jsonPart = line.substring(5).trim(); // Remove "data:" prefix
            if (!jsonPart) continue;
            
            try {
              const event: StreamEvent | any = JSON.parse(jsonPart);
              
              switch (event.type) {
                case "content":
                  // Only add content if it's not empty
                  const content = event.data ?? event.content ?? "";
                  if (content.trim()) {
                    contentBuffer += content;
                  }
                  // If sources field provided on same event
                  if (Array.isArray(event.sources)) {
                    sourcesBuffer = event.sources as string[];
                  }
                  break;
                case "checkpoint":
                  // Handle checkpoint for conversation resumption (don't display)
                  break;
                case "search_start":
                  searchInfo.stages = [...new Set([...searchInfo.stages, "searching"])];
                  searchInfo.query = event.data?.query || searchInfo.query;
                  break;
                case "search_results":
                  searchInfo.stages = [...new Set([...searchInfo.stages, "reading"])];
                  searchInfo.urls = event.data?.urls || searchInfo.urls;
                  break;
                case "search_error":
                  searchInfo.stages = [...new Set([...searchInfo.stages, "reading"])];
                  break;
                case "end":
                  searchInfo.stages = [...new Set([...searchInfo.stages, "writing"])];
                  break;
                default:
                  // Ignore unknown event types
                  break;
              }
            } catch (error) {
              // If JSON parsing fails, ignore this line (don't add to content)
              if (debug) {
                console.warn("Failed to parse streaming event:", jsonPart, error);
              }
            }
          } else {
            // Handle non-SSE format lines
            try {
              const event: StreamEvent | any = JSON.parse(line);
              
              if (event.type === "content") {
                const content = event.data ?? event.content ?? "";
                if (content.trim()) {
                  contentBuffer += content;
                }
                if (Array.isArray(event.sources)) {
                  sourcesBuffer = event.sources as string[];
                }
              }
            } catch {
              // If not JSON and doesn't start with "data:", ignore it
              // Don't add raw text to content buffer
            }
          }

          // Update the AI message with current content and search info
          updateSessionMessage(sessionId, aiMessageId, {
            content: contentBuffer,
            sources: sourcesBuffer,
            searchInfo: { ...searchInfo }
          });
          setSessions(getChatSessions());
        }
      }

      // Mark as complete
      updateSessionMessage(sessionId, aiMessageId, {
        isLoading: false
      });
      setSessions(getChatSessions());

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return; // Request was aborted
      }
      
      console.error("Streaming error:", error);
      
      // Update with error message
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
  }, [apiKey, currentSessionId, isStreaming, sessions, onSessionChange]);

  const createNewChat = useCallback(() => {
    const newSession = createNewSession();
    setSessions(prev => [...prev, newSession]);
    saveChatSessions([...sessions, newSession]);
    onSessionChange(newSession.id);
  }, [sessions, onSessionChange]);

  const selectSession = useCallback((sessionId: string) => {
    onSessionChange(sessionId);
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
