import { LiveController } from './live.controller';

describe('LiveController', () => {
  it('returns the live board projection', () => {
    const liveService = {
      getBoard: jest.fn(() => ({ rows: [] })),
      getState: jest.fn(),
      getHealth: jest.fn(),
      stream: jest.fn(),
    };

    const controller = new LiveController(liveService as never);

    expect(controller.getBoard()).toEqual({ rows: [] });
    expect(liveService.getBoard).toHaveBeenCalledTimes(1);
  });
});
