/** Value of the role field for an application that isn't for a listed opening. */
export const SPONTANEOUS = "spontaneous";

/** Keys of `t.options.experience`, stored as a number of years. */
export const experienceLevels = ["0", "1", "3", "6", "10"] as const;

/** Maps a stored number of years back to its experience bracket. */
export function experienceKey(years: number | null | undefined) {
  if (years == null) return null;
  return [...experienceLevels].reverse().find((k) => years >= Number(k)) ?? "0";
}
