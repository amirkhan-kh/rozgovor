import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Button from "./Button";

describe("<Button />", () => {
  it("children'ni ko'rsatishi kerak", () => {
    render(<Button>Saqlash</Button>);
    expect(screen.getByText("Saqlash")).toBeDefined();
  });

  it("bosilganda onClick chaqirilishi kerak", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Bos</Button>);
    await userEvent.click(screen.getByText("Bos"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("disabled bo'lsa onClick chaqirilmasligi kerak", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick} disabled>Bos</Button>);
    await userEvent.click(screen.getByText("Bos"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("loading=true bo'lsa disabled bo'lishi kerak", () => {
    render(<Button loading>Yuklanmoqda</Button>);
    const btn = screen.getByRole("button");
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it("type='submit' to'g'ri o'rnatilishi kerak", () => {
    render(<Button type="submit">Yubor</Button>);
    expect(screen.getByRole("button").getAttribute("type")).toBe("submit");
  });

  it("danger variant 'bg-danger' klassini olishi kerak", () => {
    render(<Button variant="danger">O'chir</Button>);
    expect(screen.getByRole("button").className).toContain("bg-danger");
  });
});
