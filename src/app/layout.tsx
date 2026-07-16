import type { Metadata } from 'next';
import { Inter, Sora, Space_Mono } from 'next/font/google';
import './globals.css';
import { MotionProvider } from '@/components/motion-provider';
import { ToastProvider } from '@/components/ui/Toast';

const sora = Sora({
  subsets: ['latin'],
  weight: ['300', '400', '600', '700', '800'],
  variable: '--font-heading',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-body',
  display: 'swap',
});

const spaceMono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Truth Analytics',
    template: '%s — Truth Analytics',
  },
  description: 'Inteligência de marketplace por IA para o seu e-commerce.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${sora.variable} ${inter.variable} ${spaceMono.variable}`}>
      <body className="font-sans">
        <MotionProvider>
          <ToastProvider>
            <div id="app-content">{children}</div>
          </ToastProvider>
        </MotionProvider>
      </body>
    </html>
  );
}
