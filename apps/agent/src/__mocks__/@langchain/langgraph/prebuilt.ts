export const createReactAgent = jest.fn().mockReturnValue({
  invoke: jest.fn().mockResolvedValue({
    messages: [{ content: 'Mock agent response' }]
  })
});
