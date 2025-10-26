import { NextRequest } from 'next/server';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { GoogleCustomSearch } from '@langchain/community/tools/google_custom_search';
import { StateGraph, Annotation, messagesStateReducer } from '@langchain/langgraph';
import { MemorySaver } from '@langchain/langgraph-checkpoint';
import { HumanMessage, AIMessage, BaseMessage, ToolMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

// Constant Configuration 
const APP_VERSION = '1.0.0';
const DEPLOYMENT_TIME = new Date().toISOString();

// Type Definitions

const GraphState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
  }),
});

type GraphStateType = typeof GraphState.State;

/**
 * SSE Event types for client streaming
 */
type SSEEvent =
  | { type: 'checkpoint'; checkpoint_id: string }
  | { type: 'content'; content: string }
  | { type: 'search_start'; query: string }
  | { type: 'search_results'; urls: string[] }
  | { type: 'end' }
  | { type: 'error'; error: string };

/**
 * Query parameters for the streaming endpoint
 */
interface StreamQueryParams {
  message: string;
  checkpoint_id?: string;
}

// Environment Variable Validation

function validateEnvironment(): {
  genAiApiKey: string;
  googleApiKey: string;
  googleCseId: string;
  adminApiKey: string;
} {
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
    throw new Error(
      `Missing required environment variables: ${missingVars.join(', ')}`
    );
  }

  return {
    genAiApiKey: genAiApiKey!,
    googleApiKey: googleApiKey!,
    googleCseId: googleCseId!,
    adminApiKey: adminApiKey!,
  }
  
// Authentication Middleware

// Verifies Bearer token authentication

function verifyAuthentication(request: NextRequest, adminApiKey: string): boolean {
  const authHeader = request.headers.get('authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  return token === adminApiKey;
}


// LangGraph Setup

// Initialise Memory
const memory = new MemorySaver();


 // Creates and configures the LangGraph workflow
 
function createGraph(envVars: ReturnType<typeof validateEnvironment>) {
  
  // Initialize LLM with Gemini 2.5 Flash
  const llm = new ChatGoogleGenerativeAI({
    apiKey: envVars.genAiApiKey,
    modelName: 'gemini-2.0-flash-exp',
    temperature: 0.7,
    maxOutputTokens: 2048,
  });
  //Custom Search Tool 
  const searchTool = new GoogleCustomSearch({
    apiKey: envVars.googleApiKey,
    googleCSEId: envVars.googleCseId,
  });

  // Bind tools to the LLM
  const llmWithTools = llm.bindTools([searchTool]);
  
  
   // Model node - invokes the LLM with conversation history
  
  async function modelNode(state: GraphStateType): Promise<Partial<GraphStateType>> {
    const response = await llmWithTools.invoke(state.messages);
    return { messages: [response] };
  }

  
   // Tool node - executes tool calls requested by the LLM
   
  async function toolNode(state: GraphStateType): Promise<Partial<GraphStateType>> {
    const lastMessage = state.messages[state.messages.length - 1];

    // Check if the last message is an AIMessage with tool calls
    if (!(lastMessage instanceof AIMessage) || !lastMessage.tool_calls?.length) {
      return { messages: [] };
    }

    const toolMessages: ToolMessage[] = [];

    for (const toolCall of lastMessage.tool_calls) {
      try {
        const toolName = toolCall.name;
        const toolArgs = toolCall.args;

        if (toolName === 'google_custom_search') {
          // Execute the Google Custom Search tool
          const query = toolArgs.query || toolArgs.input || '';
          
          if (!query) {
            toolMessages.push(
              new ToolMessage({
                content: JSON.stringify({ error: 'No query provided' }),
                tool_call_id: toolCall.id || '',
                name: toolName,
              })
            );
            continue;
          }

          // Invoke the search tool
          const searchResult = await searchTool.invoke(query);

          toolMessages.push(
            new ToolMessage({
              content: searchResult,
              tool_call_id: toolCall.id || '',
              name: toolName,
            })
          );
        } else {
          // Unknown tool
          toolMessages.push(
            new ToolMessage({
              content: JSON.stringify({ error: `Unknown tool: ${toolName}` }),
              tool_call_id: toolCall.id || '',
              name: toolName,
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

  /**
   * Routing function - determines next step based on tool calls
   */
  function toolsRouter(state: GraphStateType): 'tool_node' | '__end__' {
    const lastMessage = state.messages[state.messages.length - 1];

    if (
      lastMessage instanceof AIMessage &&
      lastMessage.tool_calls &&
      lastMessage.tool_calls.length > 0
    ) {
      return 'tool_node';
    }

    return '__end__';
  }

  // ========================================================================
  // Build Graph
  // ========================================================================
  const workflow = new StateGraph(GraphState)
    .addNode('model', modelNode)
    .addNode('tool_node', toolNode)
    .addEdge('__start__', 'model')
    .addConditionalEdges('model', toolsRouter)
    .addEdge('tool_node', 'model');

  // Compile graph with checkpointer
  return workflow.compile({ checkpointer: memory });
}

// ============================================================================
// SSE Streaming Helper
// ============================================================================

/**
 * Formats SSE event data according to the SSE specification
 */
function formatSSE(data: SSEEvent): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

/**
 * Creates a ReadableStream for SSE responses
 */
function createSSEStream(
  graph: ReturnType<typeof createGraph>,
  message: string,
  checkpointId: string | undefined
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        const isNewConversation = !checkpointId;
        const threadId = checkpointId || uuidv4();

        // Send checkpoint ID for new conversations
        if (isNewConversation) {
          controller.enqueue(
            encoder.encode(formatSSE({ type: 'checkpoint', checkpoint_id: threadId }))
          );
        }

        const config = {
          configurable: { thread_id: threadId },
        };

        const input = {
          messages: [new HumanMessage(message)],
        };

        // Stream events from the graph
        const stream = await graph.streamEvents(input, {
          ...config,
          version: 'v2',
        });

        let searchQuery = '';
        const searchUrls: string[] = [];

        for await (const event of stream) {
          const eventType = event.event;

          // Handle LLM streaming chunks
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

          // Handle LLM completion with tool calls
          if (eventType === 'on_chat_model_end') {
            const output = event.data?.output;
            if (output && output.tool_calls && output.tool_calls.length > 0) {
              const searchToolCall = output.tool_calls.find(
                (tc: { name: string }) => tc.name === 'google_custom_search'
              );

              if (searchToolCall) {
                searchQuery =
                  searchToolCall.args?.query ||
                  searchToolCall.args?.input ||
                  '';

                if (searchQuery) {
                  controller.enqueue(
                    encoder.encode(
                      formatSSE({
                        type: 'search_start',
                        query: searchQuery,
                      })
                    )
                  );
                }
              }
            }
          }

          // Handle tool execution results
          if (
            eventType === 'on_tool_end' &&
            event.name === 'google_custom_search'
          ) {
            const output = event.data?.output;

            if (typeof output === 'string') {
              try {
                // Parse search results to extract URLs
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
                        urls: searchUrls,
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
// API Route Handlers
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    // 1. Environment Validation

    let envVars: ReturnType<typeof validateEnvironment>;

    try {
      envVars = validateEnvironment();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Environment validation failed';
      console.error('[API Error] Environment:', errorMessage);

      return new Response(JSON.stringify({ error: errorMessage }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. Authentication

    if (!verifyAuthentication(request, envVars.adminApiKey)) {
      return new Response(
        JSON.stringify({
          error: 'Missing or invalid authorization header. Use Bearer token.',
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // 3. Parse Query Parameters
    
    const { searchParams } = new URL(request.url);
    const message = searchParams.get('message');
    const checkpointId = searchParams.get('checkpoint_id') || undefined;

    if (!message || message.trim() === '') {
      return new Response(
        JSON.stringify({ error: 'Message parameter is required' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // 4. Initialize Graph
    const graph = createGraph(envVars);

    // 5. Create SSE Stream
    const stream = createSSEStream(graph, message, checkpointId);

    // 6. Return SSE Response
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no', // Disable Nginx buffering
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('[API Error] Unhandled exception:', error);

    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}


 // POST /api/chat-stream

export async function POST(request: NextRequest) {
  try {
  
    // 1. Environment Validation
    let envVars: ReturnType<typeof validateEnvironment>;

    try {
      envVars = validateEnvironment();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Environment validation failed';
      console.error('[API Error] Environment:', errorMessage);

      return new Response(JSON.stringify({ error: errorMessage }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. Authentication
    if (!verifyAuthentication(request, envVars.adminApiKey)) {
      return new Response(
        JSON.stringify({
          error: 'Missing or invalid authorization header. Use Bearer token.',
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
    
    // 3. Parse Request Bod
    let body: { message: string; checkpoint_id?: string };

    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { message, checkpoint_id } = body;

    if (!message || message.trim() === '') {
      return new Response(
        JSON.stringify({ error: 'Message field is required' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // 4. Initialize Graph
    
    const graph = createGraph(envVars);

    // 5. Create SSE Stream
    
    const stream = createSSEStream(graph, message, checkpoint_id);
    
    // 6. Return SSE Response
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('[API Error] Unhandled exception:', error);

    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * OPTIONS handler for CORS preflight requests
 */
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
