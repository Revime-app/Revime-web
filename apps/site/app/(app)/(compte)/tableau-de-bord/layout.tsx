import { privatePageMetadata } from '../../../../lib/seo';

export const metadata = privatePageMetadata('Tableau de bord', '/tableau-de-bord');

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
