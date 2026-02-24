import { z } from 'zod';

import { GhostfolioAuth, UserAuth, ServiceAuth } from './auth.types';
import { IGhostfolioClient } from './client.types';

export type ToolCategory = 'read' | 'write' | 'analysis';

interface BaseToolContext {
  userId: string;
  abortSignal: AbortSignal;
  auth: GhostfolioAuth;
}

export interface UserToolContext extends BaseToolContext {
  auth: UserAuth;
}

export interface ServiceToolContext extends BaseToolContext {
  auth: ServiceAuth;
}

export type ToolContext = UserToolContext | ServiceToolContext;

export interface ToolDefinition {
  name: string;
  description: string;
  schema: z.ZodTypeAny;
  category: ToolCategory;
  requiresConfirmation: boolean;
  timeout: number;
  tags?: string[];
  version?: string;
  dependsOn?: string[];
  execute: (params: unknown, context: ToolContext) => Promise<string>;
}

export interface ToolDeps {
  client: IGhostfolioClient;
}

export interface ToolCallRecord {
  toolName: string;
  params: unknown;
  result: string;
  calledAt: string;
  durationMs: number;
  success: boolean;
}
