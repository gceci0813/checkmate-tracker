import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Checkmate | Project Tracker',
  description: 'Checkmate Government Relations — Project Dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
