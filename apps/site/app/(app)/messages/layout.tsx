import { privatePageMetadata } from '../../../lib/seo';

export const metadata = privatePageMetadata('Messages', '/messages');

export default function MessagesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
