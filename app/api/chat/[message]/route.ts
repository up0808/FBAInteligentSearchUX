/**
 * app/api/chat/[message]/route.ts
 * 
 * Production-grade LangGraph Agentic Search API compatible with useChatStream hook
 * Uses path parameter for message to match existing client code
 *

import { NextRequest } from 'next/server';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { GoogleCustomSearch } from '@langchain/community/tools/google_custom_search';
import { StateGraph, Annotation, messagesStateReducer } from '@langchain/langgraph';
import { MemorySaver } from '@langchain/langgraph-checkpoint';
import { HumanMessage, AIMessage, BaseMessage, ToolMessage } from '@langchain/core/messages';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// Type Definitions
// ============================================================================

const GraphState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
  }),
});

type GraphStateType = typeof GraphState.State;

interface SSEEvent {
  type: 'checkpoint' | 'content' | 'search_start' | 'search_results' | 'end' | 'error';
  data?: {
    checkpoint_id?: string;
    query?: string;
    urls?: string[];
  };
  content?: string;
  error?: string;
}

// ============================================================================
// Environment Validation
// ============================================================================

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

  return { genAiApiKey: genAiApiKey!, googleApiKey: googleApiKey!, googleCseId: googleCseId!, adminApiKey: adminApiKey! };
}

// ============================================================================
// Authentication
// ============================================================================

function verifyAuthentication(request: NextRequest, adminApiKey: string): boolean {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  return authHeader.substring(7) === adminApiKey;
}

// ============================================================================
// LangGraph Setup
// ============================================================================

const memory = new MemorySaver();

function createGraph(envVars: ReturnType<typeof validateEnvironment>) {
  const llm = new ChatGoogleGenerativeAI({
    apiKey: envVars.genAiApiKey,
    modelName: 'gemini-2.0-flash-exp',
    temperature: 0.7,
    maxOutputTokens: 2048,
  });

  const searchTool = new GoogleCustomSearch({
    apiKey: envVars.googleApiKey,
    googleCSEId: envVars.googleCseId,
  });

  const llmWithTools = llm.bindTools([searchTool]);

  async function modelNode(state: GraphStateType): Promise<Partial<GraphStateType>> {
    const response = await llmWithTools.invoke(state.messages);
    return { messages: [response] };
  }

  async function toolNode(state: GraphStateType): Promise<Partial<GraphStateType>> {
    const lastMessage = state.messages[state.messages.length - 1];

    if (!(lastMessage instanceof AIMessage) || !lastMessage.tool_calls?.length) {
      return { messages: [] };
    }

    const toolMessages: ToolMessage[] = [];

    for (const toolCall of lastMessage.tool_calls) {
      try {
        if (toolCall.name === 'google_custom_search') {
          const query = toolCall.args.query || toolCall.args.input || '';
          
          if (!query) {
            toolMessages.push(
              new ToolMessage({
                content: JSON.stringify({ error: 'No query provided' }),
                tool_call_id: toolCall.id || '',
                name: toolCall.name,
              })
            );
            continue;
          }

          const searchResult = await searchTool.invoke(query);

          toolMessages.push(
            new ToolMessage({
              content: searchResult,
              tool_call_id: toolCall.id || '',
              name: toolCall.name,
            })
          );
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Tool execution failed';
        toolMessages.push(
          new ToolMessage({
            content: JSON.stringify({ error: errorMessage }),
            tool_call_id: toolCall.id || '',
            name: toolCall.name,
          })
        );
      }
    }

    return { messages: toolMessages };
  }

  function toolsRouter(state: GraphStateType): 'tool_node' | '__end__' {
    const lastMessage = state.messages[state.messages.length - 1];
    if (lastMessage instanceof AIMessage && lastMessage.tool_calls?.length) {
      return 'tool_node';
    }
    return '__end__';
  }

  const workflow = new StateGraph(GraphState)
    .addNode('model', modelNode)
    .addNode('tool_node', toolNode)
    .addEdge('__start__', 'model')
    .addConditionalEdges('model', toolsRouter)
    .addEdge('tool_node', 'model');

  return workflow.compile({ checkpointer: memory });
}

// ============================================================================
// SSE Streaming
// ============================================================================

function formatSSE(event: SSEEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function createSSEStream(
  graph: ReturnType<typeof createGraph>,
  message: string,
  checkpointId: string | undefined
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        const threadId = checkpointId || uuidv4();
        const isNewConversation = !checkpointId;

        // Send checkpoint ID for client to track conversation
        if (isNewConversation) {
          controller.enqueue(
            encoder.encode(
              formatSSE({
                type: 'checkpoint',
                data: { checkpoint_id: threadId },
              })
            )
          );
        }

        const config = { configurable: { thread_id: threadId } };
        const input = { messages: [new HumanMessage(message)] };

        const stream = await graph.streamEvents(input, {
          ...config,
          version: 'v2',
        });

        let searchQuery = '';
        const searchUrls: string[] = [];

        for await (const event of stream) {
          const eventType = event.event;

          // Stream content chunks
          if (eventType === 'on_chat_model_stream') {
            const chunk = event.data?.chunk;
            if (chunk && typeof chunk.content === 'string' && chunk.content) {
              controller.enqueue(
                encoder.encode(
                  formatSSE({
                    type: 'content',
                    content: chunk.content,
                  })
                )
              );
            }
          }

          // Detect search start
          if (eventType === 'on_chat_model_end') {
            const output = event.data?.output;
            if (output?.tool_calls?.length) {
              const searchToolCall = output.tool_calls.find(
                (tc: { name: string }) => tc.name === 'google_custom_search'
              );

              if (searchToolCall) {
                searchQuery = searchToolCall.args?.query || searchToolCall.args?.input || '';

                if (searchQuery) {
                  controller.enqueue(
                    encoder.encode(
                      formatSSE({
                        type: 'search_start',
                        data: { query: searchQuery },
                      })
                    )
                  );
                }
              }
            }
          }

          // Extract search result URLs
          if (eventType === 'on_tool_end' && event.name === 'google_custom_search') {
            const output = event.data?.output;

            if (typeof output === 'string') {
              try {
                const results = JSON.parse(output);
                
                if (Array.isArray(results)) {
                  for (const result of results) {
                    if (result.link) {
                      searchUrls.push(result.link);
                    }
                  }
                }

                if (searchUrls.length > 0) {
                  controller.enqueue(
                    encoder.encode(
                      formatSSE({
                        type: 'search_results',
                        data: { urls: searchUrls },
                      })
                    )
                  );
                }
              } catch (parseError) {
                console.error('Failed to parse search results:', parseError);
              }
            }
          }
        }

        // Send end event
        controller.enqueue(encoder.encode(formatSSE({ type: 'end' })));
        controller.close();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Stream error';
        console.error('[Stream Error]', errorMessage);

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

// ============================================================================
// API Route Handler
// ============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ message: string }> }
) {
  try {
    // Validate environment
    let envVars: ReturnType<typeof validateEnvironment>;
    try {
      envVars = validateEnvironment();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Environment validation failed';
      return new Response(JSON.stringify({ error: errorMessage }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Verify authentication
    if (!verifyAuthentication(request, envVars.adminApiKey)) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid authorization header. Use Bearer token.' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get message from path params
    const { message } = await params;
    const decodedMessage = decodeURIComponent(message);

    if (!decodedMessage || decodedMessage.trim() === '') {
      return new Response(
        JSON.stringify({ error: 'Message parameter is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get checkpoint_id from query params
    const { searchParams } = new URL(request.url);
    const checkpointId = searchParams.get('checkpoint_id') || undefined;

    // Create graph and stream
    const graph = createGraph(envVars);
    const stream = createSSEStream(graph, decodedMessage, checkpointId);

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

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

*/