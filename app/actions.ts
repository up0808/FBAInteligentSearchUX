// actions.ts
'use server';

import { createAI, streamUI } from 'ai/rsc';
import { google } from '@ai-sdk/google';
import { ReactNode } from 'react';
import { UIState, AIState } from './lib/types'; // Ensure this path is correct
import { nanoid } from 'nanoid';

// Define the shape of the UI message components for display
interface Message {
  id: string;
  display: ReactNode;
}

// Simple component for displaying the bot's response
function BotMessage({ content }: { content: string }) {
  return (
    <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg shadow-sm">
      <svg className="w-6 h-6 text-indigo-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944c-1.233.018-2.434.11-3.618.281v15.342a12.04 12.04 0 00-2.887 1.157L5 18l-1.002.5A12.01 12.01 0 0012 22a12.01 12.01 0 008.002-3.5L19 18l-1.113.56c-.958.48-1.93.93-2.924 1.34V4.144zM12 18V6" /></svg>
      <p className="text-gray-800 text-sm font-medium whitespace-pre-wrap">{content}</p>
    </div>
  );
}

/**
 * The main server action that handles user input and streams the AI's response.
 * @param userInput The message typed by the user.
 * @returns An updated UIState array with the new message and the AI's streamed response.
 */
async function submitUserMessage(userInput: string): Promise<Message> {
  // Update AI state to include the user's message
  const newId = nanoid();
  
  // As a server component, we need to read the current state and then append to it
  const aiState = getAIState(); 
  const updatedAIState: AIState = [
    ...aiState,
    { role: 'user', content: userInput, id: newId },
  ];

  // Call the generative model
  const result = await streamUI({
    model: google('gemini-2.5-flash'), // Use a suitable Gemini model
    messages: updatedAIState,
    initialUI: <BotMessage content="Thinking..." />, // Placeholder while streaming
    
    // The generator function decides how to turn the streamed text into UI
    text: ({ content, done }) => {
      if (done) {
        // When finished, update the AI state with the full response for history
        // Note: The AI SDK handles the AI state update internally in a standard chat app.
      }
      return <BotMessage content={content} />;
    },
  });

  // Return the streamed component to the client
  return {
    id: newId,
    display: result.value,
  };
}

// Initial state values for the AI and UI
const initialAIState: AIState = [];
const initialUIState: UIState = [];

// Create the AI component with the initial state and the submit action
export const AI = createAI<AIState, UIState>({
  actions: {
    submitUserMessage,
  },
  initialUIState,
  initialAIState,
});

// Re-export the utility functions to be used inside the component structure
export { getAIState, getUIState } from 'ai/rsc';