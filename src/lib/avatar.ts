/** Public URL of a user's profile photo, versioned so browsers can cache it forever. */
export function avatarUrl(user: { id: string; avatarAt?: Date | string | null }) {
  if (!user.avatarAt) return null;
  return `/api/avatar/${user.id}?v=${new Date(user.avatarAt).getTime()}`;
}
