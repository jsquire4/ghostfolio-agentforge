// NEVER edit this file manually — ALL_VERIFIERS is derived from verifiers.exports.ts.
import { Verifier } from '../common/interfaces';
import * as verifierExports from './verifiers.exports';

export * from './verifiers.exports';
export const ALL_VERIFIERS: Verifier[] = Object.values(verifierExports)
  .filter((V): V is new () => Verifier => typeof V === 'function')
  .map((V) => new V());
