import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
import SidebarNav from "@/components/SidebarNav";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "NetRef Safety — Content Moderation",
  description: "AI-powered social media content moderation for professional athletes and referees",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body
        className={`${inter.className} h-full bg-gray-950 text-gray-100 antialiased`}
      >
        <div className="flex h-full">
          {/* Desktop sidebar */}
          <aside className="hidden md:flex md:flex-col md:w-56 md:border-r md:border-gray-800 md:bg-gray-900 md:px-4 md:py-6 md:gap-1 flex-shrink-0">
            <div className="mb-8 px-2 flex items-center gap-2.5">
              {/* Teal logo icon */}
              <div className="w-8 h-8 rounded-full bg-teal-500 flex items-center justify-center flex-shrink-0">
                <svg viewBox="0 0 24 24" className="w-4.5 h-4.5 text-white" fill="currentColor">
                  <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z" />
                </svg>
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-bold tracking-tight text-white leading-tight">
                  NetRef Safety
                </span>
                <span className="text-[10px] text-gray-500 leading-tight">
                  Content Moderation
                </span>
              </div>
            </div>
            <SidebarNav />
          </aside>

          {/* Main content area */}
          <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Mobile header */}
            <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-900 flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-teal-500 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-white" fill="currentColor">
                    <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z" />
                  </svg>
                </div>
                <span className="text-sm font-bold tracking-tight text-white">
                  NetRef Safety
                </span>
              </div>
              {/* User avatar */}
              <div className="w-8 h-8 rounded-full bg-teal-600 flex items-center justify-center text-xs font-bold text-white">
                S
              </div>
            </header>

            {/* Page content */}
            <div className="flex-1 overflow-y-auto pb-20 md:pb-0">
              {children}
            </div>
          </main>
        </div>

        {/* Mobile bottom navigation */}
        <BottomNav />
      </body>
    </html>
  );
}
