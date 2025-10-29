import { streamText, convertToCoreMessages } from 'ai';
import { google } from '@ai-sdk/google';
import { auth } from '@clerk/nextjs/server';
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
async function saveChatHistory(userId: string, chatId: string, messages: any[]) {
  if (!redis) {
    console.warn('Redis client not available. Skipping chat history save.');
    return;
  }
  const historyKey = `chat:${userId}:${chatId}`;
  try {
    await redis.set(historyKey, JSON.stringify(messages));
    await redis.expire(historyKey, 60 * 60 * 24 * 7); // 7 days
  } catch (error) {
    console.error('Error saving chat history to Redis:', error);
  }
}

// Load chat history from Redis
async function loadChatHistory(userId: string, chatId: string): Promise<any[]> {
  if (!redis) {
    console.warn('Redis client not available. Skipping chat history load.');
    return [];
  }
  const historyKey = `chat:${userId}:${chatId}`;
  try {
    const data = await redis.get(historyKey);
    if (data) {
      return JSON.parse(data as string);
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

    const { messages, id: chatId } = await req.json();

    // Load previous chat history if chatId provided
    let allMessages = messages;
    if (chatId) {
      const history = await loadChatHistory(userId, chatId);
      // Combine history with new message (last message is the new one)
      if (history.length > 0) {
        allMessages = [...history, messages[messages.length - 1]];
      }
    }

    // Convert to core messages format
    const coreMessages = convertToCoreMessages(allMessages);

    // Stream the response
    const result = streamText({
      model: aiModel,
      messages: coreMessages,
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
      onFinish: async ({ response }) => {
        // Save updated chat history with the assistant's response
        if (chatId) {
          const updatedMessages = [
            ...allMessages,
            {
              role: 'assistant',
              content: response.messages[response.messages.length - 1].content,
              id: crypto.randomUUID(),
            },
          ];
          
          await saveChatHistory(userId, chatId, updatedMessages);
        }
      },
    });

    return result.toDataStreamResponse();
  } catch (error) {
    console.error('Error in chat route:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}