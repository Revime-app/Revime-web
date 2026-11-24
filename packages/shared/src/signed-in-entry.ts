/**
 * CF4-47. How the mobile app enters the signed-in area after sign-in, sign-up or onboarding.
 *
 * 🛑 `replace` ALONE LEAVES THE AUTH SCREENS IN HISTORY. The app's root Stack is flat - there is
 * no `(auth)/_layout`, so the welcome deck, « roles », « signup », « login » and « verification »
 * are all entries of that one stack - and `replace` swaps only the TOP entry. A signed-in user
 * could swipe back from the tabs onto the signup or login screen. `dismissAll` first pops the
 * stack to its first screen, so the `replace` leaves the destination as the ONLY entry and there
 * is nothing behind it for the back gesture (or Android's back button) to reach.
 *
 * `canDismiss` guards the case where the caller is already the stack's only screen, where
 * `dismissAll` has nothing to pop. Generic over the href type so expo-router's typed `Href`
 * passes through unchanged; the interface is the subset of its `router` this needs.
 */
export interface SignedInEntryRouter<H> {
  canDismiss(): boolean;
  dismissAll(): void;
  replace(href: H): void;
  push(href: H): void;
}

export function enterSignedInApp<H>(router: SignedInEntryRouter<H>, href: H, then?: H): void {
  if (router.canDismiss()) router.dismissAll();
  router.replace(href);
  // A follow-up screen goes ABOVE the new root, so its « Retour » lands on `href`.
  if (then !== undefined) router.push(then);
}
