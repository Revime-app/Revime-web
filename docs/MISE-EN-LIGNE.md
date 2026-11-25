# Mettre REVIME en ligne depuis cette copie (Revime-web)

Pour Malek. Aucune connaissance technique nécessaire : suivre les étapes dans l'ordre.
Le dépôt original (Revime-app/revime) n'est jamais modifié ni déployé.

## Ce qu'on met en place

- **Une API** (`api.revime.fr`), partagée par l'appli et le site. L'appli appelle déjà
  `api.revime.fr` : en pointant ce nom vers ta nouvelle API, l'appli et le site parlent à la
  même API, sans republier l'appli.
- **Le site** (`revime.fr`).
- **Une base de données neuve** (Supabase). L'appli n'étant pas publiée, rien à récupérer.

Les deux services sont décrits dans `render.yaml`, à la racine du dépôt : Render les crée
tout seul.

Coût indicatif : Render « Starter » environ 7 $ par mois et par service (2 services), Supabase
gratuit au départ.

## Règle d'or

**Ne colle jamais une clé secrète dans une conversation, un e-mail ou un fichier du dépôt.**
Les clés vont uniquement dans les cases de Render (ou de GitHub, étape 7).

---

## 1. Supabase (la base de données et les photos)

1. Créer un compte sur supabase.com, puis **New project**. Nom : `revime`. Région :
   **West EU (Paris)**. Choisir un mot de passe de base solide et le noter dans un gestionnaire
   de mots de passe.
2. **Project Settings → Database → Connection string**, puis noter :
   - `DATABASE_URL` : l'adresse **Transaction pooler** (port **6543**). Ajouter
     `?pgbouncer=true` à la fin.
   - `DIRECT_URL` : l'adresse **Session pooler** ou **Direct** (port **5432**).
   Dans les deux, remplacer `[YOUR-PASSWORD]` par le mot de passe de l'étape 1.
3. **Project Settings → API**, puis noter :
   - `SUPABASE_URL` : Project URL ;
   - `SUPABASE_SERVICE_ROLE_KEY` : la clé `service_role` (secrète).
4. **Storage → New bucket**, et créer ces 5 dossiers, tous **privés** (case Public
   décochée) :
   `demande-photos`, `attachments`, `business-documents`, `legal-documents`, `shipping-labels`.

Les tables et les catégories se créent toutes seules au premier démarrage de l'API.

## 2. Stripe (les paiements)

Dans le tableau de bord Stripe, en **mode test** d'abord (interrupteur en haut à droite) :

1. **Développeurs → Clés API** : noter `STRIPE_PUBLISHABLE_KEY` (pk_test_…) et
   `STRIPE_SECRET_KEY` (sk_test_…).
2. Activer **Connect** (pour verser l'argent aux réparateurs), si ce n'est pas déjà fait.
3. Les webhooks se créent à l'étape 6, une fois l'API en ligne.

## 3. Twilio et Resend (SMS et e-mails)

- **Twilio** : noter `TWILIO_ACCOUNT_SID`. Puis **Account → API keys** → créer une clé :
  `TWILIO_API_KEY_SID` et `TWILIO_API_KEY_SECRET`. Puis **Verify → Services** → créer un
  service « REVIME » : `TWILIO_VERIFY_SERVICE_SID`.
- **Resend** : **Domains** → ajouter `revime.fr` et créer chez ton hébergeur de domaine les
  enregistrements DNS que Resend affiche. Puis **API Keys** → `RESEND_API_KEY`.

## 4. Render (l'API et le site)

1. Créer un compte sur render.com en te connectant **avec GitHub** (le compte qui a accès à
   Revime-app).
2. **New → Blueprint**, choisir le dépôt **Revime-app/Revime-web**, branche **main**.
   Render lit `render.yaml` et propose deux services : `revime-api` et `revime-site`.
3. Render demande les valeurs secrètes. Remplir :

| Case | Valeur |
|---|---|
| `DATABASE_URL`, `DIRECT_URL` | étape 1 |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | étape 1 |
| `STORAGE_DRIVER` | `supabase` |
| `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY` | étape 2 |
| `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET`, `STRIPE_IDENTITY_WEBHOOK_SECRET` | mettre `a-remplir` pour l'instant (étape 6) |
| `TWILIO_…` (4 cases), `RESEND_API_KEY` | étape 3 |
| `PUBLIC_API_URL`, `BETTER_AUTH_URL` | `https://api.revime.fr` |
| `ADMIN_ORIGIN` | `https://admin.revime.fr` |
| `BETTER_AUTH_SECRET`, `CRON_SECRET` | une longue suite aléatoire différente pour chacune (par ex. un mot de passe de 40 caractères généré par ton gestionnaire de mots de passe) |
| `OPS_EMAIL` | ton adresse e-mail (alertes) |

4. **Apply**. Le premier déploiement prend environ 5 minutes. Il crée aussi toutes les tables
   dans Supabase.

## 5. Le domaine revime.fr

Dans Render, ouvrir chaque service → **Settings → Custom Domains** : Render affiche les
enregistrements à créer. Chez ton hébergeur de domaine :

- `api.revime.fr` : **CNAME** vers l'adresse `….onrender.com` du service `revime-api` ;
- `revime.fr` : l'enregistrement **A** (ou ALIAS) indiqué par Render pour `revime-site` ;
- `www.revime.fr` : **CNAME** vers l'adresse `….onrender.com` de `revime-site`.

Supprimer les anciens enregistrements `api`, `@` et `www` qui pointaient vers l'ancien
hébergement. Compter de quelques minutes à quelques heures. Render installe le cadenas HTTPS
tout seul.

## 6. Les webhooks Stripe (Stripe prévient l'API d'un paiement)

**Développeurs → Webhooks → Ajouter un endpoint**, trois fois :

| URL | Événements | Case Render |
|---|---|---|
| `https://api.revime.fr/api/v1/stripe/webhook` | `payment_intent.succeeded`, `payment_intent.canceled`, `checkout.session.completed`, `checkout.session.expired`, `charge.dispute.created`, `refund.updated` | `STRIPE_WEBHOOK_SECRET` |
| `https://api.revime.fr/api/v1/stripe/connect/webhook` (cocher « Événements sur les comptes connectés ») | `account.updated` | `STRIPE_CONNECT_WEBHOOK_SECRET` |
| `https://api.revime.fr/api/v1/stripe/identity/webhook` | tous les `identity.verification_session.*` | `STRIPE_IDENTITY_WEBHOOK_SECRET` |

Pour chacun, copier le **secret de signature** (whsec_…) dans la case Render indiquée, à la
place de `a-remplir`. Render redémarre l'API.

## 7. Les tâches automatiques (GitHub)

Sur GitHub, dépôt Revime-web → **Settings → Secrets and variables → Actions** : ajouter
`CRON_SECRET` (la même valeur que dans Render) et `DATABASE_URL` (étape 1). Elles servent aux
tâches automatiques déjà prévues (rapprochement des paiements, maintien de la base éveillée).

## 8. Vérifier

1. Ouvrir `https://api.revime.fr/api/v1/health` : la page doit répondre.
2. Ouvrir `https://revime.fr` :
   - créer un compte ;
   - recevoir le code par e-mail, puis par SMS ;
   - publier une demande ;
   - passer en mode Réparateur et activer les versements (Stripe en mode test) ;
   - faire une offre ;
   - repasser en Client et payer avec la carte **4242 4242 4242 4242** ;
   - échanger un message ;
   - faire avancer la réparation et la valider.
3. Quand tout fonctionne : refaire l'étape 2 et l'étape 6 en **mode live** de Stripe, et
   remplacer les clés dans Render. Avant le live, activer **Stripe Identity** en mode live et
   valider le point RGPD de la vérification d'identité par selfie (mention dans la politique de
   confidentialité, ou une alternative sans selfie).

## Ce qui n'est pas couvert ici

- **Publier l'appli** sur l'App Store et Google Play : il faudra tes propres comptes Expo,
  Apple Developer et Google Play Console, et construire l'appli depuis cette copie
  (`apps/mobile`).
- **Connexion avec Google ou Apple** : il faut tes propres identifiants Google Cloud et Apple.
  À ajouter plus tard ; la connexion par e-mail fonctionne sans.
- **Envoi par colis avec Boxtal** : en mode « prix fixe » tant qu'il n'y a pas de compte Boxtal
  à ton nom (`SHIPPING_DRIVER=manual`).
- **Tableau d'administration** (`apps/admin`) : à déployer ensuite sur `admin.revime.fr`.
