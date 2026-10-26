import type { Metadata } from 'next';
import './globals.css';
import './modules.css';

export const metadata: Metadata = {
  title: 'AURA AI — Personal Assistant',
  description: 'Your personal AI workspace, powered locally by Ollama.'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
