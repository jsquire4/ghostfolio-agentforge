import { ToolCallRecord } from './tool.types';

export interface VerificationResult {
  pass: boolean;
  warnings: string[];
  flags: string[];
}

export interface Verifier {
  name: string;
  order: string;
  verify: (
    response: string,
    toolCalls: ToolCallRecord[],
    channel?: string
  ) => Promise<VerificationResult>;
}
