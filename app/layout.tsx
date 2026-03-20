import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import AppShell from "@/components/AppShell";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Whistle — Online Protection for Athletes",
  description: "AI-powered online harassment protection for professional athletes, referees, and their teams",
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
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
