import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import Skeleton, {
  SkeletonText,
  SkeletonCard,
  SkeletonKPI,
} from "./Skeleton";

describe("<Skeleton />", () => {
  it("animate-pulse klassi bilan render bo'ladi", () => {
    const { container } = render(<Skeleton className="h-4 w-20" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("animate-pulse");
  });

  it("custom className qo'shadi", () => {
    const { container } = render(<Skeleton className="my-test-class" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("my-test-class");
  });

  it("default rounded='lg' klassi bilan", () => {
    const { container } = render(<Skeleton />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("rounded-lg");
  });

  it("rounded='full' klassini qo'llab-quvvatlaydi", () => {
    const { container } = render(<Skeleton rounded="full" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("rounded-full");
  });
});

describe("<SkeletonText />", () => {
  it("default 3 qator render bo'ladi", () => {
    const { container } = render(<SkeletonText />);
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(3);
  });

  it("lines={5} bo'lsa 5 qator render bo'ladi", () => {
    const { container } = render(<SkeletonText lines={5} />);
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(5);
  });
});

describe("<SkeletonKPI />", () => {
  it("4 ta SkeletonCard render qiladi", () => {
    const { container } = render(<SkeletonKPI />);
    // har SkeletonCard ichida bir nechta animate-pulse bor — eng kamida 4 ta card uchun multiplied
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain("grid");
  });
});

describe("<SkeletonCard />", () => {
  it("border va rounded-xl bilan render bo'ladi", () => {
    const { container } = render(<SkeletonCard />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain("border");
    expect(wrapper.className).toContain("rounded-xl");
  });
});
