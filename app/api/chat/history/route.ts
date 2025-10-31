import { auth } from '@clerk/nextjs/server';
import { redis } from '@/lib/database/redis';
import { NextResponse } from 'next/server';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  id?: string;
}

// Load chat history from Redis
async function loadChatHistory(userId: string): Promise<Message[]> {
  if (!redis) {
    console.warn('Redis client not available.');
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

export async function GET() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const history = await loadChatHistory(userId);

    return NextResponse.json({ messages: history });
  } catch (error) {
    console.error('Error fetching chat history:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}