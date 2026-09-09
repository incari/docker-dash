import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, X, Trash2, Loader2 } from "lucide-react";
import { ChatMessage, type Message } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { ModelStatus } from "./ModelStatus";
import { ModelSelector } from "./ModelSelector";
import { SuggestedQueries } from "./SuggestedQueries";
import { useAIModel } from "./useAIModel";
import { chatIntegration } from "../../services/ai/integration/chatIntegration";
import { useDashboardSWR } from "../../hooks/useSWRData";
import type { AvailableModel } from "../../services/ai/availableModels";

/**
 * Floating AI Chat Interface
 * Features:
 * - Floating button in bottom-right corner
 * - Expandable chat panel (400px x 600px)
 * - Message history with auto-scroll
 * - Typing indicator
 * - Clear chat functionality
 * - AI model integration with transformer.js
 * - Docker context awareness
 */
export const AIChat: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [hasShownWelcome, setHasShownWelcome] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // AI Model hook
  const { modelStatus, isInitializing, initializeModel, switchModel, selectedModel, isModelLoaded } =
    useAIModel();

  // Dashboard data for context
  const { shortcuts, containers } = useDashboardSWR();

  // Update chat integration context when containers/shortcuts change
  useEffect(() => {
    if (containers && shortcuts) {
      chatIntegration.updateContext(containers, shortcuts);
    }
  }, [containers, shortcuts]);

  // Show welcome message when model is loaded and chat is opened
  useEffect(() => {
    if (isOpen && isModelLoaded && !hasShownWelcome && messages.length === 0) {
      const welcomeMessage: Message = {
        id: Date.now().toString(),
        role: "assistant",
        content: `👋 Hello! I'm your Docker Dashboard AI assistant. I can help you manage your containers and shortcuts.`,
        timestamp: new Date(),
      };
      setMessages([welcomeMessage]);
      setHasShownWelcome(true);
    }
  }, [isOpen, isModelLoaded, hasShownWelcome, messages.length]);

  // Auto-scroll to latest message
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  // Handle sending a message
  const handleSendMessage = async (content: string) => {
    // Check if model is loaded
    if (!isModelLoaded) {
      const errorMessage: Message = {
        id: Date.now().toString(),
        role: "assistant",
        content:
          "⚠️ AI model is not loaded yet. Please initialize the model first by clicking the 'Download & Initialize Model' button above.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
      return;
    }

    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);

    // Show typing indicator
    setIsTyping(true);

    try {
      // Process message through chat integration
      const response = await chatIntegration.processMessage(content);

      // Format response message
      const formattedContent = chatIntegration.formatResponse(response);

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: formattedContent,
        timestamp: new Date(),
        confirmationRequest: response.confirmationRequest,
      };

      setMessages((prev) => [...prev, aiMessage]);
    } catch (error) {
      console.error("Error processing message:", error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content:
          "❌ I encountered an error processing your request. Please try again.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  // Handle confirmation
  const handleConfirm = async (requestId: string) => {
    setIsTyping(true);

    try {
      const response = await chatIntegration.confirmPendingAction();
      const formattedContent = chatIntegration.formatResponse(response);

      const aiMessage: Message = {
        id: Date.now().toString(),
        role: "assistant",
        content: formattedContent,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, aiMessage]);
    } catch (error) {
      console.error("Error confirming action:", error);
      const errorMessage: Message = {
        id: Date.now().toString(),
        role: "assistant",
        content: "❌ Failed to execute the confirmed action.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  // Handle cancellation
  const handleCancel = (requestId: string) => {
    chatIntegration.cancelPendingAction();

    const cancelMessage: Message = {
      id: Date.now().toString(),
      role: "assistant",
      content: "Action cancelled.",
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, cancelMessage]);
  };

  // Clear all messages
  const handleClearChat = () => {
    setMessages([]);
    chatIntegration.cancelPendingAction();
  };

  // Toggle chat panel
  const toggleChat = () => {
    setIsOpen(!isOpen);
  };

  return (
    <>
      {/* Floating Chat Button */}
      <motion.button
        onClick={toggleChat}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-gradient-to-br from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white rounded-full shadow-2xl shadow-blue-500/50 flex items-center justify-center transition-all duration-300"
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        aria-label="Toggle AI Chat"
      >
        <AnimatePresence mode="wait">
          {isOpen ? (
            <motion.div
              key="close"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <X className="w-6 h-6" />
            </motion.div>
          ) : (
            <motion.div
              key="open"
              initial={{ rotate: 90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: -90, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <MessageSquare className="w-6 h-6" />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>

      {/* Chat Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={chatContainerRef}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-24 right-6 z-40 w-[400px] h-[600px] bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl shadow-2xl border border-slate-700/50 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-700/50 bg-slate-800/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                  <MessageSquare className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-white font-semibold">AI Assistant</h3>
                    {isModelLoaded && (
                      <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full border border-green-500/30">
                        Ready
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">
                    {isModelLoaded
                      ? "Ask me about Docker"
                      : "Model not loaded"}
                  </p>
                </div>
              </div>
              <button
                onClick={handleClearChat}
                disabled={messages.length === 0}
                className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Clear chat"
                title="Clear chat"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>

            {/* Messages Container */}
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
              {/* Model Selector - Always show */}
              <div className="mb-4">
                <ModelSelector
                  selectedModelId={selectedModel.id}
                  onModelSelect={(model: AvailableModel) => {
                    if (!isModelLoaded) {
                      // If no model loaded, initialize with selected model
                      initializeModel(model);
                    } else {
                      // If model already loaded, switch to new model
                      switchModel(model);
                    }
                  }}
                  isLoading={isInitializing}
                  disabled={isInitializing}
                />
              </div>

              {/* Model Status - Show if not loaded */}
              {!isModelLoaded && (
                <div className="mb-4">
                  <ModelStatus
                    status={modelStatus}
                    onInitialize={initializeModel}
                    isInitializing={isInitializing}
                  />
                </div>
              )}

              {messages.length === 0 ? (
                <div className="h-full flex items-center justify-center text-center">
                  <div className="text-slate-500 w-full px-4">
                    <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p className="text-sm mb-6">
                      {isModelLoaded
                        ? "Start a conversation with the AI assistant"
                        : "Initialize the AI model to start chatting"}
                    </p>
                    {isModelLoaded && (
                      <SuggestedQueries onQueryClick={handleSendMessage} />
                    )}
                  </div>
                </div>
              ) : (
                <>
                  {messages.map((message) => (
                    <ChatMessage
                      key={message.id}
                      message={message}
                      onConfirm={handleConfirm}
                      onCancel={handleCancel}
                    />
                  ))}
                </>
              )}

              {/* Typing Indicator */}
              {isTyping && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex gap-3 mb-4"
                >
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center">
                    <Loader2 className="w-4 h-4 animate-spin" />
                  </div>
                  <div className="bg-slate-700/50 text-slate-400 px-4 py-2 rounded-2xl border border-slate-600/50">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" />
                      <span
                        className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"
                        style={{ animationDelay: "0.1s" }}
                      />
                      <span
                        className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"
                        style={{ animationDelay: "0.2s" }}
                      />
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Auto-scroll anchor */}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <ChatInput onSendMessage={handleSendMessage} disabled={isTyping} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

