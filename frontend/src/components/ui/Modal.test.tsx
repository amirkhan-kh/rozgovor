import { describe, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Modal from "./Modal";

describe("<Modal />", () => {
  it("isOpen=false bo'lsa ko'rinmaydi", () => {
    render(
      <Modal isOpen={false} onClose={() => {}} title="Test">
        <p>Modal mazmuni</p>
      </Modal>
    );
    expect(screen.queryByText("Modal mazmuni")).toBeNull();
  });

  it("isOpen=true bo'lsa title va children ko'rinadi", () => {
    render(
      <Modal isOpen={true} onClose={() => {}} title="Sarlavha">
        <p>Modal mazmuni</p>
      </Modal>
    );
    expect(screen.getByText("Sarlavha")).toBeDefined();
    expect(screen.getByText("Modal mazmuni")).toBeDefined();
  });

  it("yopish tugmasi bosilganda onClose chaqirilishi kerak", async () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={onClose} title="Test">
        <p>X</p>
      </Modal>
    );
    const closeBtn = screen.getByRole("button");
    await userEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ochilganda body overflow=hidden bo'lishi kerak", () => {
    cleanup();
    render(
      <Modal isOpen={true} onClose={() => {}} title="X">
        <p>Y</p>
      </Modal>
    );
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("yopilganda body overflow tiklanishi kerak", () => {
    cleanup();
    document.body.style.overflow = "auto";
    const { rerender } = render(
      <Modal isOpen={true} onClose={() => {}} title="X">
        <p>Y</p>
      </Modal>
    );
    expect(document.body.style.overflow).toBe("hidden");
    rerender(
      <Modal isOpen={false} onClose={() => {}} title="X">
        <p>Y</p>
      </Modal>
    );
    expect(document.body.style.overflow).toBe("unset");
  });
});
