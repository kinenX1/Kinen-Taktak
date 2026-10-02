import type { OpeningSeed } from "../careers";

type Translated = Pick<OpeningSeed, "title" | "team" | "location" | "summary" | "responsibilities" | "requirements" | "niceToHave">;

/** French versions of the default job openings, keyed by slug. */
export const openingsFr: Record<string, Translated> = {
  "frontend-engineer": {
    title: "Développeur·se Frontend (React / Next.js)",
    team: "Développement",
    location: "Télétravail",
    summary: "Créez des interfaces rapides, animées et accessibles pour les sites et applications de nos clients, du premier prototype à la production.",
    responsibilities: [
      "Transformer des maquettes Figma en interfaces React et Next.js fidèles au pixel près",
      "Créer des animations et micro-interactions fluides sur tous les appareils",
      "Garder un haut niveau de performance, d'accessibilité et de SEO à chaque mise en ligne",
      "Relire le code et partager vos apprentissages avec l'équipe",
    ],
    requirements: [
      "Au moins 2 ans d'expérience sur des interfaces en production avec React et TypeScript",
      "De solides compétences CSS : mise en page, responsive et animation",
      "Une expérience avec Next.js ou un framework similaire",
      "Une communication écrite claire en français ou en anglais",
    ],
    niceToHave: ["Expérience avec Motion, GSAP ou three.js", "Un œil pour la typographie et le détail"],
  },
  "full-stack-engineer": {
    title: "Développeur·se Full-stack (Node.js / PostgreSQL)",
    team: "Développement",
    location: "Télétravail",
    summary: "Concevez et livrez les backends de nos plateformes clients : API, bases de données, authentification, paiements et intégrations.",
    responsibilities: [
      "Concevoir les modèles de données et les API de SaaS, boutiques en ligne et outils internes",
      "Mettre en place une authentification, des rôles et des permissions sécurisés",
      "Intégrer paiements, e-mails et services tiers",
      "Déployer, superviser et améliorer les systèmes en production",
    ],
    requirements: [
      "Au moins 3 ans d'expérience backend ou full-stack avec Node.js et TypeScript",
      "Une bonne maîtrise de SQL et PostgreSQL",
      "Une bonne compréhension des bases de la sécurité web",
      "L'envie de porter une fonctionnalité de bout en bout",
    ],
    niceToHave: ["Expérience avec Prisma, le serverless ou Vercel", "Projets d'IA ou d'automatisation"],
  },
  "product-designer": {
    title: "Product Designer (UI/UX)",
    team: "Design",
    location: "Télétravail",
    summary: "Façonnez l'apparence, le ressenti et le fonctionnement des produits de nos clients, de la recherche aux interfaces finales et aux design systems.",
    responsibilities: [
      "Animer des ateliers de découverte et cartographier les parcours utilisateurs",
      "Concevoir wireframes, prototypes et interfaces haute fidélité",
      "Construire et maintenir des design systems dans Figma",
      "Travailler main dans la main avec les développeurs jusqu'à la mise en ligne",
    ],
    requirements: [
      "Un portfolio montrant de vrais projets de design produit",
      "Une solide maîtrise de Figma, composants et prototypage compris",
      "Une bonne compréhension de l'accessibilité et du responsive",
      "La capacité d'expliquer et de défendre vos choix de design",
    ],
    niceToHave: ["Compétences en motion design", "Bases en HTML et CSS"],
  },
  "motion-designer": {
    title: "Motion Designer",
    team: "Design",
    location: "Télétravail",
    summary: "Créez des publicités animées, des présentations produit et des animations d'interface qui donnent vie aux marques.",
    responsibilities: [
      "Concevoir et animer des publicités et contenus sociaux pour nos clients",
      "Rédiger des guides d'animation et des spécifications d'interaction",
      "Produire des vidéos de lancement et des présentations produit",
    ],
    requirements: [
      "Une showreel avec des projets de motion design",
      "After Effects, Blender, Rive ou un outil similaire",
      "Un vrai sens du timing, du rythme et de la composition",
    ],
    niceToHave: ["Compétences 3D", "Expérience de l'animation pour le web"],
  },
  "mobile-developer": {
    title: "Développeur·se Mobile (React Native / Flutter)",
    team: "Développement",
    location: "Télétravail",
    summary: "Développez des applications iOS et Android pour nos clients, du premier build jusqu'à l'App Store et Google Play.",
    responsibilities: [
      "Développer des applications multiplateformes avec un code propre et testable",
      "Connecter les applications aux API, notifications push et paiements",
      "Publier et maintenir les applications sur l'App Store et Google Play",
    ],
    requirements: [
      "Des applications que vous avez développées et qui sont en ligne",
      "Une expérience React Native ou Flutter",
      "Une bonne connaissance des conventions UX mobiles",
    ],
    niceToHave: ["Expérience native iOS ou Android", "Applications fonctionnant hors ligne"],
  },
  "content-marketer": {
    title: "Social Media & Content Marketer",
    team: "Marketing",
    location: "Télétravail",
    summary: "Racontez l'histoire de MovEra sur Instagram, LinkedIn et TikTok, et aidez de nouveaux clients à découvrir notre travail.",
    responsibilities: [
      "Planifier et publier du contenu sur nos réseaux sociaux",
      "Transformer nos projets en études de cas, reels et publications",
      "Suivre les résultats et développer notre audience",
    ],
    requirements: [
      "Une expérience de développement d'un compte de marque ou de créateur",
      "Une excellente plume en français et en anglais",
      "À l'aise avec Canva, CapCut ou des outils similaires",
    ],
    niceToHave: ["Compétences en photo ou vidéo", "Expérience en publicité payante"],
  },
  "web-development-intern": {
    title: "Stagiaire en développement web",
    team: "Développement",
    location: "Télétravail",
    summary: "Découvrez comment se construisent de vrais produits clients en travaillant aux côtés de nos développeurs sur des projets réels.",
    responsibilities: [
      "Créer des composants et des pages avec React et Next.js",
      "Corriger des bugs et développer de petites fonctionnalités avec un mentor",
      "Participer aux revues, à la planification et aux démos clients",
    ],
    requirements: [
      "Des bases en HTML, CSS et JavaScript",
      "Un projet personnel ou scolaire à montrer",
      "De la curiosité et l'envie d'apprendre vite",
    ],
    niceToHave: ["Bases de React", "Git et GitHub"],
  },
};
