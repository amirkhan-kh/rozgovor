import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Badge from "./Badge";

describe("<Badge />", () => {
  it("children'ni ko'rsatishi kerak", () => {
    render(<Badge>Yangi</Badge>);
    expect(screen.getByText("Yangi")).toBeDefined();
  });

  it("default variant 'bg-secondary/10' klassi bilan", () => {
    render(<Badge>X</Badge>);
    expect(screen.getByText("X").className).toContain("bg-secondary/10");
  });

  it("success variant 'text-success' klassi bilan", () => {
    render(<Badge variant="success">Tayyor</Badge>);
    expect(screen.getByText("Tayyor").className).toContain("text-success");
  });

  it("danger variant 'text-danger' klassi bilan", () => {
    render(<Badge variant="danger">Xato</Badge>);
    expect(screen.getByText("Xato").className).toContain("text-danger");
  });

  it("md size 'text-sm' klassi bilan", () => {
    render(<Badge size="md">Katta</Badge>);
    expect(screen.getByText("Katta").className).toContain("text-sm");
  });
});
