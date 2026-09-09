import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { CardShell } from "../CardShell";

describe("CardShell", () => {
  it("renders a real anchor so the browser link affordances work", () => {
    render(
      <CardShell
        link="http://localhost:8096"
        linkLabel="Open Jellyfin"
      >
        <span>Jellyfin</span>
      </CardShell>,
    );

    const link = screen.getByRole("link", { name: "Open Jellyfin" });
    expect(link).toHaveAttribute("href", "http://localhost:8096");
    expect(link).toHaveAttribute("target", "_blank");
    // noopener keeps the opened page from reaching back through window.opener
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders no link while reordering, so the card can be dragged", () => {
    render(
      <CardShell
        link="http://localhost:8096"
        linkLabel="Open Jellyfin"
        isEditMode
      >
        <span>Jellyfin</span>
      </CardShell>,
    );

    expect(screen.queryByRole("link")).toBeNull();
  });

  it("renders no link when the shortcut has no destination", () => {
    render(
      <CardShell
        link={null}
        linkLabel="Open Jellyfin"
      >
        <span>Jellyfin</span>
      </CardShell>,
    );

    expect(screen.queryByRole("link")).toBeNull();
  });
});
