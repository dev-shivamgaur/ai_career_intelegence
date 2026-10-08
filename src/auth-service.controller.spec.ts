import { Test, TestingModule } from '@nestjs/testing';
import { AuthServiceController } from './auth.controller';
import { AuthServiceService } from './auth.service';

describe('AuthServiceController', () => {
  let authServiceController: AuthServiceController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AuthServiceController],
      providers: [AuthServiceService],
    }).compile();

    authServiceController = app.get<AuthServiceController>(AuthServiceController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(authServiceController.getHello()).toBe('Hello I am auth');
    });
  });
});
