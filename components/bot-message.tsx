'use client';

import { Bot, Loader2, Image as ImageIcon, Search, Calculator, Cloud } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type ToolInvocation = {
  state: 'partial-call' | 'call' | 'result';
  toolCallId: string;
  toolName: string;
  args?: any;
  result?: any;
};

type BotMessageProps = {
  content: string;
  toolInvocations?: ToolInvocation[];
};

// Helper to get a user-friendly name for the tool
function getToolInfo(toolName: string, args: any): { icon: React.ReactNode; text: string } {
  const query = args?.query || args?.expression || args?.location || '...';
  switch (toolName) {
    case 'webSearch':
      return { icon: <Search className="h-4 w-4" />, text: `Searching for: "${query}"` };
    case 'imageSearch':
      return { icon: <ImageIcon className="h-4 w-4" />, text: `Searching images for: "${query}"` };
    case 'calculator':
      return { icon: <Calculator className="h-4 w-4" />, text: `Calculating: "${query}"` };
    case 'weather':
      return { icon: <Cloud className="h-4 w-4" />, text: `Fetching weather for: "${query}"` };
    default:
      return { icon: <Loader2 className="h-4 w-4 animate-spin" />, text: `Using tool: ${toolName}` };
  }
}

export default function BotMessage({ content, toolInvocations }: BotMessageProps) {
  // Extract sources from web search results
  const sources: string[] = [];
  
  if (toolInvocations) {
    toolInvocations.forEach((invocation) => {
      if (
        invocation.toolName === 'webSearch' &&
        invocation.state === 'result' &&
        invocation.result?.results
      ) {
        invocation.result.results.forEach((result: any) => {
          if (result.url) {
            sources.push(result.url);
          }
        });
      }
    });
  }

  return (
    <div className="flex max-w-2xl items-start gap-3">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-200">
        <Bot className="h-5 w-5 text-gray-600" />
      </div>
      <div className="flex-1 space-y-2 overflow-hidden rounded-xl bg-gray-100 px-4 py-3">
        {/* Tool invocations */}
        {toolInvocations && toolInvocations.length > 0 && (
          <div className="space-y-2 mb-2">
            {toolInvocations.map((invocation) => {
              const { icon, text } = getToolInfo(invocation.toolName, invocation.args);
              
              // Show loading state for partial calls and calls
              if (invocation.state === 'partial-call' || invocation.state === 'call') {
                return (
                  <div key={invocation.toolCallId} className="flex items-center gap-2 text-sm text-gray-600">
                    {icon}
                    <span>{text}</span>
                  </div>
                );
              }

              // Show results for completed tools
              if (invocation.state === 'result') {
                if (invocation.toolName === 'imageSearch' && invocation.result?.images) {
                  return (
                    <div key={invocation.toolCallId} className="grid grid-cols-2 gap-2 mt-2">
                      {invocation.result.images.slice(0, 4).map((img: any, idx: number) => (
                        <a
                          key={idx}
                          href={img.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block"
                        >
                          <img
                            src={img.thumbnail}
                            alt={img.title}
                            className="rounded-lg object-cover w-full h-32"
                          />
                        </a>
                      ))}
                    </div>
                  );
                }

                if (invocation.toolName === 'calculator' && invocation.result?.result !== undefined) {
                  return (
                    <div key={invocation.toolCallId} className="text-sm">
                      <p className="text-gray-600">Result: <span className="font-medium text-gray-800">{invocation.result.result}</span></p>
                    </div>
                  );
                }

                if (invocation.toolName === 'weather' && invocation.result?.location) {
                  return (
                    <div key={invocation.toolCallId} className="text-sm">
                      <p className="font-medium">{invocation.result.location}</p>
                      <p className="text-gray-600">
                        {invocation.result.temperature}°{invocation.result.unit} • {invocation.result.condition}
                      </p>
                    </div>
                  );
                }
              }

              return null;
            })}
          </div>
        )}

        {/* Main content */}
        {content && (
          <article className="prose prose-sm prose-p:leading-normal max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </article>
        )}

        {/* Sources */}
        {sources.length > 0 && (
          <div className="mt-4 border-t pt-2">
            <h4 className="mb-1 text-xs font-semibold text-gray-600">Sources</h4>
            <div className="flex flex-wrap gap-2">
              {sources.map((url, index) => {
                let hostname;
                try {
                  hostname = new URL(url).hostname;
                } catch (e) {
                  hostname = url;
                }
                return (
                  <a
                    key={index}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="max-w-xs truncate rounded-full bg-white px-2.5 py-1 text-xs text-blue-600 ring-1 ring-gray-200 hover:bg-gray-50"
                  >
                    {hostname}
                  </a>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}