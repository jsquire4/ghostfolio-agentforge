import { Test } from '@nestjs/testing';

import { makeChatResponse } from '../../test-fixtures';
import { AgentService } from '../agent/agent.service';
import { ChatController, ChatRequestDto } from './chat.controller';

// Mock the entire agent service module to avoid TS2589 from @langchain/core/tools
jest.mock('../agent/agent.service', () => ({
  AgentService: jest.fn()
}));

describe('ChatController', () => {
  let controller: ChatController;
  let mockAgentService: { chat: jest.Mock };

  beforeEach(async () => {
    mockAgentService = {
      chat: jest.fn().mockResolvedValue(makeChatResponse({ message: 'Hello!' }))
    };

    const module = await Test.createTestingModule({
      controllers: [ChatController],
      providers: [{ provide: AgentService, useValue: mockAgentService }]
    }).compile();

    controller = module.get(ChatController);
  });

  it('forwards message, userId, and rawJwt to AgentService.chat()', async () => {
    const body: ChatRequestDto = Object.assign(new ChatRequestDto(), {
      message: 'Hi'
    });
    const user = { userId: 'user-1', rawJwt: 'jwt-token' };

    await controller.chat(body, user);

    expect(mockAgentService.chat).toHaveBeenCalledWith(
      body,
      'user-1',
      'jwt-token',
      undefined
    );
  });

  it('returns the ChatResponse from AgentService', async () => {
    const expected = makeChatResponse({ message: 'Response' });
    mockAgentService.chat.mockResolvedValue(expected);

    const body: ChatRequestDto = Object.assign(new ChatRequestDto(), {
      message: 'Hi'
    });
    const result = await controller.chat(body, { userId: 'u1', rawJwt: 'jwt' });

    expect(result).toEqual(expected);
  });

  it('passes conversationId when provided in request body', async () => {
    const body: ChatRequestDto = Object.assign(new ChatRequestDto(), {
      message: 'Hi',
      conversationId: 'conv-123'
    });
    const user = { userId: 'user-1', rawJwt: 'jwt' };

    await controller.chat(body, user);

    expect(mockAgentService.chat).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'conv-123' }),
      'user-1',
      'jwt',
      undefined
    );
  });

  it('passes X-Eval-Case-Id header as evalCaseId to AgentService', async () => {
    const body: ChatRequestDto = Object.assign(new ChatRequestDto(), {
      message: 'Hi'
    });
    const user = { userId: 'user-1', rawJwt: 'jwt' };

    await controller.chat(body, user, 'eval-case-42');

    expect(mockAgentService.chat).toHaveBeenCalledWith(
      body,
      'user-1',
      'jwt',
      'eval-case-42'
    );
  });
});
