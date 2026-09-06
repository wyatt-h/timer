import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import {
  CredentialsFields,
  EMPTY_CREDENTIALS,
  type CredentialsDraft,
} from "@/components/event-access/credentials-fields";

function Harness() {
  const [draft, setDraft] = useState<CredentialsDraft>(EMPTY_CREDENTIALS);
  return (
    <CredentialsFields draft={draft} onChange={setDraft} showErrors={false} />
  );
}

describe("CredentialsFields", () => {
  it("shows memorable, event-based credential guidance", () => {
    render(<Harness />);

    expect(
      screen.getByRole("heading", { name: "Make access easy to share" }),
    ).toBeInTheDocument();
    expect(screen.getByText("fnh0915 / fnh0915")).toBeInTheDocument();
    expect(screen.queryByText("globalcall0824 / globalcall0824")).not.toBeInTheDocument();
    expect(screen.getByText("wyatth / wyatth")).toBeInTheDocument();
    expect(
      screen.getByText("Base the login name on the event—not on the person running the timer."),
    ).toBeInTheDocument();
  });

  it("explains when a login name is normalized", () => {
    render(<Harness />);
    const loginName = screen.getByLabelText("Event login name") as HTMLElement & {
      value: string;
    };

    loginName.value = "Friday Night!";
    fireEvent.input(loginName);

    expect(loginName).toHaveAttribute(
      "supportingtext",
      "Converted to lowercase and removed unsupported characters.",
    );
  });

  it("confirms visually when valid passwords match", () => {
    render(<Harness />);
    const password = screen.getByLabelText("Event password") as HTMLElement & { value: string };
    const confirmation = screen.getByLabelText("Repeat the password") as HTMLElement & {
      value: string;
    };

    password.value = "123456";
    fireEvent.input(password);
    confirmation.value = "123456";
    fireEvent.input(confirmation);

    expect(screen.getByRole("status")).toHaveTextContent("Passwords match");

    confirmation.value = "123457";
    fireEvent.input(confirmation);
    expect(screen.queryByText("Passwords match")).not.toBeInTheDocument();
  });
});
