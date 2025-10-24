"use client";
import React, { useEffect, useRef } from "react";
import { Message } from "@/lib/chatSessions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { 
  Copy, 
  ThumbsUp, 
  ThumbsDown, 
  Bot, 
  User,
  Loader2
} from "lucide-react";

interface ChatWindowProps {
  messages: Message[];
  isStreaming: boolean;
  endRef: React.RefObject<HTMLDivElement | null>;
}

export default function ChatWindow({ messages, isStreaming, endRef }: ChatWindowProps) {
  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.error("Failed to copy text:", error);
    }
  };

  const handleFeedback = (messageId: string, isPositive: boolean) => {
    // TODO: Implement feedback system
    console.log(`Feedback for message ${messageId}: ${isPositive ? "positive" : "negative"}`);
  };

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Bot className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Welcome to Intelligence Search
              </h3>
              <p className="text-gray-500">
                Start a conversation by typing a message below.
              </p>
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.isUser ? "justify-end" : "justify-start"}`}
            >
              <div className={`flex items-start space-x-3 max-w-[80%] ${message.isUser ? "flex-row-reverse space-x-reverse" : ""}`}>
                {/* Avatar */}
                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                  message.isUser 
                    ? "bg-blue-600 text-white" 
                    : "bg-gray-200 text-gray-600"
                }`}>
                  {message.isUser ? (
                    <User className="h-4 w-4" />
                  ) : (
                    <Bot className="h-4 w-4" />
                  )}
                </div>

                {/* Message Content */}
                <div className={`flex flex-col ${message.isUser ? "items-end" : "items-start"}`}>
                  <Card className={`p-4 ${
                    message.isUser 
                      ? "bg-blue-600 text-white border-blue-600" 
                      : "bg-white border-gray-200"
                  }`}>
                    <div className="whitespace-pre-wrap text-sm">
                      {message.error ? (
                        <span className="text-red-600">{message.error}</span>
                      ) : message.content ? (
                        message.content
                      ) : message.isLoading ? (
                        <div className="flex items-center space-x-2">
                          <div className="flex space-x-1">
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                          </div>
                          <span className="text-gray-500 text-xs">AI is thinking...</span>
                        </div>
                      ) : (
                        "No response received"
                      )}
                    </div>
                    
                    {/* Search Info for AI messages */}
                    {!message.isUser && message.searchInfo && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <div className="text-xs text-gray-500 mb-2">
                          <div className="flex items-center space-x-2">
                            <span>Stages:</span>
                            <div className="flex space-x-1">
                              {message.searchInfo.stages.map((stage, index) => (
                                <span
                                  key={index}
                                  className="px-2 py-1 bg-gray-100 text-gray-700 rounded-full text-xs"
                                >
                                  {stage}
                                </span>
                              ))}
                            </div>
                          </div>
                          {message.searchInfo.query && (
                            <div className="mt-1">
                              <span className="font-medium">Query:</span> {message.searchInfo.query}
                            </div>
                          )}
                          {message.searchInfo.urls && message.searchInfo.urls.length > 0 && (
                            <div className="mt-2">
                              <span className="font-medium">Sources:</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {message.searchInfo.urls.map((url, index) => (
                                  <a
                                    key={index}
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:text-blue-800 underline text-xs"
                                  >
                                    Source {index + 1}
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Sources links */}
                    {!message.isUser && message.sources && message.sources.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <div className="text-xs text-gray-600">
                          <span className="font-medium">Sources:</span>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {message.sources.map((url, i) => (
                              <a
                                key={i}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline text-blue-600 hover:text-blue-800"
                              >
                                {new URL(url).hostname}
                              </a>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Loading indicator */}
                    {message.isLoading && (
                      <div className="flex items-center space-x-2 mt-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-xs text-gray-500">Streaming response...</span>
                      </div>
                    )}
                  </Card>

                  {/* Message Actions */}
                  <div className={`flex items-center space-x-2 mt-2 ${message.isUser ? "flex-row-reverse space-x-reverse" : ""}`}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopy(message.content)}
                      className="h-8 w-8 p-0"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    
                    {!message.isUser && !message.isLoading && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleFeedback(message.id, true)}
                          className="h-8 w-8 p-0"
                        >
                          <ThumbsUp className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleFeedback(message.id, false)}
                          className="h-8 w-8 p-0"
                        >
                          <ThumbsDown className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
        
        {/* Auto-scroll anchor */}
        <div ref={endRef} />
      </div>
    </div>
  );
}
