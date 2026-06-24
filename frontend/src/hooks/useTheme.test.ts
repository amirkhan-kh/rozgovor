import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTheme } from "./useTheme";

describe("useTheme", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
  });

  it("default'da dark theme bo'lishi kerak", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.isDark).toBe(true);
    expect(localStorage.getItem("theme")).toBe("dark");
  });

  it("localStorage'da 'light' bo'lsa light theme'ni o'qishi kerak", () => {
    localStorage.setItem("theme", "light");
    const { result } = renderHook(() => useTheme());
    expect(result.current.isDark).toBe(false);
  });

  it("toggleTheme dark dan light ga o'tkazadi", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.isDark).toBe(true);
    act(() => {
      result.current.toggleTheme();
    });
    expect(result.current.isDark).toBe(false);
    expect(localStorage.getItem("theme")).toBe("light");
    expect(document.documentElement.classList.contains("light")).toBe(true);
  });

  it("toggleTheme light dan dark ga o'tkazadi", () => {
    localStorage.setItem("theme", "light");
    const { result } = renderHook(() => useTheme());
    act(() => {
      result.current.toggleTheme();
    });
    expect(result.current.isDark).toBe(true);
    expect(localStorage.getItem("theme")).toBe("dark");
    expect(document.documentElement.classList.contains("light")).toBe(false);
  });
});
