import React from "react";
import { motion } from "framer-motion";
import { Download, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import type { ModelStatus as ModelStatusType } from "../../services/ai/types";

interface ModelStatusProps {
  status: ModelStatusType;
  onInitialize: () => void;
  isInitializing: boolean;
}

/**
 * Model Status Component
 * Displays model download/loading progress and initialization button
 */
export const ModelStatus: React.FC<ModelStatusProps> = ({
  status,
  onInitialize,
  isInitializing,
}) => {
  const getStatusIcon = () => {
    switch (status.status) {
      case "ready":
        return <CheckCircle className="w-5 h-5 text-green-400" />;
      case "error":
        return <AlertCircle className="w-5 h-5 text-red-400" />;
      case "downloading":
      case "loading":
        return <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />;
      default:
        return <Download className="w-5 h-5 text-slate-400" />;
    }
  };

  const getStatusText = () => {
    switch (status.status) {
      case "ready":
        return "Model ready";
      case "downloading":
        return "Downloading model...";
      case "loading":
        return "Loading model...";
      case "error":
        return status.error || "Error loading model";
      default:
        return "Model not loaded";
    }
  };

  const getStatusColor = () => {
    switch (status.status) {
      case "ready":
        return "text-green-400";
      case "error":
        return "text-red-400";
      case "downloading":
      case "loading":
        return "text-blue-400";
      default:
        return "text-slate-400";
    }
  };

  // If model is ready, show compact status
  if (status.loaded) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-green-500/10 border border-green-500/20 rounded-lg">
        <CheckCircle className="w-4 h-4 text-green-400" />
        <span className="text-xs text-green-400">AI Ready</span>
      </div>
    );
  }

  // If loading/downloading, show progress
  if (status.status === "downloading" || status.status === "loading") {
    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl"
      >
        <div className="flex items-center gap-3 mb-2">
          <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
          <div className="flex-1">
            <p className="text-sm font-medium text-blue-400">
              {getStatusText()}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {status.status === "downloading"
                ? "Downloading AI model to your browser..."
                : "Initializing AI model..."}
            </p>
          </div>
        </div>
        {/* Progress bar */}
        <div className="w-full bg-slate-700/50 rounded-full h-2 overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
            initial={{ width: 0 }}
            animate={{ width: `${status.progress}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
        <p className="text-xs text-slate-500 mt-2 text-right">
          {Math.round(status.progress)}%
        </p>
      </motion.div>
    );
  }

  // If error, show error message with retry button
  if (status.status === "error") {
    return (
      <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
        <div className="flex items-center gap-3 mb-3">
          <AlertCircle className="w-5 h-5 text-red-400" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-400">
              Failed to load model
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {status.error || "Unknown error occurred"}
            </p>
          </div>
        </div>
        <button
          onClick={onInitialize}
          disabled={isInitializing}
          className="w-full py-2 px-4 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors text-sm font-medium"
        >
          Retry
        </button>
      </div>
    );
  }

  // Default: Show download button
  return (
    <div className="p-4 bg-slate-700/30 border border-slate-600/50 rounded-xl">
      <div className="flex items-center gap-3 mb-3">
        <Download className="w-5 h-5 text-slate-400" />
        <div className="flex-1">
          <p className="text-sm font-medium text-slate-300">
            AI Model Not Loaded
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Download the AI model to start chatting (~100MB)
          </p>
        </div>
      </div>
      <button
        onClick={onInitialize}
        disabled={isInitializing}
        className="w-full py-2 px-4 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 disabled:from-slate-700 disabled:to-slate-700 text-white rounded-lg transition-all duration-200 shadow-lg shadow-blue-500/30 disabled:shadow-none text-sm font-medium"
      >
        {isInitializing ? "Initializing..." : "Download & Initialize Model"}
      </button>
    </div>
  );
};

