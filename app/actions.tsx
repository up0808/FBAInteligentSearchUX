import 'server-only';
import { createAI, createStreamableValue, getMutableAIState, render } from 'ai/rsc';
import { google } from '@ai-sdk/google'; // Changed from GoogleGenerativeAI for cleaner AI SDK usage
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { Suspense, ReactNode } from 'react';
import {
  calculatorTool,
  imageSearchTool,
  weatherTool,
  webSearchTool,
} from '@/lib/ai/tools'; // Assuming this path and components exist
import { redis } from '@/lib/database/redis';
import BotMessage from '@/components/bot-message';
import { nanoid } from 'nanoid'; // FIX: Corrected import syntax

// --- 1. Setup AI Model (Google Gemini) ---
// Using the recommended @ai-sdk/google function
const aiModel = google('gemini-2.5-flash');

// --- 2. Define Message and AI State Types ---
export interface ServerMessage {
  role: 'user' | 'assistant';
  content: string;
  id: string;
  name?: string;
}

export interface ClientMessage {
  id: string;
  role: 'user' | 'assistant';
  display: ReactNode;
}

// --- 3. Define Redis Caching Functions ---
async function saveChatHistory(userId: string, history: ServerMessage[]) {
  if (!redis) {
    console.warn('Redis client not available. Skipping chat history save.');
    return;
  }
  const historyKey = `chat_history:${userId}`;
  try {
    await redis.set(historyKey, JSON.stringify(history));
    await redis.expire(historyKey, 60 * 60 * 24); // Expire after 24 hours
  } catch (error) {
    console.error('Error saving chat history to Redis:', error);
  }
}

async function loadChatHistory(userId: string): Promise<ServerMessage[]> {
  if (!redis) {
    console.warn('Redis client not available. Skipping chat history load.');
    return [];
  }
  const historyKey = `chat_history:${userId}`;
  try {
    const data = await redis.get(historyKey);
    if (data) {
      return JSON.parse(data as string) as ServerMessage[];
    }
    return [];
  } catch (error) {
    console.error('Error loading chat history from Redis:', error);
    return [];
  }
}

// --- 4. The Core AI Agent Action ---
async function submitMessage(
  content: string,
): Promise<ClientMessage> {
  'use server';

  const { userId } = auth();
  if (!userId) {
    return {
      id: nanoid(),
      role: 'assistant',
      display: <BotMessage content="Error: You must be logged in to chat." />,
    };
  }

  const aiState = getMutableAIState<typeof AI>();
  const userMessageId = nanoid();

  // Add user message to AI state
  aiState.update([
    ...aiState.get(),
    {
      role: 'user',
      content,
      id: userMessageId,
    },
  ]);

  // --- Create a streamable UI ---
  const streamableUi = createStreamableValue(
    <BotMessage content="Thinking..." isLoading={true} />,
  );

  (async () => {
    try {
      // 1. Load history from Redis
      const history = await loadChatHistory(userId);
      
      // Combine loaded history with the current user message
      const currentMessages = [
        ...history.map(msg => ({ role: msg.role, content: msg.content })),
        { role: 'user', content: content }
      ];

      // 2. Generate the response with tool calls and streaming
      const result = await aiModel.generate({
        messages: currentMessages as any, // Cast for type compatibility
        
        tools: [
          webSearchTool,
          imageSearchTool,
          weatherTool,
          calculatorTool,
        ],
        
        system: `You are a helpful assistant. You use the provided tools to answer user questions. 
                 When you use the webSearchTool, present the results clearly.
                 At the end of your answer, list the source URLs from the search results.`,
      });

      let finalContent = '';
      
      // 3. Process the entire stream. We simplify the tool handling 
      // to ensure compilation and basic text stream until a more robust tool pattern is implemented.
      for await (const chunk of result.stream) {
          if (chunk.type === 'text') {
              finalContent += chunk.text;
              // Stream text updates
              streamableUi.update(<BotMessage content={finalContent} isLoading={true} />);
          } 
          // Tool calls are usually handled in a recursive call, not directly here for streaming.
      }
      
      // 5. Update UI with the final message
      streamableUi.done(
        <BotMessage
          content={finalContent}
          isLoading={false}
          // sources={searchResults} // Keep this if you re-implement tool tracking
        />,
      );

      // 6. Update AI state and save history to Redis
      const newHistory: ServerMessage[] = [
        ...history, // Start with loaded history
        { role: 'user', content, id: nanoid() }, // Add user message
        { role: 'assistant', content: finalContent, id: nanoid() }, // Add final assistant message
      ];
      
      aiState.done(newHistory);
      await saveChatHistory(userId, newHistory);

    } catch (error) {
      console.error('Error in submitMessage:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
      streamableUi.done(
        <BotMessage content={`Error: ${errorMessage}`} isError={true} />,
      );
      // Final state update on error
      aiState.done([
        ...aiState.get(),
        {
          role: 'assistant',
          content: `Error: ${errorMessage}`,
          id: nanoid(),
        },
      ]);
    }
  })();

  // Return the initial streamable value
  return {
    id: nanoid(),
    role: 'assistant',
    display: streamableUi.value,
  };
}


// --- 5. Create the AI provider ---
export const AI = createAI<ServerMessage[], ClientMessage[]>({
  actions: {
    submitMessage,
  },
  initialUIState: [],
  initialAIState: [],
  onGetUIState: async () => {
    'use server';
    const { userId } = auth();
    if (!userId) {
      return { uiState: [] };
    }

    // Load history from Redis
    const history = await loadChatHistory(userId);
    const uiState: ClientMessage[] = history.map(msg => ({
      id: msg.id || nanoid(),
      role: msg.role,
      display: <BotMessage content={msg.content} />, 
    }));

    return { uiState };
  },
});

// --- 6. EXPORT THE CLIENT HOOKS ---
// FIX: This is the critical line missing previously, required by app/page.tsx
export const { useUIState, useActions } = AI;

// Re-export utility functions for use in server components if needed
export { getAIState, getUIState } from 'ai/rsc';