// The offline workshop: a procedural stand-in for the AI builder. It reads
// the player's request (English, French or Spanish, typos welcome), works out
// what kind of piece, colours, materials, style and size they want, and
// assembles a good-looking piece from hand-made templates.
//
// Used when no ANTHROPIC_API_KEY is configured, and as the fallback whenever
// the real AI fails. Deterministic for a given prompt and seed.

import { MATERIAL_COLORS, type Anim, type Material, type Role, type Shape } from "../shared/pieces";
import { clamp, hashString, makeRng } from "../shared/math";
import type { ForgeContext, ForgeResult } from "./forgeTypes";

// ---------------------------------------------------------------------------
// Vocabulary

type Lang = "en" | "fr" | "es";

/** Words that name a kind of piece. `variant` picks a template flavour. */
const ROLE_WORDS: Record<string, { role: Role; variant?: string }> = {};
function roleWords(role: Role, variant: string | undefined, words: string): void {
  for (const w of words.split(/\s+/)) if (w) ROLE_WORDS[w] = { role, variant };
}
roleWords("hull", undefined, "hull hulls keel coque casco carena section bottom chassis base body");
roleWords("hull", "bow", "bow prow front nose proue proa");
roleWords("hull", "stern", "stern back rear transom poupe popa");
roleWords("float", undefined, "float floats floater buoy flotteur flotador inflatable");
roleWords("float", "pontoon", "pontoon pontoons outrigger catamaran");
roleWords("float", "raft", "raft rafts log logs radeau balsa tronc troncos");
roleWords("float", "ring", "tube tire tyre donut");
roleWords("deck", undefined, "deck decks floor platform plank planks board boards pont cubierta plancher plataforma walkway terrace");
roleWords("sail", undefined, "sail sails voile voiles vela velas canvas mainsail spinnaker");
roleWords("sail", "triangle", "jib triangle triangular lateen bermuda");
roleWords("mast", undefined, "mast masts pole mat mastil crowsnest lookout rigging spar");
roleWords("engine", undefined, "engine engines motor motors moteur outboard propeller propellor prop helice turbo");
roleWords("engine", "steam", "steam boiler chimney vapeur vapor smokestack");
roleWords("engine", "jet", "jet jets rocket rockets thruster thrusters booster boosters reactor turbine fusee cohete");
roleWords("engine", "paddle", "paddlewheel waterwheel");
roleWords("oars", undefined, "oar oars paddle paddles row rowing rame rames remo remos aviron avirons");
roleWords("rudder", undefined, "rudder rudders steering tiller gouvernail timon barre");
roleWords("rudder", "wheel", "helm wheel steeringwheel volant");
roleWords("cabin", undefined, "cabin cabins house hut room cockpit shelter cabine cabina wheelhouse tent cottage shack casa maison");
roleWords("seat", undefined, "seat seats chair chairs bench benches stool sofa couch siege asiento silla banc banco hammock");
roleWords("seat", "throne", "throne trone trono");
roleWords("cannon", undefined, "cannon cannons gun guns canon canons cannone turret cannonball mortar");
roleWords("cannon", "laser", "laser lasers blaster blasters railgun");
roleWords("light", undefined, "light lamp lamps lantern lanterns lampe lanterne lampara linterna farol candle lights");
roleWords("light", "torch", "torch torches flame antorcha flambeau");
roleWords("light", "spot", "spotlight searchlight beacon projector projecteur foco");
roleWords("flag", undefined, "flag flags banner pennant drapeau bandera bandiera standard ensign");
roleWords("storage", undefined, "crate crates box boxes cargo storage caisse caja cajas container");
roleWords("storage", "chest", "chest chests coffre cofre trunk");
roleWords("storage", "barrel", "barrel barrels keg tonneau barril cask");
roleWords("decor", "anchor", "anchor ancre ancla");
roleWords("decor", "figurehead", "figurehead mascot");
roleWords("decor", "plant", "plant plants palm tree trees flower flowers bush garden plante arbre arbol flor planta");
roleWords("decor", "treasure", "treasure treasures coins jewels loot tresor tesoro");
roleWords("decor", "statue", "statue sculpture idol estatua");
roleWords("decor", "telescope", "telescope spyglass binoculars longuevue telescopio");
roleWords("decor", "bell", "bell cloche campana");
roleWords("decor", "lifering", "lifebuoy lifering lifesaver bouee");
roleWords("decor", "sign", "sign signpost nameplate pancarte letrero");
roleWords("decor", "duck", "duck ducky canard pato");
roleWords("decor", "umbrella", "umbrella parasol sombrilla");
roleWords("decor", "totem", "totem tiki");
roleWords("decor", "snowman", "snowman bonhomme");
roleWords("decor", "trophy", "trophy cup trophee trofeo");
roleWords("decor", "crystal", "crystal gem gems diamond jewel crystals cristal");
roleWords("decor", "skull", "skull skulls crane calavera");
roleWords("decor", "grill", "grill bbq barbecue");

/** Words that ask for a whole boat (we make a hull section in that style). */
const WHOLE_BOAT = new Set(
  (
    "boat boats ship ships yacht canoe kayak galleon sailboat speedboat submarine sub vessel bateau navire barco barca barque " +
    "ferry catamaran frigate schooner dinghy tugboat battleship cruiser junk gondola pirateship warship spaceship " +
    "motorboat steamboat longship trawler destroyer carrier voilier velero lancha"
  ).split(" "),
);

interface ColorWord {
  hex: string;
  label: string;
}
const COLOR_WORDS: Record<string, ColorWord> = {};
function colorWords(hex: string, label: string, words: string): void {
  for (const w of words.split(/\s+/)) if (w) COLOR_WORDS[w] = { hex, label };
}
colorWords("#d62828", "Red", "red reds rouge rojo roja rosso");
colorWords("#b0101e", "Crimson", "crimson");
colorWords("#e0242e", "Scarlet", "scarlet ecarlate");
colorWords("#f77f00", "Orange", "orange oranges naranja");
colorWords("#ffd60a", "Yellow", "yellow jaune amarillo amarilla");
colorWords("#e8b923", "Golden", "gold golden dore dorado dorada oro");
colorWords("#2b9348", "Green", "green vert verte verde");
colorWords("#80ed99", "Lime", "lime");
colorWords("#6b8f3a", "Olive", "olive");
colorWords("#1a9e8f", "Teal", "teal");
colorWords("#22d3ee", "Cyan", "cyan");
colorWords("#30c5c0", "Turquoise", "turquoise turquesa");
colorWords("#1f6fd1", "Blue", "blue bleu bleue azul blu");
colorWords("#1b2a5a", "Navy", "navy marine");
colorWords("#7b2cbf", "Purple", "purple violet violette violeta morado morada");
colorWords("#d62ba4", "Magenta", "magenta fuchsia");
colorWords("#ff70a6", "Pink", "pink rose rosa");
colorWords("#7a4a24", "Brown", "brown marron cafe brun");
colorWords("#1d1d22", "Black", "black noir noire negro negra");
colorWords("#f5f5f0", "White", "white blanc blanche blanco blanca");
colorWords("#8d939b", "Grey", "grey gray gris");
colorWords("#c7ccd1", "Silver", "silver argent plata plateado");
colorWords("#ff7f6e", "Coral", "coral corail");
colorWords("#98f5c8", "Mint", "mint menthe");
colorWords("#e8d8b0", "Beige", "beige cream creme");
colorWords("#6d1a2a", "Maroon", "maroon bordeaux burgundy");
colorWords("#3a2f9e", "Indigo", "indigo");
colorWords("#b8a1ff", "Lavender", "lavender lilac lila");
colorWords("#ffb38a", "Peach", "peach peche melocoton");
colorWords("#4ee1d8", "Aqua", "aqua");
colorWords("#1f9e60", "Emerald", "emerald emeraude esmeralda");
colorWords("#c3112f", "Ruby", "ruby rubis rubi");
colorWords("#1d4fbf", "Sapphire", "sapphire saphir zafiro");
colorWords("#b07a3c", "Bronze", "bronze bronce");
colorWords("#b8663a", "Copper", "copper cuivre cobre");

const LIGHTER = new Set(["light", "pale", "pastel", "clair", "claire", "claro", "clara", "soft", "baby"]);
const DARKER = new Set(["dark", "deep", "fonce", "foncee", "oscuro", "oscura", "midnight"]);

const MATERIAL_WORDS: Record<string, Material> = {};
function materialWords(m: Material, words: string): void {
  for (const w of words.split(/\s+/)) if (w) MATERIAL_WORDS[w] = m;
}
materialWords("wood", "wood wooden bois madera timber bamboo bambou bambu driftwood");
materialWords("darkwood", "oak mahogany ebony walnut chene caoba");
materialWords("metal", "metal metallic steel iron chrome aluminium aluminum tin acier fer hierro acero metalico");
materialWords("gold", "gold golden or oro dore dorado brass laiton");
materialWords("glass", "glass crystal verre vidrio cristal transparent");
materialWords("stone", "stone rock marble pierre piedra marbre marmol granite");
materialWords("plastic", "plastic rubber plastique plastico lego toy");
materialWords("glow", "neon glowing glow glows luminous lumineux brillante shiny electric radioactive");
materialWords("cloth", "cloth fabric silk velvet tissu tela seda");
materialWords("rope", "rope ropes corde cuerda");

type Style =
  | "pirate"
  | "viking"
  | "steampunk"
  | "future"
  | "royal"
  | "rustic"
  | "ice"
  | "tropical"
  | "dragon"
  | "candy"
  | "military"
  | "fishing"
  | "fire"
  | "ghost"
  | "shark"
  | "unicorn"
  | "samurai";

interface StyleInfo {
  adjective: string;
  primary: string;
  secondary: string;
  accent: string;
  mainMat: Material;
  trimMat: Material;
  skull?: boolean;
  stripes?: boolean;
  rainbow?: boolean;
  glowy?: boolean;
}

const STYLES: Record<Style, StyleInfo> = {
  pirate: { adjective: "Pirate", primary: "#4a3322", secondary: "#1d1d22", accent: "#b0101e", mainMat: "darkwood", trimMat: "gold", skull: true },
  viking: { adjective: "Viking", primary: "#6b4423", secondary: "#c9a227", accent: "#b0101e", mainMat: "darkwood", trimMat: "gold", stripes: true },
  steampunk: { adjective: "Steampunk", primary: "#5c3a1e", secondary: "#b5893a", accent: "#3d3d3d", mainMat: "darkwood", trimMat: "gold" },
  future: { adjective: "Hyper", primary: "#eef2f7", secondary: "#22d3ee", accent: "#7b2cbf", mainMat: "plastic", trimMat: "glow", glowy: true },
  royal: { adjective: "Royal", primary: "#f5f5f0", secondary: "#e8b923", accent: "#6a1b9a", mainMat: "plastic", trimMat: "gold" },
  rustic: { adjective: "Rustic", primary: "#a0703c", secondary: "#7a5230", accent: "#c8a670", mainMat: "wood", trimMat: "rope" },
  ice: { adjective: "Frost", primary: "#dff4ff", secondary: "#9fd8ff", accent: "#ffffff", mainMat: "glass", trimMat: "plastic" },
  tropical: { adjective: "Tiki", primary: "#e0b872", secondary: "#2a9d8f", accent: "#ff7f6e", mainMat: "wood", trimMat: "rope" },
  dragon: { adjective: "Dragon", primary: "#2b6e3f", secondary: "#e8b923", accent: "#d62828", mainMat: "darkwood", trimMat: "gold" },
  candy: { adjective: "Candy", primary: "#ff9ecb", secondary: "#ffffff", accent: "#98f5c8", mainMat: "plastic", trimMat: "plastic", stripes: true },
  military: { adjective: "Battle", primary: "#6b7177", secondary: "#4b5320", accent: "#2b2b2b", mainMat: "metal", trimMat: "metal" },
  fishing: { adjective: "Fisher's", primary: "#f5f5f0", secondary: "#1f6fd1", accent: "#e63946", mainMat: "wood", trimMat: "rope" },
  fire: { adjective: "Blaze", primary: "#3a1d14", secondary: "#f77f00", accent: "#ffd60a", mainMat: "darkwood", trimMat: "glow", glowy: true },
  ghost: { adjective: "Ghostly", primary: "#2d2a3a", secondary: "#9dffb0", accent: "#e8e8ff", mainMat: "darkwood", trimMat: "glow", glowy: true },
  shark: { adjective: "Shark", primary: "#7d8a96", secondary: "#f5f5f0", accent: "#d62828", mainMat: "metal", trimMat: "plastic" },
  unicorn: { adjective: "Unicorn", primary: "#ffffff", secondary: "#ffa8e8", accent: "#b8a1ff", mainMat: "plastic", trimMat: "gold", rainbow: true },
  samurai: { adjective: "Samurai", primary: "#1d1d22", secondary: "#c1121f", accent: "#e8b923", mainMat: "darkwood", trimMat: "gold" },
};

const STYLE_WORDS: Record<string, Style> = {};
function styleWords(s: Style, words: string): void {
  for (const w of words.split(/\s+/)) if (w) STYLE_WORDS[w] = s;
}
styleWords("pirate", "pirate pirates pirata piratas buccaneer corsair corsaire jolly roger");
styleWords("viking", "viking vikings norse nordic viking drakkar");
styleWords("steampunk", "steampunk victorian clockwork gear gears cog cogs");
styleWords("future", "futuristic future space scifi cyber cyberpunk robot robotic alien galaxy galactic hightech tech hitech futuriste futurista spatial espacial");
styleWords("royal", "royal king queen princess prince palace castle imperial emperor roi reine princesse rey reina princesa");
styleWords("rustic", "rustic old ancient vintage antique simple basic rustique vieux viejo antiguo");
styleWords("ice", "ice icy frozen snow snowy winter arctic polar glace hielo nieve neige");
styleWords("tropical", "tropical beach hawaii hawaiian summer island coconut bamboo plage playa");
styleWords("dragon", "dragon dragons dragonne");
styleWords("candy", "candy sweet sweets cake lollipop bonbon dulce caramelo cupcake");
styleWords("military", "military army navy battle war camo camouflage armored armoured tank militaire militar guerre guerra");
styleWords("fishing", "fishing fisher fisherman fishermans net peche pesca pecheur");
styleWords("fire", "fire fiery lava flame flames volcano inferno feu fuego llamas burning");
styleWords("ghost", "ghost ghosts spooky haunted halloween zombie skeleton fantome fantasma creepy");
styleWords("shark", "shark sharks requin tiburon");
styleWords("unicorn", "unicorn magic magical fairy sparkle sparkly licorne unicornio rainbow arcenciel arcoiris");
styleWords("samurai", "samurai ninja japanese pagoda shogun japonais japones");

const BIGGER = new Set(
  "big large huge giant massive mega enormous gigantic grand grande gros grosse gigante enorme jumbo colossal titan".split(" "),
);
const SMALLER = new Set("tiny mini small little petit petite pequeno pequena chiquito baby micro".split(" "));
const LONGER = new Set("long longer extended largo longue".split(" "));
const WIDER = new Set("wide broad large ancho wider".split(" "));
const TALLER = new Set("tall high towering haut alto alta".split(" "));
const STRONGER = new Set(
  "fast faster fastest speedy powerful strong turbo super ultra hyper rapid quick rapide rapido rapida puissant potente fuerte nitro supersonic insane epic legendary".split(
    " ",
  ),
);
const WEAKER = new Set("weak slow basic simple cheap lent lento lenta modest".split(" "));

const FRENCH_HINTS = new Set(
  "le la les un une des avec pour et je veux de du voile moteur coque rouge bleu bleue noir noire blanc vert jaune petit grand gros mon ma".split(
    " ",
  ),
);
const SPANISH_HINTS = new Set(
  "el los las una unos con para y quiero de del vela motor casco rojo roja azul negro negra blanco verde amarillo pequeno grande mi".split(
    " ",
  ),
);

// ---------------------------------------------------------------------------
// Parsing

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function tokenize(prompt: string): string[] {
  return stripAccents(prompt.toLowerCase())
    .replace(/sci-fi|sci fi/g, "scifi")
    .replace(/crow'?s nest/g, "crowsnest")
    .replace(/jolly roger/g, "pirate flag")
    .replace(/life ?(ring|buoy|saver)/g, "lifebuoy")
    .replace(/paddle ?wheel/g, "paddlewheel")
    .replace(/steering wheel|ship'?s wheel/g, "steeringwheel")
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .slice(0, 60);
}

/**
 * True when a and b differ by at most one edit. Swapping two neighbouring
 * letters counts as one edit ("sial" -> "sail"). Substitutions can be turned
 * off, which keeps short words like "most" from turning into "mast".
 */
function editDistanceAtMostOne(a: string, b: string, allowSubstitution = true): boolean {
  if (a === b) return true;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (la > lb) i++;
    else if (lb > la) j++;
    else if (a[i + 1] === b[j] && a[i] === b[j + 1]) {
      i += 2;
      j += 2;
    } else {
      if (!allowSubstitution) return false;
      i++;
      j++;
    }
  }
  return edits + (la - i) + (lb - j) <= 1;
}

/** Everyday words that must never be "corrected" into a keyword. */
const STOPWORDS = new Set(
  (
    "a an the and or with without for from into onto that this these those have has want need give make made makes build " +
    "create add some like very most must more less just also please plus your mine cool nice good best real kind sort type " +
    "look looks piece pieces part parts item thing things color colour colors side sides right left night might tight fight " +
    "sight light lite what when where which while each every them they their there here then than over under about above " +
    "avec pour dans sous mais tres comme bien faire fais veux voudrais quiero para como pero algo cosa pieza hace haz " +
    "mucho muchos tiene tengo yo je moi toi tu vous nous una uno unos unas los las les des une"
  ).split(" "),
);
const ALL_KEYWORDS = [
  ...Object.keys(ROLE_WORDS),
  ...WHOLE_BOAT,
  ...Object.keys(COLOR_WORDS),
  ...Object.keys(MATERIAL_WORDS),
  ...Object.keys(STYLE_WORDS),
].filter((w) => w.length >= 4);

/** Maps a token to a known keyword: exact, singular form, or one typo away. */
function canonical(token: string): string {
  if (isKnown(token) || STOPWORDS.has(token) || isModifier(token)) return token;
  if (token.length > 3 && token.endsWith("s") && isKnown(token.slice(0, -1))) return token.slice(0, -1);
  if (token.length >= 4) {
    const allowSub = token.length >= 5;
    for (const k of ALL_KEYWORDS) if (editDistanceAtMostOne(token, k, allowSub)) return k;
  }
  return token;
}

function isKnown(w: string): boolean {
  return w in ROLE_WORDS || WHOLE_BOAT.has(w) || w in COLOR_WORDS || w in MATERIAL_WORDS || w in STYLE_WORDS;
}

function isModifier(w: string): boolean {
  return (
    BIGGER.has(w) ||
    SMALLER.has(w) ||
    LONGER.has(w) ||
    WIDER.has(w) ||
    TALLER.has(w) ||
    STRONGER.has(w) ||
    WEAKER.has(w) ||
    LIGHTER.has(w) ||
    DARKER.has(w)
  );
}

interface Request {
  /** Canonical words of the prompt. */
  words: string[];
  role: Role;
  variant: string | undefined;
  wholeBoat: boolean;
  colors: ColorWord[];
  material: Material | null;
  style: Style | null;
  size: number;
  long: boolean;
  wide: boolean;
  tall: boolean;
  power: number;
  lang: Lang;
  skull: boolean;
  stripes: boolean;
  rainbow: boolean;
}

function mix(hex: string, toward: string, t: number): string {
  const a = parseInt(hex.slice(1), 16);
  const b = parseInt(toward.slice(1), 16);
  const ch = (v: number, s: number) => (v >> s) & 255;
  const out = [16, 8, 0].map((s) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t));
  return "#" + out.map((v) => v.toString(16).padStart(2, "0")).join("");
}

function parse(prompt: string): Request {
  const raw = tokenize(prompt);
  const words = raw.map(canonical);
  let role: Role | null = null;
  let variant: string | undefined;
  let decor: { variant?: string } | null = null;
  let wholeBoat = false;
  let hullVariant: string | undefined;
  const colors: ColorWord[] = [];
  let material: Material | null = null;
  let style: Style | null = null;
  let size = 1;
  let long = false;
  let wide = false;
  let tall = false;
  let power = 5;
  let skull = false;
  let stripes = false;
  let rainbow = false;
  let fr = 0;
  let es = 0;

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const next = words[i + 1];
    if (FRENCH_HINTS.has(raw[i])) fr++;
    if (SPANISH_HINTS.has(raw[i])) es++;

    // "light blue": a shade, not a lamp.
    if ((LIGHTER.has(w) || DARKER.has(w)) && next && next in COLOR_WORDS) {
      const c = COLOR_WORDS[next];
      const lighter = LIGHTER.has(w);
      colors.push({
        hex: mix(c.hex, lighter ? "#ffffff" : "#000000", lighter ? 0.45 : 0.4),
        label: `${lighter ? "Light" : "Dark"} ${c.label}`,
      });
      i++;
      continue;
    }
    if (w === "skull" || w === "skulls" || w === "calavera" || w === "crane") skull = true;
    if (w === "stripes" || w === "striped" || w === "stripe" || w === "rayures" || w === "rayas") stripes = true;
    if (w === "rainbow" || w === "arcenciel" || w === "arcoiris") rainbow = true;

    if (w in COLOR_WORDS) colors.push(COLOR_WORDS[w]);
    if (w in MATERIAL_WORDS && !material) material = MATERIAL_WORDS[w];
    if (w in STYLE_WORDS && !style) style = STYLE_WORDS[w];
    if (BIGGER.has(w)) size = Math.max(size, 1.35);
    if (SMALLER.has(w)) size = Math.min(size, 0.7);
    if (LONGER.has(w)) long = true;
    if (WIDER.has(w)) wide = true;
    if (TALLER.has(w)) tall = true;
    if (STRONGER.has(w)) power = Math.min(10, power + 3);
    if (WEAKER.has(w)) power = Math.max(1, power - 2);
    if (w === "very" || w === "tres" || w === "muy" || w === "super") power = Math.min(10, power + 1);

    const rw = ROLE_WORDS[w];
    if (rw) {
      if (rw.role === "decor") {
        decor ??= { variant: rw.variant };
      } else if (rw.role === "hull" && rw.variant) {
        // "bow"/"stern" refine a hull, they don't override another role.
        hullVariant ??= rw.variant;
      } else if (!role) {
        role = rw.role;
        variant = rw.variant;
      } else if (role === rw.role && !variant && rw.variant) {
        variant = rw.variant;
      }
    }
    if (WHOLE_BOAT.has(w)) wholeBoat = true;
  }

  // "flag" with a skull is a pirate flag, "skull" alone is decor.
  const askedForPiece = role !== null || hullVariant !== undefined || decor !== null;
  if (!role && hullVariant) {
    role = "hull";
    variant = hullVariant;
  } else if (role === "hull" && hullVariant) {
    variant = hullVariant;
  }
  if (!role && decor) {
    role = "decor";
    variant = decor.variant;
  }
  if (!role && wholeBoat) {
    role = "hull";
    variant = hullVariant;
  }
  // A "barrel float" is a float made of barrels.
  if (role === "float" && words.includes("barrel")) variant = "barrel";
  if (role === "storage" && variant === "barrel" && words.some((w) => w === "float" || w === "raft")) {
    role = "float";
  }

  const lang: Lang = fr >= 2 && fr > es ? "fr" : es >= 2 && es > fr ? "es" : "en";
  return {
    words,
    role: role ?? "decor",
    variant,
    wholeBoat: wholeBoat && !askedForPiece,
    colors,
    material,
    style,
    size,
    long,
    wide,
    tall,
    power,
    lang,
    skull,
    stripes,
    rainbow,
  };
}

// ---------------------------------------------------------------------------
// Building blocks

interface RawPart {
  shape: Shape;
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  rx: number;
  ry: number;
  rz: number;
  color: string;
  material: Material;
  anim: Anim;
}

type V3 = [number, number, number];

function part(
  shape: Shape,
  pos: V3,
  size: V3,
  color: string,
  material: Material,
  rot: V3 = [0, 0, 0],
  anim: Anim = "none",
): RawPart {
  return {
    shape,
    x: pos[0],
    y: pos[1],
    z: pos[2],
    sx: size[0],
    sy: size[1],
    sz: size[2],
    rx: rot[0],
    ry: rot[1],
    rz: rot[2],
    color,
    material,
    anim,
  };
}

const DEG = 180 / Math.PI;

/** A cylinder from point a to point b (rope, pole, pipe, oar shaft...). */
function beam(a: V3, b: V3, diameter: number, color: string, material: Material, anim: Anim = "none"): RawPart {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const len = Math.max(0.01, Math.hypot(dx, dy, dz));
  const nx = dx / len;
  const ny = dy / len;
  const nz = dz / len;
  const rx = Math.atan2(nz, ny) * DEG;
  const rz = Math.atan2(-nx, Math.hypot(ny, nz)) * DEG;
  return part(
    "cylinder",
    [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2],
    [diameter, len, diameter],
    color,
    material,
    [rx, 0, rz],
    anim,
  );
}

/** Everything a template needs to know about the requested look. */
interface Look {
  rng: () => number;
  req: Request;
  /** Main body colour and material. */
  main: string;
  mainMat: Material;
  /** Secondary colour (sails, cloth, panels). */
  second: string;
  /** Accent (trim, stripes, details). */
  accent: string;
  trimMat: Material;
  /** Natural wood tone for structural bits. */
  wood: string;
  dark: string;
  /** Size multiplier from size words. */
  s: number;
  style: StyleInfo | null;
  skull: boolean;
  stripes: boolean;
  rainbow: boolean;
  glowy: boolean;
}

const ACCENTS = ["#e63946", "#457b9d", "#2a9d8f", "#f4a261", "#e9c46a", "#6a4c93", "#1d3557", "#ff6b6b", "#06d6a0"];
const RAINBOW = ["#e63946", "#f77f00", "#ffd60a", "#2b9348", "#1f6fd1", "#7b2cbf"];

function pick<T>(rng: () => number, list: readonly T[]): T {
  return list[Math.floor(rng() * list.length) % list.length];
}

interface Defaults {
  main: string;
  mainMat: Material;
  second: string;
}

function makeLook(req: Request, rng: () => number, defaults: Defaults): Look {
  const style = req.style ? STYLES[req.style] : null;
  const userMain = req.colors[0]?.hex;
  const userSecond = req.colors[1]?.hex;
  let mainMat: Material = req.material ?? style?.mainMat ?? defaults.mainMat;
  let trimMat: Material = style?.trimMat ?? (mainMat === "metal" ? "metal" : "wood");
  // "Golden" means a gold material, "glowing" means glow accents.
  if (req.material === "glow") {
    mainMat = style?.mainMat ?? defaults.mainMat;
    trimMat = "glow";
  }
  if (req.material === "gold") trimMat = "gold";
  const main = userMain ?? style?.primary ?? (req.material ? MATERIAL_COLORS[req.material] : defaults.main);
  const second = userSecond ?? (userMain && defaults.mainMat !== "cloth" ? defaults.second : style?.secondary ?? defaults.second);
  const accent = req.colors[2]?.hex ?? style?.accent ?? (userMain ? mix(userMain, "#ffffff", 0.55) : pick(rng, ACCENTS));
  return {
    rng,
    req,
    main,
    mainMat,
    second,
    accent,
    trimMat,
    wood: pick(rng, ["#a0703c", "#9a6a38", "#b07b45", "#8d5f33"]),
    dark: "#3a2a1c",
    s: req.size,
    style,
    skull: req.skull || Boolean(style?.skull),
    stripes: req.stripes || Boolean(style?.stripes),
    rainbow: req.rainbow || Boolean(style?.rainbow),
    glowy: req.material === "glow" || Boolean(style?.glowy),
  };
}

interface Built {
  noun: string;
  width: number;
  length: number;
  power?: number;
  parts: RawPart[];
}

function dims(look: Look, w: number, l: number, max = 5): { W: number; L: number } {
  let W = Math.round(w * look.s);
  let L = Math.round(l * look.s);
  if (look.req.wide) W += 1;
  if (look.req.long) L += 1;
  return { W: clamp(W, 1, max), L: clamp(L, 1, max) };
}

/**
 * A flat skull-and-crossbones centred on `at`, facing +z ("z") or +x ("x").
 * `gap` is how far in front of `at` the decal sits; two-sided decals are
 * mirrored behind as well.
 */
function skullDecal(parts: RawPart[], at: V3, scale: number, facing: "z" | "x", color = "#f5f5f0", gap = 0.06, twoSided = false): void {
  const [x, y, z] = at;
  // (u across, v up, w outwards) -> piece space.
  const p = (u: number, v: number, w: number): V3 => (facing === "z" ? [x + u, y + v, z + w] : [x + w, y + v, z + u]);
  const s = (su: number, sv: number, sw: number): V3 => (facing === "z" ? [su, sv, sw] : [sw, sv, su]);
  for (const side of twoSided ? [1, -1] : [1]) {
    const w = gap * side;
    parts.push(part("sphere", p(0, 0, w), s(0.5 * scale, 0.46 * scale, 0.1 * scale), color, "plastic"));
    parts.push(part("box", p(0, -0.27 * scale, w), s(0.28 * scale, 0.14 * scale, 0.08 * scale), color, "plastic"));
    for (const eye of [-1, 1]) {
      parts.push(part("sphere", p(0.1 * scale * eye, 0.02 * scale, w + side * 0.04 * scale), s(0.12 * scale, 0.12 * scale, 0.06 * scale), "#111111", "plastic"));
    }
    for (const r of [35, -35]) {
      const rot: V3 = facing === "z" ? [0, 0, r] : [r, 0, 0];
      parts.push(part("box", p(0, -0.45 * scale, w * 0.8), s(0.9 * scale, 0.08 * scale, 0.05 * scale), color, "plastic", rot));
    }
  }
}

// ---------------------------------------------------------------------------
// Templates. Piece space: y up from 0, centred on x/z, +z = bow, +x = port.

function hull(look: Look, variant: string | undefined): Built {
  const { rng } = look;
  const { W, L } = dims(look, 3, 4);
  const H = clamp(1.15 * Math.sqrt(look.s), 0.8, 1.6);
  const parts: RawPart[] = [];
  const hullColor = look.main;
  const mat = look.mainMat;
  const trim = look.accent;
  const deckWood = look.mainMat === "wood" || look.mainMat === "darkwood" ? mix(look.wood, "#ffffff", 0.15) : mix(look.main, "#ffffff", 0.25);
  const side = 0.16;

  if (variant === "bow") {
    // A pointed bow section.
    parts.push(part("bow", [0, 0.17, 0], [W - 0.5, 0.34, L], hullColor, mat));
    parts.push(part("bow", [0, 0.36, -0.12], [W - 0.9, 0.06, L - 0.6], deckWood, "wood"));
    const len = Math.hypot(W / 2, L) - 0.25;
    for (const sx of [1, -1]) {
      const ry = Math.atan2((-sx * W) / 2, L) * DEG;
      const x = sx * (W / 4 - 0.12);
      parts.push(part("box", [x, H / 2, 0], [side, H, len], hullColor, mat, [0, ry, 0]));
      parts.push(part("box", [x, H + 0.05, 0], [side + 0.1, 0.12, len], trim, look.trimMat, [0, ry, 0]));
      parts.push(part("box", [x + sx * 0.085, H * 0.62, 0], [0.02, 0.14, len * 0.94], look.second, look.trimMat === "glow" ? "glow" : "plastic", [0, ry, 0]));
    }
    parts.push(part("cylinder", [0, (H + 0.35) / 2, L / 2 - 0.12], [0.24, H + 0.35, 0.24], trim, look.trimMat));
    if (look.req.style === "dragon" || look.req.style === "viking") {
      parts.push(part("sphere", [0, H + 0.55, L / 2 - 0.05], [0.42, 0.42, 0.62], look.main, mat));
      parts.push(part("cone", [0.12, H + 0.85, L / 2 - 0.15], [0.12, 0.35, 0.12], look.second, look.trimMat, [-20, 0, -15]));
      parts.push(part("cone", [-0.12, H + 0.85, L / 2 - 0.15], [0.12, 0.35, 0.12], look.second, look.trimMat, [-20, 0, 15]));
      parts.push(part("sphere", [0.14, H + 0.62, L / 2 + 0.12], [0.08, 0.08, 0.08], "#ffd60a", "glow", [0, 0, 0], "pulse"));
      parts.push(part("sphere", [-0.14, H + 0.62, L / 2 + 0.12], [0.08, 0.08, 0.08], "#ffd60a", "glow", [0, 0, 0], "pulse"));
    } else if (look.req.style === "shark") {
      for (let i = 0; i < 5; i++) {
        const z = L / 2 - 0.5 - i * 0.22;
        for (const sx of [1, -1]) {
          const x = sx * (W / 2) * ((L / 2 - z) / L) + sx * 0.06;
          parts.push(part("cone", [x, 0.55, z], [0.12, 0.22, 0.08], "#ffffff", "plastic", [180, 0, 0]));
        }
      }
    }
    return { noun: "Bow Section", width: W, length: L, parts };
  }

  // Flat-bottomed section with flared lower sides and straight upper sides.
  parts.push(part("box", [0, 0.15, 0], [W - 0.8, 0.3, L], hullColor, mat));
  parts.push(part("box", [0, 0.07, 0], [0.3, 0.14, L], look.dark, "darkwood"));
  for (const sx of [1, -1]) {
    parts.push(part("box", [sx * (W / 2 - 0.42), 0.42, 0], [side, 0.75, L], hullColor, mat, [0, 0, sx * 38]));
    parts.push(part("box", [sx * (W / 2 - side / 2), 0.62 + (H - 0.62) / 2, 0], [side, H - 0.62, L], hullColor, mat));
    parts.push(part("box", [sx * (W / 2 - 0.14), H + 0.05, 0], [0.28, 0.12, L], trim, look.trimMat));
    // Painted stripe.
    if (look.rainbow) {
      RAINBOW.slice(0, 3).forEach((c, i) =>
        parts.push(part("box", [sx * (W / 2 + 0.005), H * 0.78 - i * 0.1, 0], [0.02, 0.09, L * 0.98], c, "plastic")),
      );
    } else {
      parts.push(
        part("box", [sx * (W / 2 + 0.005), H * 0.66, 0], [0.02, 0.12, L * 0.98], look.second, look.trimMat === "glow" ? "glow" : "plastic"),
      );
    }
  }
  // Floorboards and ribs inside.
  parts.push(part("box", [0, 0.33, 0], [W - 0.5, 0.06, L - 0.1], deckWood, "wood"));
  const ribs = Math.max(2, Math.round(L / 1.4));
  for (let i = 0; i < ribs; i++) {
    const z = -L / 2 + ((i + 0.5) * L) / ribs;
    parts.push(part("box", [0, 0.42, z], [W - 0.45, 0.12, 0.12], look.dark, "darkwood"));
  }
  if (variant === "stern") {
    parts.push(part("box", [0, H / 2 + 0.1, -L / 2 + 0.08], [W - 0.1, H + 0.2, 0.16], hullColor, mat));
    parts.push(part("box", [0, H + 0.25, -L / 2 + 0.1], [W - 0.04, 0.14, 0.2], trim, look.trimMat));
    if (look.skull) skullDecal(parts, [0, H * 0.55, -L / 2 + 0.08], 0.9, "z", "#f5f5f0", -0.13);
    else parts.push(part("box", [0, H * 0.55, -L / 2 - 0.01], [W * 0.5, 0.22, 0.04], look.second, "plastic"));
    return { noun: "Stern Section", width: W, length: L, parts };
  }
  // Portholes on bigger sections.
  if (H > 1 && rng() < 0.7) {
    for (const sx of [1, -1]) {
      for (const z of [-L / 4, L / 4]) {
        parts.push(part("cylinder", [sx * (W / 2 + 0.01), H * 0.45, z], [0.26, 0.04, 0.26], "#9fd8ff", "glass", [0, 0, 90]));
      }
    }
  }
  const noun = look.req.wholeBoat ? "Hull Section" : pick(rng, ["Hull Section", "Hull Plank", "Hull Segment"]);
  return { noun, width: W, length: L, parts };
}

function float(look: Look, variant: string | undefined): Built {
  const { rng } = look;
  const parts: RawPart[] = [];
  if (variant === "raft" || (!variant && rng() < 0.25)) {
    const { W, L } = dims(look, 3, 3);
    const tones = [look.main, mix(look.main, "#000000", 0.12), mix(look.main, "#ffffff", 0.1)];
    const n = Math.max(2, W);
    const d = W / n;
    for (let i = 0; i < n; i++) {
      parts.push(
        part("cylinder", [-W / 2 + d / 2 + i * d, d * 0.42, (rng() - 0.5) * 0.3], [d * 0.92, L, d * 0.84], tones[i % 3], look.mainMat === "metal" ? "wood" : look.mainMat, [90, 0, 0]),
      );
    }
    for (const z of [-L / 3, L / 3]) parts.push(part("box", [0, d * 0.86, z], [W, 0.08, 0.18], "#c8a670", "rope"));
    return { noun: "Log Raft", width: W, length: L, parts };
  }
  if (variant === "barrel") {
    const { W, L } = dims(look, 2, 2);
    const color = look.req.colors[0]?.hex ?? "#8a5a2b";
    for (let ix = 0; ix < W; ix++) {
      for (let iz = 0; iz < L; iz++) {
        const x = -W / 2 + 0.5 + ix;
        const z = -L / 2 + 0.5 + iz;
        parts.push(part("cylinder", [x, 0.45, z], [0.82, 0.9, 0.82], color, "wood", [0, 0, 90]));
        for (const bx of [-0.28, 0.28]) parts.push(part("torus", [x + bx, 0.45, z], [0.86, 0.06, 0.86], "#555b61", "metal", [0, 0, 90]));
      }
    }
    parts.push(part("box", [0, 0.92, 0], [W - 0.2, 0.06, L - 0.2], look.wood, "wood"));
    return { noun: "Barrel Float", width: W, length: L, parts };
  }
  if (variant === "ring") {
    const s = clamp(2 * look.s, 1.2, 4);
    parts.push(part("torus", [0, 0.3, 0], [s, 0.6, s], look.req.colors[0]?.hex ?? "#ff6b6b", "plastic"));
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + Math.PI / 4;
      const r = s / 2 - 0.3;
      parts.push(part("box", [Math.sin(a) * r, 0.3, Math.cos(a) * r], [0.32, 0.62, 0.32], "#ffffff", "plastic", [0, a * DEG, 0]));
    }
    return { noun: "Inflatable Ring", width: Math.ceil(s), length: Math.ceil(s), parts };
  }
  // Twin pontoons with a frame.
  const { W, L } = dims(look, 3, 4);
  const color = look.req.colors[0]?.hex ?? (look.style ? look.main : "#e9ecef");
  const mat: Material = look.req.material ?? (look.style ? look.mainMat : "metal");
  for (const sx of [1, -1]) {
    const x = sx * (W / 2 - 0.42);
    parts.push(part("cylinder", [x, 0.4, -0.3], [0.8, L - 0.6, 0.8], color, mat, [90, 0, 0]));
    parts.push(part("cone", [x, 0.4, L / 2 - 0.3], [0.8, 0.6, 0.8], color, mat, [90, 0, 0]));
    parts.push(part("sphere", [x, 0.4, -L / 2 + 0.3], [0.8, 0.8, 0.5], color, mat));
    parts.push(part("box", [x, 0.4, 0], [0.82, 0.1, L * 0.7], look.accent, "plastic"));
  }
  for (const z of [-L / 3, 0, L / 3]) parts.push(part("box", [0, 0.86, z], [W - 0.2, 0.12, 0.2], look.wood, "wood"));
  return { noun: "Pontoon Float", width: W, length: L, parts };
}

function deck(look: Look): Built {
  const { rng } = look;
  const { W, L } = dims(look, 3, 3);
  const parts: RawPart[] = [];
  const planks = Math.max(3, Math.round(W * 2.5));
  const pw = W / planks;
  const base = look.req.colors[0]?.hex ?? (look.mainMat === "metal" ? "#8a9299" : look.wood);
  const mat: Material = look.req.material ?? (look.mainMat === "metal" ? "metal" : "wood");
  for (let i = 0; i < planks; i++) {
    const shade = mix(base, i % 2 ? "#000000" : "#ffffff", 0.06 + rng() * 0.06);
    parts.push(part("box", [-W / 2 + pw / 2 + i * pw, 0.24, 0], [pw * 0.94, 0.12, L], shade, mat));
  }
  for (const z of [-L / 2 + 0.3, L / 2 - 0.3]) parts.push(part("box", [0, 0.09, z], [W, 0.18, 0.22], look.dark, "darkwood"));
  if (rng() < 0.45 || look.req.style === "royal" || look.req.style === "fishing") {
    const rail = look.trimMat === "gold" ? look.accent : look.style ? look.accent : "#f1ead8";
    for (const sx of [1, -1]) {
      for (let i = 0; i <= L; i++) {
        parts.push(part("cylinder", [sx * (W / 2 - 0.06), 0.62, -L / 2 + i * (L / Math.max(1, L)) * 0.98 + 0.01], [0.08, 0.6, 0.08], rail, look.trimMat === "glow" ? "glow" : "wood"));
      }
      parts.push(part("box", [sx * (W / 2 - 0.06), 0.92, 0], [0.1, 0.08, L], rail, look.trimMat === "glow" ? "glow" : "wood"));
    }
  }
  return { noun: pick(rng, ["Deck Platform", "Plank Deck", "Deck Section"]), width: W, length: L, parts };
}

function sail(look: Look, variant: string | undefined): Built {
  const { rng } = look;
  const parts: RawPart[] = [];
  const tall = look.req.tall ? 1.2 : 1;
  const H = clamp(6.2 * look.s * tall, 3.5, 9.5);
  const cloth = look.req.colors[0]?.hex ?? (look.style ? look.style.secondary : "#f4efe1");
  const clothMat: Material = look.glowy && !look.req.colors[0] ? "glow" : "cloth";
  const mastColor = look.mainMat === "metal" || look.mainMat === "plastic" ? "#c7ccd1" : look.dark;
  const mastMat: Material = look.mainMat === "metal" || look.mainMat === "plastic" ? "metal" : "darkwood";
  const ropeColor = "#c8a670";

  if (variant === "triangle") {
    // Bermuda rig: the sail runs fore-and-aft behind the mast.
    const Ls = clamp(Math.round(3 * look.s), 2, 5);
    const sailH = H - 0.9;
    parts.push(part("cylinder", [0, H / 2, Ls / 2 - 0.15], [0.2, H, 0.2], mastColor, mastMat));
    parts.push(part("wedge", [0, 0.75 + sailH / 2, -0.05], [0.05, sailH, Ls - 0.3], cloth, clothMat, [0, 180, 0]));
    parts.push(part("cylinder", [0, 0.72, -0.05], [0.12, Ls - 0.1, 0.12], mastColor, mastMat, [90, 0, 0]));
    if (look.stripes || look.rainbow) {
      const cols = look.rainbow ? RAINBOW : [look.accent];
      cols.slice(0, 3).forEach((c, i) => {
        const y = 1.2 + i * 0.35;
        const frac = 1 - (y - 0.75) / sailH;
        parts.push(part("box", [0.035, y, Ls / 2 - 0.3 - (Ls - 0.3) * frac * 0.5], [0.02, 0.2, (Ls - 0.3) * frac], c, "cloth"));
      });
    }
    parts.push(beam([0, H - 0.1, Ls / 2 - 0.15], [0, 0.4, -Ls / 2 + 0.05], 0.03, ropeColor, "rope"));
    parts.push(part("box", [0, H + 0.2, Ls / 2 - 0.4], [0.03, 0.3, 0.5], look.accent, "cloth", [0, 0, 0], "flutter"));
    const noun = pick(rng, ["Triangle Sail", "Jib Sail", "Racing Sail"]);
    return { noun, width: 1, length: Ls, parts };
  }

  // Square rig: a broad sail hanging from a yard, facing forward.
  const { W } = dims(look, 3, 1);
  const Ws = Math.max(1.6, W - 0.4);
  const sailH = H * 0.62;
  const top = H - 0.5;
  const sailY = top - sailH / 2 - 0.1;
  parts.push(part("cylinder", [0, H / 2, -0.15], [0.22, H, 0.22], mastColor, mastMat));
  parts.push(part("cylinder", [0, top, -0.05], [0.14, Ws + 0.3, 0.14], mastColor, mastMat, [0, 0, 90]));
  parts.push(part("cylinder", [0, top - sailH - 0.15, -0.05], [0.12, Ws + 0.2, 0.12], mastColor, mastMat, [0, 0, 90]));
  // The sail billows slightly forward: three panels at different depths.
  const panelH = sailH / 3;
  for (let i = 0; i < 3; i++) {
    const belly = i === 1 ? 0.22 : 0.12;
    const panelColor = look.rainbow
      ? RAINBOW[(i * 2) % RAINBOW.length]
      : look.stripes && i === 1
        ? look.accent
        : cloth;
    parts.push(part("box", [0, top - 0.12 - panelH * (i + 0.5), belly], [Ws - i * 0.06, panelH + 0.02, 0.06], panelColor, clothMat));
  }
  if (look.skull) skullDecal(parts, [0, sailY, 0.16], 1.3, "z", look.req.colors[1]?.hex ?? "#f5f5f0", 0.14, true);
  else if (rng() < 0.4 && !look.stripes && !look.rainbow) {
    parts.push(part("sphere", [0, sailY, 0.28], [0.9, 0.9, 0.08], look.accent, "cloth"));
  }
  // Rigging down to the deck.
  for (const sx of [1, -1]) {
    parts.push(beam([sx * (Ws / 2 + 0.1), top, -0.05], [sx * (Ws / 2 - 0.1), 0.15, -0.42], 0.03, ropeColor, "rope"));
  }
  if (H > 6) {
    parts.push(part("cylinder", [0, H - 1.3, -0.15], [0.9, 0.12, 0.9], mastColor, mastMat));
    parts.push(part("torus", [0, H - 1.05, -0.15], [0.95, 0.06, 0.95], ropeColor, "rope"));
  }
  parts.push(part("box", [0.02, H + 0.25, -0.33], [0.03, 0.32, 0.38], look.accent, "cloth", [0, 0, 0], "flutter"));
  const noun = H > 7.5 ? "Great Sail" : pick(rng, ["Square Sail", "Sail", "Mainsail"]);
  return { noun, width: Math.ceil(Ws + 0.2), length: 1, parts };
}

function mast(look: Look): Built {
  const parts: RawPart[] = [];
  const H = clamp(7 * look.s * (look.req.tall ? 1.25 : 1), 4, 10);
  const color = look.req.colors[0]?.hex ?? look.dark;
  const mat: Material = look.req.material ?? (look.mainMat === "metal" ? "metal" : "darkwood");
  parts.push(part("cylinder", [0, H / 2, 0], [0.26, H, 0.26], color, mat));
  parts.push(part("cylinder", [0, H - 1.4, 0], [0.88, 0.14, 0.88], look.wood, "wood"));
  parts.push(part("torus", [0, H - 1.05, 0], [0.92, 0.07, 0.92], "#c8a670", "rope"));
  for (const sx of [1, -1]) {
    parts.push(part("cylinder", [sx * 0.43, H - 1.2, 0], [0.05, 0.4, 0.05], "#c8a670", "rope"));
  }
  parts.push(part("cylinder", [0, H * 0.55, 0], [0.14, 2.4, 0.14], color, mat, [0, 0, 90]));
  for (const sx of [1, -1]) parts.push(beam([0, H - 1.5, 0], [sx * 0.5, 0.1, -0.36], 0.035, "#c8a670", "rope"));
  // Rope ladder rungs.
  for (let y = 0.6; y < H - 1.6; y += 0.45) parts.push(part("box", [0, y, -0.2], [0.4, 0.04, 0.04], "#c8a670", "rope"));
  parts.push(part("box", [0.02, H + 0.3, -0.29], [0.03, 0.42, 0.5], look.accent, "cloth", [0, 0, 0], look.skull ? "none" : "flutter"));
  if (look.skull) skullDecal(parts, [0, H + 0.3, -0.29], 0.32, "x", "#f5f5f0", 0.03, true);
  return { noun: "Mast with Crow's Nest", width: 1, length: 1, parts };
}

function engine(look: Look, variant: string | undefined): Built {
  const { rng } = look;
  const parts: RawPart[] = [];
  const s = clamp(look.s, 0.7, 1.4);
  const body = look.req.colors[0]?.hex ?? (look.style ? look.main : pick(rng, ["#3d4852", "#b0101e", "#1f6fd1", "#2b2d42"]));
  const bodyMat: Material = look.req.material && look.req.material !== "glow" ? look.req.material : look.style?.mainMat === "plastic" ? "plastic" : "metal";
  const glowColor = look.glowy ? look.style?.secondary ?? "#22d3ee" : "#ff9f1c";
  const power = clamp(look.req.power + (look.req.size > 1 ? 1 : 0), 1, 10);

  if (variant === "steam") {
    parts.push(part("box", [0, 0.12, 0], [0.92, 0.24, 1.7], look.dark, "darkwood"));
    parts.push(part("cylinder", [0, 0.7, 0.1], [0.86, 1.3, 0.86], body, bodyMat, [90, 0, 0]));
    for (const z of [-0.35, 0.1, 0.55]) parts.push(part("torus", [0, 0.7, z], [0.9, 0.06, 0.9], "#b5893a", "gold", [90, 0, 0]));
    const chimH = 1.9 * s;
    parts.push(part("cylinder", [0, 1.0 + chimH / 2, 0.45], [0.32, chimH, 0.32], "#1d1d22", "metal"));
    parts.push(part("cylinder", [0, 1.0 + chimH, 0.45], [0.44, 0.14, 0.44], "#b5893a", "gold"));
    parts.push(part("box", [0, 0.48, -0.62], [0.46, 0.36, 0.06], glowColor, "glow", [0, 0, 0], "pulse"));
    parts.push(beam([0.3, 1.05, -0.3], [0.3, 0.3, -0.7], 0.09, "#b5893a", "gold"));
    parts.push(part("torus", [-0.42, 0.95, -0.2], [0.22, 0.05, 0.22], "#b5893a", "gold", [0, 0, 90]));
    parts.push(part("box", [0, 0.35, -0.8], [0.12, 0.12, 0.16], "#555b61", "metal"));
    parts.push(part("box", [0, 0.35, -0.9], [0.9, 0.05, 0.15], "#b5893a", "gold", [90, 0, 0], "spin"));
    parts.push(part("box", [0, 0.35, -0.9], [0.9, 0.05, 0.15], "#b5893a", "gold", [90, 90, 0], "spin"));
    return { noun: "Steam Engine", width: 1, length: 2, power, parts };
  }
  if (variant === "jet") {
    const L = 2;
    parts.push(part("capsule", [0, 0.5 * s, 0.1], [0.75 * s, 1.7 * s, 0.75 * s], body, bodyMat, [90, 0, 0]));
    parts.push(part("cone", [0, 0.5 * s, -0.85 * s], [0.7 * s, 0.5 * s, 0.7 * s], "#3d3d3d", "metal", [90, 0, 0]));
    parts.push(part("cone", [0, 0.5 * s, -1.25 * s], [0.55 * s, 0.7 * s, 0.55 * s], glowColor, "glow", [-90, 0, 0], "pulse"));
    parts.push(part("torus", [0, 0.5 * s, 0.55 * s], [0.8 * s, 0.08, 0.8 * s], look.accent, look.trimMat === "glow" ? "glow" : "metal", [90, 0, 0]));
    for (const [rz, x, y] of [
      [0, 0, 0.95],
      [90, 0.42, 0.5],
      [-90, -0.42, 0.5],
    ] as const) {
      parts.push(part("wedge", [x * s, y * s, -0.45 * s], [0.06, 0.45 * s, 0.7 * s], look.accent, "metal", [0, 180, rz]));
    }
    parts.push(part("box", [0, 0.06, 0.1], [0.5 * s, 0.12, 1.2 * s], "#555b61", "metal"));
    return { noun: power >= 8 ? "Turbo Jet Thruster" : "Jet Thruster", width: 1, length: L, power, parts };
  }
  if (variant === "paddle") {
    const D = clamp(2.2 * s, 1.6, 3);
    parts.push(part("box", [0, 0.15, 0], [D + 0.3, 0.3, 1], look.dark, "darkwood"));
    for (const sx of [1, -1]) parts.push(part("box", [sx * 0.15 * D, D / 2 + 0.15, 0], [0.12, D * 0.5, 0.3], look.dark, "darkwood"));
    const wheelColor = look.req.colors[0]?.hex ?? "#b0101e";
    parts.push(part("torus", [0, D / 2 + 0.2, 0], [D, 0.12, D], wheelColor, "wood", [0, 0, 90], "spin"));
    for (let i = 0; i < 4; i++) {
      parts.push(part("box", [0, D / 2 + 0.2, 0], [D * 0.95, 0.9, 0.08], look.wood, "wood", [i * 45, 0, 90], "spin"));
    }
    parts.push(part("cylinder", [0, D / 2 + 0.2, 0], [0.18, 1.2, 0.18], "#555b61", "metal", [0, 0, 90]));
    return { noun: "Paddle Wheel", width: 1, length: Math.ceil(D), power, parts };
  }
  // Outboard motor with a spinning propeller.
  parts.push(part("box", [0, 0.1, 0.25], [0.7 * s, 0.2, 0.7 * s], "#555b61", "metal"));
  parts.push(part("capsule", [0, 0.85 * s, 0.2], [0.75 * s, 1.0 * s, 0.9 * s], body, bodyMat));
  parts.push(part("box", [0, 1.05 * s, 0.2], [0.78 * s, 0.1, 0.92 * s], look.accent, look.trimMat === "glow" ? "glow" : "plastic"));
  parts.push(part("cylinder", [0, 0.45 * s, -0.25], [0.22, 0.75 * s, 0.22], "#3d3d3d", "metal"));
  parts.push(part("sphere", [0, 0.14, -0.3], [0.3, 0.3, 0.45], "#3d3d3d", "metal"));
  parts.push(part("box", [0, 0.14, -0.6], [0.95 * s, 0.05, 0.16], "#c7ccd1", "metal", [90, 0, 0], "spin"));
  parts.push(part("box", [0, 0.14, -0.6], [0.95 * s, 0.05, 0.16], "#c7ccd1", "metal", [90, 90, 0], "spin"));
  parts.push(beam([0, 0.95 * s, 0.6], [0, 0.95 * s, 1.05], 0.08, "#1d1d22", "metal"));
  const noun = power >= 8 ? "Turbo Outboard Motor" : power <= 3 ? "Little Outboard Motor" : "Outboard Motor";
  return { noun, width: 1, length: 2, power, parts };
}

function oars(look: Look): Built {
  const parts: RawPart[] = [];
  const W = clamp(Math.round(4 * look.s), 3, 5);
  const color = look.req.colors[0]?.hex ?? look.wood;
  const mat: Material = look.req.material ?? "wood";
  parts.push(part("box", [0, 0.35, 0], [W - 1.6, 0.12, 0.45], look.dark, "darkwood"));
  for (const sx of [1, -1]) {
    const lock: V3 = [sx * (W / 2 - 0.9), 0.55, 0];
    parts.push(part("box", [lock[0], 0.3, 0], [0.16, 0.6, 0.16], look.dark, "darkwood"));
    parts.push(beam([sx * 0.15, 0.75, 0.15], [sx * (W / 2 - 0.25), 0.2, -0.2], 0.09, color, mat, "sway"));
    parts.push(part("box", [sx * (W / 2 - 0.18), 0.17, -0.24], [0.42, 0.06, 0.26], color, mat, [0, 0, sx * -18], "sway"));
    parts.push(part("cylinder", [sx * 0.2, 0.76, 0.17], [0.11, 0.24, 0.11], look.accent, "rope", [0, 0, 90]));
  }
  return { noun: "Pair of Oars", width: W, length: 1, parts };
}

function rudder(look: Look, variant: string | undefined): Built {
  const parts: RawPart[] = [];
  const color = look.req.colors[0]?.hex ?? (look.style ? look.main : look.wood);
  const mat: Material = look.req.material ?? (look.mainMat === "metal" ? "metal" : "wood");
  if (variant === "wheel") {
    const D = clamp(1.3 * look.s, 1, 2);
    parts.push(part("box", [0, 0.55, 0], [0.4, 1.1, 0.4], look.dark, "darkwood"));
    parts.push(part("cylinder", [0, 1.25, 0.12], [0.14, 0.4, 0.14], "#b5893a", "gold", [90, 0, 0]));
    parts.push(part("torus", [0, 1.25, 0.3], [D, 0.09, D], color, mat, [90, 0, 0]));
    for (let i = 0; i < 4; i++) {
      parts.push(part("box", [0, 1.25, 0.3], [D * 1.12, 0.06, 0.06], color, mat, [90, 0, i * 45]));
    }
    parts.push(part("sphere", [0, 1.25, 0.32], [0.2, 0.2, 0.2], "#b5893a", "gold"));
    // Below-deck rudder blade.
    parts.push(part("box", [0, 0.35, -0.42], [0.08, 0.7, 0.5], color, mat));
    return { noun: "Ship's Wheel", width: 1, length: 1, parts };
  }
  parts.push(part("box", [0, 0.6, -0.15], [0.12, 1.2, 0.9], color, mat));
  parts.push(part("box", [0, 0.6, -0.15], [0.14, 0.12, 0.92], look.accent, look.trimMat === "glow" ? "glow" : "plastic"));
  parts.push(part("cylinder", [0, 0.8, 0.32], [0.14, 1.6, 0.14], look.dark, "darkwood"));
  parts.push(beam([0, 1.5, 0.3], [0, 1.25, 0.95], 0.08, look.dark, "darkwood"));
  parts.push(part("sphere", [0, 1.24, 0.98], [0.14, 0.14, 0.14], "#b5893a", "gold"));
  return { noun: look.req.power >= 8 ? "Racing Rudder" : "Rudder", width: 1, length: 2, power: look.req.power, parts };
}

function cabin(look: Look): Built {
  const { rng } = look;
  const { W, L } = dims(look, 3, 3, 4);
  const H = clamp(2 * look.s, 1.6, 3);
  const parts: RawPart[] = [];
  const walls = look.req.colors[0]?.hex ?? (look.style ? look.main : pick(rng, ["#f1ead8", "#e8d8b0", "#ffffff", "#a0703c"]));
  const roof = look.req.colors[1]?.hex ?? (look.style ? look.style.secondary : pick(rng, ["#b0101e", "#1f6fd1", "#2a9d8f", "#5c3a1e"]));
  const wallMat: Material = look.req.material ?? (look.style ? look.mainMat : "wood");
  parts.push(part("box", [0, H / 2, 0], [W - 0.3, H, L - 0.3], walls, wallMat));
  // Corner posts.
  for (const sx of [1, -1]) for (const sz of [1, -1]) parts.push(part("box", [sx * (W / 2 - 0.15), H / 2, sz * (L / 2 - 0.15)], [0.18, H, 0.18], look.dark, "darkwood"));
  const modern = look.req.style === "future" || look.req.style === "military" || look.mainMat === "metal";
  if (modern) {
    parts.push(part("box", [0, H + 0.08, 0], [W, 0.16, L], roof, look.mainMat === "metal" ? "metal" : "plastic"));
    parts.push(part("box", [0, H * 0.62, L / 2 - 0.13], [W - 0.6, H * 0.4, 0.06], "#9fd8ff", "glass"));
    parts.push(part("cylinder", [0.5, H + 0.5, -0.4], [0.08, 0.8, 0.08], "#c7ccd1", "metal"));
    parts.push(part("box", [0.5, H + 0.95, -0.4], [0.7, 0.05, 0.25], "#c7ccd1", "metal", [0, 0, 0], "spin"));
  } else if (look.req.style === "royal") {
    parts.push(part("box", [0, H + 0.08, 0], [W, 0.16, L], look.accent, "gold"));
    parts.push(part("sphere", [0, H + 0.1, 0], [W * 0.7, W * 0.7, L * 0.7], look.style?.secondary ?? "#e8b923", "gold"));
    parts.push(part("cone", [0, H + W * 0.35 + 0.3, 0], [0.12, 0.6, 0.12], "#e8b923", "gold"));
  } else if (look.req.style === "samurai") {
    parts.push(part("box", [0, H + 0.1, 0], [W, 0.12, L], roof, "darkwood"));
    parts.push(part("cone", [0, H + 0.55, 0], [W * 0.7, 0.8, L * 0.7], roof, "darkwood", [0, 45, 0]));
  } else {
    const roofH = 0.9 * Math.sqrt(look.s);
    parts.push(part("bow", [0, H + roofH / 2, 0], [W, L, roofH], roof, "wood", [-90, 0, 0]));
    if (rng() < 0.5) parts.push(part("box", [W / 4, H + roofH * 0.6, -L / 4], [0.3, roofH + 0.4, 0.3], "#7a4a24", "stone"));
  }
  // Door and windows.
  parts.push(part("box", [0, 0.75, -L / 2 + 0.13], [0.7, 1.5, 0.06], look.dark, "darkwood"));
  parts.push(part("sphere", [0.22, 0.75, -L / 2 + 0.09], [0.08, 0.08, 0.08], "#e8b923", "gold"));
  for (const sx of [1, -1]) {
    parts.push(part("box", [sx * (W / 2 - 0.13), H * 0.6, 0], [0.06, 0.6, 0.7], look.glowy ? "#ffe28a" : "#9fd8ff", look.glowy ? "glow" : "glass"));
    parts.push(part("box", [sx * (W / 2 - 0.12), H * 0.6, 0], [0.07, 0.68, 0.08], look.dark, "darkwood"));
  }
  if (!modern) parts.push(part("box", [0, H * 0.62, L / 2 - 0.13], [0.7, 0.55, 0.06], "#9fd8ff", "glass"));
  return { noun: modern ? "Wheelhouse" : pick(rng, ["Cabin", "Little Cabin", "Captain's Cabin"]), width: W, length: L, parts };
}

function seat(look: Look, variant: string | undefined): Built {
  const parts: RawPart[] = [];
  if (variant === "throne") {
    const gold = look.req.colors[0]?.hex ?? "#e8b923";
    const cushion = look.req.colors[1]?.hex ?? "#b0101e";
    parts.push(part("box", [0, 0.25, 0], [1.1, 0.5, 1], gold, "gold"));
    parts.push(part("box", [0, 0.55, 0.05], [0.9, 0.14, 0.85], cushion, "cloth"));
    parts.push(part("box", [0, 1.3, -0.4], [1.1, 1.6, 0.18], gold, "gold"));
    parts.push(part("box", [0, 1.2, -0.3], [0.8, 1.1, 0.06], cushion, "cloth"));
    for (const sx of [1, -1]) {
      parts.push(part("box", [sx * 0.5, 0.75, 0.05], [0.12, 0.4, 0.8], gold, "gold"));
      parts.push(part("sphere", [sx * 0.5, 2.15, -0.4], [0.18, 0.18, 0.18], "#c3112f", "glass"));
    }
    parts.push(part("cone", [0, 2.3, -0.4], [0.3, 0.35, 0.3], gold, "gold"));
    return { noun: "Captain's Throne", width: 1, length: 1, parts };
  }
  const W = clamp(Math.round(2 * look.s), 1, 3);
  const color = look.req.colors[0]?.hex ?? look.wood;
  const mat: Material = look.req.material ?? "wood";
  parts.push(part("box", [0, 0.45, 0], [W - 0.1, 0.1, 0.5], color, mat));
  parts.push(part("box", [0, 0.8, -0.22], [W - 0.1, 0.5, 0.08], color, mat, [-10, 0, 0]));
  for (const sx of [1, -1]) {
    for (const sz of [1, -1]) parts.push(part("box", [sx * (W / 2 - 0.15), 0.2, sz * 0.18], [0.08, 0.4, 0.08], look.dark, "darkwood"));
  }
  if (look.req.colors[1] || look.style) parts.push(part("box", [0, 0.53, 0.02], [W - 0.3, 0.06, 0.42], look.req.colors[1]?.hex ?? look.accent, "cloth"));
  return { noun: W > 1 ? "Crew Bench" : "Deck Chair", width: W, length: 1, parts };
}

function cannon(look: Look, variant: string | undefined): Built {
  const parts: RawPart[] = [];
  const s = clamp(look.s, 0.7, 1.4);
  if (variant === "laser" || look.req.style === "future") {
    const glow = look.req.colors[0]?.hex ?? look.style?.secondary ?? "#ff3b6b";
    parts.push(part("cylinder", [0, 0.2, 0], [1.1, 0.4, 1.1], "#3d4852", "metal"));
    parts.push(part("sphere", [0, 0.55, 0], [0.9, 0.7, 0.9], "#eef2f7", "plastic"));
    for (const sx of [0.15, -0.15]) {
      parts.push(part("cylinder", [sx, 0.62, 0.55], [0.1, 0.9 * s, 0.1], "#c7ccd1", "metal", [90, 0, 0]));
      parts.push(part("sphere", [sx, 0.62, 1.0 * s], [0.12, 0.12, 0.12], glow, "glow", [0, 0, 0], "pulse"));
    }
    return { noun: "Laser Turret", width: 1, length: 2, parts };
  }
  const barrel = look.req.colors[0]?.hex ?? (look.req.material === "gold" ? "#e8b923" : "#2b2d33");
  const barrelMat: Material = look.req.material === "gold" ? "gold" : "metal";
  parts.push(part("box", [0, 0.28, -0.1], [0.75, 0.3, 1.1], look.dark, "darkwood"));
  for (const sx of [1, -1]) {
    for (const z of [-0.45, 0.3]) parts.push(part("cylinder", [sx * 0.42, 0.18, z], [0.36, 0.1, 0.36], look.dark, "darkwood", [0, 0, 90]));
  }
  parts.push(part("cylinder", [0, 0.62, 0.15], [0.34 * s, 1.6 * s, 0.34 * s], barrel, barrelMat, [82, 0, 0]));
  parts.push(part("torus", [0, 0.71, 0.88 * s], [0.42 * s, 0.08, 0.42 * s], barrel, barrelMat, [82, 0, 0]));
  parts.push(part("sphere", [0, 0.53, -0.62 * s], [0.24, 0.24, 0.24], barrel, barrelMat));
  parts.push(part("sphere", [0.32, 0.12, -0.75], [0.22, 0.22, 0.22], "#1d1d22", "metal"));
  parts.push(part("sphere", [0.5, 0.12, -0.75], [0.22, 0.22, 0.22], "#1d1d22", "metal"));
  return { noun: look.req.material === "gold" ? "Golden Cannon" : "Cannon", width: 1, length: 2, parts };
}

function light(look: Look, variant: string | undefined): Built {
  const parts: RawPart[] = [];
  const glow = look.req.colors[0]?.hex ?? (look.style?.glowy ? look.style.secondary : look.req.style === "samurai" ? "#ff4d4d" : "#ffd27a");
  const metal = look.req.material === "gold" || look.trimMat === "gold" ? "#e8b923" : "#2b2d33";
  const metalMat: Material = metal === "#e8b923" ? "gold" : "metal";
  if (variant === "torch") {
    parts.push(part("cylinder", [0, 0.6, 0], [0.1, 1.2, 0.1], look.dark, "darkwood"));
    parts.push(part("cylinder", [0, 1.25, 0], [0.22, 0.18, 0.22], "#555b61", "metal"));
    parts.push(part("cone", [0, 1.55, 0], [0.26, 0.5, 0.26], glow, "glow", [0, 0, 0], "pulse"));
    parts.push(part("cone", [0, 1.5, 0], [0.16, 0.3, 0.16], "#fff3b0", "glow", [0, 30, 0], "pulse"));
    return { noun: "Tiki Torch", width: 1, length: 1, parts };
  }
  if (variant === "spot") {
    parts.push(part("cylinder", [0, 0.4, 0], [0.12, 0.8, 0.12], "#555b61", "metal"));
    parts.push(part("cylinder", [0, 0.95, 0.05], [0.5, 0.55, 0.5], "#3d4852", "metal", [70, 0, 0]));
    parts.push(part("cylinder", [0, 1.04, 0.32], [0.42, 0.04, 0.42], glow, "glow", [70, 0, 0], "pulse"));
    return { noun: "Searchlight", width: 1, length: 1, parts };
  }
  const tall = look.req.tall || look.req.size > 1;
  const base = tall ? 1.4 : 0;
  if (tall) parts.push(part("cylinder", [0, base / 2, 0], [0.1, base, 0.1], metal, metalMat));
  parts.push(part("box", [0, base + 0.04, 0], [0.42, 0.08, 0.42], metal, metalMat));
  parts.push(part("cylinder", [0, base + 0.3, 0], [0.36, 0.44, 0.36], "#ffffff", "glass"));
  parts.push(part("sphere", [0, base + 0.3, 0], [0.2, 0.26, 0.2], glow, "glow", [0, 0, 0], "pulse"));
  for (const [x, z] of [
    [0.17, 0.17],
    [-0.17, 0.17],
    [0.17, -0.17],
    [-0.17, -0.17],
  ]) {
    parts.push(part("box", [x, base + 0.3, z], [0.04, 0.46, 0.04], metal, metalMat));
  }
  parts.push(part("cone", [0, base + 0.62, 0], [0.48, 0.24, 0.48], metal, metalMat));
  parts.push(part("torus", [0, base + 0.82, 0], [0.18, 0.04, 0.18], metal, metalMat, [90, 0, 0]));
  return { noun: look.req.style === "samurai" ? "Paper Lantern" : tall ? "Lamp Post" : "Lantern", width: 1, length: 1, parts };
}

function flag(look: Look): Built {
  const parts: RawPart[] = [];
  const H = clamp(3 * look.s, 2, 5);
  const pirate = look.skull;
  const cloth = look.req.colors[0]?.hex ?? (pirate ? "#1d1d22" : look.style ? look.style.secondary : pick(look.rng, ACCENTS));
  const fw = 1.6 * clamp(look.s, 0.8, 1.3);
  const fh = 1.0 * clamp(look.s, 0.8, 1.3);
  parts.push(part("cylinder", [0, H / 2, 0.4], [0.08, H, 0.08], look.dark, "darkwood"));
  parts.push(part("sphere", [0, H + 0.06, 0.4], [0.16, 0.16, 0.16], "#e8b923", "gold"));
  const anim: Anim = pirate || look.rainbow ? "none" : "flutter";
  if (look.rainbow) {
    RAINBOW.forEach((c, i) => {
      const band = fh / RAINBOW.length;
      parts.push(part("box", [0, H - 0.15 - band * (i + 0.5), 0.4 - fw / 2], [0.04, band, fw], c, "cloth"));
    });
  } else {
    parts.push(part("box", [0, H - 0.15 - fh / 2, 0.4 - fw / 2], [0.04, fh, fw], cloth, "cloth", [0, 0, 0], anim));
    if (pirate) skullDecal(parts, [0, H - 0.15 - fh / 2, 0.4 - fw / 2], 0.85, "x", look.req.colors[1]?.hex ?? "#f5f5f0", 0.03, true);
    else if (look.req.colors[1] || look.stripes) {
      parts.push(part("box", [0, H - 0.15 - fh / 2, 0.4 - fw / 2], [0.05, fh * 0.28, fw], look.req.colors[1]?.hex ?? look.accent, "cloth", [0, 0, 0], anim));
    }
  }
  return { noun: pirate ? "Pirate Flag" : "Flag", width: 1, length: 2, parts };
}

function storage(look: Look, variant: string | undefined): Built {
  const parts: RawPart[] = [];
  if (variant === "chest") {
    const body = look.req.colors[0]?.hex ?? "#7a4a24";
    const band = look.req.material === "metal" ? "#8a9299" : "#e8b923";
    parts.push(part("box", [0, 0.3, 0], [1.1, 0.6, 0.7], body, "wood"));
    parts.push(part("cylinder", [0, 0.6, 0], [0.7, 1.1, 0.5], body, "wood", [0, 0, 90]));
    for (const x of [-0.4, 0.4]) parts.push(part("box", [x, 0.45, 0], [0.08, 0.92, 0.74], band, "gold"));
    parts.push(part("box", [0, 0.55, 0.36], [0.2, 0.24, 0.06], band, "gold"));
    if (look.req.words.some((w) => w === "treasure" || w === "coins" || w === "loot" || w === "tresor" || w === "tesoro")) {
      parts.push(part("sphere", [0, 0.9, 0], [0.6, 0.3, 0.4], "#e8b923", "gold"));
    }
    return { noun: "Treasure Chest", width: 2, length: 1, parts };
  }
  if (variant === "barrel") {
    const color = look.req.colors[0]?.hex ?? "#8a5a2b";
    const n = look.req.size > 1 ? 3 : 1;
    const spots: [number, number][] = n === 1 ? [[0, 0]] : [[-0.45, -0.25], [0.45, -0.25], [0, 0.45]];
    for (const [x, z] of spots) {
      parts.push(part("cylinder", [x, 0.5, z], [0.8, 1, 0.8], color, "wood"));
      for (const y of [0.2, 0.8]) parts.push(part("torus", [x, y, z], [0.84, 0.06, 0.84], "#555b61", "metal"));
      parts.push(part("cylinder", [x, 1.0, z], [0.7, 0.03, 0.7], mix(color, "#000000", 0.2), "wood"));
    }
    return { noun: n > 1 ? "Barrel Stack" : "Barrel", width: n > 1 ? 2 : 1, length: n > 1 ? 2 : 1, parts };
  }
  const crate = look.req.colors[0]?.hex ?? "#b07b45";
  const stack = look.req.size > 1 || look.rng() < 0.4;
  const boxes: [number, number, number, number][] = stack
    ? [
        [-0.45, 0, -0.45, 0.85],
        [0.45, 0, -0.4, 0.8],
        [0, 0, 0.45, 0.85],
        [-0.2, 0.85, -0.2, 0.7],
      ]
    : [[0, 0, 0, 0.9]];
  for (const [x, y, z, s] of boxes) {
    parts.push(part("box", [x, y + s / 2, z], [s, s, s], crate, "wood"));
    for (const sy of [y + 0.05, y + s - 0.05]) parts.push(part("box", [x, sy, z], [s + 0.03, 0.08, s + 0.03], mix(crate, "#000000", 0.3), "darkwood"));
  }
  return { noun: stack ? "Cargo Crates" : "Crate", width: stack ? 2 : 1, length: stack ? 2 : 1, parts };
}

function decor(look: Look, variant: string | undefined): Built {
  const { rng } = look;
  const parts: RawPart[] = [];
  const c = look.req.colors[0]?.hex;
  const v = variant ?? pick(rng, ["statue", "plant", "crystal", "lifering", "sign"]);
  switch (v) {
    case "anchor": {
      const col = c ?? "#3d4852";
      const m: Material = look.req.material ?? "metal";
      parts.push(part("torus", [0, 1.75, 0], [0.4, 0.08, 0.4], col, m, [90, 0, 0]));
      parts.push(part("cylinder", [0, 0.95, 0], [0.12, 1.5, 0.12], col, m));
      parts.push(part("box", [0, 1.4, 0], [0.7, 0.1, 0.1], col, m));
      parts.push(beam([0, 0.2, 0], [0.55, 0.55, 0], 0.11, col, m));
      parts.push(beam([0, 0.2, 0], [-0.55, 0.55, 0], 0.11, col, m));
      parts.push(part("cone", [0.6, 0.6, 0], [0.2, 0.25, 0.2], col, m, [0, 0, -30]));
      parts.push(part("cone", [-0.6, 0.6, 0], [0.2, 0.25, 0.2], col, m, [0, 0, 30]));
      return { noun: "Anchor", width: 2, length: 1, parts };
    }
    case "figurehead": {
      const col = c ?? (look.style ? look.main : "#2b6e3f");
      parts.push(part("box", [0, 0.3, -0.3], [0.5, 0.6, 0.6], look.dark, "darkwood"));
      parts.push(part("capsule", [0, 0.9, 0.05], [0.45, 1.3, 0.45], col, "wood", [40, 0, 0]));
      parts.push(part("sphere", [0, 1.45, 0.5], [0.5, 0.45, 0.75], col, "wood"));
      parts.push(part("cone", [0.15, 1.75, 0.35], [0.12, 0.4, 0.12], look.accent, "gold", [-25, 0, -15]));
      parts.push(part("cone", [-0.15, 1.75, 0.35], [0.12, 0.4, 0.12], look.accent, "gold", [-25, 0, 15]));
      parts.push(part("sphere", [0.15, 1.5, 0.82], [0.09, 0.09, 0.09], "#ffd60a", "glow", [0, 0, 0], "pulse"));
      parts.push(part("sphere", [-0.15, 1.5, 0.82], [0.09, 0.09, 0.09], "#ffd60a", "glow", [0, 0, 0], "pulse"));
      return { noun: "Dragon Figurehead", width: 1, length: 2, parts };
    }
    case "plant": {
      parts.push(part("cylinder", [0, 0.3, 0], [0.6, 0.6, 0.6], c ?? "#b8663a", "stone"));
      parts.push(part("cylinder", [0, 0.58, 0], [0.55, 0.06, 0.55], "#5c3a1e", "wood"));
      parts.push(beam([0, 0.6, 0], [0.15, 2.4, 0.1], 0.14, "#8d6e4f", "wood"));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * 360;
        const rad = (a * Math.PI) / 180;
        parts.push(part("box", [0.15 + Math.sin(rad) * 0.55, 2.3, 0.1 + Math.cos(rad) * 0.55], [0.3, 0.04, 1.2], "#2b9348", "cloth", [20, a, 0], "sway"));
      }
      parts.push(part("sphere", [0.15, 2.25, 0.25], [0.18, 0.18, 0.18], "#7a4a24", "wood"));
      return { noun: "Potted Palm", width: 2, length: 2, parts };
    }
    case "treasure": {
      for (let i = 0; i < 9; i++) {
        const a = rng() * Math.PI * 2;
        const r = rng() * 0.5;
        parts.push(part("sphere", [Math.sin(a) * r, 0.12 + (0.5 - r) * 0.5, Math.cos(a) * r], [0.3, 0.12, 0.3], "#e8b923", "gold"));
      }
      parts.push(part("sphere", [0.1, 0.45, 0], [0.18, 0.18, 0.18], "#c3112f", "glass"));
      parts.push(part("sphere", [-0.2, 0.35, 0.2], [0.15, 0.15, 0.15], "#1f9e60", "glass"));
      parts.push(part("cone", [0, 0.25, 0], [1.3, 0.5, 1.3], "#e8b923", "gold"));
      return { noun: "Treasure Pile", width: 2, length: 2, parts };
    }
    case "statue": {
      const col = c ?? "#d9d4c7";
      const m: Material = look.req.material ?? "stone";
      parts.push(part("box", [0, 0.25, 0], [0.8, 0.5, 0.8], "#8d8a83", "stone"));
      parts.push(part("capsule", [0, 1.1, 0], [0.45, 1.2, 0.35], col, m));
      parts.push(part("sphere", [0, 1.9, 0], [0.32, 0.36, 0.32], col, m));
      parts.push(beam([0.2, 1.4, 0], [0.45, 2.1, 0.1], 0.1, col, m));
      parts.push(part("sphere", [0.47, 2.15, 0.1], [0.14, 0.14, 0.14], look.accent, "gold"));
      return { noun: "Statue", width: 1, length: 1, parts };
    }
    case "telescope": {
      for (const a of [0, 120, 240]) {
        const rad = (a * Math.PI) / 180;
        parts.push(beam([Math.sin(rad) * 0.4, 0, Math.cos(rad) * 0.4], [0, 1.1, 0], 0.05, look.dark, "darkwood"));
      }
      parts.push(part("cylinder", [0, 1.3, 0.1], [0.14, 1.1, 0.14], c ?? "#b5893a", "gold", [65, 0, 0]));
      parts.push(part("cylinder", [0, 1.12, -0.32], [0.1, 0.4, 0.1], "#1d1d22", "metal", [65, 0, 0]));
      return { noun: "Telescope", width: 1, length: 1, parts };
    }
    case "bell": {
      parts.push(part("box", [0, 1.6, 0], [1, 0.12, 0.12], look.dark, "darkwood"));
      for (const sx of [1, -1]) parts.push(part("box", [sx * 0.45, 0.8, 0], [0.12, 1.6, 0.12], look.dark, "darkwood"));
      parts.push(part("cone", [0, 1.2, 0], [0.55, 0.6, 0.55], c ?? "#e8b923", "gold", [0, 0, 0], "sway"));
      parts.push(part("sphere", [0, 1.45, 0], [0.3, 0.2, 0.3], c ?? "#e8b923", "gold", [0, 0, 0], "sway"));
      return { noun: "Ship's Bell", width: 1, length: 1, parts };
    }
    case "lifering": {
      parts.push(part("box", [0, 0.6, 0], [0.9, 1.2, 0.08], look.wood, "wood"));
      parts.push(part("torus", [0, 0.75, 0.1], [0.8, 0.16, 0.8], c ?? "#e63946", "plastic", [90, 0, 0]));
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2 + Math.PI / 4;
        parts.push(part("box", [Math.sin(a) * 0.32, 0.75 + Math.cos(a) * 0.32, 0.1], [0.18, 0.18, 0.18], "#ffffff", "plastic", [0, 0, -a * DEG]));
      }
      return { noun: "Life Ring", width: 1, length: 1, parts };
    }
    case "sign": {
      parts.push(part("cylinder", [0, 0.7, 0], [0.1, 1.4, 0.1], look.dark, "darkwood"));
      parts.push(part("box", [0, 1.3, 0.06], [1.4, 0.6, 0.08], c ?? look.wood, "wood"));
      parts.push(part("box", [0, 1.3, 0.11], [1.1, 0.12, 0.02], look.accent, "plastic"));
      return { noun: "Wooden Sign", width: 2, length: 1, parts };
    }
    case "duck": {
      const col = c ?? "#ffd60a";
      const s = clamp(look.s * 1.2, 0.7, 2.5);
      parts.push(part("sphere", [0, 0.45 * s, 0], [1.0 * s, 0.8 * s, 1.2 * s], col, "plastic"));
      parts.push(part("sphere", [0, 1.0 * s, 0.35 * s], [0.6 * s, 0.6 * s, 0.6 * s], col, "plastic"));
      parts.push(part("cone", [0, 0.95 * s, 0.7 * s], [0.2 * s, 0.3 * s, 0.14 * s], "#f77f00", "plastic", [90, 0, 0]));
      parts.push(part("sphere", [0.15 * s, 1.1 * s, 0.6 * s], [0.08 * s, 0.08 * s, 0.08 * s], "#111111", "plastic"));
      parts.push(part("sphere", [-0.15 * s, 1.1 * s, 0.6 * s], [0.08 * s, 0.08 * s, 0.08 * s], "#111111", "plastic"));
      return { noun: "Rubber Duck", width: Math.ceil(s), length: Math.ceil(1.2 * s), parts };
    }
    case "umbrella": {
      parts.push(part("cylinder", [0, 1.1, 0], [0.07, 2.2, 0.07], "#f5f5f0", "metal"));
      const cols = look.rainbow ? RAINBOW : [c ?? "#e63946", "#ffffff"];
      for (let i = 0; i < 6; i++) {
        parts.push(part("wedge", [0, 2.15, 0], [0.04, 0.4, 1.15], cols[i % cols.length], "cloth", [0, i * 60, 0]));
      }
      parts.push(part("cone", [0, 2.1, 0], [2.3, 0.45, 2.3], c ?? "#e63946", "cloth"));
      return { noun: "Beach Umbrella", width: 2, length: 2, parts };
    }
    case "totem": {
      const cols = [c ?? "#b0101e", "#e8b923", "#1a9e8f", "#7a4a24"];
      for (let i = 0; i < 4; i++) {
        parts.push(part("box", [0, 0.35 + i * 0.7, 0], [0.7, 0.68, 0.7], cols[i % cols.length], "wood"));
        parts.push(part("box", [0, 0.42 + i * 0.7, 0.36], [0.4, 0.1, 0.04], "#1d1d22", "plastic"));
        for (const sx of [1, -1]) parts.push(part("sphere", [sx * 0.15, 0.55 + i * 0.7, 0.36], [0.12, 0.12, 0.06], "#ffffff", "plastic"));
      }
      parts.push(part("wedge", [0.65, 2.2, 0], [0.6, 0.4, 0.15], "#e8b923", "wood", [0, 90, 0]));
      parts.push(part("wedge", [-0.65, 2.2, 0], [0.6, 0.4, 0.15], "#e8b923", "wood", [0, -90, 0]));
      return { noun: "Tiki Totem", width: 2, length: 1, parts };
    }
    case "snowman": {
      parts.push(part("sphere", [0, 0.45, 0], [0.9, 0.9, 0.9], "#ffffff", "plastic"));
      parts.push(part("sphere", [0, 1.15, 0], [0.65, 0.65, 0.65], "#ffffff", "plastic"));
      parts.push(part("sphere", [0, 1.65, 0], [0.45, 0.45, 0.45], "#ffffff", "plastic"));
      parts.push(part("cone", [0, 1.65, 0.3], [0.08, 0.3, 0.08], "#f77f00", "plastic", [90, 0, 0]));
      parts.push(part("cylinder", [0, 1.95, 0], [0.32, 0.3, 0.32], c ?? "#1d1d22", "cloth"));
      parts.push(part("torus", [0, 1.4, 0], [0.5, 0.1, 0.5], "#e63946", "cloth"));
      return { noun: "Snowman", width: 1, length: 1, parts };
    }
    case "trophy": {
      parts.push(part("box", [0, 0.15, 0], [0.6, 0.3, 0.6], "#3a2a1c", "darkwood"));
      parts.push(part("cylinder", [0, 0.45, 0], [0.12, 0.3, 0.12], "#e8b923", "gold"));
      parts.push(part("cone", [0, 0.95, 0], [0.6, 0.7, 0.6], c ?? "#e8b923", "gold", [180, 0, 0]));
      for (const sx of [1, -1]) parts.push(part("torus", [sx * 0.32, 1.0, 0], [0.3, 0.05, 0.3], "#e8b923", "gold", [90, 0, 0]));
      return { noun: "Golden Trophy", width: 1, length: 1, parts };
    }
    case "skull": {
      skullDecal(parts, [0, 0.6, 0], 1.2, "z", c ?? "#f5f5f0");
      parts.push(part("box", [0, 0.05, 0], [0.8, 0.1, 0.5], look.dark, "darkwood"));
      return { noun: "Skull Ornament", width: 1, length: 1, parts };
    }
    case "grill": {
      parts.push(part("cylinder", [0, 0.8, 0], [0.9, 0.4, 0.9], c ?? "#1d1d22", "metal"));
      parts.push(part("cylinder", [0, 0.85, 0], [0.8, 0.05, 0.8], "#ff6b1a", "glow", [0, 0, 0], "pulse"));
      for (const a of [0, 120, 240]) {
        const r = (a * Math.PI) / 180;
        parts.push(beam([Math.sin(r) * 0.35, 0.6, Math.cos(r) * 0.35], [Math.sin(r) * 0.45, 0, Math.cos(r) * 0.45], 0.05, "#1d1d22", "metal"));
      }
      parts.push(part("capsule", [0.15, 0.95, 0], [0.12, 0.4, 0.12], "#8b3a1a", "plastic", [0, 0, 90]));
      return { noun: "Deck Barbecue", width: 1, length: 1, parts };
    }
    default: {
      // crystal / mystery gem
      const col = c ?? pick(rng, ["#b8a1ff", "#22d3ee", "#ff70a6", "#80ed99"]);
      parts.push(part("cylinder", [0, 0.2, 0], [0.8, 0.4, 0.8], "#8d8a83", "stone"));
      parts.push(part("cone", [0, 1.0, 0], [0.6, 1.2, 0.6], col, "glass", [0, 45, 0]));
      parts.push(part("cone", [0, 0.6, 0], [0.6, 0.4, 0.6], col, "glass", [180, 45, 0]));
      parts.push(part("sphere", [0, 0.75, 0], [0.3, 0.3, 0.3], col, "glow", [0, 0, 0], "pulse"));
      parts.push(part("cone", [0.3, 0.6, 0.1], [0.2, 0.5, 0.2], col, "glass", [0, 0, -25]));
      return { noun: "Glowing Crystal", width: 1, length: 1, parts };
    }
  }
}

// ---------------------------------------------------------------------------
// Messages

const ROLE_DEFAULTS: Record<Role, Defaults> = {
  hull: { main: "#a0703c", mainMat: "wood", second: "#f1ead8" },
  float: { main: "#9a6a38", mainMat: "wood", second: "#e9ecef" },
  deck: { main: "#b07b45", mainMat: "wood", second: "#f1ead8" },
  sail: { main: "#5c3a1e", mainMat: "darkwood", second: "#f4efe1" },
  mast: { main: "#5c3a1e", mainMat: "darkwood", second: "#f4efe1" },
  engine: { main: "#3d4852", mainMat: "metal", second: "#c7ccd1" },
  oars: { main: "#a0703c", mainMat: "wood", second: "#c8a670" },
  rudder: { main: "#a0703c", mainMat: "wood", second: "#c8a670" },
  cabin: { main: "#f1ead8", mainMat: "wood", second: "#b0101e" },
  seat: { main: "#a0703c", mainMat: "wood", second: "#b0101e" },
  cannon: { main: "#2b2d33", mainMat: "metal", second: "#5c3a1e" },
  light: { main: "#2b2d33", mainMat: "metal", second: "#ffd27a" },
  flag: { main: "#5c3a1e", mainMat: "darkwood", second: "#e63946" },
  storage: { main: "#b07b45", mainMat: "wood", second: "#5c3a1e" },
  decor: { main: "#a0703c", mainMat: "wood", second: "#e8b923" },
};

const TIPS: Record<Role, Record<Lang, string[]>> = {
  hull: {
    en: [
      "Hull pieces go down first. Line a few up along the grid to make your boat longer.",
      "Put two of these side by side or end to end for a sturdier boat.",
    ],
    fr: ["Les coques se posent en premier : alignes-en plusieurs pour allonger ton bateau."],
    es: ["Los cascos van primero: pon varios en fila para alargar tu barco."],
  },
  float: {
    en: ["Floats add buoyancy. Put them along the sides for a steady boat.", "Great for keeping heavy boats above water!"],
    fr: ["Les flotteurs ajoutent de la flottabilite. Places-les sur les cotes."],
    es: ["Los flotadores dan flotabilidad. Ponlos a los lados."],
  },
  deck: {
    en: ["Stack decks on top of your hull to give the crew room to stand.", "A good spot for cabins and cannons to sit on."],
    fr: ["Pose les ponts sur ta coque pour que l'equipage puisse marcher."],
    es: ["Pon cubiertas sobre el casco para que la tripulacion pueda caminar."],
  },
  sail: {
    en: [
      "Sails pull best with the wind behind or beside you. Press R to raise or lower them.",
      "Plant it in the middle of the deck and watch the wind arrow on your map.",
    ],
    fr: ["Les voiles marchent mieux avec le vent dans le dos. Appuie sur R pour les hisser."],
    es: ["Las velas funcionan mejor con el viento a favor. Pulsa R para izarlas."],
  },
  mast: {
    en: ["Stand it in the middle of the deck. Pair it with a sail for speed."],
    fr: ["Place-le au milieu du pont, avec une voile pour aller vite."],
    es: ["Ponlo en el centro de la cubierta, junto a una vela."],
  },
  engine: {
    en: ["Engines push when you hold W. They fit best on the back row (the stern).", "Mount it at the stern and hold W to go!"],
    fr: ["Les moteurs poussent quand tu tiens W. Mets-le a l'arriere."],
    es: ["Los motores empujan cuando mantienes W. Ponlo en la popa."],
  },
  oars: {
    en: ["Oars are light and push a little when you hold W. Put them across the middle."],
    fr: ["Les rames poussent un peu quand tu tiens W."],
    es: ["Los remos empujan un poco cuando mantienes W."],
  },
  rudder: {
    en: ["Put it on the back row (the stern) and your boat will turn much faster.", "Rudders make steering with A and D snappier."],
    fr: ["Place-le a l'arriere : ton bateau tournera beaucoup mieux."],
    es: ["Ponlo en la popa y tu barco girara mucho mejor."],
  },
  cabin: {
    en: ["Cabins are heavy, so make sure you have enough hull to float it."],
    fr: ["Les cabines sont lourdes : ajoute assez de coque."],
    es: ["Las cabinas pesan: asegurate de tener suficiente casco."],
  },
  seat: { en: ["A comfy spot for your crew."], fr: ["Un coin confortable pour l'equipage."], es: ["Un sitio comodo para tu tripulacion."] },
  cannon: {
    en: ["Press F while sailing to fire a (harmless) salute!"],
    fr: ["Appuie sur F en naviguant pour tirer une salve (sans danger) !"],
    es: ["Pulsa F mientras navegas para disparar una salva (inofensiva)."],
  },
  light: { en: ["It glows, so friends can spot your boat from far away."], fr: ["Ca brille : tes amis te verront de loin."], es: ["Brilla, asi tus amigos te veran de lejos."] },
  flag: { en: ["Fly it high so everyone knows whose boat it is!"], fr: ["Hisse-le haut pour que tout le monde te reconnaisse !"], es: ["Izala bien alto para que todos te reconozcan."] },
  storage: { en: ["Handy for hauling loot between cities."], fr: ["Pratique pour transporter ton butin."], es: ["Ideal para llevar tu botin."] },
  decor: { en: ["Pure style. Put it wherever it makes you smile."], fr: ["Juste pour le style. Mets-le ou tu veux !"], es: ["Puro estilo. Ponlo donde quieras."] },
};

const OPENERS: Record<Lang, string[]> = {
  en: ["Here's your {name}!", "Fresh from the workshop: your {name}.", "Ta-da! One {name}, coming up.", "I made you this {name}!", "Your {name} is ready."],
  fr: ["Voici ta piece : {name} !", "Tout juste sorti de l'atelier : {name}.", "Et voila : {name} !"],
  es: ["Aqui tienes: {name}!", "Recien salido del taller: {name}.", "Listo: {name}!"],
};

const WHOLE_BOAT_MESSAGE: Record<Lang, string> = {
  en: "I build boats one piece at a time, so here's your {name} to start! Ask me for more hull pieces, then a sail or an engine, and a rudder.",
  fr: "Je construis les bateaux piece par piece, alors voici pour commencer : {name} ! Demande-moi d'autres coques, puis une voile ou un moteur, et un gouvernail.",
  es: "Construyo los barcos pieza a pieza, asi que para empezar aqui tienes: {name}. Pideme mas cascos, luego una vela o un motor y un timon.",
};

function title(name: string): string {
  return name.length > 32 ? name.slice(0, 32).trim() : name;
}

// ---------------------------------------------------------------------------

export function workshopPiece(prompt: string, ctx: ForgeContext, seed: number): ForgeResult {
  const text = typeof prompt === "string" ? prompt.slice(0, 500) : "";
  const req = parse(text);
  const rng = makeRng((seed ^ hashString(text)) >>> 0);
  const look = makeLook(req, rng, ROLE_DEFAULTS[req.role]);

  let built: Built;
  switch (req.role) {
    case "hull":
      built = hull(look, req.variant);
      break;
    case "float":
      built = float(look, req.variant);
      break;
    case "deck":
      built = deck(look);
      break;
    case "sail":
      built = sail(look, req.variant);
      break;
    case "mast":
      built = mast(look);
      break;
    case "engine":
      built = engine(look, req.variant);
      break;
    case "oars":
      built = oars(look);
      break;
    case "rudder":
      built = rudder(look, req.variant);
      break;
    case "cabin":
      built = cabin(look);
      break;
    case "seat":
      built = seat(look, req.variant);
      break;
    case "cannon":
      built = cannon(look, req.variant);
      break;
    case "light":
      built = light(look, req.variant);
      break;
    case "flag":
      built = flag(look);
      break;
    case "storage":
      built = storage(look, req.variant);
      break;
    default:
      built = decor(look, req.variant);
  }

  const adjective = look.style?.adjective ?? (req.material === "gold" ? "Golden" : req.material === "glow" ? "Neon" : "");
  const colorLabel = req.colors[0]?.label ?? (req.rainbow ? "Rainbow" : "");
  const words = [colorLabel, adjective, built.noun].filter(Boolean);
  // Avoid "Golden Golden Cannon".
  const name = title(words.filter((w, i) => !words.slice(i + 1).some((o) => o.includes(w))).join(" "));

  const powerWords = req.power >= 8 ? (req.lang === "fr" ? "puissant" : req.lang === "es" ? "potente" : "powerful") : "";
  const description =
    req.lang === "fr"
      ? `${name}${powerWords ? " " + powerWords : ""}, fabrique a la main par ${ctx.botName}.`
      : req.lang === "es"
        ? `${name}${powerWords ? " " + powerWords : ""}, hecho a mano por ${ctx.botName}.`
        : `A ${powerWords ? powerWords + " " : ""}${name.toLowerCase()} handmade by ${ctx.botName}.`;

  let message: string;
  if (req.wholeBoat) {
    message = WHOLE_BOAT_MESSAGE[req.lang].replace("{name}", name);
  } else {
    const opener = pick(rng, OPENERS[req.lang]).replace("{name}", name);
    const tip = pick(rng, TIPS[req.role][req.lang]);
    message = `${opener} ${tip}`;
  }

  return {
    piece: {
      name,
      description,
      role: req.role,
      width: built.width,
      length: built.length,
      power: built.power ?? req.power,
      parts: built.parts,
    },
    message,
  };
}

/** Exposed for tests. */
export const _internal = { parse, canonical, editDistanceAtMostOne };
