import {
  CHANNEL_CAPABILITIES,
  VALID_CHANNELS,
  getChannelCapabilities
} from './channel.capabilities';

describe('ChannelCapabilities', () => {
  it('exports all expected channels', () => {
    expect(VALID_CHANNELS).toEqual(
      expect.arrayContaining(['web-chat', 'cli', 'api', 'slack', 'csv-export'])
    );
    expect(VALID_CHANNELS).toHaveLength(5);
  });

  it('web-chat supports plain and html', () => {
    const caps = CHANNEL_CAPABILITIES['web-chat'];
    expect(caps.supportedFormats).toEqual(['plain', 'html']);
    expect(caps.maxResponseLength).toBeUndefined();
  });

  it('cli supports plain and markdown with length limit', () => {
    const caps = CHANNEL_CAPABILITIES['cli'];
    expect(caps.supportedFormats).toEqual(['plain', 'markdown']);
    expect(caps.maxResponseLength).toBe(4000);
  });

  it('csv-export supports only csv', () => {
    const caps = CHANNEL_CAPABILITIES['csv-export'];
    expect(caps.supportedFormats).toEqual(['csv']);
  });

  it('getChannelCapabilities defaults to web-chat when no channel', () => {
    const caps = getChannelCapabilities();
    expect(caps.channel).toBe('web-chat');
  });

  it('getChannelCapabilities defaults to web-chat for unknown channel', () => {
    const caps = getChannelCapabilities('unknown-channel');
    expect(caps.channel).toBe('web-chat');
  });

  it('getChannelCapabilities returns correct caps for known channel', () => {
    const caps = getChannelCapabilities('slack');
    expect(caps.channel).toBe('slack');
    expect(caps.supportedFormats).toContain('markdown');
  });
});
