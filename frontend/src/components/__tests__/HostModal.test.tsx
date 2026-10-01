/**
 * Adding a server, and finding out it is wrong before saving it.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HostModal } from "../HostModal";
import type { Host } from "../../types";

vi.mock("axios");

const props = {
  isOpen: true,
  host: null,
  onSaved: vi.fn(),
  onClose: vi.fn(),
  onError: vi.fn(),
};

const saved: Host = {
  id: 2,
  name: "NAS",
  type: "docker",
  url: "ssh://me@nas.local",
  hostname: "nas.local",
  color: "#22c55e",
  position: 1,
  enabled: true,
  status: {
    online: true,
    checked_at: null,
    container_count: 4,
    error: null,
    error_code: null,
    failures: 0,
    retry_after: null,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("checking a server before saving it", () => {
  it("says what is wrong in the dashboard's language", async () => {
    const user = userEvent.setup();
    (axios.post as any).mockResolvedValue({
      data: {
        ok: false,
        error: "me@nas: Permission denied (publickey).",
        error_code: "ssh_auth",
      },
    });

    render(<HostModal {...props} />);
    await user.type(
      screen.getByPlaceholderText("ssh://user@192.168.1.10"),
      "ssh://me@nas.local",
    );
    await user.click(screen.getByRole("button", { name: "Test" }));

    // The backend sends a code alongside its own English sentence, so the
    // message the user reads is the translated one.
    expect(
      await screen.findByText(/Authorise it on that machine with ssh-copy-id/),
    ).toBeInTheDocument();
  });

  it("explains an old agent address instead of only refusing it", async () => {
    const user = userEvent.setup();
    // The backend answers 400 for an address it will not store.
    (axios.post as any).mockRejectedValue({
      response: {
        data: { ok: false, error: "no longer", error_code: "legacy_agent" },
      },
    });

    render(<HostModal {...props} />);
    await user.type(
      screen.getByPlaceholderText("ssh://user@192.168.1.10"),
      "http://nas.local:3080",
    );
    await user.click(screen.getByRole("button", { name: "Test" }));

    expect(
      await screen.findByText(/no longer reads other dashboards/),
    ).toBeInTheDocument();
  });

  it("reports what it found when the server answers", async () => {
    const user = userEvent.setup();
    (axios.post as any).mockResolvedValue({
      data: { ok: true, containers: 4, version: "27.3.1" },
    });

    render(<HostModal {...props} />);
    await user.type(
      screen.getByPlaceholderText("ssh://user@192.168.1.10"),
      "ssh://me@nas.local",
    );
    await user.click(screen.getByRole("button", { name: "Test" }));

    expect(
      await screen.findByText("Reachable - Docker 27.3.1, 4 containers"),
    ).toBeInTheDocument();
  });
});

describe("saving a server", () => {
  it("sends the address as typed, with no key to go with it", async () => {
    const user = userEvent.setup();
    (axios.post as any).mockResolvedValue({ data: saved });

    render(<HostModal {...props} />);
    await user.type(screen.getByPlaceholderText("NAS, VPS, office…"), "NAS");
    await user.type(
      screen.getByPlaceholderText("ssh://user@192.168.1.10"),
      "ssh://me@nas.local",
    );
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(axios.post).toHaveBeenCalled());
    const [, payload] = (axios.post as any).mock.calls[0];
    expect(payload).toMatchObject({ name: "NAS", url: "ssh://me@nas.local" });
    expect(payload).not.toHaveProperty("api_key");
  });

  it("asks for no address on the local server, which already has its socket", () => {
    render(
      <HostModal
        {...props}
        host={{ ...saved, id: 1, type: "local", name: "Mac mini" }}
      />,
    );

    expect(screen.queryByPlaceholderText("ssh://user@192.168.1.10")).toBeNull();
    expect(screen.queryByRole("button", { name: "Test" })).toBeNull();
  });
});
