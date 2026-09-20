/**
 * Example Usage of AI Service
 * This file demonstrates how to use the AI service in your application
 * DO NOT import this file in production code - it's for reference only
 */

import AIService from './AIService';

/**
 * Example 1: Basic initialization and usage
 */
export async function basicExample() {
  try {
    // Initialize the model with progress tracking
    await AIService.initializeModel({
      onProgress: (progress) => {
        console.log(`Loading model: ${progress.progress}%`);
        console.log(`Status: ${progress.status}`);
      }
    });

    // Generate a response
    const response = await AIService.generateResponse(
      'What is Docker and how does it work?'
    );

    if (response.success) {
      console.log('AI Response:', response.text);
      console.log('Generation time:', response.metadata?.generationTime, 'ms');
    } else {
      console.error('Error:', response.error);
    }
  } catch (error) {
    console.error('Failed to initialize model:', error);
  }
}

/**
 * Example 2: Custom configuration with WebGPU
 */
export async function webGPUExample() {
  try {
    await AIService.initializeModel({
      device: 'webgpu', // Use WebGPU for faster inference
      temperature: 0.5,
      maxTokens: 256,
      onProgress: (progress) => {
        console.log(`${progress.status}: ${progress.progress}%`);
      }
    });

    const response = await AIService.generateResponse(
      'List the running Docker containers',
      {
        maxTokens: 128,
        temperature: 0.3,
      }
    );

    console.log(response.text);
  } catch (error) {
    console.error('Error:', error);
  }
}

/**
 * Example 3: Conversation with system message
 */
export async function conversationExample() {
  // Add a system message to set context
  AIService.addSystemMessage(
    'You are a helpful Docker assistant. Provide concise, accurate answers about Docker containers and management.'
  );

  // Generate responses
  const response1 = await AIService.generateResponse(
    'How do I start a container?'
  );
  console.log('Response 1:', response1.text);

  const response2 = await AIService.generateResponse(
    'What about stopping it?'
  );
  console.log('Response 2:', response2.text);

  // View conversation history
  const history = AIService.getConversationHistory();
  console.log('Conversation history:', history);

  // Clear history when done
  AIService.clearConversationHistory();
}

/**
 * Example 4: Check model status before using
 */
export async function statusCheckExample() {
  // Check if model is already loaded
  if (!AIService.isModelLoaded()) {
    console.log('Model not loaded, initializing...');
    await AIService.initializeModel();
  }

  // Get detailed status
  const status = AIService.getModelStatus();
  console.log('Model Status:', {
    loaded: status.loaded,
    progress: status.progress,
    status: status.status,
  });

  // Use the model
  if (status.loaded) {
    const response = await AIService.generateResponse('Hello!');
    console.log(response.text);
  }
}

/**
 * Example 5: React component integration (pseudo-code)
 */
export function ReactComponentExample() {
  /*
  import { useState, useEffect } from 'react';
  import AIService from '@/services/ai/AIService';

  function AIChat() {
    const [loading, setLoading] = useState(true);
    const [progress, setProgress] = useState(0);
    const [response, setResponse] = useState('');

    useEffect(() => {
      // Initialize model on component mount
      AIService.initializeModel({
        onProgress: (prog) => {
          setProgress(prog.progress);
          if (prog.status === 'ready') {
            setLoading(false);
          }
        }
      });
    }, []);

    const handleSubmit = async (prompt: string) => {
      const result = await AIService.generateResponse(prompt);
      if (result.success) {
        setResponse(result.text);
      }
    };

    if (loading) {
      return <div>Loading model: {progress}%</div>;
    }

    return (
      <div>
        <button onClick={() => handleSubmit('Hello')}>
          Ask AI
        </button>
        <div>{response}</div>
      </div>
    );
  }
  */
}

