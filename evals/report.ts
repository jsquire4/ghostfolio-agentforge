// Eval report exporter — writes JSON and HTML reports for instructor review.
import { writeFileSync } from 'fs';
import { resolve } from 'path';

import { PortfolioSnapshot } from './snapshot';
import { EvalSuiteResult } from './types';

interface FullReport {
  generatedAt: string;
  snapshot: PortfolioSnapshot;
  suites: EvalSuiteResult[];
  summary: {
    totalPassed: number;
    totalFailed: number;
    totalDurationMs: number;
    estimatedCost: number;
  };
}

function buildReport(
  snapshot: PortfolioSnapshot,
  suites: EvalSuiteResult[]
): FullReport {
  const totalPassed = suites.reduce((s, r) => s + r.totalPassed, 0);
  const totalFailed = suites.reduce((s, r) => s + r.totalFailed, 0);
  const totalDurationMs = suites.reduce((s, r) => s + r.totalDurationMs, 0);
  const estimatedCost = suites.reduce((s, r) => s + (r.estimatedCost || 0), 0);

  return {
    generatedAt: new Date().toISOString(),
    summary: { totalPassed, totalFailed, totalDurationMs, estimatedCost },
    suites,
    snapshot
  };
}

// ── JSON Export ──────────────────────────────────────────────

export function writeJsonReport(
  snapshot: PortfolioSnapshot,
  suites: EvalSuiteResult[],
  outDir: string
): string {
  const report = buildReport(snapshot, suites);
  const filename = `eval-report-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const filepath = resolve(outDir, filename);
  writeFileSync(filepath, JSON.stringify(report, null, 2));
  return filepath;
}

// ── HTML Export ──────────────────────────────────────────────

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDollar(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(2)}%`;
}

function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function writeHtmlReport(
  snapshot: PortfolioSnapshot,
  suites: EvalSuiteResult[],
  outDir: string
): string {
  const report = buildReport(snapshot, suites);
  const filename = `eval-report-${new Date().toISOString().replace(/[:.]/g, '-')}.html`;
  const filepath = resolve(outDir, filename);

  const holdingsRows = snapshot.holdings
    .sort((a, b) => b.allocationInPercentage - a.allocationInPercentage)
    .map(
      (h) => `
      <tr>
        <td>${escHtml(h.symbol)}</td>
        <td>${escHtml(h.name)}</td>
        <td>${h.quantity}</td>
        <td>${fmtDollar(h.marketPrice)}</td>
        <td>${fmtDollar(h.valueInBaseCurrency)}</td>
        <td>${(h.allocationInPercentage * 100).toFixed(1)}%</td>
        <td class="${h.netPerformancePercent >= 0 ? 'positive' : 'negative'}">${fmtPct(h.netPerformancePercent)}</td>
      </tr>`
    )
    .join('');

  const riskRows = snapshot.reportRules
    .filter((r) => r.isActive)
    .map(
      (r) => `
      <tr>
        <td class="${r.value ? 'pass' : 'fail'}">${r.value ? '\u2713' : '\u2717'}</td>
        <td>${escHtml(r.name)}</td>
      </tr>`
    )
    .join('');

  const suiteHtml = suites
    .map((suite) => {
      const caseCards = suite.cases
        .map((c) => {
          const icon = c.passed ? '\u2713' : '\u2717';
          const cls = c.passed ? 'pass' : 'fail';
          const d = c.details || {};
          const toolCalls =
            (d.toolCalls as {
              toolName: string;
              params: unknown;
              result: string;
              calledAt: string;
              durationMs: number;
              success: boolean;
            }[]) || [];

          // Build tool steps
          const stepsHtml =
            toolCalls.length > 0
              ? toolCalls
                  .map((tc, i) => {
                    let parsedResult = '';
                    try {
                      const parsed = JSON.parse(tc.result);
                      parsedResult = JSON.stringify(parsed, null, 2);
                    } catch {
                      parsedResult = tc.result;
                    }
                    return `
                <div class="step">
                  <div class="step-header">
                    <span class="step-num">Step ${i + 1}</span>
                    <span class="${tc.success ? 'pass' : 'fail'}">${tc.success ? '\u2713' : '\u2717'}</span>
                    <strong>${escHtml(tc.toolName)}</strong>
                    <span class="dim">${tc.durationMs}ms</span>
                  </div>
                  <div class="step-body">
                    <div class="step-section"><span class="dim">Params:</span><pre>${escHtml(JSON.stringify(tc.params, null, 2))}</pre></div>
                    <div class="step-section"><span class="dim">Result:</span><pre>${escHtml(parsedResult)}</pre></div>
                  </div>
                </div>`;
                  })
                  .join('')
              : '<p class="dim">No tool calls</p>';

          // Warnings & flags
          const warnings = (d.warnings as string[]) || [];
          const flags = (d.flags as string[]) || [];
          const alertsHtml =
            warnings.length > 0 || flags.length > 0
              ? `<div class="alerts">
                ${flags.map((f: string) => `<span class="alert flag">\u26a0 ${escHtml(f)}</span>`).join('')}
                ${warnings.map((w: string) => `<span class="alert warn">${escHtml(w)}</span>`).join('')}
              </div>`
              : '';

          // Metrics row
          const metrics = [
            d.ttftMs ? `TTFT: ${fmtMs(d.ttftMs as number)}` : '',
            d.estimatedCost
              ? `Cost: ~$${(d.estimatedCost as number).toFixed(4)}`
              : '',
            d.tokens ? `Tokens: ${d.tokens}` : '',
            `Duration: ${fmtMs(c.durationMs)}`
          ]
            .filter(Boolean)
            .join(' &middot; ');

          return `
          <details class="eval-card ${c.passed ? '' : 'eval-failed'}">
            <summary>
              <span class="${cls} eval-icon">${icon}</span>
              <strong>${escHtml(c.id)}</strong>
              <span class="eval-desc">${escHtml(c.description)}</span>
              <span class="eval-metrics dim">${metrics}</span>
              ${!c.passed ? `<span class="fail eval-error">${escHtml(c.error || '')}</span>` : ''}
            </summary>
            <div class="eval-detail">
              ${d.prompt ? `<div class="detail-row"><span class="dim">Prompt:</span> <code>${escHtml(String(d.prompt))}</code></div>` : ''}
              <div class="detail-row"><span class="dim">Tools:</span> ${d.tools ? escHtml(String(d.tools)) : '(none)'}</div>
              ${alertsHtml}
              <h4>Agent Steps</h4>
              ${stepsHtml}
              ${d.response ? `<h4>Full Response</h4><pre class="agent-response">${escHtml(String(d.response))}</pre>` : ''}
            </div>
          </details>`;
        })
        .join('');

      return `
        <h2>${suite.tier.charAt(0).toUpperCase() + suite.tier.slice(1)} Evals</h2>
        <p>${suite.totalPassed}/${suite.totalPassed + suite.totalFailed} passed &middot;
           ${fmtMs(suite.totalDurationMs)}
           ${suite.estimatedCost ? ` &middot; ~$${suite.estimatedCost.toFixed(4)}` : ''}</p>
        ${caseCards}`;
    })
    .join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AgentForge Eval Report — ${report.generatedAt}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace;
           background: #0d1117; color: #c9d1d9; padding: 2rem; max-width: 1400px; margin: 0 auto; }
    h1 { color: #58a6ff; margin-bottom: 0.5rem; }
    h2 { color: #58a6ff; margin: 2rem 0 1rem; border-bottom: 1px solid #21262d; padding-bottom: 0.5rem; }
    h3 { color: #8b949e; margin: 1.5rem 0 0.5rem; }
    .summary { background: #161b22; border: 1px solid #30363d; border-radius: 6px;
               padding: 1.5rem; margin: 1rem 0; display: flex; gap: 2rem; flex-wrap: wrap; }
    .summary .stat { text-align: center; }
    .summary .stat .value { font-size: 2rem; font-weight: bold; }
    .summary .stat .label { color: #8b949e; font-size: 0.85rem; }
    .pass { color: #3fb950; font-weight: bold; }
    .fail { color: #f85149; font-weight: bold; }
    .positive { color: #3fb950; }
    .negative { color: #f85149; }
    table { width: 100%; border-collapse: collapse; margin: 1rem 0; font-size: 0.85rem; }
    th, td { padding: 0.5rem 0.75rem; text-align: left; border-bottom: 1px solid #21262d; }
    th { background: #161b22; color: #8b949e; font-weight: 600; position: sticky; top: 0; }
    tr:hover { background: #161b22; }
    .failed-row { background: #1a0f0f; }
    .response-cell { max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    code { background: #161b22; padding: 0.2rem 0.4rem; border-radius: 3px; font-size: 0.85em; }
    pre { background: #161b22; border: 1px solid #30363d; border-radius: 6px;
          padding: 1rem; overflow-x: auto; font-size: 0.8rem; margin: 0.5rem 0;
          max-height: 400px; overflow-y: auto; white-space: pre-wrap; }
    .meta { color: #8b949e; font-size: 0.85rem; margin-bottom: 2rem; }
    small { color: #8b949e; }
    .dim { color: #8b949e; }

    /* Eval accordion cards */
    .eval-card { background: #161b22; border: 1px solid #30363d; border-radius: 6px;
                 margin: 0.5rem 0; }
    .eval-card.eval-failed { border-color: #f8514966; }
    .eval-card summary { padding: 0.75rem 1rem; cursor: pointer; display: flex;
                         align-items: center; gap: 0.6rem; flex-wrap: wrap;
                         list-style: none; font-size: 0.9rem; }
    .eval-card summary::-webkit-details-marker { display: none; }
    .eval-card summary::before { content: '\\25B6'; font-size: 0.6rem; color: #8b949e;
                                  transition: transform 0.15s; flex-shrink: 0; }
    .eval-card[open] summary::before { transform: rotate(90deg); }
    .eval-card summary:hover { background: #1c2128; }
    .eval-icon { font-size: 1rem; flex-shrink: 0; }
    .eval-desc { color: #8b949e; }
    .eval-metrics { margin-left: auto; font-size: 0.8rem; white-space: nowrap; }
    .eval-error { font-size: 0.8rem; width: 100%; margin-top: 0.25rem; }
    .eval-detail { padding: 0.75rem 1rem 1rem; border-top: 1px solid #21262d; }
    .eval-detail h4 { color: #58a6ff; font-size: 0.85rem; margin: 1rem 0 0.5rem; }
    .detail-row { font-size: 0.85rem; margin: 0.3rem 0; }

    /* Tool call steps */
    .step { background: #0d1117; border: 1px solid #21262d; border-radius: 4px;
            margin: 0.4rem 0; }
    .step-header { padding: 0.5rem 0.75rem; display: flex; align-items: center;
                   gap: 0.5rem; font-size: 0.85rem; }
    .step-num { background: #21262d; color: #8b949e; padding: 0.1rem 0.4rem;
                border-radius: 3px; font-size: 0.75rem; }
    .step-body { padding: 0 0.75rem 0.5rem; }
    .step-body pre { max-height: 250px; font-size: 0.75rem; margin: 0.25rem 0 0.5rem; }
    .step-section { margin-bottom: 0.5rem; font-size: 0.8rem; }
    .agent-response { max-height: 500px; }

    /* Alerts */
    .alerts { display: flex; flex-wrap: wrap; gap: 0.4rem; margin: 0.5rem 0; }
    .alert { padding: 0.2rem 0.5rem; border-radius: 3px; font-size: 0.8rem; }
    .alert.flag { background: #f8514922; color: #f85149; }
    .alert.warn { background: #d2992222; color: #d29922; }
  </style>
</head>
<body>
  <h1>AgentForge Eval Report</h1>
  <p class="meta">Generated: ${report.generatedAt}</p>

  <div class="summary">
    <div class="stat">
      <div class="value ${report.summary.totalFailed > 0 ? 'fail' : 'pass'}">
        ${report.summary.totalPassed}/${report.summary.totalPassed + report.summary.totalFailed}
      </div>
      <div class="label">Passed</div>
    </div>
    <div class="stat">
      <div class="value">${fmtMs(report.summary.totalDurationMs)}</div>
      <div class="label">Duration</div>
    </div>
    <div class="stat">
      <div class="value">~$${report.summary.estimatedCost.toFixed(4)}</div>
      <div class="label">Est. Cost</div>
    </div>
    <div class="stat">
      <div class="value">${snapshot.holdings.length}</div>
      <div class="label">Holdings</div>
    </div>
    ${
      snapshot.performance
        ? `
    <div class="stat">
      <div class="value">${fmtDollar(snapshot.performance.currentNetWorth ?? snapshot.performance.currentValueInBaseCurrency)}</div>
      <div class="label">Net Worth</div>
    </div>`
        : ''
    }
  </div>

  ${suiteHtml}

  <h2>Portfolio Snapshot (Ground Truth)</h2>

  ${
    snapshot.performance
      ? `
  <h3>Performance</h3>
  <table>
    <tr><td>Net Worth</td><td>${fmtDollar(snapshot.performance.currentNetWorth ?? snapshot.performance.currentValueInBaseCurrency)}</td></tr>
    <tr><td>Total Invested</td><td>${fmtDollar(snapshot.performance.totalInvestment)}</td></tr>
    <tr><td>Net P&amp;L</td><td class="${snapshot.performance.netPerformance >= 0 ? 'positive' : 'negative'}">${fmtDollar(snapshot.performance.netPerformance)} (${fmtPct(snapshot.performance.netPerformancePercentage)})</td></tr>
  </table>`
      : ''
  }

  ${
    snapshot.holdings.length > 0
      ? `
  <h3>Holdings</h3>
  <table>
    <thead><tr><th>Symbol</th><th>Name</th><th>Qty</th><th>Price</th><th>Value</th><th>Alloc</th><th>Return</th></tr></thead>
    <tbody>${holdingsRows}</tbody>
  </table>`
      : ''
  }

  ${
    riskRows
      ? `
  <h3>Risk Report</h3>
  <table>
    <thead><tr><th></th><th>Rule</th></tr></thead>
    <tbody>${riskRows}</tbody>
  </table>`
      : ''
  }

  ${
    snapshot.aiPrompt
      ? `
  <h3>AI Prompt (what portfolio_summary sends to LLM)</h3>
  <pre>${escHtml(snapshot.aiPrompt)}</pre>`
      : ''
  }

  ${
    snapshot.errors.length > 0
      ? `
  <h3>Snapshot Errors</h3>
  <ul>${snapshot.errors.map((e) => `<li class="fail">${escHtml(e)}</li>`).join('')}</ul>`
      : ''
  }

</body>
</html>`;

  writeFileSync(filepath, html);
  return filepath;
}
