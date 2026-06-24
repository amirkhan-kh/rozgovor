import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Card from "./Card";

describe("<Card />", () => {
  it("children'ni ko'rsatadi", () => {
    render(<Card>Mazmun</Card>);
    expect(screen.getByText("Mazmun")).toBeDefined();
  });

  it("title bo'lsa h3 elementida ko'rsatadi", () => {
    render(<Card title="Sarlavha">Mazmun</Card>);
    const h3 = screen.getByText("Sarlavha");
    expect(h3.tagName).toBe("H3");
  });

  it("subtitle bo'lsa ko'rsatadi", () => {
    render(<Card title="A" subtitle="Tavsif">Mazmun</Card>);
    expect(screen.getByText("Tavsif")).toBeDefined();
  });

  it("title yo'q bo'lsa subtitle ko'rsatilmaydi", () => {
    render(<Card subtitle="Tavsif">Mazmun</Card>);
    expect(screen.queryByText("Tavsif")).toBeNull();
  });

  it("custom className qo'shadi", () => {
    const { container } = render(<Card className="custom-class">X</Card>);
    expect(container.querySelector(".custom-class")).toBeDefined();
  });

  it("default klasslarni qo'llab-quvvatlaydi", () => {
    const { container } = render(<Card>X</Card>);
    expect(container.firstChild).toHaveProperty("className");
    const className = (container.firstChild as HTMLElement).className;
    expect(className).toContain("bg-card");
    expect(className).toContain("rounded-xl");
  });
});
