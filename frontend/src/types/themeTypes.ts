export interface ThemeColors {
  primary: string;
  background: string;
}

export interface Theme {
  name: string;
  colors: ThemeColors;
}

export const PRESET_THEMES: Theme[] = [
  {
    name: "Blue Ocean",
    colors: {
      primary: "#3b82f6", // blue-500
      background: "#0f172a", // slate-950
    },
  },
  {
    name: "Purple Dream",
    colors: {
      primary: "#a855f7", // purple-500
      background: "#1e1b4b", // indigo-950
    },
  },
  {
    name: "Emerald Forest",
    colors: {
      primary: "#10b981", // emerald-500
      background: "#022c22", // emerald-950
    },
  },
  {
    name: "Rose Garden",
    colors: {
      primary: "#f43f5e", // rose-500
      background: "#4c0519", // rose-950
    },
  },
  {
    name: "Amber Sunset",
    colors: {
      primary: "#f59e0b", // amber-500
      background: "#451a03", // amber-950
    },
  },
  {
    name: "Cyan Wave",
    colors: {
      primary: "#06b6d4", // cyan-500
      background: "#083344", // cyan-950
    },
  },
  {
    name: "Violet Night",
    colors: {
      primary: "#8b5cf6", // violet-500
      background: "#2e1065", // violet-950
    },
  },
  {
    name: "Teal Ocean",
    colors: {
      primary: "#14b8a6", // teal-500
      background: "#042f2e", // teal-950
    },
  },
  {
    name: "Light Mode",
    colors: {
      primary: "#1e293b", // slate-800 (dark accent)
      background: "#ffffff", // white
    },
  },
  {
    name: "Dark Mode",
    colors: {
      primary: "#e0e7ff", // indigo-100 (light accent)
      background: "#000000", // black
    },
  },
];

