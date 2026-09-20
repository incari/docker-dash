import type { DockerContainer, Shortcut } from "../types";

/**
 * Case- and accent-insensitive normalisation, so "Pi-hole" matches "pihole"
 * and "Almacén" matches "almacen".
 */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/** Splits a query into terms; every term must match (AND). */
export function parseQuery(query: string): string[] {
  const normalized = normalize(query);
  return normalized ? normalized.split(/\s+/) : [];
}

function haystack(parts: Array<string | number | null | undefined>): string {
  return normalize(parts.filter((p) => p != null && p !== "").join(" "));
}

export function matchesShortcut(
  shortcut: Shortcut,
  container: DockerContainer | null | undefined,
  terms: string[],
): boolean {
  if (terms.length === 0) return true;

  const text = haystack([
    shortcut.display_name,
    shortcut.description,
    shortcut.container_name,
    shortcut.container_match_name,
    shortcut.url,
    shortcut.port,
    shortcut.compose_project,
    // Typing a server's name narrows the dashboard to that machine.
    shortcut.host_name,
    container?.name,
    container?.image,
    container?.composeProject,
  ]);

  return terms.every((term) => text.includes(term));
}

export function matchesContainer(
  container: DockerContainer,
  terms: string[],
): boolean {
  if (terms.length === 0) return true;

  const text = haystack([
    container.name,
    container.image,
    container.composeProject,
    container.composeService,
    container.state,
    // Typing a server's name narrows the list to that machine.
    container.hostName,
    ...container.ports.map((p) => p.public),
  ]);

  return terms.every((term) => text.includes(term));
}
