'use client';

import { useChat } from '@ai-sdk/react';
import { useEffect, useRef, useState } from 'react';
import { User, Bot, Loader2, Send, AlertCircle } from 'lucide-react';
import BotMessage from '@/components/bot-message';
import { nanoid } from 'nanoid';

export default function IntelligentSearchChat() {
  const [chatId] = useState(() => nanoid());
  const [input, setInput] = useState('');

  // Determine API endpoint based on environment
  const getApiEndpoint = () => {
    if (typeof window === 'undefined') return '/api/chat';
    
    const host = window.location.host;
    
    // If on chat.search subdomain, use api.search subdomain
    if (host.startsWith('chat.search.')) {
      return `https://api.search.${host.replace('chat.search.', '')}/api/chat`;
    }
    
    // Default: relative path (for localhost and main domain)
    return '/api/chat';
  };

  const {
    messages,
    sendMessage,
    status,
    error,
    regenerate,
  } = useChat({
    id: chatId,
    api: getApiEndpoint(),
    body: {
      id: chatId,
    },
    credentials: 'include', // Important for cross-subdomain cookies
  });

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll effect
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || status !== 'ready') return;

    sendMessage({ content: input });
    setInput('');
  };

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      {/* Header */}
      <div className="px-6 py-4 bg-white border-b border-gray-200 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Bot className="w-7 h-7 text-indigo-600" />
          FBA Intelligent Search Chat
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          Ask questions about FBA processes, data, and insights.
        </p>
      </div>

      {/* Chat Area */}
      <div className="flex-1 p-4 overflow-y-auto space-y-4">
        {/* Initial Welcome Message */}
        {messages.length === 0 && status === 'ready' && (
          <div className="text-center py-10 text-gray-500">
            <Bot className="w-12 h-12 mx-auto text-indigo-400 mb-3" />
            <p className="text-lg font-semibold text-gray-700">
              How can I assist you with FBA data today?
            </p>
            <p className="text-sm mt-2 text-gray-500">
              Start by asking a question, like &quot;What are the sales trends for the
              last quarter?&quot;
            </p>
            
            {/* Example prompts */}
            <div className="mt-6 max-w-2xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                'Search for FBA best practices',
                'Show me images of warehouse layouts',
                'Calculate ROI for a $1000 investment at 15% return',
                'What\'s the weather in Seattle?'
              ].map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => setInput(prompt)}
                  className="text-left px-4 py-3 bg-white border border-gray-200 rounded-lg hover:border-indigo-300 hover:shadow-md transition-all text-sm text-gray-700"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${
              message.role === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            {message.role === 'user' ? (
              <div className="flex items-start gap-3 p-4 bg-white rounded-lg shadow-sm max-w-2xl border border-gray-200">
                <div className="text-gray-800 text-sm font-medium whitespace-pre-wrap flex-1">
                  {typeof message.content === 'string' 
                    ? message.content 
                    : message.parts?.map((part, index) => {
                        if (part.type === 'text') {
                          return <span key={index}>{part.text}</span>;
                        }
                        return null;
                      })
                  }
                </div>
                <User className="w-6 h-6 text-gray-500 shrink-0" />
              </div>
            ) : (
              <BotMessage message={message} />
            )}
          </div>
        ))}

        {/* Loading Indicator */}
        {(status === 'submitted' || status === 'streaming') && (
          <div className="flex justify-start">
            <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg shadow-sm border border-gray-200">
              <Loader2 className="w-6 h-6 text-indigo-500 shrink-0 animate-spin" />
              <p className="text-gray-700 text-sm font-medium">
                AI is generating response...
              </p>
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="flex justify-start">
            <div className="flex items-start gap-3 p-4 bg-red-50 rounded-lg shadow-sm max-w-2xl border border-red-200">
              <AlertCircle className="w-6 h-6 text-red-500 shrink-0" />
              <div>
                <p className="text-red-700 text-sm font-medium">
                  An error occurred: {error.message}
                </p>
                <button
                  onClick={() => regenerate()}
                  className="mt-2 text-sm text-red-600 hover:text-red-800 underline font-medium"
                >
                  Try again
                </button>
              </div>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 border-t bg-white shadow-lg">
        <form onSubmit={handleSubmit} className="flex space-x-3 max-w-4xl mx-auto">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Send a message..."
            className="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition duration-150 text-gray-900 placeholder-gray-400"
            disabled={status !== 'ready'}
          />
          <button
            type="submit"
            disabled={!input.trim() || status !== 'ready'}
            className="px-5 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed transition duration-150 shadow-md hover:shadow-lg flex items-center gap-2"
          >
            <Send className="w-5 h-5" />
            <span className="font-medium">Send</span>
          </button>
        </form>
        
        {/* Status indicator */}
        {status !== 'ready' && (
          <p className="text-xs text-gray-500 text-center mt-2">
            {status === 'streaming' ? 'Receiving response...' : 'Processing...'}
          </p>
        )}
      </div>
    </div>
  );
}