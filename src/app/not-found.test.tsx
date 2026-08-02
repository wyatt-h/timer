import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import NotFound from "@/app/not-found";

describe("NotFound", () => {
  it("offers branded ways back into the product", () => {
    render(<NotFound />);

    expect(
      screen.getByRole("heading", { name: "This page isn't on the run of show." }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Return home" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "View product guide" })).toHaveAttribute(
      "href",
      "/guide",
    );
  });
});
