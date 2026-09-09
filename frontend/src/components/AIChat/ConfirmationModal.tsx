/**
 * AI Confirmation Modal Component
 * Shows confirmation dialog for dangerous AI operations
 */

import React, { useId } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { AlertTriangle, X, Shield } from "lucide-react";
import type { ConfirmationRequest } from "../../services/ai/types";
import { useModalA11y } from "../../hooks/useModalA11y";

interface AIConfirmationModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Confirmation request details */
  confirmationRequest: ConfirmationRequest | null;
  /** Callback when user confirms */
  onConfirm: () => void;
  /** Callback when user cancels */
  onCancel: () => void;
}

/**
 * Confirmation modal for AI-initiated actions
 * Displays action details and affected resources before execution
 */
export const AIConfirmationModal: React.FC<AIConfirmationModalProps> = ({
  isOpen,
  confirmationRequest,
  onConfirm,
  onCancel,
}) => {
  const { t } = useTranslation();

  const titleId = useId();
  const dialogRef = useModalA11y<HTMLDivElement>(isOpen, onCancel);

  if (!isOpen || !confirmationRequest) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Modal */}
      <motion.div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="relative bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-8 max-w-md w-full shadow-2xl border border-blue-500/20"
      >
        {/* Close button */}
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
          aria-label={t('common.close')}
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <div className="p-3 bg-blue-500/20 rounded-2xl">
            <Shield className="w-8 h-8 text-blue-400" />
          </div>
          <div>
            <h2
              id={titleId}
              className="text-2xl font-bold text-white"
            >
              {t('ai.confirmation.title')}
            </h2>
            <p className="text-sm text-slate-400">{t('ai.title')}</p>
          </div>
        </div>

        {/* Action description */}
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-slate-400 uppercase mb-2">
            {t('ai.confirmation.action')}
          </h3>
          <p className="text-white font-medium">{confirmationRequest.action}</p>
        </div>

        {/* Description */}
        {confirmationRequest.description && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-slate-400 uppercase mb-2">
              {t('ai.confirmation.description')}
            </h3>
            <p className="text-slate-300 leading-relaxed">
              {confirmationRequest.description}
            </p>
          </div>
        )}

        {/* Affected resources */}
        {confirmationRequest.affectedResources.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-slate-400 uppercase mb-2">
              {t('ai.confirmation.affectedResources')}
            </h3>
            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
              <ul className="space-y-2">
                {confirmationRequest.affectedResources.map((resource, index) => (
                  <li
                    key={index}
                    className="flex items-center gap-2 text-slate-300"
                  >
                    <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                    <span className="text-sm">{resource}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Warning message */}
        <div className="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
          <p className="text-sm text-yellow-200">
            {t('ai.confirmation.warning')}
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 px-6 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-xl transition-all duration-200"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-3 px-6 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg shadow-blue-500/30"
          >
            {t('common.confirm')}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

