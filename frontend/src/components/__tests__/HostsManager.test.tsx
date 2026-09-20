/**
 * The Servers panel: what it says about each machine, and the two things only
 * this machine's own card offers - its API key and the switch that makes the
 * key mean anything.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HostsManager } from "../HostsManager";
import type { Host } from "../../types";

vi.mock("axios");

const LOCAL_KEY =
  "baf8c0e1e88ba8ffa60fa091fd7e18abbd86d9f9873352ad82aef776dc100d5c";

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
    has_api_key: false,
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
      type: "agent",
      url: "http://nas.local:3080",
      has_api_key: true,
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
      type: "agent",
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

describe("this machine's own API key", () => {
  const localWithKey = (enabled: boolean, managedByEnv = false) =>
    host({
      agent: { enabled, managed_by_env: managedByEnv, api_key: LOCAL_KEY },
    });

  it("stays hidden until the machine is opened up to a hub", () => {
    render(<HostsManager hosts={[localWithKey(false)]} {...props} />);

    expect(
      screen.getByLabelText(/Let another dashboard read this server/),
    ).not.toBeChecked();
    expect(screen.queryByText(/baf8c0e1/)).toBeNull();
  });

  it("appears abbreviated once it does, and in full on request", async () => {
    const user = userEvent.setup();
    render(<HostsManager hosts={[localWithKey(true)]} {...props} />);

    // Long enough to recognise, short enough not to fill the card.
    expect(screen.getByText("baf8c0e1…0d5c")).toBeInTheDocument();
    expect(screen.queryByText(LOCAL_KEY)).toBeNull();

    await user.click(screen.getByRole("button", { name: "Show key" }));

    // In full, because a machine with no clipboard access still has to be able
    // to copy it by hand.
    expect(screen.getByText(LOCAL_KEY)).toBeInTheDocument();
  });

  it("saves the switch as soon as it is flipped", async () => {
    const user = userEvent.setup();
    (axios.put as any).mockResolvedValue({ data: {} });

    render(<HostsManager hosts={[localWithKey(false)]} {...props} />);
    await user.click(
      screen.getByLabelText(/Let another dashboard read this server/),
    );

    expect(axios.put).toHaveBeenCalledWith("/api/hosts/1", {
      agent_enabled: true,
    });
  });

  it("is read-only when the environment pins it", () => {
    render(<HostsManager hosts={[localWithKey(true, true)]} {...props} />);

    expect(
      screen.getByLabelText(/Let another dashboard read this server/),
    ).toBeDisabled();
    expect(screen.getByText(/Set by the API_KEY environment/)).toBeInTheDocument();
    // Nor can it be replaced from here - that would be undone by a restart.
    expect(screen.queryByRole("button", { name: "Replace key" })).toBeNull();
  });

  it("asks before replacing a key that other dashboards are using", async () => {
    const user = userEvent.setup();
    render(<HostsManager hosts={[localWithKey(true)]} {...props} />);

    await user.click(screen.getByRole("button", { name: "Replace key" }));

    expect(props.showConfirm).toHaveBeenCalledWith(
      expect.stringContaining("stops being able to read this server"),
      expect.any(Function),
    );
    // Nothing happens until the user says yes.
    expect(axios.post).not.toHaveBeenCalled();
  });

  it("is never offered for a remote server", () => {
    const remote = host({
      id: 2,
      name: "NAS",
      type: "agent",
      has_api_key: true,
      agent: undefined,
    });

    const { container } = render(
      <HostsManager hosts={[remote]} {...props} />,
    );

    expect(
      within(container).queryByLabelText(
        /Let another dashboard read this server/,
      ),
    ).toBeNull();
  });
});
