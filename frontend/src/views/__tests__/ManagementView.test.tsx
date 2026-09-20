/**
 * The container list, which is where a fleet has to be legible.
 *
 * The same image runs on several machines, so a flat list of thirty containers
 * says nothing about which box to look at - and two of them can be called
 * `nginx`.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ManagementView } from "../ManagementView";
import type { DockerContainer, Host } from "../../types";

vi.mock("axios");

function container(
  overrides: Partial<DockerContainer> & { id: string; name: string },
): DockerContainer {
  return {
    state: "running",
    status: "Up 2 hours",
    image: "nginx:latest",
    // A published port gives the card a real link, which is one per card -
    // unlike the title, which every card renders twice for mobile and desktop.
    ports: [{ private: 80, public: 8080, type: "tcp" }],
    composeProject: null,
    composeService: null,
    hostId: 1,
    hostName: "Mac mini",
    ...overrides,
  };
}

function host(id: number, name: string, type: Host["type"] = "agent"): Host {
  return {
    id,
    name,
    type,
    url: type === "local" ? null : `http://${name}:3080`,
    hostname: null,
    color: null,
    position: id,
    enabled: true,
    has_api_key: type === "agent",
    status: {
      online: true,
      checked_at: "2026-09-19T00:00:00.000Z",
      container_count: 2,
      error: null,
      error_code: null,
      failures: 0,
      retry_after: null,
    },
  };
}

const baseProps = {
  shortcuts: [],
  tailscaleInfo: { available: false, ip: null },
  setView: vi.fn(),
  setEditingShortcut: vi.fn(),
  setIsModalOpen: vi.fn(),
  openEditModal: vi.fn(),
  handleDelete: vi.fn(),
  handleStart: vi.fn(),
  handleStop: vi.fn(),
  handleRestart: vi.fn(),
  handleQuickAdd: vi.fn(),
  handleQuickAddAsFavorite: vi.fn(),
  handleToggleFavorite: vi.fn(),
  viewMode: "default",
  mobileColumns: 2,
  searchQuery: "",
  onHostsChanged: vi.fn(),
  onError: vi.fn(),
  showHostConfirm: vi.fn(),
} as any;

const local = host(1, "Mac mini", "local");
const nas = host(2, "NAS");

const twoServers = [
  container({ id: "a1", name: "nginx" }),
  container({ id: "a2", name: "plex" }),
  container({ id: "b1", name: "nginx", hostId: 2, hostName: "NAS" }),
  container({ id: "b2", name: "jellyfin", hostId: 2, hostName: "NAS" }),
];

describe("grouping containers by server", () => {
  it("puts each server's containers under its own heading", () => {
    render(
      <ManagementView
        {...baseProps}
        hosts={[local, nas]}
        containers={twoServers}
      />,
    );

    // One count badge per server heading.
    expect(screen.getAllByText("2 containers")).toHaveLength(2);
    // And the same name really does appear on both machines.
    expect(screen.getAllByRole("link", { name: "Open nginx" })).toHaveLength(2);
  });

  it("does not group when there is only one server", () => {
    render(
      <ManagementView
        {...baseProps}
        hosts={[local]}
        containers={[
          container({ id: "a1", name: "nginx" }),
          container({ id: "a2", name: "plex" }),
        ]}
      />,
    );

    // A heading naming the one thing already on screen is noise, so there is
    // no count badge at all.
    expect(screen.queryByText("2 containers")).toBeNull();
    expect(screen.getAllByRole("link", { name: "Open nginx" })).toHaveLength(1);
  });

  it("keeps compose projects nested inside their server", () => {
    render(
      <ManagementView
        {...baseProps}
        hosts={[local, nas]}
        containers={[
          container({ id: "a1", name: "nginx" }),
          container({
            id: "b1",
            name: "immich-server",
            hostId: 2,
            hostName: "NAS",
            composeProject: "immich",
            composeService: "server",
          }),
          container({
            id: "b2",
            name: "immich-db",
            hostId: 2,
            hostName: "NAS",
            composeProject: "immich",
            composeService: "database",
          }),
        ]}
      />,
    );

    expect(screen.getByText("immich")).toBeInTheDocument();
    // Two under the project, two under the server that owns it, one under the
    // other server.
    expect(screen.getAllByText("2 containers")).toHaveLength(2);
    expect(screen.getByText("1 container")).toBeInTheDocument();
  });

  it("searching narrows the servers, not just the containers", () => {
    render(
      <ManagementView
        {...baseProps}
        hosts={[local, nas]}
        containers={twoServers}
        searchQuery="jellyfin"
      />,
    );

    expect(screen.getByRole("link", { name: "Open jellyfin" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open plex" })).toBeNull();
    // Only the server that has a match keeps a heading.
    expect(screen.getAllByText("1 container")).toHaveLength(1);
  });
});
