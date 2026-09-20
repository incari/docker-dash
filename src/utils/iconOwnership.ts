/**
 * Whether an icon was chosen by the user rather than derived automatically.
 *
 * Kept apart from dockerIconVault, which reaches the network: this is a pure
 * predicate used on hot paths and in tests, and it should never drag HTTP
 * lookups in behind it.
 */
export function isUserChosenIcon(icon: string | null | undefined): boolean {
  if (!icon) return false;
  // An uploaded file, or any URL that is not the Homarr icon CDN we generate from.
  if (icon.startsWith("uploads/")) return true;
  return (
    icon.startsWith("http") && !icon.includes("homarr-labs/dashboard-icons")
  );
}
