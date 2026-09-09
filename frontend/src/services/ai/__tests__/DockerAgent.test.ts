/**
 * Docker Agent Tests
 * Comprehensive tests for the AI agent system
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DockerAgent } from '../agent/DockerAgent';
import { buildDashboardContext } from '../context/contextBuilder';
import { validateAction, isBlockedOperation, requiresConfirmation } from '../safety/guardrails';
import { parseFunctionCalls, validateFunctionCall } from '../parsers/functionCallParser';
import { getToolByName } from '../tools/dockerTools';
import { SafetyLevel } from '../types';
import type { DockerContainer, Shortcut } from '../../../types';

describe('DockerAgent', () => {
  let agent: DockerAgent;
  let mockContainers: DockerContainer[];
  let mockShortcuts: Shortcut[];

  beforeEach(() => {
    agent = new DockerAgent();
    
    mockContainers = [
      {
        id: 'container1',
        name: 'nginx',
        state: 'running',
        status: 'Up 2 hours',
        image: 'nginx:latest',
        ports: [],
        composeProject: null,
        composeService: null,
      },
      {
        id: 'container2',
        name: 'postgres',
        state: 'stopped',
        status: 'Exited (0) 1 hour ago',
        image: 'postgres:14',
        ports: [],
        composeProject: null,
        composeService: null,
      },
    ];

    mockShortcuts = [
      {
        id: 1,
        display_name: 'Web Server',
        description: 'Nginx web server',
        url: 'http://localhost:8080',
        port: 8080,
        icon: 'Server',
        icon_type: 'lucide',
        container_id: 'container1',
        container_name: 'nginx',
        container_match_name: 'nginx',
        position: 0,
        is_favorite: true,
        section_id: null,
        compose_project: null,
      },
    ];

    const context = buildDashboardContext(mockContainers, mockShortcuts);
    agent.setContext(context);
  });

  describe('Safety Guardrails', () => {
    it('should block dangerous operations', () => {
      const dangerousActions = [
        'delete all containers',
        'remove everything',
        'drop database',
        'rm -rf /',
      ];

      dangerousActions.forEach(action => {
        expect(isBlockedOperation(action)).toBe(true);
        const validation = validateAction(action);
        expect(validation.allowed).toBe(false);
        expect(validation.safetyLevel).toBe(SafetyLevel.BLOCKED);
      });
    });

    it('should require confirmation for container control', () => {
      const confirmationActions = [
        'start container',
        'stop nginx',
        'restart postgres',
        'open url',
      ];

      confirmationActions.forEach(action => {
        expect(requiresConfirmation(action)).toBe(true);
        const validation = validateAction(action);
        expect(validation.requiresConfirmation).toBe(true);
      });
    });

    it('should allow safe operations', () => {
      const safeActions = [
        'list containers',
        'show shortcuts',
        'find nginx',
      ];

      safeActions.forEach(action => {
        const validation = validateAction(action);
        expect(validation.allowed).toBe(true);
        expect(validation.safetyLevel).toBe(SafetyLevel.SAFE);
      });
    });
  });

  describe('Function Call Parser', () => {
    it('should parse function calls correctly', () => {
      const output = `I'll list your containers.
      
FUNCTION_CALL: listAllContainers
PARAMETERS: {}`;

      const calls = parseFunctionCalls(output);
      
      expect(calls).toHaveLength(1);
      expect(calls[0].functionName).toBe('listAllContainers');
      expect(calls[0].parameters).toEqual({});
    });

    it('should parse function calls with parameters', () => {
      const output = `FUNCTION_CALL: findContainersByName
PARAMETERS: {"name": "nginx"}`;

      const calls = parseFunctionCalls(output);
      
      expect(calls).toHaveLength(1);
      expect(calls[0].functionName).toBe('findContainersByName');
      expect(calls[0].parameters).toEqual({ name: 'nginx' });
    });

    it('should validate function calls', () => {
      const validCall = {
        functionName: 'findContainersByName',
        parameters: { name: 'nginx' },
      };

      const validation = validateFunctionCall(validCall);
      expect(validation.valid).toBe(true);
    });

    it('should reject invalid function calls', () => {
      const invalidCall = {
        functionName: 'findContainersByName',
        parameters: {}, // missing required 'name' parameter
      };

      const validation = validateFunctionCall(invalidCall);
      expect(validation.valid).toBe(false);
    });
  });

  describe('Docker Tools', () => {
    it('should have all required tools', () => {
      const requiredTools = [
        'findContainersByName',
        'getContainerHealth',
        'listAllContainers',
        'getContainerLogs',
        'listShortcuts',
        'openContainerUrl',
        'startContainer',
        'stopContainer',
        'restartContainer',
      ];

      requiredTools.forEach(toolName => {
        const tool = getToolByName(toolName);
        expect(tool).toBeDefined();
        expect(tool?.name).toBe(toolName);
      });
    });

    it('should have correct safety levels', () => {
      const safeTool = getToolByName('listAllContainers');
      expect(safeTool?.safetyLevel).toBe(SafetyLevel.SAFE);

      const confirmationTool = getToolByName('startContainer');
      expect(confirmationTool?.safetyLevel).toBe(SafetyLevel.REQUIRES_CONFIRMATION);
    });
  });

  describe('Context Builder', () => {
    it('should build context correctly', () => {
      const context = buildDashboardContext(mockContainers, mockShortcuts);

      expect(context.containers).toHaveLength(2);
      expect(context.shortcuts).toHaveLength(1);
      expect(context.runningContainers).toBe(1);
      expect(context.stoppedContainers).toBe(1);
    });
  });
});

