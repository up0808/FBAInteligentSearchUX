import { streamText } from 'ai';
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
    const authResult = await auth();
    const userId = authResult.userId;

    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { messages, id: chatId } = await req.json();

    // Load previous chat history if chatId provided
    let allMessages = messages;
    if (chatId) {
      const history = await loadChatHistory(userId, chatId);
      if (history.length > 0) {
        // Merge history with new messages, avoiding duplicates
        const messageIds = new Set(messages.map((m: any) => m.id));
        const uniqueHistory = history.filter((m: any) => !messageIds.has(m.id));
        allMessages = [...uniqueHistory, ...messages];
      }
    }

    // System prompt for FBA context
    const systemPrompt = `You are an intelligent FBA (Fulfillment by Amazon) assistant. You help users with:
- FBA processes, inventory management, and fulfillment workflows
- Sales trends analysis and data insights
- Product research and competitive analysis
- Amazon seller metrics and performance optimization

You have access to the following tools:
- webSearch: Search the web for current information (use for recent data, trends, news)
- imageSearch: Find relevant images (use for product visuals, charts, diagrams)
- calculator: Perform mathematical calculations (use for metrics, ROI, profit margins)
- weather: Get weather information (use when weather impacts logistics or sales)

Always provide accurate, helpful, and actionable advice. When using tools, explain your findings clearly.`;

    // Stream the response using AI SDK v5
    const result = streamText({
      model: aiModel,
      system: systemPrompt,
      messages: allMessages,
      tools: {
        webSearch: webSearchTool,
        imageSearch: imageSearchTool,
        calculator: calculatorTool,
        weather: weatherTool,
      },
      maxSteps: 5, // Allow up to 5 tool calls in a row
    });

    // Return streaming response - AI SDK v5 uses toUIMessageStreamResponse
    return result.toUIMessageStreamResponse({
      onFinish: async ({ messages: finalMessages }) => {
        // Save complete conversation to Redis
        if (chatId) {
          await saveChatHistory(userId, chatId, finalMessages);
        }
      },
    });
  } catch (error: any) {
    console.error('Chat API Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}