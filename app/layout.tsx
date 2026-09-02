import type { Metadata } from 'next';
import { Geist, Lora } from 'next/font/google';
import './globals.css';

const geist = Geist({ variable: '--font-sans', subsets: ['latin'] });
const lora = Lora({ variable: '--font-serif', subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL('https://lounasvahti.rnyqvist.chatgpt.site'),
  title: 'Lounasvahti – päivän lounaat läheltäsi',
  description: 'Paikallisten lounasravintoloiden päivän ruokalistat yhdessä paikassa.',
  openGraph: {
    title: 'Lounasvahti',
    description: 'Päivän lounaat läheltäsi — yhdessä paikassa.',
    images: [{ url: '/og.png', width: 1536, height: 908, alt: 'Lounasvahti – päivän lounaat läheltäsi' }],
    locale: 'fi_FI',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Lounasvahti',
    description: 'Päivän lounaat läheltäsi — yhdessä paikassa.',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fi"><body className={`${geist.variable} ${lora.variable}`}>{children}</body></html>;
}
