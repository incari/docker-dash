/**
 * A render that throws must not take the page with it.
 *
 * React unmounts the entire tree when a render throws, so before this boundary
 * existed a single malformed shortcut left a white screen whose only way out
 * was a reload the user had to think of themselves.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "../ErrorBoundary";

let shouldThrow = true;

function Explodes() {
  if (shouldThrow) {
    throw new Error("Cannot read properties of undefined (reading 'ports')");
  }
  return <p>the view</p>;
}

beforeEach(() => {
  shouldThrow = true;
  // React logs the caught error itself; the test does not need the noise.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ErrorBoundary", () => {
  it("shows what went wrong instead of nothing at all", () => {
    render(
      <ErrorBoundary>
        <Explodes />
      </ErrorBoundary>,
    );

    expect(
      screen.getByText("This part of the dashboard stopped working"),
    ).toBeInTheDocument();
    // The actual message, because "something went wrong" helps nobody report a
    // bug.
    expect(
      screen.getByText(/Cannot read properties of undefined/),
    ).toBeInTheDocument();
  });

  it("leaves everything outside it alone", () => {
    render(
      <div>
        <header>the header</header>
        <ErrorBoundary>
          <Explodes />
        </ErrorBoundary>
      </div>,
    );

    // The point of scoping the boundary to the views: there is still somewhere
    // to navigate to.
    expect(screen.getByText("the header")).toBeInTheDocument();
  });

  it("can be told to try again once the cause is gone", async () => {
    const user = userEvent.setup();
    render(
      <ErrorBoundary>
        <Explodes />
      </ErrorBoundary>,
    );

    shouldThrow = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(screen.getByText("the view")).toBeInTheDocument();
  });
});
