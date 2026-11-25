import { privatePageMetadata } from '../../../../lib/seo';

export const metadata = privatePageMetadata('Mon profil public', '/profil-pro');

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
