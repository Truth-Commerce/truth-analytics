import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Truth Analytics',
  description: 'Análise multi-marketplace por IA.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
