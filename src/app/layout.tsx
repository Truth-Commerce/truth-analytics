import type { Metadata } from 'next';
import { Instrument_Serif, Inter } from 'next/font/google';
import './globals.css';
import { MotionProvider } from '@/components/motion-provider';
import { ToastProvider } from '@/components/ui/Toast';

const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-heading',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-body',
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
    <html lang="pt-BR" className={`${instrumentSerif.variable} ${inter.variable}`}>
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
