import { ScreenTitle } from './ui';

export function Soon({ title, text }: { title: string; text: string }) {
  return (
    <div className="esp-page">
      <ScreenTitle title={title} />
      <div className="esp-card">
        <p className="esp-card__title">Bientôt sur le site</p>
        <p className="esp-muted">{text}</p>
      </div>
    </div>
  );
}
