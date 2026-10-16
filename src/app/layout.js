import './globals.css';
import { Providers } from '@/components/Providers';

export const metadata = {
  title: 'E-HSE Prohaba Jaya Mandiri',
  description: 'Sistem HSE terintegrasi PT. Prohaba Jaya Mandiri — Head Office dan seluruh site',
};

export const viewport = { width: 'device-width', initialScale: 1, themeColor: '#0F2B5B' };

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
