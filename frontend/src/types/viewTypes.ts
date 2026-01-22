export type ViewMode = "default" | "compact" | "icon" | "list";
export type MobileColumns = 1 | 2;

export interface ViewSettings {
  mode: ViewMode;
  mobileColumns: MobileColumns;
}

