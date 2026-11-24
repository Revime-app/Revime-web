import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="doc doc--plain">
      <h1 className="doc__title">Cette page n’existe pas</h1>
      <p>
        Retrouvez les documents de Revime sur la <Link href="/">page d’accueil</Link>.
      </p>
    </div>
  );
}
