import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AuthUser } from '../auth.types';
import { CurrentUser } from './current-user.decorator';

@Controller('test-user')
class TestController {
  @Get()
  get(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }
}

describe('CurrentUser decorator', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [TestController]
    }).compile();

    app = module.createNestApplication();
    app.use((req: any, _res, next) => {
      req.user = { userId: 'user-1', rawJwt: 'jwt-token' };
      next();
    });
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('extracts user from request', async () => {
    const res = await request(app.getHttpServer()).get('/test-user');
    expect(res.body).toEqual({ userId: 'user-1', rawJwt: 'jwt-token' });
  });

  it('returns undefined when request.user is not set', async () => {
    const noUserModule = await Test.createTestingModule({
      controllers: [TestController]
    }).compile();

    const noUserApp = noUserModule.createNestApplication();
    await noUserApp.init();

    const res = await request(noUserApp.getHttpServer()).get('/test-user');
    expect(res.body).toEqual({});

    await noUserApp.close();
  });
});
