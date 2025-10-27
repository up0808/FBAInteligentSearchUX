"use client";
import React from "react";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";

interface MobileHeaderProps {
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export default function MobileHeader({ isSidebarOpen, onToggleSidebar }: MobileHeaderProps) {
  return (
    // --- MODIFICATION: Changed justify-between to justify-start and added gap-x-4 ---
    <div className="lg:hidden flex items-center justify-start gap-x-4 p-4 border-b bg-background">
      {/* --- MODIFICATION: Button moved to the top-left --- */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onToggleSidebar}
        className="h-8 w-8"
      >
        {isSidebarOpen ? (
          <X className="h-4 w-4" />
        ) : (
          <Menu className="h-4 w-4" />
        )}
      </Button>
      
      {/* --- MODIFICATION: Title is now the second item --- */}
      <h1 className="text-lg font-semibold">FBA Intelligence Search</h1>
    </div>
  );
}

