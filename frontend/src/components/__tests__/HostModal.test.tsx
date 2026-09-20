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
  type: "agent",
  url: "http://nas.local:3080",
  hostname: "nas.local",
  color: "#22c55e",
  position: 1,
  enabled: true,
  has_api_key: true,
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
      data: { ok: false, error: "Invalid API key", error_code: "key_rejected" },
    });

    render(<HostModal {...props} />);
    await user.type(
      screen.getByPlaceholderText("http://192.168.1.10:3080"),
      "nas.local:3080",
    );
    await user.click(screen.getByRole("button", { name: "Test" }));

    // The backend sends a code alongside its own English sentence, so the
    // message the user reads is the translated one.
    expect(
      await screen.findByText(/Copy the key from that server's own dashboard/),
    ).toBeInTheDocument();
  });

  it("reports what it found when the server answers", async () => {
    const user = userEvent.setup();
    (axios.post as any).mockResolvedValue({
      data: { ok: true, containers: 4 },
    });

    render(<HostModal {...props} />);
    await user.type(
      screen.getByPlaceholderText("http://192.168.1.10:3080"),
      "nas.local:3080",
    );
    await user.click(screen.getByRole("button", { name: "Test" }));

    expect(
      await screen.findByText("Reachable - 4 containers"),
    ).toBeInTheDocument();
  });
});

describe("the API key field", () => {
  it("starts empty when editing, and an empty field keeps the saved key", async () => {
    const user = userEvent.setup();
    (axios.put as any).mockResolvedValue({ data: saved });

    render(
      <HostModal
        {...props}
        host={saved}
      />,
    );

    // The browser is never sent the key, so there is nothing to prefill with.
    const field = screen.getByPlaceholderText(
      "Leave empty to keep the saved key",
    );
    expect(field).toHaveValue("");

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(axios.put).toHaveBeenCalled());
    const [, payload] = (axios.put as any).mock.calls[0];
    expect(payload).not.toHaveProperty("api_key");
    expect(payload.name).toBe("NAS");
  });

  it("sends a key that was typed", async () => {
    const user = userEvent.setup();
    (axios.post as any).mockResolvedValue({ data: saved });

    render(<HostModal {...props} />);
    await user.type(screen.getByPlaceholderText("NAS, VPS, office…"), "NAS");
    await user.type(
      screen.getByPlaceholderText("http://192.168.1.10:3080"),
      "nas.local:3080",
    );
    await user.type(
      screen.getByPlaceholderText("Paste that server's API key"),
      "abc123",
    );
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(axios.post).toHaveBeenCalled());
    const [, payload] = (axios.post as any).mock.calls[0];
    expect(payload).toMatchObject({
      name: "NAS",
      url: "nas.local:3080",
      api_key: "abc123",
    });
  });

  it("is not asked for on the local server, which has no address to reach", () => {
    render(
      <HostModal
        {...props}
        host={{ ...saved, id: 1, type: "local", name: "Mac mini" }}
      />,
    );

    expect(screen.queryByText("API key")).toBeNull();
    expect(screen.queryByRole("button", { name: "Test" })).toBeNull();
  });
});
