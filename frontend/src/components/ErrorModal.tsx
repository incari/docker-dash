import React, { useEffect } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, CheckCircle, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ErrorModalProps } from "../types";

/**
 * Error modal component for displaying error and success messages
 */
export const ErrorModal: React.FC<ErrorModalProps> = ({
  isOpen,
  title,
  message,
  onClose,
  type = "error",
}) => {
  const { t } = useTranslation();

  const isSuccess = type === "success";

  // Add ESC key handler
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className={`relative bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-8 max-w-md w-full shadow-2xl border ${
          isSuccess ? "border-green-500/20" : "border-red-500/20"
        }`}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-4 mb-6">
          <div
            className={`p-3 rounded-2xl ${
              isSuccess ? "bg-green-500/20" : "bg-red-500/20"
            }`}
          >
            {isSuccess ? (
              <CheckCircle className="w-8 h-8 text-green-400" />
            ) : (
              <AlertTriangle className="w-8 h-8 text-red-400" />
            )}
          </div>
          <h2 className="text-2xl font-bold text-white">
            {title || (isSuccess ? "Success" : t("modals.error.title"))}
          </h2>
        </div>

        <p className="text-slate-300 mb-6 leading-relaxed">{message}</p>

        <button
          onClick={onClose}
          className={`w-full py-3 px-6 bg-gradient-to-r text-white font-semibold rounded-xl transition-all duration-200 shadow-lg ${
            isSuccess
              ? "from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 shadow-green-500/30"
              : "from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 shadow-red-500/30"
          }`}
        >
          {t("modals.error.close")}
        </button>
      </motion.div>
    </div>
  );
};
