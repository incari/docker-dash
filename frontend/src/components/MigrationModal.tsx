import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { RefreshCw, X, CheckSquare, Square } from "lucide-react";

interface MigrationModalProps {
  isOpen: boolean;
  shortcuts: Array<{
    id: number;
    name: string;
    description: string;
    icon: string;
  }>;
  onConfirm: (selectedIcons: number[], selectedDescriptions: number[]) => void;
  onCancel: () => void;
}

/**
 * Migration modal component with separate checkbox selection for icons and descriptions
 */
export const MigrationModal: React.FC<MigrationModalProps> = ({
  isOpen,
  shortcuts,
  onConfirm,
  onCancel,
}) => {
  const [selectedIcons, setSelectedIcons] = useState<Set<number>>(new Set());
  const [selectedDescriptions, setSelectedDescriptions] = useState<Set<number>>(
    new Set(),
  );

  // Initialize with all shortcuts selected for both icons and descriptions
  useEffect(() => {
    if (isOpen) {
      const allIds = new Set(shortcuts.map((s) => s.id));
      setSelectedIcons(allIds);
      setSelectedDescriptions(allIds);
    }
  }, [isOpen, shortcuts]);

  const toggleIcon = (id: number) => {
    setSelectedIcons((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const toggleDescription = (id: number) => {
    setSelectedDescriptions((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const toggleAllIcons = () => {
    if (selectedIcons.size === shortcuts.length) {
      setSelectedIcons(new Set());
    } else {
      setSelectedIcons(new Set(shortcuts.map((s) => s.id)));
    }
  };

  const toggleAllDescriptions = () => {
    if (selectedDescriptions.size === shortcuts.length) {
      setSelectedDescriptions(new Set());
    } else {
      setSelectedDescriptions(new Set(shortcuts.map((s) => s.id)));
    }
  };

  const handleConfirm = () => {
    onConfirm(Array.from(selectedIcons), Array.from(selectedDescriptions));
  };

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

  const allIconsSelected = selectedIcons.size === shortcuts.length;
  const allDescriptionsSelected =
    selectedDescriptions.size === shortcuts.length;
  const noneSelected =
    selectedIcons.size === 0 && selectedDescriptions.size === 0;

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
        className="relative bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-8 max-w-3xl w-full shadow-2xl border border-blue-500/20"
      >
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-4 mb-6">
          <div className="p-3 bg-blue-500/20 rounded-2xl">
            <RefreshCw className="w-8 h-8 text-blue-400" />
          </div>
          <h2 className="text-2xl font-bold text-white">
            Update Container Icons & Descriptions
          </h2>
        </div>

        <p className="text-slate-300 mb-6 leading-relaxed">
          Select which icons and descriptions you want to update from the
          docker-icon-vault. You can choose to update icons, descriptions, or
          both for each shortcut.
        </p>

        {/* Table */}
        <div className="mb-6 max-h-96 overflow-y-auto rounded-xl border border-slate-700">
          <table className="w-full">
            <thead className="bg-slate-800/50 sticky top-0">
              <tr>
                <th className="p-3 text-left text-sm font-semibold text-slate-300">
                  Name
                </th>
                <th className="p-3 text-center">
                  <button
                    onClick={toggleAllIcons}
                    className="flex flex-col items-center gap-1 text-slate-300 hover:text-white transition-colors mx-auto"
                  >
                    {allIconsSelected ? (
                      <CheckSquare className="w-5 h-5 text-blue-400" />
                    ) : (
                      <Square className="w-5 h-5" />
                    )}
                    <span className="text-xs font-semibold">Icon</span>
                  </button>
                </th>
                <th className="p-3 text-center">
                  <button
                    onClick={toggleAllDescriptions}
                    className="flex flex-col items-center gap-1 text-slate-300 hover:text-white transition-colors mx-auto"
                  >
                    {allDescriptionsSelected ? (
                      <CheckSquare className="w-5 h-5 text-blue-400" />
                    ) : (
                      <Square className="w-5 h-5" />
                    )}
                    <span className="text-xs font-semibold">Description</span>
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {shortcuts.map((shortcut) => (
                <tr
                  key={shortcut.id}
                  className="border-t border-slate-700 hover:bg-slate-800/30 transition-colors"
                >
                  <td className="p-3 text-slate-200">{shortcut.name}</td>
                  <td className="p-3 text-center">
                    <button
                      onClick={() => toggleIcon(shortcut.id)}
                      className="mx-auto block"
                    >
                      {selectedIcons.has(shortcut.id) ? (
                        <CheckSquare className="w-5 h-5 text-blue-400" />
                      ) : (
                        <Square className="w-5 h-5 text-slate-500" />
                      )}
                    </button>
                  </td>
                  <td className="p-3 text-center">
                    <button
                      onClick={() => toggleDescription(shortcut.id)}
                      className="mx-auto block"
                    >
                      {selectedDescriptions.has(shortcut.id) ? (
                        <CheckSquare className="w-5 h-5 text-blue-400" />
                      ) : (
                        <Square className="w-5 h-5 text-slate-500" />
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between mb-6">
          <p className="text-sm text-slate-400">
            Icons: {selectedIcons.size} / {shortcuts.length} • Descriptions:{" "}
            {selectedDescriptions.size} / {shortcuts.length}
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 px-6 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-xl transition-all duration-200"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={noneSelected}
            className={`flex-1 py-3 px-6 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg ${
              noneSelected
                ? "bg-slate-600 cursor-not-allowed opacity-50"
                : "bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 shadow-blue-500/30"
            }`}
          >
            Update Selected
          </button>
        </div>
      </motion.div>
    </div>
  );
};
