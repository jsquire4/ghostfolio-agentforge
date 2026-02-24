import { ToolCallRecord } from './tool.types';

export interface VerificationResult {
  pass: boolean;
  warnings: string[];
  flags: string[];
}

export interface Verifier {
  name: string;
  order: number;
  verify: (
    response: string,
    toolCalls: ToolCallRecord[]
  ) => Promise<VerificationResult>;
}
