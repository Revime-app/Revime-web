import { privatePageMetadata } from '../../../../lib/seo';

export const metadata = privatePageMetadata('Mes propositions', '/mes-propositions');

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
