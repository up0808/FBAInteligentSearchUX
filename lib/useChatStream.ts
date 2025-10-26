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
      setCheckpointId(null); // Reset checkpoint for new session
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
      // Build URL with checkpoint_id query parameter for conversation continuity
      const url = new URL(`/api/chat`, window.location.origin);
      url.searchParams.append('message', content);
      if (checkpointId) {
        url.searchParams.append('checkpoint_id', checkpointId);
      }

      if (debug) {
        console.log('Fetching:', url.toString());
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

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
          // Handle SSE format (lines starting with "data:")
          if (line.startsWith('data:')) {
            const jsonPart = line.substring(5).trim(); // Remove "data:" prefix
            if (!jsonPart) continue;

            try {
              const event: any = JSON.parse(jsonPart);

              if (debug) {
                console.log('SSE Event:', event);
              }

              switch (event.type) {
                case "checkpoint":
                  // Save checkpoint_id for conversation continuity
                  const newCheckpointId = event.checkpoint_id;
                  if (newCheckpointId) {
                    setCheckpointId(newCheckpointId);
                    if (debug) console.log("Checkpoint ID received:", newCheckpointId);
                  }
                  break;

                case "content":
                  // Handle content from LangGraph streaming
                  const textContent = event.content ?? "";
                  if (textContent.trim()) {
                    contentBuffer += textContent;
                  }
                  break;

                case "search_start":
                  // Search initiated by the agent
                  searchInfo.stages = [...new Set([...searchInfo.stages, "searching"])];
                  searchInfo.query = event.query || searchInfo.query;
                  if (debug) console.log("Search started:", searchInfo.query);
                  break;

                case "search_results":
                  // Search results returned from Google Custom Search
                  searchInfo.stages = [...new Set([...searchInfo.stages, "reading"])];
                  searchInfo.urls = event.urls || searchInfo.urls;
                  sourcesBuffer = searchInfo.urls;
                  if (debug) console.log("Search results:", searchInfo.urls);
                  break;

                case "end":
                  // Stream completed
                  searchInfo.stages = [...new Set([...searchInfo.stages, "writing"])];
                  if (debug) console.log("Stream ended");
                  break;

                case "error":
                  // Error occurred during streaming
                  console.error("Stream error from server:", event.error);
                  throw new Error(event.error || "Unknown streaming error");

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

            } catch (parseError) {
              // If JSON parsing fails, log but don't break the stream
              if (debug) {
                console.warn("Failed to parse SSE event:", jsonPart, parseError);
              }
            }
          } else {
            // Handle non-SSE format lines (fallback, shouldn't happen with proper SSE)
            try {
              const event: any = JSON.parse(line);

              if (event.type === "content") {
                const textContent = event.content ?? "";
                if (textContent.trim()) {
                  contentBuffer += textContent;
                }
              }

              // Update message
              updateSessionMessage(sessionId, aiMessageId, {
                content: contentBuffer,
                sources: sourcesBuffer,
                searchInfo: { ...searchInfo }
              });
              setSessions(getChatSessions());

            } catch {
              // If not valid JSON, ignore this line
              // Don't add raw text to content buffer
              if (debug) {
                console.log("Non-JSON line ignored:", line);
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
        if (debug) console.log("Request aborted");
        return; // Request was aborted, don't show error
      }

      console.error("Streaming error:", error);

      // Update with error message
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
    setCheckpointId(null); // Reset checkpoint for new chat
  }, [sessions, onSessionChange]);

  const selectSession = useCallback((sessionId: string) => {
    onSessionChange(sessionId);
    setCheckpointId(null); // Reset checkpoint when switching sessions
    // TODO: If you want to persist checkpoint per session, store it in the session object
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