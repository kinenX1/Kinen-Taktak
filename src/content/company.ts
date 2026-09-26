/** Copy for the process, values and about sections. Edit freely. */

export const processSteps = [
  {
    number: "01",
    title: "Discover",
    summary: "We learn your business, your users and what success actually means.",
    detail:
      "Conversations, research and a close look at what exists today. We leave this stage with a shared understanding of the problem — not just a list of features.",
    outputs: ["Goals & constraints", "User needs", "Technical audit"],
  },
  {
    number: "02",
    title: "Strategize",
    summary: "We decide what to build first, and what not to build at all.",
    detail:
      "We shape the scope, map the architecture and plan releases so that the first version delivers value quickly and leaves room to grow.",
    outputs: ["Scope & roadmap", "Architecture plan", "Estimate"],
  },
  {
    number: "03",
    title: "Design",
    summary: "Structure, interaction and visual language — tested before it's built.",
    detail:
      "Wireframes become interactive prototypes, then a complete visual system. You see and click through the product before a line of production code is written.",
    outputs: ["Prototypes", "Visual design", "Design system"],
  },
  {
    number: "04",
    title: "Build",
    summary: "Engineering in short cycles, with a working product at every step.",
    detail:
      "We build in focused iterations with regular demos, automated tests and a staging environment you can use at any time.",
    outputs: ["Weekly demos", "Staging environment", "Automated tests"],
  },
  {
    number: "05",
    title: "Launch",
    summary: "A calm, rehearsed release — not a leap of faith.",
    detail:
      "Performance tuning, accessibility and security checks, analytics and a launch plan. We stay close through the first days in production.",
    outputs: ["QA & audits", "Deployment", "Launch support"],
  },
  {
    number: "06",
    title: "Evolve",
    summary: "Products are never finished. We keep them moving.",
    detail:
      "We measure how the product is used, prioritise improvements with you and keep the platform secure, fast and up to date.",
    outputs: ["Analytics review", "Iteration roadmap", "Maintenance"],
  },
] as const;

export const pillars = [
  {
    title: "Design",
    body: "Clarity first. Interfaces that make complex things feel simple — and look like they belong to you.",
  },
  {
    title: "Technology",
    body: "Modern, proven tools chosen for the job, not for the trend. Fast, secure and maintainable.",
  },
  {
    title: "Strategy",
    body: "We ask why before how. Every feature has to earn its place in the product.",
  },
  {
    title: "Engineering",
    body: "Clean architecture, tested code and documentation your future team will thank us for.",
  },
] as const;

export const values = [
  {
    title: "Momentum over perfection",
    body: "We ship early, learn quickly and improve continuously. Movement creates clarity.",
  },
  {
    title: "Craft in the details",
    body: "Typography, timing, error messages, loading states. Quality lives in the parts most people skip.",
  },
  {
    title: "Honest by default",
    body: "Clear estimates, clear trade-offs and no promises we can't keep. If something is a bad idea, we'll say so.",
  },
  {
    title: "Built to be owned",
    body: "You own your code, your data and your product. We document it so anyone can pick it up.",
  },
  {
    title: "Accessible to everyone",
    body: "Products should work for every person who needs them — on any device, with any ability.",
  },
] as const;

export const principles = [
  { k: "Motion", v: "Everything we build should move businesses forward — visibly." },
  { k: "Era", v: "We build for where technology is going, not where it has been." },
] as const;
