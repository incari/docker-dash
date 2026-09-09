import React from "react";
import { motion } from "framer-motion";
import { User, Sparkles, CheckCircle, XCircle } from "lucide-react";
import type { ConfirmationRequest } from "../../services/ai/types";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  confirmationRequest?: ConfirmationRequest;
}

interface ChatMessageProps {
  message: Message;
  onConfirm?: (requestId: string) => void;
  onCancel?: (requestId: string) => void;
}

/**
 * Individual chat message component
 * Displays user messages in blue and AI responses in gray
 * Supports confirmation requests for dangerous actions
 */
export const ChatMessage: React.FC<ChatMessageProps> = ({
  message,
  onConfirm,
  onCancel,
}) => {
  const isUser = message.role === "user";
  const hasConfirmation = message.confirmationRequest !== undefined;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex gap-3 mb-4 ${isUser ? "flex-row-reverse" : "flex-row"}`}
    >
      {/* Avatar */}
      <div
        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
          isUser
            ? "bg-blue-500/20 text-blue-400"
            : "bg-purple-500/20 text-purple-400"
        }`}
      >
        {isUser ? (
          <User className="w-4 h-4" />
        ) : (
          <Sparkles className="w-4 h-4" />
        )}
      </div>

      {/* Message bubble */}
      <div
        className={`flex-1 max-w-[80%] ${isUser ? "text-right" : "text-left"}`}
      >
        <div
          className={`inline-block px-4 py-2 rounded-2xl ${
            isUser
              ? "bg-blue-500/20 text-blue-100 border border-blue-500/30"
              : "bg-slate-700/50 text-slate-200 border border-slate-600/50"
          }`}
        >
          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
            {message.content}
          </p>

          {/* Confirmation Request UI */}
          {hasConfirmation && message.confirmationRequest && (
            <div className="mt-3 pt-3 border-t border-slate-600/50">
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 mb-3">
                <p className="text-xs font-semibold text-yellow-400 mb-1">
                  ⚠️ Confirmation Required
                </p>
                <p className="text-xs text-slate-300 mb-2">
                  {message.confirmationRequest.description}
                </p>
                {message.confirmationRequest.affectedResources.length > 0 && (
                  <div className="text-xs text-slate-400">
                    <span className="font-medium">Affected: </span>
                    {message.confirmationRequest.affectedResources.join(", ")}
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() =>
                    onConfirm?.(message.confirmationRequest!.id)
                  }
                  className="flex-1 flex items-center justify-center gap-2 py-2 px-3 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg transition-colors text-xs font-medium"
                >
                  <CheckCircle className="w-3 h-3" />
                  Confirm
                </button>
                <button
                  onClick={() => onCancel?.(message.confirmationRequest!.id)}
                  className="flex-1 flex items-center justify-center gap-2 py-2 px-3 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors text-xs font-medium"
                >
                  <XCircle className="w-3 h-3" />
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="mt-1 px-2">
          <span className="text-xs text-slate-500">
            {message.timestamp.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
      </div>
    </motion.div>
  );
};

