import { ChannelCapabilities, OutputFormat } from '../common/interfaces';

export const CHANNEL_CAPABILITIES: Record<string, ChannelCapabilities> = {
  'web-chat': {
    channel: 'web-chat',
    supportedFormats: ['plain', 'html'] as OutputFormat[]
  },
  cli: {
    channel: 'cli',
    supportedFormats: ['plain', 'markdown'] as OutputFormat[],
    maxResponseLength: 4000
  },
  api: {
    channel: 'api',
    supportedFormats: ['markdown', 'plain', 'html', 'csv'] as OutputFormat[]
  },
  slack: {
    channel: 'slack',
    supportedFormats: ['markdown', 'plain'] as OutputFormat[],
    maxResponseLength: 3000
  },
  'csv-export': {
    channel: 'csv-export',
    supportedFormats: ['csv'] as OutputFormat[],
    maxResponseLength: 50000
  }
};

export const VALID_CHANNELS = Object.keys(CHANNEL_CAPABILITIES);

export function getChannelCapabilities(channel?: string): ChannelCapabilities {
  if (!channel) return CHANNEL_CAPABILITIES['web-chat'];
  return CHANNEL_CAPABILITIES[channel] ?? CHANNEL_CAPABILITIES['web-chat'];
}
