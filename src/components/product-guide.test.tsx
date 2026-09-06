import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProductGuide } from "@/components/product-guide";

describe("ProductGuide", () => {
  it("introduces the three Timer experiences and primary actions", () => {
    render(<ProductGuide />);

    expect(screen.getByRole("heading", { name: "One clock. Every room." })).toBeInTheDocument();
    expect(screen.getByText("Event controller")).toBeInTheDocument();
    expect(screen.getByText("Speaker view")).toBeInTheDocument();
    expect(screen.getByText("Zoom indicator")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Create an event/i }).length).toBeGreaterThan(0);
  });

  it("moves through the interactive prepare, run, and share tour", () => {
    render(<ProductGuide />);

    expect(screen.getByRole("heading", { name: "Friday showcase" })).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("tab", {
        name: "Run: Keep the room moving without losing the plan.",
      }),
    );
    expect(screen.getByText("Live control room")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("tab", {
        name: "Share: Put the same clock everywhere it matters.",
      }),
    );
    expect(screen.getByText("Sound is local to the speaker display")).toBeInTheDocument();
  });

  it("provides anchored navigation and accessible FAQ content", () => {
    render(<ProductGuide />);

    expect(screen.getByRole("navigation", { name: "Guide navigation" })).toBeInTheDocument();
    expect(screen.getByText("Does the speaker need an account?")).toBeInTheDocument();
    expect(screen.getByText(/speaker link is anonymous and read-only/i)).toBeInTheDocument();
  });
});
