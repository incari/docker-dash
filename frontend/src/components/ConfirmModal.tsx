import React, { useEffect } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ConfirmModalProps } from "../types";

/**
 * Confirmation modal component for confirming destructive actions
 */
export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  type = "danger",
}) => {
  const { t } = useTranslation();

  // Determine colors and text based on type
  const isWarning = type === "warning";
  const borderColor = isWarning ? "border-blue-500/20" : "border-yellow-500/20";
  const iconBgColor = isWarning ? "bg-blue-500/20" : "bg-yellow-500/20";
  const iconColor = isWarning ? "text-blue-400" : "text-yellow-400";
  const buttonGradient = isWarning
    ? "bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 shadow-blue-500/30"
    : "bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 shadow-red-500/30";
  const confirmText = isWarning ? "Update" : t("modals.confirm.delete");

  // Add ESC key handler
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onCancel();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className={`relative bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-8 max-w-md w-full shadow-2xl border ${borderColor}`}
      >
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-4 mb-6">
          <div className={`p-3 ${iconBgColor} rounded-2xl`}>
            <AlertTriangle className={`w-8 h-8 ${iconColor}`} />
          </div>
          <h2 className="text-2xl font-bold text-white">{title}</h2>
        </div>

        <p className="text-slate-300 mb-8 leading-relaxed">{message}</p>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 px-6 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-xl transition-all duration-200"
          >
            {t("modals.confirm.cancel")}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 py-3 px-6 ${buttonGradient} text-white font-semibold rounded-xl transition-all duration-200 shadow-lg`}
          >
            {confirmText}
          </button>
        </div>
      </motion.div>
    </div>
  );
};
