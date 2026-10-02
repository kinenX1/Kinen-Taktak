import type { PortfolioSeed } from "../portfolio";

type Translated = Pick<PortfolioSeed, "client" | "summary" | "overview" | "challenge" | "solution" | "design" | "development" | "results">;

/**
 * French versions of the seeded concept projects, keyed by slug. Used only
 * while a project still matches its seed; projects created or rewritten in
 * /admin are shown as entered.
 */
export const portfolioFr: Record<string, Translated> = {
  tavola: {
    client: "Concept — Restauration",
    summary: "Une application mobile de commande et de réservation pour les restaurants indépendants qui veulent un lien direct avec leurs clients.",
    overview:
      "Tavola est le concept d'une application mobile en marque blanche qui permet aux restaurants indépendants de gérer réservations, précommandes et fidélité en interne — sans confier la relation client aux plateformes.",
    challenge:
      "Les clients attendent le confort des grandes plateformes de livraison, mais un petit restaurant ne peut pas construire et maintenir seul une telle expérience. L'application devait paraître haut de gamme pour les clients et rester simple pour l'équipe en plein service.",
    solution:
      "Un modèle d'application unique que chaque restaurant personnalise avec son menu, ses couleurs et ses photos. Les clients réservent une table, commandent à l'avance et cumulent des récompenses ; l'équipe gère tout depuis un tableau de bord léger sur tablette.",
    design:
      "Nous avons conçu autour du moment où l'on a faim : de grandes photos, un menu qui se lit comme la carte imprimée et une commande réduite à trois étapes. Le tableau de bord utilise des états très contrastés, lisibles sous l'éclairage d'une cuisine.",
    development:
      "Une application multiplateforme avec un panier tolérant aux coupures réseau, le suivi des commandes en temps réel et une API commune à l'application client et au tableau de bord.",
    results: [
      "Commande en trois étapes, du menu à la confirmation",
      "Une seule base de code pour iOS, Android et la tablette",
      "Système de thèmes personnalisable pour chaque restaurant",
    ],
  },
  ledgerline: {
    client: "Concept — Opérations financières",
    summary: "Un espace de travail financier qui réunit factures, validations et rapports dispersés dans un seul tableau de bord apaisé.",
    overview:
      "Ledgerline est le concept d'une application web pour les petites équipes financières qui gèrent leurs validations entre e-mails, tableurs et logiciels comptables.",
    challenge:
      "Dans les entreprises en croissance, les équipes financières passent une grande partie de la clôture mensuelle à relancer des validations et à rapprocher des données entre outils. Toute alternative devait être fiable, auditable et plus rapide que le tableur qu'elle remplace.",
    solution:
      "Un espace avec des circuits de validation, une vue de trésorerie en direct et un journal d'audit pour chaque modification. Des intégrations récupèrent les données comptables pour que l'équipe travaille à partir d'une seule source de vérité.",
    design:
      "Beaucoup d'informations, présentées calmement : une palette sobre, des chiffres tabulaires et une hiérarchie claire. Chaque écran de validation répond aux trois mêmes questions — quoi, combien et qui décide.",
    development:
      "Une application full-stack typée avec permissions par rôle, synchronisations en arrière-plan et une piste d'audit immuable stockée avec chaque enregistrement.",
    results: [
      "Circuits de validation avec piste d'audit complète",
      "Accès par rôle pour valideurs, finance et administrateurs",
      "Tableau de bord optimisé pour la navigation au clavier",
    ],
  },
  "atelier-nord": {
    client: "Concept — Ameublement",
    summary: "Une boutique en ligne éditoriale pour une marque de mobilier design, avec un configurateur pour les pièces sur mesure.",
    overview:
      "Atelier Nord est le concept d'une boutique pour un fabricant de meubles sur mesure, où les clients choisissent matériaux, finitions et dimensions.",
    challenge:
      "Un meuble sur mesure est un achat réfléchi. Les clients doivent comprendre les matériaux et voir leur configuration avant de dépenser des milliers d'euros en ligne — et la marque voulait l'ambiance d'un showroom, pas d'un catalogue.",
    solution:
      "Une boutique éditoriale avec des collections pièce par pièce, un configurateur en direct avec un prix transparent et un paiement qui annonce clairement les délais de fabrication et de livraison.",
    design:
      "Des mises en page façon magazine, de l'espace et une palette neutre et chaleureuse laissent le produit au premier plan. Les échantillons de matières sont grands et tactiles, et chaque variation de prix est expliquée.",
    development:
      "Une architecture e-commerce headless avec un configurateur sur mesure, des pages produits rendues côté serveur pour le référencement et des intégrations pour le paiement et la gestion des commandes.",
    results: [
      "Configurateur avec prix détaillé en direct",
      "Catalogue rendu côté serveur pour le référencement",
      "Paiement avec des délais de fabrication clairs",
    ],
  },
  "halden-architects": {
    client: "Concept — Cabinet d'architecture",
    summary: "Un site portfolio pour un cabinet d'architecture où chaque projet se découvre comme une promenade dans le bâtiment.",
    overview:
      "Halden est le concept d'un site pour un cabinet d'architecture qui voulait une présence en ligne aussi réfléchie que ses bâtiments.",
    challenge:
      "Les portfolios d'architecture se résument souvent à des grilles d'images qui aplatissent le travail. Le cabinet avait besoin d'un site qui raconte la démarche, la matière et le lieu — et que l'équipe puisse mettre à jour elle-même.",
    solution:
      "Des récits de projets au long cours mêlant photos, plans et textes courts dans une narration au défilement, alimentés par un CMS aux blocs de mise en page flexibles.",
    design:
      "Une grille architecturale, une typographie sobre et des animations lentes et maîtrisées. Les images ont de l'espace pour respirer et les plans sont présentés en pleine largeur.",
    development:
      "Un site généré statiquement avec un CMS headless, une chaîne d'images responsive et des animations au défilement qui respectent la préférence « mouvement réduit ».",
    results: [
      "Blocs de récit modifiables par le cabinet",
      "Chaîne d'images responsive pour les grandes photos",
      "Narration au défilement compatible « mouvement réduit »",
    ],
  },
  fleetwise: {
    client: "Concept — Logistique",
    summary: "Un logiciel de répartition et de planification d'itinéraires pour les flottes de livraison régionales, avec carte en direct et application chauffeur.",
    overview:
      "Fleetwise est le concept d'une plateforme opérationnelle pour les entreprises de logistique régionales qui coordonnent chauffeurs, véhicules et livraisons urgentes.",
    challenge:
      "Les répartiteurs jonglaient entre appels téléphoniques, tableaux blancs et un vieux logiciel de bureau. Le nouveau système devait s'apprendre en une journée et rester fiable au milieu d'une journée perturbée.",
    solution:
      "Une console de répartition avec carte en direct, affectation par glisser-déposer et suggestions d'itinéraires automatiques, associée à une application chauffeur simple pour les statuts et les preuves de livraison.",
    design:
      "Une console sombre et très contrastée, pensée pour les longues journées, où la couleur est réservée aux exceptions pour que les problèmes sautent aux yeux.",
    development:
      "Un backend événementiel avec mises à jour en temps réel via WebSockets, un service de calcul d'itinéraires et une synchronisation chauffeur tolérante aux coupures.",
    results: [
      "Carte en temps réel avec la position des véhicules",
      "Répartition par glisser-déposer avec suggestions d'itinéraires",
      "Preuve de livraison saisie dans l'application chauffeur",
    ],
  },
  "pulse-care": {
    client: "Concept — Santé numérique",
    summary: "Une application d'accompagnement patient et son design system, centrés sur la clarté, le calme et l'accessibilité.",
    overview:
      "Pulse Care est un projet UX concept pour une application d'accompagnement patient — rendez-vous, rappels de traitement et messagerie sécurisée avec l'équipe soignante.",
    challenge:
      "Les applications de santé sont souvent utilisées par des personnes stressées, malades ou peu à l'aise avec la technologie. Chaque écran devait être lisible, tolérant aux erreurs et accessible, sans paraître clinique.",
    solution:
      "Une architecture de l'information simplifiée avec une action principale par écran, appuyée par un design system pensé pour les grands textes, le fort contraste et les lecteurs d'écran.",
    design:
      "Des couleurs douces et chaleureuses, de grandes zones tactiles et des textes en langage clair. Les composants ont été conçus et documentés avec des annotations d'accessibilité dès le départ.",
    development:
      "Livré sous forme de design system à base de tokens avec une bibliothèque de composants codée, ce qui simplifie l'implémentation sur le web comme sur mobile.",
    results: [
      "Design system avec annotations d'accessibilité",
      "Contraste WCAG AA sur tous les composants",
      "Une action principale par écran",
    ],
  },
};
