import { describe, it, expect } from "vitest";
import { parseQuery, matchesShortcut, matchesContainer } from "../search";
import type { DockerContainer, Shortcut } from "../../types";

const shortcut = {
  id: 1,
  display_name: "Pi-hole",
  description: "DNS sinkhole",
  container_name: "pihole",
  container_match_name: "pihole",
  url: null,
  port: 8080,
  icon: null,
  icon_type: null,
  is_favorite: 1,
  section_id: null,
  position: 0,
} as unknown as Shortcut;

const container = {
  id: "abc",
  name: "jellyfin-1",
  image: "linuxserver/jellyfin:latest",
  state: "running",
  status: "Up 2 hours",
  ports: [{ private: 8096, public: 8096, type: "tcp" }],
  composeProject: "media",
  composeService: "jellyfin",
} as unknown as DockerContainer;

describe("parseQuery", () => {
  it("returns no terms for blank input", () => {
    expect(parseQuery("")).toEqual([]);
    expect(parseQuery("   ")).toEqual([]);
  });

  it("splits on whitespace and lowercases", () => {
    expect(parseQuery("  Pi Hole ")).toEqual(["pi", "hole"]);
  });
});

describe("matchesShortcut", () => {
  it("matches everything when the query is empty", () => {
    expect(matchesShortcut(shortcut, null, [])).toBe(true);
  });

  it("matches on display name, case-insensitively", () => {
    expect(matchesShortcut(shortcut, null, parseQuery("PI-HOLE"))).toBe(true);
  });

  it("matches on description and port", () => {
    expect(matchesShortcut(shortcut, null, parseQuery("sinkhole"))).toBe(true);
    expect(matchesShortcut(shortcut, null, parseQuery("8080"))).toBe(true);
  });

  it("ignores accents", () => {
    const accented = { ...shortcut, display_name: "Almacén" } as Shortcut;
    expect(matchesShortcut(accented, null, parseQuery("almacen"))).toBe(true);
  });

  it("requires every term to match", () => {
    expect(matchesShortcut(shortcut, null, parseQuery("pi dns"))).toBe(true);
    expect(matchesShortcut(shortcut, null, parseQuery("pi plex"))).toBe(false);
  });

  it("matches on the linked container's image", () => {
    expect(matchesShortcut(shortcut, container, parseQuery("linuxserver"))).toBe(
      true,
    );
    expect(matchesShortcut(shortcut, null, parseQuery("linuxserver"))).toBe(
      false,
    );
  });
});

describe("matchesContainer", () => {
  it("matches on name, image, compose project and published port", () => {
    expect(matchesContainer(container, parseQuery("jellyfin"))).toBe(true);
    expect(matchesContainer(container, parseQuery("linuxserver"))).toBe(true);
    expect(matchesContainer(container, parseQuery("media"))).toBe(true);
    expect(matchesContainer(container, parseQuery("8096"))).toBe(true);
  });

  it("rejects non-matching terms", () => {
    expect(matchesContainer(container, parseQuery("postgres"))).toBe(false);
  });
});
