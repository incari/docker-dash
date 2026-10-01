/**
 * Docker over ssh, through the system ssh client.
 *
 * dockerode can dial ssh itself through the ssh2 library, but that is an ssh
 * of its own: it ignores ~/.ssh/config and known_hosts and accepts whatever
 * host key it is shown. Handing the connection to the ssh binary instead - the
 * way the Docker CLI and docker-controller-bot do it - means a machine that
 * answers `ssh nas docker version` answers here too, host aliases and all, and
 * is debugged with the same command.
 *
 * Each HTTP request gets its own `ssh ... docker system dial-stdio`, which
 * pipes the remote daemon's socket over stdin/stdout - one short ssh session
 * per request, exactly what `docker -H ssh://...` does.
 */

import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import http from "http";
import { Duplex } from "stream";
import type { DockerAddress } from "./hostUrl.js";

/** Overridable so tests can stand in a fake ssh, and odd images a real one. */
const SSH_BINARY = process.env.SSH_BINARY || "ssh";

/**
 * How long to wait for stderr to close after ssh exits.
 *
 * Normally it closes with the process. A ControlMaster in the user's ssh
 * config leaves a master in the background that can hold it open for as long
 * as it persists, and every request would wait that long.
 */
const STDERR_GRACE_MS = 250;

export function sshArgs(
  address: DockerAddress,
  connectTimeoutMs: number,
): string[] {
  const args = [
    // Never stop to ask: there is nobody to type a passphrase or say "yes" to
    // an unknown host key, and a prompt would hang the request instead.
    "-o",
    "BatchMode=yes",
    "-o",
    `ConnectTimeout=${Math.max(1, Math.ceil(connectTimeoutMs / 1000))}`,
  ];

  if (address.port) args.push("-p", String(address.port));
  if (address.user) args.push("-l", address.user);
  args.push("--", address.host, "docker", "system", "dial-stdio");
  return args;
}

/**
 * Why ssh gave up, in words the person can act on.
 *
 * ssh reports everything on stderr and exits 255, so stderr is the only place
 * the reason lives. The codes match the ones the frontend translates.
 */
export function describeSshFailure(stderr: string): {
  message: string;
  code:
    | "ssh_auth"
    | "ssh_host_key"
    | "dns"
    | "refused"
    | "timeout"
    | "no_docker_cli"
    | "socket_permission"
    | "docker_down"
    | "unreachable";
} {
  const text = stderr.trim();
  const lower = text.toLowerCase();

  if (lower.includes("host key verification failed")) {
    return {
      message:
        "This machine is not in known_hosts. Run `ssh <user>@<machine>` once from the machine docker-dash runs on and accept its key.",
      code: "ssh_host_key",
    };
  }
  if (lower.includes("permission denied (")) {
    return {
      message:
        "The ssh key was not accepted. Authorise it on that machine with ssh-copy-id.",
      code: "ssh_auth",
    };
  }
  if (lower.includes("could not resolve hostname")) {
    return { message: "That hostname does not resolve", code: "dns" };
  }
  if (lower.includes("connection refused")) {
    return {
      message: "Connection refused - is sshd running on that machine?",
      code: "refused",
    };
  }
  if (lower.includes("timed out")) {
    return {
      message: "The connection timed out - check the address and any firewall",
      code: "timeout",
    };
  }
  if (
    lower.includes("docker: not found") ||
    lower.includes("command not found") ||
    lower.includes("docker: command not found")
  ) {
    return {
      message: "`docker` is not on that user's PATH on the remote machine",
      code: "no_docker_cli",
    };
  }
  if (lower.includes("permission denied while trying to connect")) {
    return {
      message:
        "That user cannot use Docker there. Add it to the docker group on the remote machine.",
      code: "socket_permission",
    };
  }
  if (
    lower.includes("cannot connect to the docker daemon") ||
    lower.includes("is the docker daemon running")
  ) {
    return {
      message: "Docker is not running on this server",
      code: "docker_down",
    };
  }

  return {
    message: text.split("\n").filter(Boolean).pop() || "ssh failed",
    code: "unreachable",
  };
}

export class SshTransportError extends Error {
  constructor(
    message: string,
    readonly code: ReturnType<typeof describeSshFailure>["code"],
  ) {
    super(message);
  }
}

/**
 * One ssh process presented as the socket http.request expects.
 *
 * http only needs a Duplex plus the handful of socket methods it calls on
 * whatever it is given; those are no-ops here except setTimeout, which is how
 * dockerode's request timeout reaches the connection.
 */
class SshSocket extends Duplex {
  private stderr = "";
  private gotData = false;
  private stdoutEnded = false;
  private stderrEnded = false;
  private exitCode: number | null | undefined = undefined;
  private finished = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly child: ChildProcessWithoutNullStreams) {
    super();

    child.stdout.on("data", (chunk: Buffer) => {
      this.gotData = true;
      if (!this.push(chunk)) child.stdout.pause();
    });
    child.stdout.on("end", () => {
      this.stdoutEnded = true;
      this.finish();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      // Bounded: a chatty remote must not grow this without limit.
      if (this.stderr.length < 4096) this.stderr += chunk.toString();
    });
    child.stderr.on("end", () => {
      this.stderrEnded = true;
      this.finish();
    });

    child.on("error", (error: NodeJS.ErrnoException) => {
      this.destroy(
        error.code === "ENOENT"
          ? new SshTransportError(
              "This image has no ssh client. Install openssh-client to use ssh:// servers.",
              "unreachable",
            )
          : error,
      );
    });

    // 'exit' rather than 'close', which waits for every pipe - see
    // STDERR_GRACE_MS for why stderr cannot be waited on indefinitely...
    child.on("exit", (code) => {
      this.exitCode = code;
      this.finish();
      // ...but only for a moment, which is all ssh's own last words need.
      setTimeout(() => {
        this.stderrEnded = true;
        this.finish();
      }, STDERR_GRACE_MS).unref();
    });

    child.stdin.on("error", () => {
      // The process exiting closes stdin under a pending write; the exit
      // handler above already reports why.
    });
  }

  /**
   * Ends the stream once ssh has exited and closed stdout and stderr.
   *
   * Ending on stdout alone would let http report a bare "socket hang up"
   * before the exit code and stderr say what went wrong.
   */
  private finish(): void {
    if (this.finished) return;
    if (!this.stdoutEnded || !this.stderrEnded || this.exitCode === undefined) {
      return;
    }
    this.finished = true;
    this.child.stderr.destroy();

    // A clean exit after an answer is the normal end of a request. Anything
    // that dies before saying a word is ssh failing, and stderr says why.
    if (this.exitCode !== 0 && !this.gotData) {
      const { message, code } = describeSshFailure(this.stderr);
      this.destroy(new SshTransportError(message, code));
    } else {
      this.push(null);
    }
  }

  override _read(): void {
    this.child.stdout.resume();
  }

  override _write(
    chunk: Buffer,
    encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    // Never fails the socket. ssh that dies early closes stdin under this
    // write, and an EPIPE here would reach http before the exit code and
    // stderr do - reporting "broken pipe" instead of why ssh gave up.
    this.child.stdin.write(chunk, encoding, () => callback());
  }

  override _final(callback: (error?: Error | null) => void): void {
    this.child.stdin.end(() => callback());
  }

  override _destroy(
    error: Error | null,
    callback: (error?: Error | null) => void,
  ): void {
    if (this.timer) clearTimeout(this.timer);
    if (this.child.exitCode === null && !this.child.killed) {
      this.child.kill();
    }
    callback(error);
  }

  setTimeout(ms: number, onTimeout?: () => void): this {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (onTimeout) this.once("timeout", onTimeout);
    if (ms > 0) {
      this.timer = setTimeout(() => this.emit("timeout"), ms);
      this.timer.unref();
    }
    return this;
  }

  setNoDelay(): this {
    return this;
  }

  setKeepAlive(): this {
    return this;
  }

  ref(): this {
    return this;
  }

  unref(): this {
    return this;
  }
}

/**
 * An http.Agent whose every connection is a fresh `docker system dial-stdio`
 * on the remote machine.
 */
export function createSshAgent(
  address: DockerAddress,
  connectTimeoutMs: number,
): http.Agent {
  const agent = new http.Agent({ keepAlive: false });

  // Returned synchronously, which http.Agent takes as the connection: http
  // writes the request straight in and ssh buffers it until the remote end is
  // ready.
  agent.createConnection = () => {
    const child = spawn(SSH_BINARY, sshArgs(address, connectTimeoutMs), {
      stdio: ["pipe", "pipe", "pipe"],
    });
    return new SshSocket(child) as never;
  };

  return agent;
}
