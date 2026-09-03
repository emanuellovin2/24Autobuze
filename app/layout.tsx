import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Autobuze Bacău — hartă live',
  description:
    'Unde e autobuzul meu și în cât timp ajunge în stație. Hartă live a transportului public din Bacău — proiect demonstrativ cu simulare.',
};

export const viewport: Viewport = {
  themeColor: '#16a34a',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ro" data-theme="light" className="h-full">
      <body className="h-full">{children}</body>
    </html>
  );
}
