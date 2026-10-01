import { describe, expect, it } from "vitest";
import { HostUrlError, hostnameOf, parseHostUrl } from "../hostUrl.js";

function problemOf(raw: string): string | null {
  try {
    parseHostUrl(raw);
    return null;
  } catch (error) {
    return error instanceof HostUrlError ? error.problem : "threw";
  }
}

describe("parseHostUrl", () => {
  it("reads ssh with and without a user or a port", () => {
    expect(parseHostUrl("ssh://me@nas:2222")).toMatchObject({
      transport: "ssh",
      url: "ssh://me@nas:2222",
      host: "nas",
      port: 2222,
      user: "me",
    });
    // A bare alias leaves user and port to ~/.ssh/config.
    expect(parseHostUrl("ssh://nas")).toMatchObject({
      url: "ssh://nas",
      port: null,
      user: null,
    });
  });

  it("gives tcp the proxy's port when none is written", () => {
    expect(parseHostUrl("tcp://100.64.0.7").url).toBe("tcp://100.64.0.7:2375");
    expect(parseHostUrl("nas.lan:2376").url).toBe("tcp://nas.lan:2376");
  });

  it("hands ssh an IPv6 address without its brackets", () => {
    expect(parseHostUrl("ssh://me@[fd7a::1]").host).toBe("fd7a::1");
  });

  it("reads a socket path", () => {
    expect(parseHostUrl("unix:///var/run/other.sock")).toMatchObject({
      transport: "unix",
      socketPath: "/var/run/other.sock",
    });
  });

  it("says why an address is refused", () => {
    expect(problemOf("")).toBe("empty");
    expect(problemOf("https://nas:3080")).toBe("legacy_agent");
    expect(problemOf("nas")).toBe("scheme");
    expect(problemOf("ftp://nas")).toBe("scheme");
    expect(problemOf("ssh://me:secret@nas")).toBe("invalid");
    expect(problemOf("tcp://nas:2375/containers")).toBe("invalid");
  });
});

describe("hostnameOf", () => {
  it("is the machine a port link should open", () => {
    expect(hostnameOf("ssh://me@nas.lan")).toBe("nas.lan");
    expect(hostnameOf("unix:///var/run/docker.sock")).toBeNull();
    expect(hostnameOf("not an address")).toBeNull();
  });
});
