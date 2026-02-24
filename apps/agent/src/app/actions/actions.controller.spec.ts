import { Test } from '@nestjs/testing';

import { makeChatResponse } from '../../test-fixtures';
import { AgentService } from '../agent/agent.service';
import { ActionsController } from './actions.controller';

// Mock the entire agent service module to avoid TS2589 from @langchain/core/tools
jest.mock('../agent/agent.service', () => ({
  AgentService: jest.fn()
}));

describe('ActionsController', () => {
  let controller: ActionsController;
  let mockAgentService: { resume: jest.Mock };

  beforeEach(async () => {
    mockAgentService = {
      resume: jest.fn().mockResolvedValue(makeChatResponse({ message: 'Done' }))
    };

    const module = await Test.createTestingModule({
      controllers: [ActionsController],
      providers: [{ provide: AgentService, useValue: mockAgentService }]
    }).compile();

    controller = module.get(ActionsController);
  });

  it('approve calls resume with approved=true', async () => {
    const user = { userId: 'user-1', rawJwt: 'jwt' };
    await controller.approve('action-1', user);
    expect(mockAgentService.resume).toHaveBeenCalledWith(
      'action-1',
      true,
      'user-1',
      'jwt'
    );
  });

  it('reject calls resume with approved=false', async () => {
    const user = { userId: 'user-1', rawJwt: 'jwt' };
    await controller.reject('action-1', user);
    expect(mockAgentService.resume).toHaveBeenCalledWith(
      'action-1',
      false,
      'user-1',
      'jwt'
    );
  });

  it('approve returns the ChatResponse from AgentService', async () => {
    const expected = makeChatResponse({ message: 'Approved' });
    mockAgentService.resume.mockResolvedValue(expected);

    const result = await controller.approve('action-1', {
      userId: 'u1',
      rawJwt: 'jwt'
    });
    expect(result).toEqual(expected);
  });

  it('passes the correct action id parameter', async () => {
    const user = { userId: 'u1', rawJwt: 'jwt' };
    await controller.approve('unique-action-id', user);
    expect(mockAgentService.resume).toHaveBeenCalledWith(
      'unique-action-id',
      true,
      'u1',
      'jwt'
    );
  });
});
