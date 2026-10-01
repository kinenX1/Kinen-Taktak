/** Motion tokens shared by JS animations — mirror the CSS tokens in globals.css. */
export const ease = {
  outExpo: [0.16, 1, 0.3, 1],
  outQuart: [0.25, 1, 0.5, 1],
  inOutQuint: [0.83, 0, 0.17, 1],
} as const;

export const duration = {
  fast: 0.18,
  base: 0.42,
  slow: 0.9,
  cinematic: 1.3,
} as const;
