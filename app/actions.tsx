import 'server-only';
import { createAI, createStreamableValue, getMutableAIState, render } from 'ai/rsc';
import { GoogleGenerativeAI } from '@ai-sdk/google';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { Suspense } from 'react';
import {
  calculatorTool,
  imageSearchTool,
  weatherTool,
  webSearchTool,
} from '@/lib/ai/tools';
import { redis } from '@/lib/database/redis';
import BotMessage from '@/components/bot-message';
import { nanoid } as 'nanoid';

// --- 1. Setup AI Model (Google Gemini) ---
// Ensure GOOGLE_GENERATIVE_AI_API_KEY is in your .env
const google = new GoogleGenerativeAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
});
const model = google.generativeAI('models/gemini-2.5-flash');

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
  display: React.ReactNode;
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
    // Handle unauthorized access
    return {
      id: nanoid(),
      role: 'assistant',
      display: <BotMessage content="Error: You must be logged in to chat." />,
    };
  }

  const aiState = getMutableAIState<typeof AI>();

  // Add user message to UI state
  aiState.update([
    ...aiState.get(),
    {
      role: 'user',
      content,
    },
  ]);

  // --- Create a streamable UI ---
  const streamableUi = createStreamableValue(
    <BotMessage content="" isLoading={true} />,
  );

  (async () => {
    try {
      // 1. Load history from Redis
      const history = await loadChatHistory(userId);

      // 2. Generate the response
      const result = await model.generate({
        system: `You are a helpful assistant. You use the provided tools to answer user questions. 
                 When you use the webSearchTool, present the results clearly.
                 At the end of your answer, list the source URLs from the search results.`,
        prompt: content,
        history: history as any, // Pass loaded history
        tools: {
          webSearch: webSearchTool,
          imageSearch: imageSearchTool,
          weather: weatherTool,
          calculator: calculatorTool,
        },
      });

      let finalContent = '';
      let searchResults: any[] = []; // Store search results

      // 3. Process tool calls
      for (const toolCall of result.toolCalls) {
        const { toolName, args } = toolCall;
        
        // --- This is where the UI shows "Searching...", etc. ---
        // The `render` utility generates a UI node for the tool call
        const toolUi = render({
          model: 'gemini-2.5-flash',
          // We use Suspense to show a loading state while the tool runs
          fn: toolName as any,
          args: args,
          // This component will be rendered while the tool is executing
          pending: <BotMessage content="" isLoading={true} messageType={toolName as string} toolArgs={args} />,
          // This component will be rendered when the tool is done
          // We pass the output to BotMessage to render it
          display: ({ output }) => <BotMessage content={output} messageType={toolName as string} toolArgs={args} />
        });

        // Update the UI with the tool's loading state
        streamableUi.update(toolUi);

        // Execute the tool and get the result
        const toolResult = await toolCall.result;
        finalContent += toolResult.result.toString();

        // --- Store search results to display sources ---
        if (toolName === 'webSearch' && typeof toolResult.result === 'object') {
          searchResults = (toolResult.result as { results: any[] }).results || [];
        }

        // Add tool result to history
        history.push({ role: 'assistant', content: finalContent, id: nanoid(), name: toolName });
      }

      // 4. Generate the final text response
      const finalResult = await model.generate({
        prompt: content,
        history: history as any,
      });

      finalContent = finalResult.text;

      // 5. Update UI with the final message + sources
      streamableUi.done(
        <BotMessage
          content={finalContent}
          isLoading={false}
          sources={searchResults}
        />,
      );

      // 6. Update AI state and save history to Redis
      const newHistory: ServerMessage[] = [
        ...aiState.get(),
        { role: 'user', content, id: nanoid() },
        { role: 'assistant', content: finalContent, id: nanoid() },
      ];
      
      aiState.done(newHistory);
      await saveChatHistory(userId, newHistory);

    } catch (error) {
      console.error('Error in submitMessage:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
      streamableUi.done(
        <BotMessage content={`Error: ${errorMessage}`} isError={true} />,
      );
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

  return {
    id: nanoid(),
    role: 'assistant',
    display: streamableUi.value,
  };
}


// --- 5. Create the AI provider ---
// This wires up the initial state and server actions
export const AI = createAI<ServerMessage[], ClientMessage[]>({
  actions: {
    submitMessage,
  },
  initialUIState: [],
  initialAIState: [],
  // This onGetUIState function will be called to restore the UI state
  // from the AI state when the user reloads the page.
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
      display: <BotMessage content={msg.content} />
    }));

    return { uiState };
  },
});