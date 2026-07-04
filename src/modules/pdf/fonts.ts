import fs from 'node:fs';
import path from 'node:path';

import { Font } from '@react-pdf/renderer';

export type PdfFontFamilies = { heading: string; body: string; mono: string };

let registered: PdfFontFamilies | null = null;

/**
 * Registra Sora/Inter/Space Mono a partir de public/fonts.
 * Se os TTFs não existirem (ex.: CI sem assets), cai para Helvetica/Courier —
 * o PDF perde as fontes da marca mas nunca quebra.
 */
export function registerPdfFonts(): PdfFontFamilies {
  if (registered) return registered;

  const dir = path.join(process.cwd(), 'public', 'fonts');
  const p = (f: string) => path.join(dir, f);
  const all = [
    'Sora-Regular.ttf',
    'Sora-Bold.ttf',
    'Inter-Regular.ttf',
    'Inter-SemiBold.ttf',
    'SpaceMono-Regular.ttf',
    'SpaceMono-Bold.ttf',
  ];

  if (all.every((f) => fs.existsSync(p(f)))) {
    Font.register({
      family: 'Sora',
      fonts: [{ src: p('Sora-Regular.ttf') }, { src: p('Sora-Bold.ttf'), fontWeight: 700 }],
    });
    Font.register({
      family: 'Inter',
      fonts: [{ src: p('Inter-Regular.ttf') }, { src: p('Inter-SemiBold.ttf'), fontWeight: 600 }],
    });
    Font.register({
      family: 'Space Mono',
      fonts: [
        { src: p('SpaceMono-Regular.ttf') },
        { src: p('SpaceMono-Bold.ttf'), fontWeight: 700 },
      ],
    });
    registered = { heading: 'Sora', body: 'Inter', mono: 'Space Mono' };
  } else {
    registered = { heading: 'Helvetica-Bold', body: 'Helvetica', mono: 'Courier' };
  }
  return registered;
}
