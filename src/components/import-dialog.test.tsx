import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ImportDialog } from "@/components/import-dialog";

beforeEach(() => {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.setAttribute("open", "");
      },
    },
    close: {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.removeAttribute("open");
      },
    },
  });
});

describe("ImportDialog", () => {
  it("stays open when the native file picker is cancelled", () => {
    const onClose = vi.fn();
    render(<ImportDialog open onClose={onClose} onImport={vi.fn()} />);

    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    input!.dispatchEvent(new Event("cancel", { bubbles: true }));

    expect(onClose).not.toHaveBeenCalled();
    expect(
      screen.getByRole("dialog", { name: "Import events from CSV" }),
    ).toHaveAttribute("open");
  });

  it("still closes when the dialog itself is cancelled", () => {
    const onClose = vi.fn();
    render(<ImportDialog open onClose={onClose} onImport={vi.fn()} />);

    screen
      .getByRole("dialog", { name: "Import events from CSV" })
      .dispatchEvent(new Event("cancel", { bubbles: true, cancelable: true }));

    expect(onClose).toHaveBeenCalledOnce();
  });
});
