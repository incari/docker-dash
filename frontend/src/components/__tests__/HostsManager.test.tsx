/**
 * The Servers panel: what it says about each machine.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HostsManager } from "../HostsManager";
import type { Host } from "../../types";

vi.mock("axios");

function host(overrides: Partial<Host> = {}): Host {
  return {
    id: 1,
    name: "Mac mini",
    type: "local",
    url: null,
    hostname: null,
    color: null,
    position: 0,
    enabled: true,
    status: {
      online: true,
      checked_at: "2026-09-19T00:00:00.000Z",
      container_count: 3,
      error: null,
      error_code: null,
      failures: 0,
      retry_after: null,
    },
    ...overrides,
  };
}

const props = {
  onChanged: vi.fn(),
  onError: vi.fn(),
  showConfirm: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("what a server card reports", () => {
  it("says a server is online and how much it has", () => {
    render(<HostsManager hosts={[host()]} {...props} />);

    expect(screen.getByText("Online - 3 containers")).toBeInTheDocument();
  });

  it("says why a server could not be read, in the dashboard's language", () => {
    const dead = host({
      id: 2,
      name: "NAS",
      type: "docker",
      url: "tcp://nas.local:2375",
      status: {
        online: false,
        checked_at: "2026-09-19T00:00:00.000Z",
        container_count: null,
        // The backend's own English sentence is the fallback; the code is what
        // the UI actually shows.
        error: "Connection refused - nothing is listening",
        error_code: "refused",
        failures: 2,
        retry_after: "2099-01-01T00:00:00.000Z",
      },
    });

    render(<HostsManager hosts={[dead]} {...props} />);

    expect(
      screen.getByText(/Connection refused - nothing is listening on that/),
    ).toBeInTheDocument();
  });

  it("offers a way to try a skipped server right now", async () => {
    const user = userEvent.setup();
    (axios.post as any).mockResolvedValue({ data: {} });

    const dead = host({
      id: 2,
      name: "NAS",
      type: "docker",
      status: { ...host().status, online: false, error_code: "timeout" },
    });

    render(<HostsManager hosts={[dead]} {...props} />);
    await user.click(screen.getByRole("button", { name: /Try again now/ }));

    // A backoff of up to a minute is the wrong answer the moment someone
    // switches the machine back on.
    expect(axios.post).toHaveBeenCalledWith("/api/hosts/2/retry");
    await waitFor(() => expect(props.onChanged).toHaveBeenCalled());
  });

  it("does not offer to retry a server that is answering", () => {
    render(<HostsManager hosts={[host()]} {...props} />);

    expect(screen.queryByRole("button", { name: /Try again now/ })).toBeNull();
  });

  it("will not offer to remove the local server", () => {
    render(<HostsManager hosts={[host()]} {...props} />);

    expect(screen.queryByRole("button", { name: "Remove server" })).toBeNull();
  });
});

describe("a server switched off by the upgrade", () => {
  it("says it needs a new address, not just that it is off", () => {
    const migrated = host({
      id: 2,
      name: "NAS",
      type: "docker",
      url: "http://nas.local:3080",
      enabled: false,
    });

    render(<HostsManager hosts={[migrated]} {...props} />);

    expect(
      screen.getByText(/it was read through the old agent/),
    ).toBeInTheDocument();
  });

  it("says plainly that a server someone switched off is off", () => {
    const off = host({
      id: 2,
      name: "NAS",
      type: "docker",
      url: "ssh://me@nas.local",
      enabled: false,
    });

    render(<HostsManager hosts={[off]} {...props} />);

    expect(screen.getByText("Not being read")).toBeInTheDocument();
  });
});
