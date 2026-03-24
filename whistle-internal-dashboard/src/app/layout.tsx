import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Whistle — Internal Dashboard',
  description: 'Internal operations dashboard for the Whistle team.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        style={{
          margin: 0,
          padding: 0,
          fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
          background: '#0B0F1A',
          color: '#F1F5F9',
        }}
      >
        {children}
      </body>
    </html>
  );
}
