/** A green check drawn in two strokes, for the moments that end well (publiée, paiement reçu). */
export function SuccessMark({ tone = 'green' }: { tone?: 'green' | 'red' }) {
  return (
    <svg className={`ap-successmark ap-successmark--${tone}`} viewBox="0 0 52 52" width="56" height="56" aria-hidden="true">
      <circle className="ap-successmark__ring" cx="26" cy="26" r="23" fill="none" strokeWidth="3" />
      {tone === 'green' ? (
        <path className="ap-successmark__tick" d="M15 27 l8 8 l15 -17" fill="none" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path className="ap-successmark__tick" d="M18 18 l16 16 M34 18 l-16 16" fill="none" strokeWidth="4" strokeLinecap="round" />
      )}
    </svg>
  );
}
