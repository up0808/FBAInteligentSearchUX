import { NextRequest } from 'next/server';
import { google } from '@ai-sdk/google';
import { streamText, tool } from 'ai';
import { z } from 'zod';

// --- Type Definitions ---

interface SSEEvent {
  type: 'checkpoint' | 'content' | 'search_start' | 'search_results' | 'end' | 'error';
  checkpoint_id?: string;
  content?: string;
  query?: string;
  urls?: string[];
  error?: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// --- Environment Validation ---

function validateEnvironment() {
  const genAiApiKey = process.env.GOOGLE_GENAI_API_KEY;
  const googleApiKey = process.env.GOOGLE_API_KEY;
  const googleCseId = process.env.GOOGLE_CSE_ID;
  const adminApiKey = process.env.ADMIN_API_KEY;

  const missingVars: string[] = [];
  if (!genAiApiKey) missingVars.push('GOOGLE_GENAI_API_KEY');
  if (!googleApiKey) missingVars.push('GOOGLE_API_KEY');
  if (!googleCseId) missingVars.push('GOOGLE_CSE_ID');
  if (!adminApiKey) missingVars.push('ADMIN_API_KEY');

  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }

  return {
    genAiApiKey: genAiApiKey!,
    googleApiKey: googleApiKey!,
    googleCseId: googleCseId!,
    adminApiKey: adminApiKey!
  };
}

// --- Authentication ---

function verifyAuthentication(request: NextRequest, adminApiKey: string): boolean {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  return authHeader.substring(7) === adminApiKey;
}

// --- Google Custom Search Tool ---

function createGoogleSearchTool(apiKey: string, cseId: string) {
  return tool({
    description: 'Search the web using Google Custom Search API for real-time and recent information.',
    inputSchema: z.object({
      query: z.string().describe('The search query'),
    }),
    execute: async ({ query }) => {
      const apiUrl = `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(query)}&key=${apiKey}&cx=${cseId}&num=5`;

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const response = await fetch(apiUrl, {
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`Google API Error: ${response.status}`);
        }

        const data = await response.json();
        const items = data.items || [];

        return {
          query,
          results: items.map((item: any) => ({
            title: item.title,
            url: item.link,
            snippet: item.snippet || '',
          })),
          timestamp: new Date().toISOString(),
        };
      } catch (error: any) {
        console.error('[Search Error]', error.message);
        return {
          query,
          results: [],
          error: error.message,
          timestamp: new Date().toISOString(),
        };
      }
    },
  });
}

// --- In-Memory Chat History (Replace with Redis/DB in production) ---

const conversationStore = new Map<string, ChatMessage[]>();

function getConversationHistory(threadId: string): ChatMessage[] {
  return conversationStore.get(threadId) || [];
}

function addToConversationHistory(threadId: string, message: ChatMessage) {
  const history = getConversationHistory(threadId);
  history.push(message);
  conversationStore.set(threadId, history);
  
  // Limit history to last 50 messages to prevent memory issues
  if (history.length > 50) {
    conversationStore.set(threadId, history.slice(-50));
  }
}

function clearConversationHistory(threadId: string) {
  conversationStore.delete(threadId);
}

// --- SSE Streaming Helper ---

function formatSSE(event: SSEEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

// --- Main Stream Function ---

async function createAIStream(
  message: string,
  threadId: string,
  envVars: ReturnType<typeof validateEnvironment>
): Promise<ReadableStream<Uint8Array>> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        const isNewConversation = !conversationStore.has(threadId);

        // 1. Send checkpoint ID for new conversations
        if (isNewConversation) {
          controller.enqueue(
            encoder.encode(
              formatSSE({
                type: 'checkpoint',
                checkpoint_id: threadId,
              })
            )
          );
        }

        // 2. Get conversation history
        const history = getConversationHistory(threadId);

        // 3. Create the Google search tool
        const googleSearchTool = createGoogleSearchTool(
          envVars.googleApiKey,
          envVars.googleCseId
        );

        // 4. Configure the model
        const model = google('gemini-2.0-flash-exp', {
          apiKey: envVars.genAiApiKey,
        });

        // 5. State tracking for tool execution
        let searchQuery = '';
        const searchUrls: string[] = [];
        let isProcessingToolCall = false;
        let fullResponse = '';

        // 6. Stream text with multi-step tool calling
        const result = streamText({
          model,
          system: `You are a helpful AI assistant with access to web search capabilities.

Guidelines:
- Use the google_custom_search tool when you need current information, recent events, or factual data that may have changed
- Always cite your sources when using search results
- Be concise and accurate in your responses
- If search results are insufficient, acknowledge the limitation`,
          messages: [
            ...history.map(msg => ({
              role: msg.role,
              content: msg.content,
            })),
            {
              role: 'user',
              content: message,
            },
          ],
          tools: {
            google_custom_search: googleSearchTool,
          },
          maxSteps: 5, // Allow up to 5 steps for multi-tool usage
          temperature: 0.7,
          maxTokens: 2048,

          // Handle tool execution lifecycle
          onStepFinish: async ({ toolCalls, toolResults }) => {
            // Handle tool calls (search_start event)
            if (toolCalls && toolCalls.length > 0) {
              for (const toolCall of toolCalls) {
                if (toolCall.toolName === 'google_custom_search') {
                  searchQuery = (toolCall.args as any).query || '';

                  if (searchQuery) {
                    controller.enqueue(
                      encoder.encode(
                        formatSSE({
                          type: 'search_start',
                          query: searchQuery,
                        })
                      )
                    );
                    isProcessingToolCall = true;
                  }
                }
              }
            }

            // Handle tool results (search_results event)
            if (toolResults && toolResults.length > 0) {
              for (const toolResult of toolResults) {
                if (toolResult.toolName === 'google_custom_search') {
                  const resultData = toolResult.result as any;

                  // Extract URLs from results
                  if (resultData?.results && Array.isArray(resultData.results)) {
                    for (const result of resultData.results) {
                      if (result.url) {
                        searchUrls.push(result.url);
                      }
                    }
                  }

                  // Send search_results event
                  if (searchUrls.length > 0) {
                    controller.enqueue(
                      encoder.encode(
                        formatSSE({
                          type: 'search_results',
                          urls: searchUrls,
                        })
                      )
                    );
                  }

                  isProcessingToolCall = false;
                }
              }
            }
          },
        });

        // 7. Stream the text content
        for await (const chunk of result.textStream) {
          // Only stream content if we're not processing a tool call
          if (!isProcessingToolCall && chunk) {
            fullResponse += chunk;
            controller.enqueue(
              encoder.encode(
                formatSSE({
                  type: 'content',
                  content: chunk,
                })
              )
            );
          }
        }

        // 8. Wait for completion
        await result;

        // 9. Save to conversation history
        addToConversationHistory(threadId, {
          role: 'user',
          content: message,
        });
        addToConversationHistory(threadId, {
          role: 'assistant',
          content: fullResponse,
        });

        // 10. Send end event
        controller.enqueue(encoder.encode(formatSSE({ type: 'end' })));
        controller.close();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Stream error';
        console.error('[Stream Error]', errorMessage, error);

        controller.enqueue(
          encoder.encode(
            formatSSE({
              type: 'error',
              error: errorMessage,
            })
          )
        );
        controller.close();
      }
    },
  });
}

// --- GET Handler (URL Parameters) ---

export async function GET(request: NextRequest) {
  try {
    const envVars = validateEnvironment();

    if (!verifyAuthentication(request, envVars.adminApiKey)) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid authorization header. Use Bearer token.' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { searchParams } = new URL(request.url);
    const message = searchParams.get('message');
    const checkpointId = searchParams.get('checkpoint_id') || crypto.randomUUID();
    const action = searchParams.get('action'); // Optional: 'clear' to reset conversation

    // Handle clear conversation action
    if (action === 'clear' && checkpointId) {
      clearConversationHistory(checkpointId);
      return new Response(
        JSON.stringify({ success: true, message: 'Conversation cleared' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!message || message.trim() === '') {
      return new Response(
        JSON.stringify({ error: 'Message parameter is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const stream = await createAIStream(message, checkpointId, envVars);

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('[API Error]', error);

    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// --- POST Handler (JSON Body) ---

export async function POST(request: NextRequest) {
  try {
    const envVars = validateEnvironment();

    if (!verifyAuthentication(request, envVars.adminApiKey)) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid authorization header. Use Bearer token.' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const body = await request.json();
    const { message, checkpoint_id, action } = body;

    const checkpointId = checkpoint_id || crypto.randomUUID();

    // Handle clear conversation action
    if (action === 'clear' && checkpointId) {
      clearConversationHistory(checkpointId);
      return new Response(
        JSON.stringify({ success: true, message: 'Conversation cleared' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!message || typeof message !== 'string' || message.trim() === '') {
      return new Response(
        JSON.stringify({ error: 'Message field is required and must be a non-empty string' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const stream = await createAIStream(message, checkpointId, envVars);

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('[API Error]', error);

    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// --- OPTIONS Handler (CORS) ---

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}