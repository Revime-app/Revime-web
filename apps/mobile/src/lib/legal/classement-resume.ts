import type { LegalDocument } from './types';

export const CLASSEMENT_RESUME: LegalDocument = {
  title: 'CLASSEMENT DES RÉPARATEURS',
  updated: 'Dernière mise à jour : 10 octobre 2026',
  sections: [
    {
      heading: '',
      body: [
        'REVIME présente les réparateurs dans les résultats en fonction de plusieurs critères afin de proposer les réparateurs les plus pertinents pour chaque demande de réparation.',
      ],
    },
    {
      heading: '1. CRITÈRES DE CLASSEMENT',
      level: 1,
      body: [
        'Le classement prend en compte les critères suivants, par ordre général d\'importance :',
        '• la correspondance entre les compétences et catégories du réparateur et la demande de réparation ;',
        '• la distance lorsque la localisation est pertinente pour la prestation ;',
        '• la note moyenne ;',
        '• le nombre d’avis ;',
        '• la fiabilité et la bonne réalisation des transactions précédentes, notamment les transactions effectivement réalisées et les incidents constatés ;',
        '• le délai de réponse lorsque des données suffisantes sont disponibles ;',
        '• les modalités de réparation proposées, notamment à domicile, en atelier ou avec livraison.',
      ],
    },
    {
      heading: '2. CLASSEMENT ORGANIQUE',
      level: 1,
      body: [
        'REVIME ne propose pas, à ce jour, de positionnement payant permettant à un réparateur de remonter artificiellement dans les résultats.',
        'Le classement repose donc principalement sur la pertinence du réparateur par rapport à la demande et sur les critères présentés ci-dessus.',
      ],
    },
    {
      heading: '3. FILTRES',
      level: 1,
      body: [
        'Les utilisateurs peuvent utiliser différents filtres afin d\'affiner les résultats, notamment selon :',
        '• la distance ;',
        '• la note ;',
        '• le statut Particulier vérifié ou Professionnel vérifié ;',
        '• la vérification du profil ;',
        '• les modalités de réparation proposées ;',
        '• le prix lorsque celui-ci est pertinent.',
      ],
    },
    {
      heading: '4. ORDRE D’AFFICHAGE',
      level: 1,
      body: [
        'Selon les fonctionnalités disponibles dans l’application, les utilisateurs peuvent également choisir différents modes de tri, notamment :',
        '• Pertinence ;',
        '• Distance ;',
        '• Meilleure note ;',
        '• Prix.',
      ],
    },
    {
      heading: '5. ÉVOLUTION DU CLASSEMENT',
      level: 1,
      body: [
        'Les critères de classement peuvent évoluer afin d\'améliorer la pertinence des résultats ou de tenir compte de l\'évolution de REVIME.',
        'Toute modification substantielle des principaux paramètres de classement sera présentée conformément aux obligations applicables.',
        'La version en vigueur des informations relatives au classement est accessible depuis l\'application.',
        'Les informations détaillées figurent dans le document « Comment sont classés les réparateurs sur REVIME ? ».',
      ],
    },
  ],
};
