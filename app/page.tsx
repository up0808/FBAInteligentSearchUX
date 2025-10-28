'use client';

import { useUIState, useActions } from 'ai/rsc';
import { AI } from './actions';
import { useState, useRef, useEffect } from 'react';
import { User, Bot, Loader2, Send } from 'lucide-react';
import { SignedIn, SignedOut, UserButton, RedirectToSignIn } from '@clerk/nextjs';

// This is the new, simplified chat page.
// It uses the hooks from `createAI` in actions.tsx.
export default function ChatPage() {
  return (
    <>
      {/* Handle Authentication */}
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
      <SignedIn>
        <Chat />
      </SignedIn>
    </>
  );
}

function Chat() {
  const [inputValue, setInputValue] = useState('');
  const [messages, setMessages] = useUIState<typeof AI>();
  const { submitMessage } = useActions<typeof AI>();
  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const messageContent = inputValue.trim();
    if (!messageContent) return;

    // Clear input
    setInputValue('');

    // Add user message to UI
    setMessages(currentMessages => [
      ...currentMessages,
      {
        id: crypto.randomUUID(),
        role: 'user',
        display: (
          <div className="flex justify-end">
            <div className="flex max-w-sm items-start gap-3">
              <div className="flex-1 space-y-2 overflow-hidden rounded-xl bg-blue-600 px-4 py-3 text-white">
                {messageContent}
              </div>
              <UserButton />
            </div>
          </div>
        ),
      },
    ]);

    // Call the server action to get the AI response
    const responseMessage = await submitMessage(messageContent);
    setMessages(currentMessages => [...currentMessages, responseMessage]);
  };

  return (
    <div className="flex h-screen flex-col bg-gray-50">
      {/* Header */}
      <header className="flex h-16 w-full items-center justify-between border-b bg-white px-4 md:px-6">
        <h1 className="text-lg font-semibold">AI Search Agent</h1>
        <UserButton />
      </header>

      {/* Chat Window */}
      <div className="flex-1 space-y-6 overflow-y-auto p-4 md:p-6">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center text-gray-500">
              <Bot className="mx-auto mb-2 h-10 w-10" />
              Start a conversation by typing below.
            </div>
          </div>
        ) : (
          messages.map(message => (
            <div key={message.id}>{message.display}</div>
          ))
        )}
        <div ref={endOfMessagesRef} />
      </div>

      {/* Input Form */}
      <div className="border-t bg-white p-4">
        <form
          onSubmit={handleSubmit}
          className="mx-auto flex w-full max-w-3xl items-center gap-2"
        >
          <input
            type="text"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            placeholder="Ask anything..."
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            disabled={false} // You can manage a loading state here if needed
          />
          <button
            type="submit"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            disabled={!inputValue.trim()}
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}