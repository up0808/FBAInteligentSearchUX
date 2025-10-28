// app/page.tsx
'use client';

// Correct path and hooks, which are now correctly exposed by the provider in app/layout.tsx
import { useUIState, useActions } from 'ai/react';
import { AI } from './actions';
import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { User, Bot, Loader2, Send } from 'lucide-react';

/**
 * Main chat interface component.
 * Uses the Vercel AI SDK hooks for state management and actions.
 */
export default function IntelligentSearchChat() {
  // Client state managed by the Vercel AI SDK
  const [messages, setMessages] = useUIState<typeof AI>();
  
  // Server actions accessible on the client
  const { submitUserMessage } = useActions<typeof AI>();
  
  // Local state for the input field
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // Refs for auto-scrolling
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll effect
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  /**
   * Handles the submission of the user's message.
   */
  const handleSendMessage = async () => {
    if (input.trim() === '' || isLoading) return;

    const userMessageId = nanoid(); // Assuming nanoid is available from dependency list

    // 1. Display user message immediately
    const newUserMessage = {
      id: userMessageId,
      display: (
        <div className="flex items-start gap-3 p-3 bg-white rounded-lg shadow-sm self-end">
          <p className="text-gray-800 text-sm font-medium whitespace-pre-wrap">{input}</p>
          <User className="w-6 h-6 text-gray-500 shrink-0" />
        </div>
      ),
    };

    setMessages((currentMessages) => [...currentMessages, newUserMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // 2. Call the server action to get the AI response (which includes streaming UI)
      const aiResponse = await submitUserMessage(input);

      // 3. Append the AI's streamed UI to the chat
      setMessages((currentMessages) => [...currentMessages, aiResponse]);
    } catch (error) {
      console.error('Error submitting message:', error);
      // Display a static error message
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: nanoid(),
          display: (
            <div className="p-3 text-sm text-red-700 bg-red-100 rounded-lg">
              An error occurred while getting a response. Please try again.
            </div>
          ),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handles the Enter key press.
   */
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="flex flex-col h-screen max-w-4xl mx-auto bg-white shadow-xl">
      {/* Header */}
      <header className="p-4 border-b bg-indigo-600 text-white">
        <h1 className="text-xl font-bold">FBA Intelligent Search Chat</h1>
        <p className="text-sm opacity-80">Ask questions about FBA processes, data, and insights.</p>
      </header>

      {/* Chat Area */}
      <div className="flex-1 p-4 overflow-y-auto space-y-4">
        {/* Initial Welcome Message (Optional) */}
        {messages.length === 0 && (
          <div className="text-center py-10 text-gray-500">
            <Bot className="w-12 h-12 mx-auto text-indigo-400" />
            <p className="mt-2 text-lg font-semibold">How can I assist you with FBA data today?</p>
            <p className="text-sm mt-1">Start by asking a question, like "What are the sales trends for the last quarter?"</p>
          </div>
        )}

        {/* Mapped Messages */}
        {messages.map((message) => (
          <div key={message.id} className={`flex ${message.display.type === 'div' && message.display.props.className.includes('self-end') ? 'justify-end' : 'justify-start'}`}>
            {message.display}
          </div>
        ))}
        
        {/* Loading Indicator */}
        {isLoading && (
          <div className="flex justify-start">
             <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg shadow-sm">
                <Loader2 className="w-6 h-6 text-indigo-500 shrink-0 animate-spin" />
                <p className="text-gray-800 text-sm font-medium">AI is generating response...</p>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 border-t bg-gray-50">
        <div className="flex space-x-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Send a message..."
            className="flex-1 p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition duration-150"
            disabled={isLoading}
          />
          <button
            onClick={handleSendMessage}
            disabled={input.trim() === '' || isLoading}
            className="p-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:bg-indigo-300 transition duration-150 shadow-md"
          >
            <Send className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
}