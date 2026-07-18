import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Shakhan — Stellar Money Toolkit',
  description: 'Send XLM, receive tips with a QR code, and split bills on Stellar testnet.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}