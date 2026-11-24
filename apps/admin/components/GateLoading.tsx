/**
 * ISS-133. The gate's loading screen.
 *
 * « Se déconnecter » is an escape hatch, not part of a normal load: the API's cold start has
 * measured 22 s to 5 m 56 s, and the first version of the gate left an operator on a bare
 * « Chargement... » with no way out. A refresh normally takes about a second, so showing the button
 * at once made it flash on every reload.
 *
 * The button is always rendered and hidden by `.gate-loading__signout` in globals.css, which
 * reveals it after a delay with a CSS animation. No state and no timer: nothing to cancel, and a
 * remount starts the delay again. There is no reduced-motion exception on purpose: the reveal
 * changes `visibility`, it does not move anything, and an exception made the button flash on every
 * refresh for visitors whose system has animations off.
 */
export function GateLoading({ onSignOut }: { onSignOut: () => void }) {
  return (
    <div className="page">
      <p>Chargement...</p>
      <button type="button" className="gate-loading__signout" onClick={onSignOut}>
        Se déconnecter
      </button>
    </div>
  );
}
