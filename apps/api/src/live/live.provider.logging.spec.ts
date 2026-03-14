import {
  parseProviderLogMode,
  resolveProviderLogSettings,
} from './live.provider.logging';

describe('live.provider.logging', () => {
  it('parses canonical provider log modes', () => {
    expect(parseProviderLogMode('off')).toBe('off');
    expect(parseProviderLogMode('frames')).toBe('frames');
    expect(parseProviderLogMode('messages')).toBe('messages');
    expect(parseProviderLogMode('all')).toBe('all');
  });

  it('falls back to legacy boolean envs when canonical mode is absent', () => {
    expect(
      resolveProviderLogSettings({
        modeValue: undefined,
        legacyFramesValue: 'true',
        legacyMessagesValue: 'false',
        maxCharsValue: '600',
      }),
    ).toMatchObject({
      mode: 'frames',
      framesEnabled: true,
      messagesEnabled: false,
    });

    expect(
      resolveProviderLogSettings({
        modeValue: undefined,
        legacyFramesValue: 'true',
        legacyMessagesValue: 'true',
        maxCharsValue: '600',
      }),
    ).toMatchObject({
      mode: 'all',
      framesEnabled: true,
      messagesEnabled: true,
    });
  });

  it('prefers the canonical mode when both styles are present', () => {
    expect(
      resolveProviderLogSettings({
        modeValue: 'messages',
        legacyFramesValue: 'true',
        legacyMessagesValue: 'false',
        maxCharsValue: '600',
      }),
    ).toMatchObject({
      mode: 'messages',
      framesEnabled: false,
      messagesEnabled: true,
    });
  });
});
