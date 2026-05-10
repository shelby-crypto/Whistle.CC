import type { Metadata } from "next";
import { DM_Sans, DM_Serif_Display } from "next/font/google";
import "./globals.css";
import AppShell from "@/components/AppShell";

// Body font. Exposed as a CSS variable so tokens.css can chain it into
// --font-sans without any component needing to import the font object.
const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-dm-sans",
  display: "swap",
});

// Heading font. Single-weight serif, used for display + h2/h3 in the mockups.
const dmSerif = DM_Serif_Display({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-dm-serif",
  display: "swap",
});

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
    <html lang="en" className={`h-full ${dmSans.variable} ${dmSerif.variable}`}>
      <body className="h-full antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
