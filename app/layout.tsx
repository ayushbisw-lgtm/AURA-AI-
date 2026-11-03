import type { Metadata } from 'next';
import './globals.css';
import './modules.css';
import MotionFoundation from './MotionFoundation';

export const metadata: Metadata = {
  title: 'AURA AI — Personal Assistant',
  description: 'Your personal AI workspace, powered locally by Ollama.'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><MotionFoundation/>{children}</body></html>;
}
