/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { Button, Field } from "./primitives.js";

describe("Button", () => {
  it("is operable by keyboard (Enter/Space)", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Start</Button>);
    const btn = screen.getByRole("button", { name: "Start" });
    btn.focus();
    expect(btn).toBe(document.activeElement);
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard(" ");
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("exposes aria-busy and is disabled while loading", () => {
    render(<Button loading>Saving</Button>);
    const btn = screen.getByRole("button", { name: "Saving" });
    expect(btn.getAttribute("aria-busy")).toBe("true");
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it("defaults to type=button (no accidental submit)", () => {
    render(<Button>Go</Button>);
    expect(screen.getByRole("button").getAttribute("type")).toBe("button");
  });

  it("has no axe violations", async () => {
    const { container } = render(<Button>Accessible</Button>);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("Field", () => {
  it("associates the label and input", () => {
    render(<Field label="Client label" defaultValue="x" />);
    const input = screen.getByLabelText("Client label");
    expect(input).toBeTruthy();
  });

  it("wires aria-invalid + aria-describedby to the error", () => {
    render(<Field label="MRN" error="Required" />);
    const input = screen.getByLabelText("MRN");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const describedby = input.getAttribute("aria-describedby");
    expect(describedby).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe("Required");
  });

  it("has no axe violations (labelled control)", async () => {
    const { container } = render(<Field label="Email" hint="We never share it" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
