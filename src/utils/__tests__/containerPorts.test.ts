/**
 * Covers orderPortsForDisplay: the browser receives `ports` best-first so no
 * call site may rely on Docker's arbitrary Ports order.
 *
 * This exists because Transmission showed its BitTorrent peer port (51413)
 * instead of its 9091 web UI, and Jellyfin could list 8920/1900/7359 before
 * its 8096 web UI: every quick-add path used the first entry Docker happened
 * to return.
 */

import { describe, expect, it } from "vitest";
import {
  orderPortsForDisplay,
  selectPublishedPort,
  type ContainerPortInfo,
} from "../containerMatching.js";

function port(
  PrivatePort: number,
  PublicPort?: number,
  Type = "tcp",
): ContainerPortInfo {
  return { PrivatePort, PublicPort, Type };
}

describe("orderPortsForDisplay", () => {
  it("lists the Transmission web UI before the peer port", () => {
    const raw = [
      port(51413, 51413, "tcp"),
      port(51413, 51413, "udp"),
      port(9091, 9091, "tcp"),
    ];

    const ordered = orderPortsForDisplay(raw);

    expect(ordered.map((p) => p.public)).toEqual([9091, 51413]);
    // The auto-sync selector and the displayed list agree.
    expect(ordered[0].public).toBe(selectPublishedPort(raw));
  });

  it("lists the Jellyfin HTTP UI before HTTPS and discovery ports", () => {
    const raw = [
      port(8920, 8920, "tcp"),
      port(1900, 1900, "udp"),
      port(7359, 7359, "udp"),
      port(8096, 8096, "tcp"),
    ];

    const ordered = orderPortsForDisplay(raw);

    expect(ordered[0].public).toBe(8096);
    expect(ordered[0].public).toBe(selectPublishedPort(raw));
  });

  it("prefers the TCP row when a host port is published for both protocols", () => {
    const ordered = orderPortsForDisplay([
      port(53, 53, "udp"),
      port(53, 53, "tcp"),
      port(80, 8053, "tcp"),
    ]);

    // Pi-hole: the conventional web-UI private port 80 wins over DNS port 53,
    // and port 53 appears once, as TCP.
    expect(ordered.map((p) => p.public)).toEqual([8053, 53]);
    expect(ordered.find((p) => p.public === 53)?.type).toBe("tcp");
  });

  it("drops exposed-but-unpublished ports and handles empty input", () => {
    expect(orderPortsForDisplay([port(7000), port(8080, 7000)])).toEqual([
      { private: 8080, public: 7000, type: "tcp" },
    ]);
    expect(orderPortsForDisplay([])).toEqual([]);
    expect(orderPortsForDisplay(null)).toEqual([]);
  });
});
