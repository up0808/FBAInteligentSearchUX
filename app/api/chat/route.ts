import { NextRequest } from 'next/server';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { GoogleCustomSearch } from '@langchain/community/tools/google_custom_search';
import { StateGraph, Annotation, messagesStateReducer } from '@langchain/langgraph';
import { MemorySaver } from '@langchain/langgraph-checkpoint';
import { HumanMessage, AIMessage, BaseMessage, ToolMessage } from '@langchain/core/messages';
import { v4 as uuidv4 } from 'uuid';

// --- Type Definitions ---

const GraphState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
  }),
});

type GraphStateType = typeof GraphState.State;

interface SSEEvent {
  type: 'checkpoint' | 'content' | 'search_start' | 'search_results' | 'end' | 'error';
  checkpoint_id?: string;
  content?: string;
  query?: string;
  urls?: string[];
  error?: string;
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

// --- LangGraph Setup ---

const memory = new MemorySaver();

function createGraph(envVars: ReturnType<typeof validateEnvironment>) {
  const llm = new ChatGoogleGenerativeAI({
    apiKey: envVars.genAiApiKey,
    modelName: 'gemini-2.5-flash', 
    temperature: 0.7,
    maxOutputTokens: 2048,
  });

  const searchTool = new GoogleCustomSearch({
    apiKey: envVars.googleApiKey,
    googleCSEId: envVars.googleCseId,
  });

  const llmWithTools = llm.bindTools([searchTool]);

  // Model node: Invokes the LLM to either generate text or call a tool
  async function modelNode(state: GraphStateType): Promise<Partial<GraphStateType>> {
    const response = await llmWithTools.invoke(state.messages);
    return { messages: [response] };
  }

  // Tool node: Executes the Google search tool
  async function toolNode(state: GraphStateType): Promise<Partial<GraphStateType>> {
    const lastMessage = state.messages[state.messages.length - 1];

    if (!(lastMessage instanceof AIMessage) || !lastMessage.tool_calls?.length) {
      return { messages: [] };
    }

    const toolMessages: ToolMessage[] = [];

    for (const toolCall of lastMessage.tool_calls) {
      if (toolCall.name === 'google_custom_search') {
        const query = toolCall.args.query || toolCall.args.input || '';
        
        try {
          // Invoke the tool
          const searchResult = await searchTool.invoke(query);

          toolMessages.push(
            new ToolMessage({
              content: searchResult, // JSON string of results
              tool_call_id: toolCall.id || '',
              name: toolCall.name,
            })
          );
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
    }

    return { messages: toolMessages };
  }

  // Router: Determines next step (Tool or End)
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
    .addEdge('tool_node', 'model'); // Loop back to the model after tool execution

  return workflow.compile({ checkpointer: memory });
}


// --- SSE Streaming with FIXED Event Ordering ---

function formatSSE(event: SSEEvent): string {
  // SSE messages must end with \n\n
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

        // 1. Send checkpoint ID (Only if new conversation)
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

        const config = { configurable: { thread_id: threadId } };
        const input = { messages: [new HumanMessage(message)] };

        const stream = await graph.streamEvents(input, {
          ...config,
          version: 'v2',
        });

        // --- RESILIENT STREAM STATE TRACKING (SIMPLIFIED) ---
        // New state flag: True if the model has requested a tool and we are now 
        // blocking content stream until the tool results are back.
        let isAwaitingToolResult = false;
        let finalAnswerStarted = false; // Flag to ensure final streaming is re-enabled
        let searchQuery = '';
        const searchUrls: string[] = [];
        // ---

        for await (const event of stream) {
          const eventType = event.event;
          const nodeName = event.name; 

          // --- STEP 1: Detect Tool Call Request (Trigger BLOCK) ---
          if (eventType === 'on_chat_model_end' && nodeName === 'model') {
            const output = event.data?.output as AIMessage | undefined;
            
            // Check if the output of this model run was a tool call (length > 0)
            if (output?.tool_calls && output.tool_calls.length > 0) {
              
              // This is the first model run and it's calling a tool.
              isAwaitingToolResult = true; 

              const searchToolCall = output.tool_calls.find(
                (tc: { name: string }) => tc.name === 'google_custom_search'
              );

              if (searchToolCall) { 
                searchQuery = searchToolCall.args?.query || searchToolCall.args?.input || '';
                
                // Immediately emit search_start event before the tool runs
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

          // --- STEP 2: Process Tool Execution End (Release BLOCK) ---
          // This marks the transition from tool execution back to the model (for the final answer)
          if (eventType === 'on_tool_end' && nodeName === 'tool_node' && isAwaitingToolResult) {
            
            // Tool has finished running, re-enable content streaming for the final model run
            isAwaitingToolResult = false; 
            finalAnswerStarted = true; // Confirms we are now in the final answer phase

            // Extract search results (links) from the tool output
            const output = event.data?.output;
            if (typeof output === 'string') {
              try {
                const results = JSON.parse(output);
                
                if (Array.isArray(results)) {
                  for (const result of results) {
                    if (result.link && typeof result.link === 'string') {
                      searchUrls.push(result.link);
                    }
                  }
                }

                // Immediately emit search_results event 
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
                console.error('Failed to parse search results in on_tool_end:', parseError);
              }
            }
          }
          
          // --- STEP 3: Stream Content with Fixed Logic ---
          if (eventType === 'on_chat_model_stream') {
            const chunk = event.data?.chunk;
            
            if (typeof chunk?.content === 'string' && chunk.content) {
              
              // CRITICAL FIX: Only block content if we are actively waiting for the tool results.
              // This ensures simple queries (where isAwaitingToolResult is false) stream fine.
              if (!isAwaitingToolResult) {
                controller.enqueue(
                  encoder.encode(
                    formatSSE({
                      type: 'content',
                      content: chunk.content,
                    })
                  )
                );
              }
              // If isAwaitingToolResult is true, we discard the LLM's tool monologue.
            }
          }
        }

        // Send end event
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

// --- API Route Handler ---

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
    const checkpointId = searchParams.get('checkpoint_id') || undefined;

    if (!message || message.trim() === '') {
      return new Response(
        JSON.stringify({ error: 'Message parameter is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const graph = createGraph(envVars);
    const stream = createSSEStream(graph, message, checkpointId);

    // Return the stream with production-ready SSE headers
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

// Standard OPTIONS handler for CORS preflight requests
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