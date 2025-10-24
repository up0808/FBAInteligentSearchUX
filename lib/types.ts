export type Stage = "searching" | "reading" | "writing";

export interface SearchInfo {
  stages: Stage[];
  query: string;
  urls: string[];
}

export interface Message {
  id: number;
  content: string;
  isUser: boolean;
  type: "user" | "assistant" | "system";
  isLoading?: boolean;
  searchInfo?: SearchInfo;
  createdAt?: number;
}

export interface StreamEventContent {
  type: "content";
  data: string;
}

export interface StreamEventCheckpoint {
  type: "checkpoint";
  data: { checkpoint_id: string };
}

export interface StreamEventSearchStart {
  type: "search_start";
  data: { query: string };
}

export interface StreamEventSearchResults {
  type: "search_results";
  data: { urls: string[] };
}

export interface StreamEventSearchError {
  type: "search_error";
  data: { error: string };
}

export interface StreamEventEnd {
  type: "end";
}

export type StreamEvent =
  | StreamEventContent
  | StreamEventCheckpoint
  | StreamEventSearchStart
  | StreamEventSearchResults
  | StreamEventSearchError
  | StreamEventEnd;


