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
    <div className="lg:hidden flex items-center justify-between p-4 border-b bg-background">
      <h1 className="text-lg font-semibold">FBA Intelligence Search</h1>
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
    </div>
  );
}
