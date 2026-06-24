import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import LoadingSpinner from "./LoadingSpinner";

describe("<LoadingSpinner />", () => {
  it("default md size 'w-8 h-8' klassi bilan", () => {
    const { container } = render(<LoadingSpinner />);
    const spinner = container.querySelector(".animate-spin");
    expect(spinner).not.toBeNull();
    expect((spinner as HTMLElement).className).toContain("w-8");
  });

  it("sm size 'w-5 h-5' klassi bilan", () => {
    const { container } = render(<LoadingSpinner size="sm" />);
    const spinner = container.querySelector(".animate-spin");
    expect((spinner as HTMLElement).className).toContain("w-5");
  });

  it("lg size 'w-12 h-12' klassi bilan", () => {
    const { container } = render(<LoadingSpinner size="lg" />);
    const spinner = container.querySelector(".animate-spin");
    expect((spinner as HTMLElement).className).toContain("w-12");
  });

  it("animate-spin klassi mavjud", () => {
    const { container } = render(<LoadingSpinner />);
    expect(container.querySelector(".animate-spin")).not.toBeNull();
  });
});
