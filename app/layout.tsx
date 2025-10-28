import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { ThemeProvider } from "@/lib/theme"; // Assuming this path is correct
import { AI } from "./actions"; // Import the AI provider from actions.ts

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FBA Intelligence Search",
  description: "AI-powered search and chat application",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      {/* 1. ClerkProvider: Essential for authentication, should typically wrap everything */}
      <ClerkProvider>
        <body
          className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        >
          {/* 2. ThemeProvider: For managing light/dark mode */}
          <ThemeProvider
            defaultTheme="system"
            storageKey="fba-chatbot-theme"
          >
            {/* 3. AI Provider: Must wrap {children} so useUIState/useActions are available */}
            <AI>
              {children}
            </AI>
          </ThemeProvider>
        </body>
      </ClerkProvider>
    </html>
  );
}