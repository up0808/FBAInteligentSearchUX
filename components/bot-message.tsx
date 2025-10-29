'use client';

import { Bot, Loader2, Image as ImageIcon, Search, Calculator, Cloud } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type MessagePart = {
  type: string;
  text?: string;
  toolCallId?: string;
  toolName?: string;
  args?: any;
  result?: any;
  [key: string]: any;
};

type BotMessageProps = {
  message: {
    id: string;
    role: string;
    parts: MessagePart[];
  };
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

export default function BotMessage({ message }: BotMessageProps) {
  // Extract text content and tool invocations from parts
  const textContent: string[] = [];
  const toolCalls: MessagePart[] = [];
  const toolResults: MessagePart[] = [];
  const sources: string[] = [];

  message.parts.forEach((part) => {
    if (part.type === 'text' && part.text) {
      textContent.push(part.text);
    } else if (part.type.startsWith('tool-call')) {
      toolCalls.push(part);
    } else if (part.type.startsWith('tool-result')) {
      toolResults.push(part);
      
      // Extract sources from web search results
      if (part.toolName === 'webSearch' && part.result?.results) {
        part.result.results.forEach((result: any) => {
          if (result.url) {
            sources.push(result.url);
          }
        });
      }
    }
  });

  const fullText = textContent.join(' ');

  return (
    <div className="flex max-w-2xl items-start gap-3">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-200">
        <Bot className="h-5 w-5 text-gray-600" />
      </div>
      <div className="flex-1 space-y-2 overflow-hidden rounded-xl bg-gray-100 px-4 py-3">
        {/* Tool calls */}
        {toolCalls.length > 0 && (
          <div className="space-y-2 mb-2">
            {toolCalls.map((call, index) => {
              const { icon, text } = getToolInfo(call.toolName || 'unknown', call.args);
              return (
                <div key={index} className="flex items-center gap-2 text-sm text-gray-600">
                  {icon}
                  <span>{text}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Tool results with special rendering */}
        {toolResults.map((result, index) => {
          if (result.toolName === 'imageSearch' && result.result?.images) {
            return (
              <div key={index} className="grid grid-cols-2 gap-2 mt-2">
                {result.result.images.slice(0, 4).map((img: any, idx: number) => (
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

          if (result.toolName === 'calculator' && result.result?.result !== undefined) {
            return (
              <div key={index} className="text-sm">
                <p className="text-gray-600">
                  Result: <span className="font-medium text-gray-800">{result.result.result}</span>
                </p>
              </div>
            );
          }

          if (result.toolName === 'weather' && result.result?.location) {
            return (
              <div key={index} className="text-sm">
                <p className="font-medium">{result.result.location}</p>
                <p className="text-gray-600">
                  {result.result.temperature}°{result.result.unit} • {result.result.condition}
                </p>
              </div>
            );
          }

          return null;
        })}

        {/* Main text content */}
        {fullText && (
          <article className="prose prose-sm prose-p:leading-normal max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{fullText}</ReactMarkdown>
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