import React, { useRef } from "react";
import { useTranslation } from "react-i18next";
import { Download, Upload } from "../constants/icons";
import { dataApi } from "../services/api";

interface DataTransferProps {
  /** Receives the parsed export file; the caller confirms before applying it. */
  onImport: (payload: unknown, fileName: string) => void;
  onError: (title: string, message: string) => void;
}

const BUTTON_CLASS =
  "flex items-center gap-1.5 sm:gap-2 bg-slate-800/50 hover:bg-slate-800 border border-white/5 hover:border-blue-500/30 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg transition-all duration-300";

/**
 * Export and import of shortcuts and sections.
 *
 * Upgrading migrates the database in place - tables are rebuilt and duplicate
 * rows deleted, with no way back - so this is how a user keeps a copy of their
 * own before updating, or moves a setup between instances.
 */
export const DataTransfer: React.FC<DataTransferProps> = ({
  onImport,
  onError,
}) => {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset immediately so picking the same file twice still fires a change.
    event.target.value = "";
    if (!file) return;

    try {
      const payload = JSON.parse(await file.text());
      onImport(payload, file.name);
    } catch {
      onError(t("data.importFailed"), t("data.notJson"));
    }
  };

  return (
    <>
      <a
        href={dataApi.exportUrl}
        download
        className={BUTTON_CLASS}
        title={t("data.exportHint")}
      >
        <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-400" />
        <span className="text-slate-300 text-xs sm:text-sm hover:text-blue-400 transition-colors">
          {t("data.export")}
        </span>
      </a>

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className={BUTTON_CLASS}
        title={t("data.importHint")}
      >
        <Upload className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-400" />
        <span className="text-slate-300 text-xs sm:text-sm hover:text-blue-400 transition-colors">
          {t("data.import")}
        </span>
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        onChange={handleFile}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />
    </>
  );
};
