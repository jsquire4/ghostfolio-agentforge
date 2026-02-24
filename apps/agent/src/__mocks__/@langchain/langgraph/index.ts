// Directory mock for @langchain/langgraph — takes precedence over flat file.
// Test files call jest.mock('@langchain/langgraph') to activate it;
// Jest uses this file as the replacement implementation.

export const isInterrupted = jest.fn().mockReturnValue(false);
export const INTERRUPT = '__interrupt__';
export const isGraphInterrupt = jest.fn().mockReturnValue(false);

export class Command {
  public resume: unknown;
  constructor(opts: { resume: unknown }) {
    this.resume = opts.resume;
  }
}
