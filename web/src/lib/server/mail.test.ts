import { describe, expect, it, vi } from 'vitest';

import { deliverLoginCode } from './mail';

describe('login-code delivery', () => {
  it('delivers the code through Email Service', async () => {
    const send = vi.fn().mockResolvedValue({ messageId: 'message-1' });

    await deliverLoginCode('alice@gmail.com', '123456', { send }, false);

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'alice@gmail.com',
        from: 'login@phones.llmfn.com',
        text: expect.stringContaining('123456')
      })
    );
  });

  it('logs the code instead of sending in development', async () => {
    const send = vi.fn();
    const log = vi.fn();

    await deliverLoginCode('alice@gmail.com', '123456', { send }, true, log);

    expect(send).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('123456'));
  });
});
