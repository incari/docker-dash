/**
 * AI Chat Component - Example Integration
 * Demonstrates how to integrate the AI agent system with the chat UI
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, Loader2 } from 'lucide-react';
import { ChatMessage, type Message } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { AIConfirmationModal } from './ConfirmationModal';
import { chatIntegration } from '../../services/ai';
import { exampleQueries, getBeginnerExamples } from '../../services/ai/examples';
import type { ConfirmationRequest } from '../../services/ai/types';
import type { DockerContainer, Shortcut } from '../../types';

interface AIChatProps {
  /** Whether the chat is open */
  isOpen: boolean;
  /** Callback to close the chat */
  onClose: () => void;
  /** Current containers */
  containers: DockerContainer[];
  /** Current shortcuts */
  shortcuts: Shortcut[];
}

/**
 * AI Chat Component with Agent Integration
 * Full example of how to use the AI agent system
 */
export const AIChatExample: React.FC<AIChatProps> = ({
  isOpen,
  onClose,
  containers,
  shortcuts,
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [confirmationRequest, setConfirmationRequest] = useState<ConfirmationRequest | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Update AI context when containers or shortcuts change
  useEffect(() => {
    chatIntegration.updateContext(containers, shortcuts);
  }, [containers, shortcuts]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Add welcome message on first open
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([
        {
          id: '1',
          role: 'assistant',
          content: "👋 Hi! I'm your Docker Dashboard AI assistant. I can help you manage your containers and shortcuts. Try asking me something!",
          timestamp: new Date(),
        },
      ]);
    }
  }, [isOpen]);

  /**
   * Handle user sending a message
   */
  const handleSendMessage = async (text: string) => {
    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);

    // Process with AI agent
    setIsLoading(true);
    try {
      const response = await chatIntegration.processMessage(text);

      // Check if confirmation is required
      if (response.confirmationRequest) {
        setConfirmationRequest(response.confirmationRequest);
      }

      // Add AI response
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: chatIntegration.formatResponse(response),
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error('Error processing message:', error);
      
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '❌ Sorry, I encountered an error processing your request. Please try again.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handle confirming a pending action
   */
  const handleConfirm = async () => {
    if (!confirmationRequest) return;

    setIsLoading(true);
    try {
      const response = await chatIntegration.confirmPendingAction();

      const aiMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: chatIntegration.formatResponse(response),
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error('Error confirming action:', error);
    } finally {
      setConfirmationRequest(null);
      setIsLoading(false);
    }
  };

  /**
   * Handle canceling a pending action
   */
  const handleCancel = () => {
    chatIntegration.cancelPendingAction();
    setConfirmationRequest(null);

    const cancelMessage: Message = {
      id: Date.now().toString(),
      role: 'assistant',
      content: 'Action cancelled.',
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, cancelMessage]);
  };

  /**
   * Handle clicking an example query
   */
  const handleExampleClick = (text: string) => {
    handleSendMessage(text);
  };

  if (!isOpen) return null;

  const beginnerExamples = getBeginnerExamples();

  return (
    <>
      {/* Chat Window */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className="fixed bottom-4 right-4 w-96 h-[600px] bg-slate-900 rounded-2xl shadow-2xl border border-slate-700 flex flex-col overflow-hidden z-50"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-white" />
            <h3 className="text-white font-semibold">AI Assistant</h3>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <AnimatePresence>
            {messages.map(message => (
              <ChatMessage key={message.id} message={message} />
            ))}
          </AnimatePresence>

          {/* Loading indicator */}
          {isLoading && (
            <div className="flex items-center gap-2 text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Thinking...</span>
            </div>
          )}

          {/* Example queries (show when no messages) */}
          {messages.length <= 1 && (
            <div className="space-y-2">
              <p className="text-sm text-slate-400">Try asking:</p>
              {beginnerExamples.map((example, index) => (
                <button
                  key={index}
                  onClick={() => handleExampleClick(example.text)}
                  className="w-full text-left px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm text-slate-300 transition-colors"
                >
                  {example.text}
                </button>
              ))}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <ChatInput
          onSendMessage={handleSendMessage}
          disabled={isLoading}
          placeholder="Ask me about your containers..."
        />
      </motion.div>

      {/* Confirmation Modal */}
      <AIConfirmationModal
        isOpen={!!confirmationRequest}
        confirmationRequest={confirmationRequest}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </>
  );
};

