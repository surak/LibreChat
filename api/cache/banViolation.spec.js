const banViolation = require('./banViolation');

jest.mock('~/models', () => ({
  deleteAllUserSessions: jest.fn().mockResolvedValue(true),
  updateUser: jest.fn().mockResolvedValue(true),
}));

describe('banViolation', () => {
  let req, res, errorMessage;

  beforeEach(() => {
    req = { ip: '127.0.0.1', cookies: { refreshToken: 'someToken' } };
    res = { clearCookie: jest.fn() };
    errorMessage = {
      type: 'someViolation',
      user_id: 'user123',
      prev_count: 0,
      violation_count: 0,
    };
    process.env.BAN_VIOLATIONS = 'true';
    process.env.BAN_DURATION = '7200000';
    process.env.BAN_INTERVAL = '20';
  });

  it('should not ban if BAN_VIOLATIONS are not enabled', async () => {
    process.env.BAN_VIOLATIONS = 'false';
    await banViolation(req, res, errorMessage);
    expect(errorMessage.ban).toBeFalsy();
  });

  it('should ban if violation_count crosses the interval threshold: 19 -> 20', async () => {
    errorMessage.prev_count = 19;
    errorMessage.violation_count = 20;
    await banViolation(req, res, errorMessage);
    expect(errorMessage.ban).toBeTruthy();
  });

  it('should not ban if violation_count does not cross the interval threshold: 0 -> 19', async () => {
    errorMessage.prev_count = 0;
    errorMessage.violation_count = 19;
    await banViolation(req, res, errorMessage);
    expect(errorMessage.ban).toBeFalsy();
  });
});
