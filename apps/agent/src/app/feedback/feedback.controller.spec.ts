import { Test } from '@nestjs/testing';

import { FeedbackRepository } from '../database/feedback.repository';
import { FeedbackController } from './feedback.controller';

describe('FeedbackController', () => {
  let controller: FeedbackController;
  let feedbackRepository: FeedbackRepository;

  beforeEach(async () => {
    feedbackRepository = {
      log: jest.fn()
    } as any;

    const module = await Test.createTestingModule({
      controllers: [FeedbackController],
      providers: [{ provide: FeedbackRepository, useValue: feedbackRepository }]
    }).compile();

    controller = module.get(FeedbackController);
  });

  it('logs feedback and returns ok', () => {
    const user = { userId: 'user-1', rawJwt: 'jwt' };
    const body = { rating: 'up' as const, correction: 'Fixed typo' };

    const result = controller.submitFeedback('conv-123', body, user);

    expect(result).toEqual({ ok: true });
    expect(feedbackRepository.log).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        conversationId: 'conv-123',
        rating: 'up',
        correction: 'Fixed typo'
      })
    );
  });

  it('generates a valid UUID for the feedback id', () => {
    const user = { userId: 'user-1', rawJwt: 'jwt' };
    controller.submitFeedback('conv-1', { rating: 'up' as const }, user);

    const logCall = (feedbackRepository.log as jest.Mock).mock.calls[0][0];
    expect(logCall.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  it('sets createdAt to a valid ISO timestamp', () => {
    const user = { userId: 'user-1', rawJwt: 'jwt' };
    controller.submitFeedback('conv-1', { rating: 'up' as const }, user);

    const logCall = (feedbackRepository.log as jest.Mock).mock.calls[0][0];
    expect(new Date(logCall.createdAt).toISOString()).toBe(logCall.createdAt);
  });

  it('handles down rating', () => {
    const user = { userId: 'user-1', rawJwt: 'jwt' };
    const result = controller.submitFeedback(
      'conv-1',
      { rating: 'down' as const },
      user
    );

    expect(result).toEqual({ ok: true });
    expect(feedbackRepository.log).toHaveBeenCalledWith(
      expect.objectContaining({ rating: 'down' })
    );
  });

  it('logs without correction when omitted', () => {
    const user = { userId: 'user-1', rawJwt: 'jwt' };
    controller.submitFeedback('conv-1', { rating: 'up' as const }, user);

    const logCall = (feedbackRepository.log as jest.Mock).mock.calls[0][0];
    expect(logCall.correction).toBeUndefined();
  });
});
