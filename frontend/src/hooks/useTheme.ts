import { useState, useEffect } from "react";
import type { ThemeColors } from "../types/themeTypes";

const DEFAULT_THEME: ThemeColors = {
  primary: "#3b82f6",
  background: "#0f172a",
};

// Calculate luminance to determine if color is light or dark
function getLuminance(hex: string): number {
  const rgb = parseInt(hex.slice(1), 16);
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = (rgb >> 0) & 0xff;

  // Convert to relative luminance
  const [rs, gs, bs] = [r, g, b].map(c => {
    const val = c / 255;
    return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

// Determine if we should use light or dark text
function getContrastColor(hex: string): string {
  const luminance = getLuminance(hex);
  return luminance > 0.5 ? "#000000" : "#ffffff";
}

// Apply theme immediately from localStorage to prevent flickering
function getInitialTheme(): ThemeColors {
  const saved = localStorage.getItem("theme");
  if (saved) {
    try {
      const theme = JSON.parse(saved);
      // Apply immediately to prevent flickering
      applyThemeToDOM(theme);
      return theme;
    } catch {
      return DEFAULT_THEME;
    }
  }
  return DEFAULT_THEME;
}

// Helper function to apply theme to DOM
function applyThemeToDOM(theme: ThemeColors) {
  document.documentElement.style.setProperty("--color-primary", theme.primary);
  document.documentElement.style.setProperty("--color-background", theme.background);

  // Calculate and set contrast colors
  const primaryContrast = getContrastColor(theme.primary);
  const backgroundContrast = getContrastColor(theme.background);
  document.documentElement.style.setProperty("--color-primary-contrast", primaryContrast);
  document.documentElement.style.setProperty("--color-background-contrast", backgroundContrast);

  // Calculate lighter/darker variants
  const primaryRgb = parseInt(theme.primary.slice(1), 16);
  const r = (primaryRgb >> 16) & 0xff;
  const g = (primaryRgb >> 8) & 0xff;
  const b = (primaryRgb >> 0) & 0xff;

  // Primary with opacity variants
  document.documentElement.style.setProperty("--color-primary-rgb", `${r}, ${g}, ${b}`);

  // Calculate card background (slightly lighter/darker than main background)
  const bgLuminance = getLuminance(theme.background);
  const bgRgb = parseInt(theme.background.slice(1), 16);
  const bgR = (bgRgb >> 16) & 0xff;
  const bgG = (bgRgb >> 8) & 0xff;
  const bgB = (bgRgb >> 0) & 0xff;

  // If background is dark, make cards slightly lighter; if light, make cards slightly darker
  const adjustment = bgLuminance > 0.5 ? -20 : 20;
  const cardR = Math.max(0, Math.min(255, bgR + adjustment));
  const cardG = Math.max(0, Math.min(255, bgG + adjustment));
  const cardB = Math.max(0, Math.min(255, bgB + adjustment));

  const cardBg = `#${cardR.toString(16).padStart(2, '0')}${cardG.toString(16).padStart(2, '0')}${cardB.toString(16).padStart(2, '0')}`;
  document.documentElement.style.setProperty("--color-card-background", cardBg);
}

export function useTheme() {
  const [theme, setTheme] = useState<ThemeColors>(getInitialTheme);

  useEffect(() => {
    // Apply theme to DOM
    applyThemeToDOM(theme);

    // Save to localStorage
    localStorage.setItem("theme", JSON.stringify(theme));
  }, [theme]);

  const updateTheme = (colors: ThemeColors) => {
    setTheme(colors);
  };

  const resetTheme = () => {
    setTheme(DEFAULT_THEME);
  };

  return {
    theme,
    updateTheme,
    resetTheme,
  };
}

