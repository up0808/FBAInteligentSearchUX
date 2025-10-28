import { streamText, convertToCoreMessages } from 'ai';
import { google } from '@ai-sdk/google';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import {
  calculatorTool,
  imageSearchTool,
  weatherTool,
  webSearchTool,
} from '@/lib/ai/tools';
import { redis } from '@/lib/database/redis';

// Setup AI Model (Google Gemini)
const aiModel = google('gemini-2.0-flash-exp');

export const maxDuration = 30;

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  id?: string;
}

// Save chat history to Redis
async function saveChatHistory(userId: string, messages: Message[]) {
  if (!redis) {
    console.warn('Redis client not available. Skipping chat history save.');
    return;
  }
  const historyKey = `chat_history:${userId}`;
  try {
    await redis.set(historyKey, JSON.stringify(messages));
    await redis.expire(historyKey, 60 * 60 * 24); // 24 hours
  } catch (error) {
    console.error('Error saving chat history to Redis:', error);
  }
}

// Load chat history from Redis
async function loadChatHistory(userId: string): Promise<Message[]> {
  if (!redis) {
    console.warn('Redis client not available. Skipping chat history load.');
    return [];
  }
  const historyKey = `chat_history:${userId}`;
  try {
    const data = await redis.get(historyKey);
    if (data) {
      return JSON.parse(data as string) as Message[];
    }
    return [];
  } catch (error) {
    console.error('Error loading chat history from Redis:', error);
    return [];
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return new Response('Unauthorized', { status: 401 });
    }

    const { messages } = await req.json();

    // Load previous chat history
    const history = await loadChatHistory(userId);
    
    // Combine history with new messages
    const allMessages = [...history, ...messages];

    // Stream the response
    const result = streamText({
      model: aiModel,
      messages: convertToCoreMessages(messages),
      system: `You are a helpful FBA (Fulfillment by Amazon) assistant. You use the provided tools to answer user questions accurately.
When you use the webSearchTool, present the results clearly and cite your sources.
For calculations, use the calculator tool.
For weather information, use the weather tool.
For image searches, use the image search tool.`,
      tools: {
        webSearch: webSearchTool,
        imageSearch: imageSearchTool,
        weather: weatherTool,
        calculator: calculatorTool,
      },
      maxSteps: 5,
      onFinish: async ({ text, toolCalls, toolResults, usage }) => {
        // Save updated chat history
        const updatedHistory = [
          ...allMessages,
          {
            role: 'assistant' as const,
            content: text,
            id: crypto.randomUUID(),
          },
        ];
        
        await saveChatHistory(userId, updatedHistory);
        
        console.log('Chat completed:', {
          toolCallsCount: toolCalls?.length || 0,
          usage,
        });
      },
    });

    return result.toDataStreamResponse();
  } catch (error) {
    console.error('Error in chat route:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}