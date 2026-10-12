// Policy registry. Policies are registered in per-batch files (batch-*.js)
// so separate authors never edit the same file; order in the manual comes
// from each policy's `number`.

import aspireA from './batch-aspire-a.js';
import aspireB from './batch-aspire-b.js';
import program from './batch-program.js';

export const POLICIES = [...aspireA, ...aspireB, ...program].sort((a, b) =>
  String(a.number).localeCompare(String(b.number), undefined, { numeric: true })
);
