/**
 * AI Chat Component - i18n Integration Example
 * Demonstrates how to use translation keys in the AI chat interface
 */

import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
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
  isOpen: boolean;
  onClose: () => void;
  containers: DockerContainer[];
  shortcuts: Shortcut[];
}

/**
 * AI Chat Component with i18n Support
 * All text is translated using react-i18next
 */
export const AIChatI18nExample: React.FC<AIChatProps> = ({
  isOpen,
  onClose,
  containers,
  shortcuts,
}) => {
  const { t } = useTranslation();
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
          content: t('ai.chat.welcomeMessage'),
          timestamp: new Date(),
        },
      ]);
    }
  }, [isOpen, t]);

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
        content: t('ai.chat.errorProcessing'),
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
      content: t('ai.chat.actionCancelled'),
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
        {/* Header - Using i18n */}
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-white" />
            <h3 className="text-white font-semibold">{t('ai.chat.title')}</h3>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white transition-colors"
            aria-label={t('ai.chat.close')}
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

          {/* Loading indicator - Using i18n */}
          {isLoading && (
            <div className="flex items-center gap-2 text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">{t('ai.chat.thinking')}</span>
            </div>
          )}

          {/* Example queries - Using i18n */}
          {messages.length <= 1 && (
            <div className="space-y-2">
              <p className="text-sm text-slate-400">{t('ai.chat.tryAsking')}</p>
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

        {/* Input - Using i18n */}
        <ChatInput
          onSendMessage={handleSendMessage}
          disabled={isLoading}
          placeholder={t('ai.chat.placeholder')}
        />
      </motion.div>

      {/* Confirmation Modal - Using i18n */}
      <AIConfirmationModal
        isOpen={!!confirmationRequest}
        confirmationRequest={confirmationRequest}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </>
  );
};

