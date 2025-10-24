"use client";
import React, { useMemo, useState } from "react";
import { SignedIn, SignedOut, RedirectToSignIn, useUser } from "@clerk/nextjs";
import { demoProfile } from "@/lib/demoProfile";
import Sidebar from "@/components/Sidebar";
import ChatWindow from "@/components/ChatWindow";
import ChatInput from "@/components/ChatInput";
import MobileHeader from "@/components/MobileHeader";
import { useChatStream } from "@/lib/useChatStream";

export default function ChatApp() {
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const { user } = useUser();
  const isGuest = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("guest") === "1";

  const {
    messages,
    isStreaming,
    sendMessage,
    createNewChat,
    selectSession,
    endRef,
    sessions
  } = useChatStream({
    apiKey: process.env.NEXT_PUBLIC_AI_SECRET_KEY || "secret_ishant_angad_yadav",
    currentSessionId,
    onSessionChange: setCurrentSessionId,
  });

  const handleNewChat = () => {
    createNewChat();
  };

  const handleSessionSelect = (sessionId: string) => {
    selectSession(sessionId);
  };

  const handleToggleSidebar = () => {
    setIsSidebarCollapsed(!isSidebarCollapsed);
  };

  return (
    <>
      <SignedIn>
        <div className="flex h-screen bg-background">
          {/* Mobile Header */}
          <MobileHeader 
            isSidebarOpen={!isSidebarCollapsed} 
            onToggleSidebar={handleToggleSidebar} 
          />
          
          {/* Desktop Sidebar */}
          <div className="hidden lg:block">
            <Sidebar
              currentSessionId={currentSessionId}
              onSessionSelect={handleSessionSelect}
              onNewChat={handleNewChat}
              isCollapsed={isSidebarCollapsed}
              onToggleCollapse={handleToggleSidebar}
            />
          </div>
          
          {/* Mobile Sidebar Overlay */}
          {!isSidebarCollapsed && (
            <div className="lg:hidden fixed inset-0 z-50">
              <div className="absolute inset-0 bg-black/50" onClick={handleToggleSidebar} />
              <div className="relative w-80 h-full">
                <Sidebar
                  currentSessionId={currentSessionId}
                  onSessionSelect={handleSessionSelect}
                  onNewChat={handleNewChat}
                  isCollapsed={false}
                  onToggleCollapse={handleToggleSidebar}
                />
              </div>
            </div>
          )}
          
          <div className="flex-1 flex flex-col">
            <div className="flex-1 flex flex-col overflow-hidden">
              <ChatWindow messages={messages} isStreaming={isStreaming} endRef={endRef} />
            </div>
            <ChatInput onSend={sendMessage} disabled={isStreaming} />
          </div>
        </div>
      </SignedIn>

      <SignedOut>
        {isGuest ? (
          <div className="flex h-screen bg-background">
            {/* Mobile Header */}
            <MobileHeader 
              isSidebarOpen={!isSidebarCollapsed} 
              onToggleSidebar={handleToggleSidebar} 
            />
            
            {/* Desktop Sidebar */}
            <div className="hidden lg:block">
              <Sidebar
                currentSessionId={currentSessionId}
                onSessionSelect={handleSessionSelect}
                onNewChat={handleNewChat}
                isCollapsed={isSidebarCollapsed}
                onToggleCollapse={handleToggleSidebar}
              />
            </div>
            
            {/* Mobile Sidebar Overlay */}
            {!isSidebarCollapsed && (
              <div className="lg:hidden fixed inset-0 z-50">
                <div className="absolute inset-0 bg-black/50" onClick={handleToggleSidebar} />
                <div className="relative w-80 h-full">
                  <Sidebar
                    currentSessionId={currentSessionId}
                    onSessionSelect={handleSessionSelect}
                    onNewChat={handleNewChat}
                    isCollapsed={false}
                    onToggleCollapse={handleToggleSidebar}
                  />
                </div>
              </div>
            )}
            
            <div className="flex-1 flex flex-col">
              <div className="flex items-center justify-between p-3 border-b bg-background">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500" />
                  <div className="text-sm">{demoProfile.fullName} (Guest Mode)</div>
                </div>
              </div>
              <div className="flex-1 flex flex-col overflow-hidden">
                <ChatWindow messages={messages} isStreaming={isStreaming} endRef={endRef} />
              </div>
              <ChatInput onSend={sendMessage} disabled={isStreaming} />
            </div>
          </div>
        ) : (
          <RedirectToSignIn />
        )}
      </SignedOut>
    </>
  );
}
