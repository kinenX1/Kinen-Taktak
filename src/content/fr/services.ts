import type { ServiceSeed } from "../services";

type Translated = Pick<ServiceSeed, "title" | "shortTitle" | "tagline" | "description" | "audience" | "capabilities" | "benefits">;

/** French versions of the seeded services, keyed by slug. */
export const servicesFr: Record<string, Translated> = {
  websites: {
    title: "Création de sites web",
    shortTitle: "Sites web",
    tagline: "Des sites rapides, clairs et qui donnent envie d'agir.",
    description:
      "Nous concevons et développons des sites vitrines et de marque de A à Z — structurés autour de ce que vos visiteurs doivent comprendre et de ce que vous attendez d'eux. Chaque site est livré avec un outil de gestion de contenu que votre équipe peut vraiment utiliser.",
    audience:
      "Les entreprises qui lancent une nouvelle marque, remplacent un site qui ne leur ressemble plus ou préparent une croissance qu'un simple template ne peut pas suivre.",
    capabilities: [
      "Sites de marque et sites vitrines",
      "Landing pages et sites de campagne",
      "Intégration d'un CMS headless",
      "Motion design et interactions",
      "SEO technique et performance",
      "Analytics et suivi des conversions",
    ],
    benefits: [
      "Un site qui explique votre activité en quelques secondes",
      "Des contenus que votre équipe modifie sans développeur",
      "D'excellents Core Web Vitals sur de vrais appareils",
      "Accessible à tous les visiteurs",
    ],
  },
  "web-apps": {
    title: "Applications web",
    shortTitle: "Applications web",
    tagline: "Des logiciels sérieux, directement dans le navigateur.",
    description:
      "Portails clients, systèmes de réservation, tableaux de bord et outils internes. Nous gérons la réflexion produit, le design d'interface, l'architecture backend et le déploiement — pour que l'application fonctionne dès le premier jour et continue de fonctionner quand vous grandissez.",
    audience:
      "Les entreprises dont l'activité a dépassé les tableurs et les e-mails, et les fondateurs qui transforment un processus en produit.",
    capabilities: [
      "Cadrage et découverte produit",
      "Authentification, rôles et permissions",
      "Tableaux de bord et visualisation de données",
      "Paiements et intégrations tierces",
      "API et services backend",
      "Hébergement, supervision et maintenance",
    ],
    benefits: [
      "Un seul système au lieu de cinq outils déconnectés",
      "Une sécurité pensée dès le départ",
      "Une architecture qui suit la croissance",
      "Votre code et vos données vous appartiennent",
    ],
  },
  "mobile-apps": {
    title: "Applications mobiles",
    shortTitle: "Applications mobiles",
    tagline: "Des applications iOS et Android au ressenti natif.",
    description:
      "Nous développons des applications mobiles multiplateformes qui se sentent chez elles sur chaque appareil — avec mode hors ligne, notifications push et la finition qu'on attend des applications qu'on garde sur son écran d'accueil.",
    audience:
      "Les marques qui construisent une relation directe avec leurs clients, et les produits où le téléphone est le principal outil de travail.",
    capabilities: [
      "iOS et Android à partir d'une seule base de code",
      "Synchronisation des données hors ligne",
      "Notifications push",
      "Achats intégrés et paiements",
      "Publication sur l'App Store et Google Play",
      "Tableaux de bord d'administration associés",
    ],
    benefits: [
      "Une mise sur le marché plus rapide sur les deux plateformes",
      "Une expérience cohérente sur tous les appareils",
      "Un processus de publication reproductible",
      "Des analytics qui montrent comment l'application est utilisée",
    ],
  },
  "ui-ux-design": {
    title: "Design UI/UX",
    shortTitle: "Design UI/UX",
    tagline: "Des interfaces qu'on comprend sans mode d'emploi.",
    description:
      "Recherche, architecture de l'information, design d'interaction et systèmes visuels. Nous concevons des produits clairs dès la première utilisation et toujours agréables à la millième — et nous livrons des design systems sur lesquels les développeurs peuvent s'appuyer.",
    audience:
      "Les équipes qui lancent un nouveau produit, refondent un produit complexe ou ont besoin d'un design system pour garder de nombreux écrans cohérents.",
    capabilities: [
      "Recherche et entretiens utilisateurs",
      "Architecture de l'information",
      "Wireframes et prototypes interactifs",
      "Design visuel et d'interaction",
      "Design systems et bibliothèques de composants",
      "Tests d'utilisabilité",
    ],
    benefits: [
      "Moins de questions au support et moins d'abandons",
      "Des décisions fondées sur les comportements réels",
      "Un développement plus rapide grâce à un langage de composants commun",
      "Un produit qui ressemble à un seul produit",
    ],
  },
  "custom-software": {
    title: "Logiciels sur mesure",
    shortTitle: "Logiciels sur mesure",
    tagline: "Des logiciels taillés pour votre façon de travailler.",
    description:
      "Quand les outils du marché vous obligent à adapter vos processus, nous construisons des systèmes qui s'adaptent à eux — des plateformes opérationnelles aux intégrations qui relient les outils que vous utilisez déjà.",
    audience:
      "Les entreprises aux processus spécifiques, et les équipes qui assemblent tant bien que mal des outils qui ne communiquent pas entre eux.",
    capabilities: [
      "Systèmes opérationnels et back-office",
      "Intégrations et flux de données",
      "Modernisation de logiciels existants",
      "Reporting et business intelligence",
      "Contrôle d'accès par rôle",
      "Accompagnement sur le long terme",
    ],
    benefits: [
      "Des processus codés une fois, appliqués toujours de la même façon",
      "Moins de saisie manuelle",
      "Une visibilité en temps réel sur toute l'activité",
      "Pas de mauvaise surprise de licences par utilisateur",
    ],
  },
  "e-commerce": {
    title: "E-commerce",
    shortTitle: "E-commerce",
    tagline: "Des boutiques où l'on aime flâner, faire confiance et acheter.",
    description:
      "De la découverte produit au paiement, nous créons des expériences d'achat qui reflètent votre marque et éliminent les frictions — sur des plateformes hébergées ou des solutions entièrement sur mesure, selon votre catalogue et votre logistique.",
    audience:
      "Les marques qui dépassent leur première boutique, et les commerçants qui ont besoin d'une logique produit, d'intégrations ou d'un tunnel de paiement sur mesure.",
    capabilities: [
      "Design et développement de boutiques",
      "E-commerce headless",
      "Configurateurs de produits",
      "Paiement et intégration bancaire",
      "Intégration stocks et ERP",
      "Abonnements et adhésions",
    ],
    benefits: [
      "Une boutique qui vous ressemble, pas un thème",
      "Des pages plus rapides sur mobile, là où se font la plupart des achats",
      "Une logistique qui suit le volume de commandes",
      "La liberté de changer de plateforme plus tard",
    ],
  },
  saas: {
    title: "Produits SaaS",
    shortTitle: "SaaS",
    tagline: "De l'idée au produit par abonnement.",
    description:
      "Nous aidons fondateurs et entreprises à concevoir, développer et lancer des logiciels en SaaS — architecture multi-clients, facturation, onboarding et outils d'administration dont vous aurez besoin quand les vrais clients arriveront.",
    audience:
      "Les fondateurs qui valident un produit, et les entreprises établies qui transforment leur expertise interne en plateforme commercialisable.",
    capabilities: [
      "Cadrage du MVP et feuille de route",
      "Architecture multi-clients",
      "Facturation par abonnement",
      "Parcours d'onboarding et d'activation",
      "Outils d'administration et de support",
      "Analytics d'usage",
    ],
    benefits: [
      "Lancer avec l'essentiel, pas avec tout",
      "Des bases qui tiennent le cap des mille premiers clients",
      "Facturation et permissions gérées correctement",
      "Une équipe produit disponible pendant vos itérations",
    ],
  },
  automation: {
    title: "Automatisation",
    shortTitle: "Automatisation",
    tagline: "Confiez le travail répétitif aux logiciels.",
    description:
      "Nous cartographions vos processus, repérons les étapes que personne ne devrait faire à la main et les automatisons — en reliant formulaires, boîtes mail, tableurs, CRM et systèmes internes dans des flux fiables.",
    audience: "Les équipes qui perdent des heures en copier-coller, en reporting manuel ou à chercher des informations d'un outil à l'autre.",
    capabilities: [
      "Cartographie des processus",
      "Intégrations d'API",
      "Traitement de documents et de données",
      "Rapports et alertes programmés",
      "Circuits de validation",
      "Supervision et gestion des erreurs",
    ],
    benefits: [
      "Des heures rendues à votre équipe chaque semaine",
      "Moins d'erreurs de manipulation",
      "Des processus qui tournent toujours de la même façon",
      "Des journaux clairs quand quelque chose demande votre attention",
    ],
  },
  "ai-products": {
    title: "Produits IA",
    shortTitle: "Produits IA",
    tagline: "Une intelligence utile, intégrée à de vrais produits.",
    description:
      "Nous concevons et développons des fonctionnalités d'IA qui résolvent des problèmes précis — assistants fondés sur vos propres connaissances, recherche intelligente, compréhension de documents et copilotes métier — avec l'évaluation et les garde-fous nécessaires pour leur faire confiance en production.",
    audience:
      "Les entreprises qui ont un problème précis que l'IA peut aider à résoudre, et les équipes produit qui ajoutent des fonctionnalités intelligentes à un logiciel existant.",
    capabilities: [
      "Assistants IA et interfaces de chat",
      "Recherche dans vos propres contenus",
      "Extraction et classification de documents",
      "Copilotes métier et agents",
      "Évaluation et suivi de la qualité",
      "Déploiement respectueux de la vie privée",
    ],
    benefits: [
      "L'IA appliquée là où elle crée une vraie valeur",
      "Des réponses fondées sur vos données",
      "Une qualité mesurée avant le lancement",
      "Des coûts et une latence maîtrisés",
    ],
  },
};
