/**
 * The address of a Docker daemon, as the person adding a server types it.
 *
 * Three transports, the same ones the Docker CLI speaks:
 *
 *   ssh://user@nas      the recommended one: nothing to install on the remote
 *                       machine beyond its sshd, and the key is the credential
 *   tcp://nas:2375      a docker-socket-proxy on a network you trust
 *   unix:///path.sock   another socket mounted into this container
 *
 * http:// and https:// are refused on purpose. They were how a remote
 * docker-dash used to be reached, and accepting them would point a migrated
 * server at a dashboard instead of a daemon - which fails much later, with an
 * error that says nothing about what is actually wrong.
 */

export type DockerTransport = "ssh" | "tcp" | "unix";

export interface DockerAddress {
  transport: DockerTransport;
  /** The canonical form, which is what gets stored. */
  url: string;
  host: string;
  port: number | null;
  user: string | null;
  socketPath: string | null;
}

export type HostUrlProblem = "empty" | "legacy_agent" | "scheme" | "invalid";

export class HostUrlError extends Error {
  constructor(readonly problem: HostUrlProblem) {
    super(
      problem === "legacy_agent"
        ? "docker-dash no longer reads other dashboards. Use ssh://user@machine, or tcp://machine:2375 through a socket proxy."
        : problem === "scheme"
          ? "The address must start with ssh://, tcp:// or unix://"
          : problem === "empty"
            ? "A server address is required, for example ssh://user@nas"
            : "That server address is not valid",
    );
  }

  /** The error code the browser translates. */
  get code(): "no_url" | "legacy_agent" | "bad_url" {
    if (this.problem === "empty") return "no_url";
    if (this.problem === "legacy_agent") return "legacy_agent";
    return "bad_url";
  }
}

/** The proxy's port, and the daemon's own unencrypted one. */
const DEFAULT_TCP_PORT = 2375;

export function parseHostUrl(raw: string | null | undefined): DockerAddress {
  const value = (raw || "").trim().replace(/\/+$/, "");
  if (!value) throw new HostUrlError("empty");

  if (/^https?:\/\//i.test(value)) throw new HostUrlError("legacy_agent");

  // "nas:2375" is what people type for a proxy; anything else without a
  // scheme is ambiguous, and guessing ssh or tcp would be wrong half the time.
  const withScheme = /^[a-z]+:\/\//i.test(value)
    ? value
    : /^[^/@\s]+:\d+$/.test(value)
      ? `tcp://${value}`
      : null;
  if (!withScheme) throw new HostUrlError("scheme");

  const scheme = withScheme.slice(0, withScheme.indexOf(":")).toLowerCase();

  if (scheme === "unix") {
    const socketPath = withScheme.slice("unix://".length);
    if (!socketPath.startsWith("/")) throw new HostUrlError("invalid");
    return {
      transport: "unix",
      url: `unix://${socketPath}`,
      host: "localhost",
      port: null,
      user: null,
      socketPath,
    };
  }

  if (scheme !== "ssh" && scheme !== "tcp") throw new HostUrlError("scheme");

  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw new HostUrlError("invalid");
  }
  if (!parsed.hostname || (parsed.pathname && parsed.pathname !== "/")) {
    throw new HostUrlError("invalid");
  }
  if (parsed.password) throw new HostUrlError("invalid");

  const port = parsed.port ? parseInt(parsed.port, 10) : null;
  // URL keeps IPv6 literals in brackets; ssh and net want them bare.
  const host = parsed.hostname.replace(/^\[(.*)\]$/, "$1");

  if (scheme === "tcp") {
    const effectivePort = port ?? DEFAULT_TCP_PORT;
    return {
      transport: "tcp",
      url: `tcp://${parsed.hostname}:${effectivePort}`,
      host,
      port: effectivePort,
      user: null,
      socketPath: null,
    };
  }

  // ssh keeps the port optional: left out, ~/.ssh/config decides, which is
  // what makes ssh://nas work for a host alias that sets its own port.
  const user = parsed.username ? decodeURIComponent(parsed.username) : null;
  return {
    transport: "ssh",
    url: `ssh://${user ? `${encodeURIComponent(user)}@` : ""}${parsed.hostname}${port ? `:${port}` : ""}`,
    host,
    port,
    user,
    socketPath: null,
  };
}

/** The hostname behind an address, or null when there is none to open. */
export function hostnameOf(raw: string | null | undefined): string | null {
  try {
    const address = parseHostUrl(raw);
    return address.transport === "unix" ? null : address.host;
  } catch {
    return null;
  }
}
