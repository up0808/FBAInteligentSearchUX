export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

export interface Message {
  id: string;
  content: string;
  isUser: boolean;
  type: "user" | "assistant" | "system";
  isLoading?: boolean;
  searchInfo?: SearchInfo;
  sources?: string[];
  error?: string;
  createdAt: number;
}

export interface SearchInfo {
  stages: string[];
  query: string;
  urls: string[];
}

export interface StreamEvent {
  type: "content" | "checkpoint" | "search_start" | "search_results" | "search_error" | "end";
  data?: any;
}

const STORAGE_KEY = "chat-sessions";

export function getChatSessions(): ChatSession[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function saveChatSessions(sessions: ChatSession[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch (error) {
    console.error("Failed to save chat sessions:", error);
  }
}

export function createNewSession(): ChatSession {
  return {
    id: Date.now().toString(),
    title: "New Chat",
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function updateSessionTitle(sessionId: string, title: string): void {
  const sessions = getChatSessions();
  const session = sessions.find(s => s.id === sessionId);
  if (session) {
    session.title = title;
    session.updatedAt = Date.now();
    saveChatSessions(sessions);
  }
}

export function addMessageToSession(sessionId: string, message: Message): void {
  const sessions = getChatSessions();
  const session = sessions.find(s => s.id === sessionId);
  if (session) {
    session.messages.push(message);
    session.updatedAt = Date.now();
    
    // Auto-generate title from first user message if still "New Chat"
    if (session.title === "New Chat" && message.isUser && message.content.trim()) {
      session.title = message.content.slice(0, 50) + (message.content.length > 50 ? "..." : "");
    }
    
    saveChatSessions(sessions);
  }
}

export function updateSessionMessage(sessionId: string, messageId: string, updates: Partial<Message>): void {
  const sessions = getChatSessions();
  const session = sessions.find(s => s.id === sessionId);
  if (session) {
    const message = session.messages.find(m => m.id === messageId);
    if (message) {
      Object.assign(message, updates);
      session.updatedAt = Date.now();
      saveChatSessions(sessions);
    }
  }
}

export function deleteSession(sessionId: string): void {
  const sessions = getChatSessions();
  const filtered = sessions.filter(s => s.id !== sessionId);
  saveChatSessions(filtered);
}

export function clearAllSessions(): void {
  saveChatSessions([]);
}
