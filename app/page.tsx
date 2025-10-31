'use client';
import { useChat } from '@ai-sdk/react';
 import { DefaultChatTransport } from 'ai';
 import { useEffect, useRef, useState } from 'react';
 import { User, Bot, Loader2, Send, AlertCircle } from 'lucide-react';
 import BotMessage from '@/components/bot-message';
 import { nanoid } from 'nanoid';
export default function IntelligentSearchChat() {
 const [chatId] = useState(() => nanoid());
 const [input, setInput] = useState('');
const {
 messages,
 sendMessage,
 status,
 error,
 regenerate,
 } = useChat({
 id: chatId,
 transport: new DefaultChatTransport({
 api: '/api/chat',
 }),
 });
const chatEndRef = useRef(null);
// Auto-scroll effect
 useEffect(() => {
 chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
 }, [messages]);
const handleSubmit = (e: React.FormEvent) => {
 e.preventDefault();
 if (!input.trim() || status !== 'ready') return;
sendMessage({ text: input });  
setInput(''); 

};
return (



{/* Header */}

FBA Intelligent Search Chat


 Ask questions about FBA processes, data, and insights.



 {/* Chat Area */}  
  <div className="flex-1 p-4 overflow-y-auto space-y-4">  
    {/* Initial Welcome Message */}  
    {messages.length === 0 && status === 'ready' && (  
      <div className="text-center py-10 text-gray-500">  
        <Bot className="w-12 h-12 mx-auto text-indigo-400" />  
        <p className="mt-2 text-lg font-semibold">  
          How can I assist you with FBA data today?  
        </p>  
        <p className="text-sm mt-1">  
          Start by asking a question, like &quot;What are the sales trends for the  
          last quarter?&quot;  
        </p>  
      </div>  
    )}  

    {/* Messages */}  
    {messages.map((message) => (  
      <div  
        key={message.id}  
        className={`flex ${  
          message.role === 'user' ? 'justify-end' : 'justify-start'  
        }`}  
      >  
        {message.role === 'user' ? (  
          <div className="flex items-start gap-3 p-3 bg-white rounded-lg shadow-sm max-w-2xl">  
            <div className="text-gray-800 text-sm font-medium whitespace-pre-wrap">  
              {message.parts.map((part, index) => {  
                if (part.type === 'text') {  
                  return <span key={index}>{part.text}</span>;  
                }  
                return null;  
              })}  
            </div>  
            <User className="w-6 h-6 text-gray-500 shrink-0" />  
          </div>  
        ) : (  
          <BotMessage message={message} />  
        )}  
      </div>  
    ))}  

    {/* Loading Indicator */}  
    {(status === 'submitted' || status === 'streaming') && (  
      <div className="flex justify-start">  
        <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg shadow-sm">  
          <Loader2 className="w-6 h-6 text-indigo-500 shrink-0 animate-spin" />  
          <p className="text-gray-800 text-sm font-medium">  
            AI is generating response...  
          </p>  
        </div>  
      </div>  
    )}  

    {/* Error Display */}  
    {error && (  
      <div className="flex justify-start">  
        <div className="flex items-start gap-3 p-3 bg-red-50 rounded-lg shadow-sm max-w-2xl">  
          <AlertCircle className="w-6 h-6 text-red-500 shrink-0" />  
          <div>  
            <p className="text-red-700 text-sm font-medium">  
              An error occurred: {error.message}  
            </p>  
            <button  
              onClick={() => regenerate()}  
              className="mt-2 text-sm text-red-600 hover:text-red-800 underline"  
            >  
              Try again  
            </button>  
          </div>  
        </div>  
      </div>  
    )}  

    <div ref={chatEndRef} />  
  </div>  

  {/* Input Area */}  
  <div className="p-4 border-t bg-gray-50">  
    <form onSubmit={handleSubmit} className="flex space-x-3">  
      <input  
        type="text"  
        value={input}  
        onChange={(e) => setInput(e.target.value)}  
        placeholder="Send a message..."  
        className="flex-1 p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition duration-150"  
        disabled={status !== 'ready'}  
      />  
      <button  
        type="submit"  
        disabled={!input.trim() || status !== 'ready'}  
        className="p-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:bg-indigo-300 transition duration-150 shadow-md"  
      >  
        <Send className="w-6 h-6" />  
      </button>  
    </form>  
  </div>  
</div> 

);
 }
