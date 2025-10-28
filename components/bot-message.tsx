'use client';

import { Bot, Loader2, Image as ImageIcon, Search, Calculator, Cloud } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type SearchResult = {
  url: string;
  title: string;
  snippet: string;
  [key: string]: any; // Allow other properties like 'link'
};

type BotMessageProps = {
  content: string | object;
  isLoading?: boolean;
  isError?: boolean;
  sources?: SearchResult[];
  messageType?: string;
  toolArgs?: any;
};

// --- Helper to get a user-friendly name for the tool ---
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
      return { icon: <Loader2 className="h-4 w-4 animate-spin" />, text: `Thinking...` };
  }
}

export default function BotMessage({
  content,
  isLoading = false,
  isError = false,
  sources = [],
  messageType,
  toolArgs,
}: BotMessageProps) {
  
  // --- 1. Handle Loading/Thinking State ---
  if (isLoading) {
    const { icon, text } = getToolInfo(messageType || 'loading', toolArgs);
    return (
      <div className="flex max-w-sm items-start gap-3">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-200">
          <Bot className="h-5 w-5 text-gray-600" />
        </div>
        <div className="flex-1 space-y-2 overflow-hidden rounded-xl bg-gray-100 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            {icon}
            <span>{text}</span>
          </div>
        </div>
      </div>
    );
  }

  // --- 2. Handle Error State ---
  if (isError) {
    return (
      <div className="flex max-w-sm items-start gap-3">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-red-100">
          <Bot className="h-5 w-5 text-red-600" />
        </div>
        <div className="flex-1 space-y-2 overflow-hidden rounded-xl bg-red-50 px-4 py-3 text-red-700">
          {typeof content === 'string' ? content : JSON.stringify(content)}
        </div>
      </div>
    );
  }

  // --- 3. Handle Tool Output (non-string content) ---
  if (typeof content !== 'string') {
    let toolName = messageType || 'webSearch';
    let toolOutput = content as any;
    let displayContent: React.ReactNode = null;

    try {
      if (toolName === 'webSearch' && toolOutput.results) {
        displayContent = (
          <div>
            <p className="text-sm text-gray-600">
              Found {toolOutput.results.length} web results.
            </p>
            {/* Sources will be rendered by the final message */}
          </div>
        );
      } else if (toolName === 'imageSearch' && toolOutput.images) {
        displayContent = (
          <div className="grid grid-cols-2 gap-2">
            {toolOutput.images.slice(0, 4).map((img: any, idx: number) => (
              <a
                key={idx}
                href={img.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <img
                  src={img.thumbnail}
                  alt={img.title}
                  className="rounded-lg object-cover"
                />
              </a>
            ))}
          </div>
        );
      } else if (toolName === 'calculator') {
        displayContent = (
          <p className="text-lg font-medium">
            Result: {toolOutput.result}
          </p>
        );
      } else if (toolName === 'weather') {
        displayContent = (
          <div className="text-sm">
            <p className="font-medium">{toolOutput.location}</p>
            <p>{toolOutput.temperature}°{toolOutput.unit} &bull; {toolOutput.condition}</p>
          </div>
        );
      } else {
        // Fallback for unknown tool
        displayContent = (
          <pre className="text-xs">{JSON.stringify(content, null, 2)}</pre>
        );
      }
    } catch (e) {
      displayContent = <pre className="text-xs">{JSON.stringify(content, null, 2)}</pre>
    }

    return (
      <div className="flex max-w-sm items-start gap-3">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-200">
          <Bot className="h-5 w-5 text-gray-600" />
        </div>
        <div className="flex-1 space-y-2 overflow-hidden rounded-xl bg-gray-100 px-4 py-3">
          {displayContent}
        </div>
      </div>
    );
  }


  // --- 4. Handle Final Text Response (string content) ---
  const validSources = sources
    .map(s => s.url || s.link) // Handle both 'url' and 'link'
    .filter(Boolean);

  return (
    <div className="flex max-w-2xl items-start gap-3">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-200">
        <Bot className="h-5 w-5 text-gray-600" />
      </div>
      <div className="flex-1 space-y-2 overflow-hidden rounded-xl bg-gray-100 px-4 py-3">
        {/* This renders the markdown */}
        <article className="prose prose-sm prose-p:leading-normal">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </article>

        {/* This renders the clickable sources */}
        {validSources.length > 0 && (
          <div className="mt-4 border-t pt-2">
            <h4 className="mb-1 text-xs font-semibold text-gray-600">
              Sources
            </h4>
            <div className="flex flex-wrap gap-2">
              {validSources.map((url, index) => {
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