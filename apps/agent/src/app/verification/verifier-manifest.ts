import { Verifier } from '../common/interfaces';
import { ConfidenceVerifier } from './confidence.verifier';
import { SourceAttributionVerifier } from './source-attribution.verifier';

export function getVerifierManifest(): Verifier[] {
  return [
    new SourceAttributionVerifier(),
    new ConfidenceVerifier()
    // new verifiers added here — import above, add to array, done
  ];
}
