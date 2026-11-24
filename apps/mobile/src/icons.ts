import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react-native';
import {
  ArrowLeft01Icon, Home01Icon, Search01Icon, Message01Icon, UserIcon, PlusSignIcon,
  CheckmarkBadge01Icon, Mail01Icon, LockPasswordIcon, ArrowRight01Icon,
  SecurityCheckIcon, PackageIcon, FavouriteIcon, Briefcase01Icon, MoreVerticalIcon,
  StarIcon,
  // Accueil's Categories row. Note the CASING: it is SmartPhone01Icon, not
  // Smartphone01Icon - the package exports both spellings for different glyphs and
  // the lower-case one does not exist at 01. Verified against
  // node_modules/@hugeicons/core-free-icons/dist/types/index.d.ts rather than guessed.
  SmartPhone01Icon, LaptopIcon, SmartWatch01Icon, GameController01Icon, Bicycle01Icon,
  // `CF-49`, task 11. The four missing icons for the completion checklist.
  Image01Icon, Edit02Icon, DashboardSquare01Icon, Calendar03Icon,
  // A CHEVRON, not an arrow. The prototype's trust strip uses ChevronRight
  // (Accueil.tsx:162) and its « disclosure » meaning differs from ArrowRight's
  // « go do this » - the first says a screen lies behind this row, the second is a CTA.
  ChevronRightIcon,
  // « Entreprise vérifiée » on the Réparateurs vérifiés screen. The prototype uses
  // lucide's `Store` (Verification.tsx:7).
  Store01Icon,
  // One per ROOT category, for Recherche's result rows. Mobilité reuses IconBike rather than
  // importing a second bicycle.
  //
  // 🛑 AMENDED BY `CF-32`, 2026-08-29. This comment used to continue « Children inherit their
  // root's icon: `CategoryDto` carries no icon field, and 36 hand-picked child icons would be
  // a mapping nobody maintains. » The first clause is still true -- there is no icon column --
  // but the conclusion was overruled by the client, and it was overruled because it was
  // VISIBLE: with every child on its root's glyph, all ten Électronique children rendered the
  // same CPU chip and « Montres & bijoux » rendered a T-shirt. He wrote « ajouter les
  // icônes/logos manquants pour certaines catégories », and "manquants" meant the specific
  // glyph was missing, not that the row was blank. The 36-entry mapping now lives in
  // `src/lib/category-icons.ts`, typed so `tsc` catches an INCOMPLETE mapping. It cannot check
  // the slugs against the database -- read that file's note before assuming otherwise.
  CpuIcon, Sofa01Icon, TShirtIcon, BabyBed01Icon, GuitarIcon, Car01Icon, Grid02Icon,
  // ~~Profil's « Mes demandes » shortcut. IconPackage is already spoken for by « Mes
  // commandes », and the two need to be distinguishable at 20pt.~~ **`ClipboardCheckIcon`
  // AND `IconClipboard` WERE REMOVED BY `CF-22` ON 2026-08-30**, because that slice deleted
  // both tiles this comment names: « Mes demandes » is not among the client's six réparateur
  // rubriques, and « Mes commandes » was renamed « Mes réparations » (which uses IconWrench).
  // `IconPackage` survives and is still in use - `roles.tsx` and `NotificationRow`'s
  // `ICON_FOR` map - so do not read this note as retiring that one too.
  // `CF-11`'s « Mes offres reçues » tile, matching the inbox tray the client drew in mockup
  // `01`. 🛑 IT IS `InboxIcon`, NOT `Inbox01Icon` - the `01` form DOES NOT EXIST in this
  // package, which is the SmartPhone01Icon trap above in the opposite direction. Verified
  // against node_modules/@hugeicons/core-free-icons/dist/types/index.d.ts **with six
  // known-good names as a control**, because a checker that cannot find a name you know is
  // there reports "missing" and never reports "fine".
  InboxIcon,
  // Photo picker on the Publier wizard's step 1.
  Camera01Icon, Cancel01Icon,
  // CF4-49. The conversation's « Ajouter un document » button and pending-document tile, which
  // drew a 📄 emoji (rendered as a grey glyph unlike every other control). Name verified in
  // node_modules/@hugeicons/core-free-icons/dist/esm/File01Icon.js.
  File01Icon,
  // The notification centre. The prototype uses lucide's `Bell` in both headers
  // (`Accueil.tsx:40`, `AccueilPro.tsx:26`), `Wrench` for a repair-status row and
  // `CreditCard` for a money row (`Notifications.tsx:2`). All three names verified against
  // node_modules/@hugeicons/core-free-icons/dist/types/index.d.ts rather than guessed --
  // this file's SmartPhone01Icon comment above is why.
  Notification03Icon, Wrench01Icon, CreditCardIcon,
  // The réparateur Accueil. The prototype uses lucide's `MapPin` on the nearby-demande
  // card's meta line and `Lightbulb` on « Conseil du jour » (`AccueilPro.tsx:2`). Both
  // names verified against node_modules/@hugeicons/core-free-icons/dist/types/index.d.ts
  // rather than guessed - this file's SmartPhone01Icon comment above is why.
  Location01Icon, Idea01Icon,
  // The FAB demande feed's filter button. The prototype uses lucide's `SlidersHorizontal`
  // (`FilDemandes.tsx:2`); `PreferenceHorizontalIcon` is hugeicons' equivalent glyph -- three
  // horizontal tracks with handles -- where `FilterHorizontalIcon` is the funnel. Name verified
  // against node_modules/@hugeicons/core-free-icons/dist/types/index.d.ts.
  PreferenceHorizontalIcon,
  // `CF-32`, 2026-08-29. One per CHILD category, for Recherche's result rows -- see
  // `src/lib/category-icons.ts` for the mapping and for why the root-only scheme this
  // supersedes was the client's actual complaint. All 19 names below were verified against
  // node_modules/@hugeicons/core-free-icons/dist/types/index.d.ts **with 12 known-good names
  // as a control**, because the first checker written for this reported every name missing --
  // including `CpuIcon`, which was compiling at the time. A checker that cannot find a name
  // you know is there is broken; it never reports "fine".
  Tablet01Icon, Tv01Icon, Speaker01Icon, HeadphonesIcon, Router01Icon,
  WashingMachineIcon, BlenderIcon, ShovelIcon, BulbIcon, FrameIcon,
  HandBag01Icon, Watch01Icon, Scooter01Icon, ToyBrickIcon, PuzzleIcon,
  Dumbbell01Icon, PaintBrush01Icon, Motorbike01Icon, TireIcon,
  // `CF-22`, 2026-08-30. The two réparateur tiles mockup `01` draws that had no glyph here.
  //
  // 🛑 BOTH WERE CHOSEN BY RENDERING THEM, not by reading the name, because this package's
  // names are unreliable predictors of the shape - see the SmartPhone01Icon and InboxIcon
  // notes above. A throwaway script composited the candidates to a PNG at 96pt:
  //
  //   Chart01Icon      three plain bars, differing heights  <- what he drew
  //   BarChartIcon     three bars PLUS a stray floating dot
  //   Analytics01Icon  bars inside a rounded-square frame the mockup has no trace of
  //
  // 🛑 AND « Mes propositions » IS A DELIBERATE MISMATCH, recorded so nobody "fixes" it.
  // The mockup draws a PAPER PLANE and this icon set does not contain one: there are zero
  // `Paper*Icon` exports, and `Navigation01Icon`/`Navigation02Icon` - the names that sound
  // right - both render as a four-way directional PAD, not a plane. The same situation as
  // « Chaussures » having no footwear glyph. `MailSend01Icon` (an envelope with a trailing
  // arrow) is the closest available, and it earns the slot on a second count: it MIRRORS the
  // `InboxIcon` tray that `CF-11` gave the client's « Mes offres reçues », so offers-sent and
  // offers-received read as a matched pair rather than as two unrelated pictures.
  Chart01Icon, MailSend01Icon,
  // `CF-47`, 2026-08-30. The Paramètres tile, sixth in both grids.
  //
  // 🛑 CHOSEN BY RENDERING, not by name. Candidates: Settings01-05Icon, CogIcon,
  // Configuration01-02Icon. Settings01Icon is the classic, universally recognized settings
  // cog - clean at 20pt, distinct from all other icons. Rejected: Settings02Icon (busier),
  // Settings03Icon (hexagonal, less standard), Settings04/05Icon (sliders, less universal),
  // CogIcon (too industrial), Configuration icons (wrench suggests repair, confusing in an
  // app where IconWrench already means repair work). Rendered with render-settings-icons.mjs
  // 2026-08-30.
  Settings01Icon,
  // `CF-10`'s gate sheet (the « quelques minutes » note) and `CF-55`'s checklist ticks.
  // 🛑 Both names verified against
  // node_modules/@hugeicons/core-free-icons/dist/types/index.d.ts WITH FOUR KNOWN-GOOD
  // CONTROLS PASSING (InboxIcon, SmartPhone01Icon, SecurityCheckIcon, CheckmarkBadge01Icon),
  // because a broken checker reports "missing" and never reports "fine". `ConfettiIcon` was
  // checked at the same time and DOES NOT EXIST - see src/components/Confetti.tsx.
  Clock01Icon, Tick01Icon,
  /**
   * `CF-53`'s share glyph on the demande header.
   *
   * 🛑 `Share08Icon`, chosen by MATCHING THE DRAWING rather than by name. Mockup `02` draws three
   * nodes - one at the left middle, two at the right, joined by two straight connectors - and
   * `Share08Icon`'s own path data is circles at (18, 6.5), (6, 12) and (18, 17.5) with two
   * straight lines between them, symmetric about y=12. `Share07Icon` is the near-miss: also three
   * nodes, but asymmetric at (17.5, 5.5) / (5.5, 11.5) / (18.5, 18.5). `Share01Icon` through
   * `Share06Icon` are box-and-arrow glyphs, not nodes at all.
   *
   * The name was verified against
   * node_modules/@hugeicons/core-free-icons/dist/types/index.d.ts WITH A KNOWN-GOOD CONTROL
   * (`FavouriteIcon`, 6 hits), per this file's standing rule that a broken checker reports
   * "missing" and never reports "fine". Note that `require()`ing the package from Node returns an
   * EMPTY object - it is `"type": "module"` - so a probe that counts exports finds zero icons and
   * looks exactly like a missing dependency. Grep the type declarations instead.
   */
  Share08Icon,
  // `CF-45`, 2026-09-04. The Protection Revime sheet's four trust cards and the ⓘ that opens it.
  //
  // 🛑 ALL FIVE WERE CHOSEN BY RENDERING 31 CANDIDATES to one page at the sizes the sheet uses
  // (20pt Rouge Punch on a 40pt `redSoft` disc; 14pt muted for the trigger), not by reading names -
  // the CF-22 note below is why. What the rendering settled:
  //
  //   LockIcon               a plain padlock with a keyhole. `LockPasswordIcon` (the app's IconLock)
  //                          draws password dots and already means « verification required » on
  //                          IdentityGateSheet (V8 E1: OfferGateSheet); `SecurityLockIcon` repeats the band's shield;
  //                          `SafeIcon` is a hand, not a vault.
  //   IdentityCardIcon       an ID card with a portrait - unmistakable at 20pt. `IdVerifiedIcon` adds
  //                          a check badge that turns to noise at that size.
  //   StoreVerified01Icon    the storefront IconStore already uses for « Entreprise vérifiée »,
  //                          with a check - so the SIRET card and the badge share one shape.
  //   MailAtSign01Icon       an envelope with an @. Deliberately NOT `CustomerSupportIcon` or
  //                          `HeadsetIcon`: a headset promises a phone line, and the only channel
  //                          behind « Support Revime » is an e-mail address (`src/lib/support.ts`).
  //   InformationCircleIcon  replaces the « ⓘ » CHARACTER (U+24D8) the trigger row carried since P1.
  //                          That codepoint is NOT in Google Sans Flex - PIL returns the 7.50pt
  //                          `.notdef` advance for it, identical to a CJK control - so every device
  //                          was substituting a system glyph beside a Google Sans label.
  LockIcon, IdentityCardIcon, StoreVerified01Icon, MailAtSign01Icon, InformationCircleIcon,
} from '@hugeicons/core-free-icons';
import { createElement } from 'react';

type Props = { size?: number; color?: string; strokeWidth?: number };

const make =
  (icon: IconSvgElement) =>
  ({ size = 22, color = '#141414', strokeWidth = 1.8 }: Props) =>
    createElement(HugeiconsIcon, { icon, size, color, strokeWidth });

export const IconBack = make(ArrowLeft01Icon);
export const IconHome = make(Home01Icon);
export const IconSearch = make(Search01Icon);
export const IconMessage = make(Message01Icon);
export const IconUser = make(UserIcon);
export const IconPlus = make(PlusSignIcon);
export const IconVerified = make(CheckmarkBadge01Icon);
export const IconMail = make(Mail01Icon);
export const IconLock = make(LockPasswordIcon);
export const IconArrowRight = make(ArrowRight01Icon);
export const IconShieldCheck = make(SecurityCheckIcon);
export const IconPackage = make(PackageIcon);
export const IconHeart = make(FavouriteIcon);
export const IconBriefcase = make(Briefcase01Icon);
export const IconMore = make(MoreVerticalIcon);
export const IconStar = make(StarIcon);
export const IconSmartphone = make(SmartPhone01Icon);
export const IconLaptop = make(LaptopIcon);
export const IconWatch = make(SmartWatch01Icon);
export const IconConsole = make(GameController01Icon);
export const IconBike = make(Bicycle01Icon);
export const IconChevronRight = make(ChevronRightIcon);
export const IconStore = make(Store01Icon);
export const IconElectronics = make(CpuIcon);
export const IconHomeGarden = make(Sofa01Icon);
export const IconFashion = make(TShirtIcon);
export const IconFamily = make(BabyBed01Icon);
export const IconLeisure = make(GuitarIcon);
export const IconVehicle = make(Car01Icon);
export const IconOther = make(Grid02Icon);
export const IconInbox = make(InboxIcon);
export const IconCamera = make(Camera01Icon);
export const IconCancel = make(Cancel01Icon);
export const IconDocument = make(File01Icon);
export const IconNotification = make(Notification03Icon);
export const IconWrench = make(Wrench01Icon);
export const IconCreditCard = make(CreditCardIcon);
export const IconLocation = make(Location01Icon);
export const IconIdea = make(Idea01Icon);
export const IconFilters = make(PreferenceHorizontalIcon);
// `CF-49`, task 11. The four new icons for the completion checklist.
export const IconImage = make(Image01Icon);
export const IconEdit = make(Edit02Icon);
export const IconGrid = make(DashboardSquare01Icon);
export const IconCalendar = make(Calendar03Icon);
// `CF-22`'s réparateur RACCOURCIS tiles. See the import block for why `MailSend01Icon` is
// standing in for the paper plane the client drew.
export const IconChart = make(Chart01Icon);
export const IconMailSend = make(MailSend01Icon);
// `CF-47`'s Paramètres tile, sixth in both grids.
export const IconSettings = make(Settings01Icon);
export const IconClock = make(Clock01Icon);
export const IconTick = make(Tick01Icon);
// `CF-53`'s share control on the demande header. See the import block for why it is `Share08Icon`.
export const IconShare = make(Share08Icon);
// `CF-45`'s Protection Revime sheet. See the import block for how each was chosen.
export const IconPadlock = make(LockIcon);
export const IconIdCard = make(IdentityCardIcon);
export const IconStoreVerified = make(StoreVerified01Icon);
export const IconMailAt = make(MailAtSign01Icon);
export const IconInfo = make(InformationCircleIcon);

// `CF-32`'s child-category glyphs. Grouped by the root they sit under so a reader can check
// the set against the taxonomy rather than against this list's alphabetical accident.
// Note `IconBulb` is NOT `IconIdea`: `Idea01Icon` is a lightbulb meaning « conseil » on the
// réparateur Accueil, and reusing it for « Éclairage » would make a product category and a
// tip-of-the-day render identically.
export const IconTablet = make(Tablet01Icon); // Tablettes & liseuses
export const IconTv = make(Tv01Icon); // Télévisions
export const IconSpeaker = make(Speaker01Icon); // Audio & enceintes
export const IconHeadphones = make(HeadphonesIcon); // Casques & écouteurs
export const IconRouter = make(Router01Icon); // Objets connectés -- no IoT glyph exists
export const IconWashingMachine = make(WashingMachineIcon); // Électroménager
export const IconBlender = make(BlenderIcon); // Petit électroménager
export const IconShovel = make(ShovelIcon); // Jardin & outillage -- spans both halves
export const IconBulb = make(BulbIcon); // Éclairage
export const IconFrame = make(FrameIcon); // Décoration
export const IconHandBag = make(HandBag01Icon); // Sacs & maroquinerie
export const IconWatchAnalog = make(Watch01Icon); // Montres & bijoux -- not IconWatch
export const IconScooter = make(Scooter01Icon); // Trottinettes électriques
export const IconToyBrick = make(ToyBrickIcon); // Jouets (Famille)
export const IconPuzzle = make(PuzzleIcon); // Jeux & jouets (Loisirs) -- must differ from above
export const IconDumbbell = make(Dumbbell01Icon); // Articles de sport
export const IconPaintBrush = make(PaintBrush01Icon); // Loisirs créatifs
export const IconMotorbike = make(Motorbike01Icon); // Motos
export const IconTire = make(TireIcon); // Équipement automobile
