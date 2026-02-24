// This file IS the mock module — do NOT call jest.mock() here.
// Test files call jest.mock('@langchain/langgraph') to activate it;
// Jest uses this file as the replacement implementation.
export const createReactAgent = jest.fn().mockReturnValue({
  invoke: jest.fn().mockResolvedValue({
    messages: [{ content: 'Mock agent response' }]
  })
});
export const isInterrupted = jest.fn().mockReturnValue(false);
export const INTERRUPT = '__interrupt__';
export const isGraphInterrupt = jest.fn().mockReturnValue(false);
