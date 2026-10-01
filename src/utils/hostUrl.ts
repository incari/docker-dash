/**
 * The address of a remote docker-dash, as typed by a person.
 *
 * Shared by the hosts routes and the importer, so a server that could not be
 * added from the form cannot be smuggled in through an export file either.
 */

/**
 * Addresses the hub must never be pointed at.
 *
 * The hub sends a bearer token to whatever URL a host has, and reports whether
 * the address answered. The link-local range is where cloud metadata services
 * live, and 0.0.0.0 / :: mean "this machine" on most stacks; neither can ever
 * be a docker-dash someone meant to add. Private LAN ranges are deliberately
 * allowed - that is where the servers are.
 */
function isForbiddenHostname(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "0.0.0.0" || h === "::" || h === "0") return true;
  if (/^169\.254\.\d+\.\d+$/.test(h)) return true;
  if (h.startsWith("fe80:")) return true;
  if (h === "metadata.google.internal") return true;
  return false;
}

/** Accepts "nas:3080" as readily as a full URL; an agent is HTTP either way. */
export function normalizeHostUrl(raw: string): string | null {
  const value = raw.trim().replace(/\/+$/, "");
  if (!value) return null;

  // A scheme that is not http(s) is a mistake, not something to prefix.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) && !/^https?:\/\//i.test(value)) {
    return null;
  }
  const withScheme = /^https?:\/\//i.test(value) ? value : `http://${value}`;
  try {
    const url = new URL(withScheme);
    if (!url.hostname) return null;
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (isForbiddenHostname(url.hostname)) return null;
    return url.origin;
  } catch {
    return null;
  }
}
