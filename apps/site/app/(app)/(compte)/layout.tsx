import { AccountNav } from '../../../components/app/AccountNav';

/** The personal pages: the account column on a computer, the page alone on a phone. */
export default function CompteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="ap-account">
      <AccountNav />
      <div className="ap-account__main">{children}</div>
    </div>
  );
}
