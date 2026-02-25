import { getChannelCapabilities } from '../agent/channel.capabilities';
import {
  ToolCallRecord,
  Verifier,
  VerificationResult
} from '../common/interfaces';

export class InterfaceFormatVerifier implements Verifier {
  name = 'interface_format';
  order = 'I-0001';

  async verify(
    response: string,
    _toolCalls: ToolCallRecord[],
    channel?: string
  ): Promise<VerificationResult> {
    const warnings: string[] = [];
    const flags: string[] = [];
    const caps = getChannelCapabilities(channel);
    const formats = caps.supportedFormats;

    // Check: markdown in plain-only channel
    if (
      !formats.includes('markdown') &&
      !formats.includes('html') &&
      /[#*_`~[\]]/.test(response)
    ) {
      warnings.push(
        `Response contains markdown syntax but channel "${caps.channel}" only supports: ${formats.join(', ')}.`
      );
    }

    // Check: prose in CSV-only channel (flag → short-circuits)
    // A valid CSV first line has 2+ comma-separated fields (e.g. "Symbol,Weight,Value")
    const firstLine = response.trim().split('\n')[0];
    const csvFieldCount = firstLine.split(',').length;
    if (formats.length === 1 && formats[0] === 'csv' && csvFieldCount < 2) {
      flags.push(
        `Channel "${caps.channel}" requires CSV-only output but response contains prose.`
      );
    }

    // Check: length over limit
    if (caps.maxResponseLength && response.length > caps.maxResponseLength) {
      warnings.push(
        `Response length (${response.length}) exceeds channel limit of ${caps.maxResponseLength} characters.`
      );
    }

    return {
      pass: flags.length === 0,
      warnings,
      flags
    };
  }
}
