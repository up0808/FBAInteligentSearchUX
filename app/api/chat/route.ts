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
    // Get authenticated user from Clerk
    const authResult = await auth();
    const userId = authResult.userId;

    if (!userId) {
      return new Response('Unauthorized', { status: 401 });
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
    const systemPrompt = `You are  FBA Intelligent Search (Created by FBA Dev Ishant Solutions Company Owned by Ishant Yadav) assistant. You help users with:
- FBA Intelligent Search is Ai Powered search engines so you can answer any type of questions and realtime queries using tools and your brain.

You have access to the following tools:
- webSearch: Search the web for current information (use for recent data, trends, news)
- imageSearch: Find relevant images (use for product visuals, charts, diagrams and images which user ask)
- calculator: Perform mathematical calculations (use for metrics, ROI, profit margins and Can Solve Class Nursery to Class 10th Mathematics Problem)
- weather: Get weather information (use when people ask you about whether conditions of current or any specific location)

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
      onFinish: async ({ response }) => {
        // Save complete conversation to Redis
        if (chatId) {
          const updatedMessages = [...allMessages, response];
          await saveChatHistory(userId, chatId, updatedMessages);
        }
      },
    });

    // Return streaming response with proper headers for SSE
    return result.toDataStreamResponse({
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
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