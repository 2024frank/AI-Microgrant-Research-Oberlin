import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Community Calendar Aggregator',
  description: 'Oberlin Environmental Dashboard — AI-powered community calendar',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
