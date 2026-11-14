import { RESOURCES, CRAFT_RECIPES, BUILDINGS, TECHS, ERAS } from './data.js';
import { getEconomyDiagnostics } from './simulation.js';

export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  if (s < 60) return `${s}s`;
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (mins > 0) parts.push(`${mins}m`);
  if (days === 0 && hours === 0 && secs > 0) parts.push(`${secs}s`);
  return parts.join(' ');
}

function fmtSigned(val, decimals = 2) {
  const n = Number(val) || 0;
  if (Math.abs(n) < 1e-9) return `0.${'0'.repeat(decimals)}`;
  return `${n > 0 ? '+' : ''}${n.toFixed(decimals)}`;
}

function fmtAmount(val) {
  const n = Number(val) || 0;
  if (Math.abs(n - Math.round(n)) < 0.05) return String(Math.round(n));
  return n.toFixed(1);
}

function getCapExpansionSources(resId) {
  const bNames = BUILDINGS.filter(b => b.effects?.cap?.[resId]).map(b => `${b.name} (+${b.effects.cap[resId]})`);
  bNames.push('Expeditions (+10%–20% global caps)', 'Harbor Colossus (+20% caps/stage)');
  return bNames.join(' · ');
}

export function initInsightsUI(api) {
  let selectedResId = 'food';
  let lastReturnSummary = null;
  let diagOpener = null;
  let summaryOpener = null;

  // 1. Create Resource & Bottleneck Diagnostics Dialog
  const diagDialog = document.createElement('dialog');
  diagDialog.id = 'diagnostics-dialog';
  diagDialog.className = 'modal-dialog';
  diagDialog.setAttribute('aria-labelledby', 'diagnostics-title');
  diagDialog.innerHTML = `
    <header class="settings-heading">
      <div>
        <p class="helper-note">PRODUCTION, CONSUMPTION &amp; BOTTLENECKS</p>
        <h2 id="diagnostics-title">Resource &amp; Economy Diagnostics</h2>
      </div>
      <div class="header-controls">
        <button type="button" id="diagnostics-open-return" class="btn-small hidden">Last Return Summary</button>
        <button type="button" id="diagnostics-close" class="btn-small" aria-label="Close diagnostics">Close ×</button>
      </div>
    </header>
    <p class="helper-note">Separates steady building and worker production, citizen food upkeep, and automatic crafting's potential output and input demand.</p>
    <div id="diagnostics-res-tabs" class="diag-pill-bar" role="tablist" aria-label="Select resource to inspect"></div>
    <div id="diagnostics-body" class="diag-body"></div>
  `;
  document.body.append(diagDialog);

  // 2. Create Return Summary Dialog
  const returnDialog = document.createElement('dialog');
  returnDialog.id = 'return-summary-dialog';
  returnDialog.className = 'modal-dialog';
  returnDialog.setAttribute('aria-labelledby', 'return-summary-title');
  returnDialog.innerHTML = `
    <header class="settings-heading">
      <div>
        <p class="helper-note">ACTUAL SIMULATED CATCH-UP RESULTS</p>
        <h2 id="return-summary-title">While You Were Away</h2>
      </div>
      <button type="button" id="return-summary-close" class="btn-small" aria-label="Close return summary">Close ×</button>
    </header>
    <div id="return-summary-body" class="diag-body"></div>
  `;
  document.body.append(returnDialog);

  // Wire close handlers
  diagDialog.querySelector('#diagnostics-close').addEventListener('click', () => diagDialog.close());
  diagDialog.addEventListener('close', () => {
    document.body.classList.remove('settings-open');
    diagOpener?.focus();
  });

  returnDialog.querySelector('#return-summary-close').addEventListener('click', () => returnDialog.close());
  returnDialog.addEventListener('close', () => {
    document.body.classList.remove('settings-open');
    summaryOpener?.focus();
  });

  diagDialog.querySelector('#diagnostics-open-return').addEventListener('click', () => {
    diagDialog.close();
    openReturnSummary();
  });

  diagDialog.querySelector('#diagnostics-res-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-diag-res]');
    if (!btn) return;
    selectedResId = btn.dataset.diagRes;
    renderDiagnosticsModal();
  });

  function renderDiagnosticsModal() {
    if (!diagDialog.open) return;
    const state = api.getState();
    const diag = getEconomyDiagnostics(state);
    const unlockedRes = RESOURCES.filter(r => diag.resources[r.id]?.unlocked);
    if (!unlockedRes.some(r => r.id === selectedResId)) {
      selectedResId = unlockedRes[0]?.id || 'food';
    }

    const returnBtn = diagDialog.querySelector('#diagnostics-open-return');
    returnBtn.classList.toggle('hidden', !lastReturnSummary);

    // Render resource selector pills
    const tabsEl = diagDialog.querySelector('#diagnostics-res-tabs');
    tabsEl.innerHTML = unlockedRes.map(r => {
      const rd = diag.resources[r.id];
      const active = r.id === selectedResId;
      const hasWarning = rd.bottlenecks.length > 0;
      return `
        <button type="button" role="tab" aria-selected="${active}" data-diag-res="${r.id}" class="btn-small diag-pill ${active ? 'accent-teal' : ''} ${hasWarning ? 'diag-pill-warn' : ''}">
          <span>${r.name}</span>
          <span class="tabular">${fmtSigned(rd.passiveNet, 1)}/s</span>
        </button>
      `;
    }).join('');

    const rd = diag.resources[selectedResId];
    const pop = diag.population;
    const unlockedRecipes = diag.recipeList.filter(r => r.unlocked);

    let timingNote = 'Steady stockpile';
    if (rd.atCap && rd.passiveNet >= 0) {
      timingNote = `Full at storage cap (${rd.cap}/${rd.cap}) — excess passive production overflows`;
    } else if (rd.timeToCapSeconds !== null) {
      timingNote = `Reaches storage cap in ~${formatDuration(Math.ceil(rd.timeToCapSeconds))} at steady passive rate`;
    } else if (rd.timeToEmptySeconds !== null) {
      timingNote = `Depletes in ~${formatDuration(Math.ceil(rd.timeToEmptySeconds))} at current passive drain`;
    } else if (rd.isEmpty && rd.passiveNet < 0) {
      timingNote = 'Stockpile is empty (0) and net rate is negative';
    }

    const buildingRows = rd.buildingSources.length > 0
      ? rd.buildingSources.map(b => `
          <div class="diag-line">
            <span>${b.name} ×${b.count} <span class="label-muted">(base +${b.baseRate.toFixed(2)}/s)</span></span>
            <strong class="tabular rate-pos">+${b.rate.toFixed(2)}/s</strong>
          </div>
        `).join('')
      : `<div class="diag-empty">No structures currently producing ${rd.name}.</div>`;

    const workerRows = rd.workerSources.length > 0
      ? rd.workerSources.map(w => `
          <div class="diag-line">
            <span>${w.name} ×${w.count}${w.jobBoost > 1 ? ` <span class="label-muted">(+40% Philosophy)</span>` : ''}</span>
            <strong class="tabular rate-pos">+${w.rate.toFixed(2)}/s</strong>
          </div>
        `).join('')
      : `<div class="diag-empty">No workers currently assigned to ${rd.name}.</div>`;

    const multRows = rd.multiplierSources.length > 0
      ? rd.multiplierSources.map(m => `<span class="badge-inline">${m.label}: ${m.bonus}</span>`).join(' ')
      : `<span class="label-muted">1.00× (No wonder or tech production multipliers active yet)</span>`;

    const craftOutRows = rd.craftOutputSources.length > 0
      ? rd.craftOutputSources.map(c => `
          <div class="diag-line">
            <span>${c.name} <span class="label-muted">(${c.status === 'running' ? 'active' : 'blocked'})</span></span>
            <strong class="tabular ${c.status === 'running' ? 'rate-pos' : ''}">up to +${c.potentialRate.toFixed(2)}/s</strong>
          </div>
        `).join('')
      : `<div class="diag-empty">No enabled auto-craft recipes output ${rd.name}.</div>`;

    const craftInRows = rd.craftInputDemands.length > 0
      ? rd.craftInputDemands.map(c => `
          <div class="diag-line">
            <span>${c.name} <span class="label-muted">(${c.status === 'running' ? 'drawing inputs' : 'paused'})</span></span>
            <strong class="tabular rate-neg">up to -${c.potentialDemand.toFixed(2)}/s</strong>
          </div>
        `).join('')
      : `<div class="diag-empty">No enabled auto-craft recipes consume ${rd.name}.</div>`;

    const bottleneckRows = rd.bottlenecks.length > 0
      ? rd.bottlenecks.map(msg => `<div class="diag-alert">${msg}</div>`).join('')
      : `<div class="diag-ok">No bottlenecks detected for ${rd.name}.</div>`;

    const recipeCards = unlockedRecipes.length > 0
      ? unlockedRecipes.map(r => {
          const badgeClass =
            r.status === 'running' ? 'diag-badge-ok' :
            r.status === 'off' ? 'diag-badge-muted' : 'diag-badge-warn';
          const statusLabel =
            r.status === 'running' ? 'Running' :
            r.status === 'no_artisans' ? 'No Artisans' :
            r.status === 'blocked_output_full' ? 'Output Full' :
            r.status === 'blocked_missing_inputs' ? 'Missing Inputs' :
            r.status === 'input_bottleneck' ? 'Input Bottleneck' : 'Auto OFF';
          const inSummary = r.inputs.map(i => `${i.name}: ${Math.floor(i.stored)}/${i.perBatch}${r.enabled ? ` (${i.demandPerSec.toFixed(2)}/s needed vs ${fmtSigned(i.passiveSupplyPerSec, 2)}/s supply)` : ''}`).join(' · ');
          const outSummary = r.outputs.map(o => `${o.name}: ${Math.floor(o.stored)}/${o.cap} (+${o.perBatch}/batch)`).join(' · ');
          return `
            <div class="diag-recipe-card">
              <div class="diag-recipe-head">
                <strong>${r.name}</strong>
                <span class="diag-badge ${badgeClass}">${statusLabel}</span>
              </div>
              <div class="row-sub">${r.explanation}</div>
              <div class="diag-recipe-meta tabular">Inputs: ${inSummary}</div>
              <div class="diag-recipe-meta tabular">Outputs: ${outSummary}</div>
            </div>
          `;
        }).join('')
      : `<div class="diag-empty">Research Flint Toolmaking to unlock multi-step crafting chains.</div>`;

    const bodyEl = diagDialog.querySelector('#diagnostics-body');
    bodyEl.innerHTML = `
      <section class="diag-section">
        <div class="diag-section-head">
          <h3>${rd.name} (${rd.crafted ? 'Refined Good' : 'Raw Resource'})</h3>
          <span class="tabular">Stored: <strong>${Math.floor(rd.amount)} / ${rd.cap}</strong> (${Math.round(rd.fillRatio * 100)}%)</span>
        </div>
        <p class="helper-note">${timingNote}. Increase cap via: ${getCapExpansionSources(rd.id)}.</p>
        ${bottleneckRows}

        <div class="diag-grid-2">
          <div class="diag-card">
            <h4>Steady Passive Production &amp; Upkeep</h4>
            <div class="diag-group-label">Structures</div>
            ${buildingRows}
            <div class="diag-group-label">Workers</div>
            ${workerRows}
            <div class="diag-line diag-subtotal">
              <span>Gross Passive Production (${rd.multiplier.toFixed(2)}×)</span>
              <strong class="tabular rate-pos">+${rd.grossProduction.toFixed(2)}/s</strong>
            </div>
            <div class="diag-line">
              <span>Citizen Consumption ${rd.id === 'food' ? `(${pop.current} citizens × 0.50/s)` : '(Food only)'}</span>
              <strong class="tabular ${rd.citizenConsumption > 0 ? 'rate-neg' : ''}">-${rd.citizenConsumption.toFixed(2)}/s</strong>
            </div>
            <div class="diag-line diag-total">
              <span>Steady Net Rate (without crafting)</span>
              <strong class="tabular ${rd.passiveNet > 0 ? 'rate-pos' : rd.passiveNet < 0 ? 'rate-neg' : ''}">${fmtSigned(rd.passiveNet, 2)}/s</strong>
            </div>
            <div class="diag-mult-box">
              <span class="label-muted">Multipliers:</span> ${multRows}
            </div>
          </div>

          <div class="diag-card">
            <h4>Automatic Crafting Impact (Potential vs. Steady)</h4>
            <p class="helper-note">Auto-crafting runs in discrete batches when inputs and output storage allow.</p>
            <div class="diag-group-label">Potential Auto-Craft Output</div>
            ${craftOutRows}
            <div class="diag-group-label">Potential Auto-Craft Input Demand</div>
            ${craftInRows}
            <div class="diag-line diag-subtotal">
              <span>Max Potential Craft Net</span>
              <strong class="tabular">${fmtSigned(rd.potentialCraftOutput - rd.potentialCraftDemand, 2)}/s</strong>
            </div>
            <div class="diag-line diag-total">
              <span>Net Balance at Full Auto-Craft Speed</span>
              <strong class="tabular ${rd.netAfterPotentialCrafting > 0 ? 'rate-pos' : rd.netAfterPotentialCrafting < 0 ? 'rate-neg' : ''}">${fmtSigned(rd.netAfterPotentialCrafting, 2)}/s</strong>
            </div>
          </div>
        </div>
      </section>

      <section class="diag-section">
        <div class="diag-section-head">
          <h3>Auto-Crafting Chains &amp; Recipe Bottlenecks</h3>
          <span class="tabular">Artisans: ${diag.Population ? '' : ''}${state.jobs.artisan || 0} · Speed: ${diag.multipliers.craftSpeed.toFixed(2)}× (${((state.jobs.artisan || 0) * diag.multipliers.craftSpeed / 4).toFixed(2)} cycles/s)</span>
        </div>
        <div class="diag-recipe-list">${recipeCards}</div>
      </section>

      <section class="diag-section">
        <div class="diag-section-head">
          <h3>Population &amp; Settler Growth</h3>
          <span class="tabular">Pop: <strong>${pop.current}/${pop.max}</strong> · Idle: ${pop.idle} · Timer: ${pop.growthSeconds}/${pop.secondsRequired}s</span>
        </div>
        <p class="row-sub">${pop.explanation}</p>
      </section>
    `;
  }

  function renderReturnSummaryModal() {
    const bodyEl = returnDialog.querySelector('#return-summary-body');
    if (!lastReturnSummary) {
      bodyEl.innerHTML = `<p class="helper-note">No away session has been recorded yet in this session.</p>`;
      return;
    }

    const s = lastReturnSummary;
    const state = api.getState();
    const currentEraOrder = ERAS.find(e => e.id === state.era)?.order || 0;

    const visibleResRows = RESOURCES.filter(r => {
      const unlocked = (ERAS.find(e => e.id === r.unlockedAt)?.order || 0) <= currentEraOrder;
      const rs = s.resources?.[r.id];
      if (!rs) return false;
      return unlocked || Math.abs(rs.net) > 1e-6 || rs.gained > 1e-6 || rs.used > 1e-6 || rs.overflow > 1e-6;
    }).map(r => {
      const rs = s.resources[r.id];
      const netClass = rs.net > 0.05 ? 'rate-pos' : rs.net < -0.05 ? 'rate-neg' : '';
      const gainParts = [];
      if (rs.produced > 0.05) gainParts.push(`+${fmtAmount(rs.produced)} prod`);
      if (rs.craftedOut > 0.05) gainParts.push(`+${fmtAmount(rs.craftedOut)} crafted`);
      const spentParts = [];
      if (rs.consumed > 0.05) spentParts.push(`-${fmtAmount(rs.consumed)} upkeep`);
      if (rs.spentInCraft > 0.05) spentParts.push(`-${fmtAmount(rs.spentInCraft)} craft in`);

      return `
        <tr>
          <td><strong>${rs.name}</strong></td>
          <td class="tabular">${Math.floor(rs.before)} → <strong>${Math.floor(rs.after)}</strong> / ${rs.cap}</td>
          <td class="tabular ${netClass}"><strong>${rs.net >= 0 ? '+' : ''}${fmtAmount(rs.net)}</strong></td>
          <td class="tabular rate-pos">${gainParts.length ? gainParts.join(', ') : '0'}</td>
          <td class="tabular ${spentParts.length ? 'rate-neg' : ''}">${spentParts.length ? spentParts.join(', ') : '0'}</td>
          <td class="tabular">${rs.overflow > 0.05 ? `<span class="diag-overflow-tag">${fmtAmount(rs.overflow)} capped</span>` : '0'}</td>
        </tr>
      `;
    }).join('');

    const activeRecipes = (s.recipes || []).filter(r => r.enabled || r.batches > 0 || r.blockedByInput > 0 || r.blockedByOutput > 0);
    const recipeRows = activeRecipes.length > 0
      ? activeRecipes.map(r => {
          const outText = Object.entries(r.outputsProduced)
            .filter(([, amt]) => amt > 0)
            .map(([id, amt]) => `+${amt} ${RESOURCES.find(x => x.id === id)?.name || id}`)
            .join(', ') || '0 outputs';
          const inText = Object.entries(r.inputsSpent)
            .filter(([, amt]) => amt > 0)
            .map(([id, amt]) => `-${amt} ${RESOURCES.find(x => x.id === id)?.name || id}`)
            .join(', ') || '0 inputs';
          const notes = [];
          if (r.blockedByOutput > 0) notes.push(`Paused ${r.blockedByOutput} cycle(s) by full output storage`);
          if (r.blockedByInput > 0) notes.push(`Skipped ${r.blockedByInput} cycle(s) from missing inputs`);
          if (r.batches === 0 && notes.length === 0) notes.push('No full batch completed during this window');
          return `
            <div class="diag-recipe-card">
              <div class="diag-recipe-head">
                <strong>${r.name}</strong>
                <span class="tabular"><strong>${r.batches}</strong> batch${r.batches === 1 ? '' : 'es'} completed</span>
              </div>
              <div class="diag-recipe-meta tabular">Produced: ${outText} · Spent: ${inText}</div>
              ${notes.length ? `<div class="row-sub">${notes.join(' · ')}</div>` : ''}
            </div>
          `;
        }).join('')
      : `<div class="diag-empty">No automatic crafting recipes were active while you were away.</div>`;

    let popNote = 'Population remained steady.';
    if (s.popGained > 0) {
      popNote = `${s.popGained} new settler${s.popGained === 1 ? '' : 's'} joined (${s.popBefore} → ${s.popAfter}/${s.maxPop}).`;
    } else if (s.growthLimitReason === 'housing_full') {
      popNote = `Population stayed at ${s.popAfter}/${s.maxPop} (housing was full).`;
    } else if (s.growthLimitReason === 'negative_food_rate') {
      popNote = `Population stayed at ${s.popAfter}/${s.maxPop} (net Food production was not positive).`;
    } else if (s.growthLimitReason === 'low_food_stock') {
      popNote = `Population stayed at ${s.popAfter}/${s.maxPop} (stored Food was 15 or below).`;
    } else {
      popNote = `Population stayed at ${s.popAfter}/${s.maxPop} (growth timer at ${s.growthSeconds}/25s).`;
    }

    bodyEl.innerHTML = `
      <div class="diag-summary-banner">
        <div>
          <strong>Simulated Time: ${formatDuration(s.seconds)}</strong> (${s.seconds}s)
          ${s.capped ? `<span class="diag-badge diag-badge-warn">7-Day Offline Cap Reached</span>` : ''}
        </div>
        <p class="helper-note">These figures come directly from the simulation's tick-by-tick execution—accounting for storage caps, crafting batch order, and population growth—rather than linear rate estimates.</p>
      </div>

      <section class="diag-section">
        <h3>Actual Resource Gains, Spending &amp; Storage Overflow</h3>
        <div class="diag-table-wrap">
          <table class="diag-table">
            <thead>
              <tr>
                <th>Resource</th>
                <th>Stockpile</th>
                <th>Net Change</th>
                <th>Actual Gains</th>
                <th>Actual Spending</th>
                <th>Storage Overflow</th>
              </tr>
            </thead>
            <tbody>
              ${visibleResRows}
            </tbody>
          </table>
        </div>
      </section>

      <section class="diag-section">
        <h3>Completed Auto-Crafting Batches</h3>
        <div class="diag-recipe-list">${recipeRows}</div>
      </section>

      <section class="diag-section">
        <h3>Population &amp; Chronicle Status</h3>
        <p class="row-sub"><strong>Settlers:</strong> ${popNote}</p>
        ${s.activeEvent ? `<p class="row-sub"><strong>Chronicle Dilemma Waiting:</strong> "${s.activeEvent.title}" is ready for your decision on the main screen.</p>` : ''}
      </section>
    `;
  }

  function openDiagnostics(resId) {
    if (resId) selectedResId = resId;
    diagOpener = document.activeElement;
    document.body.classList.add('settings-open');
    if (!diagDialog.open) diagDialog.showModal();
    renderDiagnosticsModal();
  }

  function openReturnSummary() {
    if (!lastReturnSummary) return;
    summaryOpener = document.activeElement;
    document.body.classList.add('settings-open');
    if (!returnDialog.open) returnDialog.showModal();
    renderReturnSummaryModal();
  }

  function recordReturnSummary(summary, autoOpen = false) {
    if (!summary || summary.seconds < 5) return;
    lastReturnSummary = summary;
    const badge = document.getElementById('offline-badge');
    if (badge) {
      badge.textContent = `+${formatDuration(summary.seconds)} Offline · Summary`;
      badge.classList.remove('hidden');
      badge.setAttribute('role', 'button');
      badge.setAttribute('tabindex', '0');
      badge.setAttribute('title', 'View actual gains, crafting batches, and overflow from while you were away');
    }
    if (autoOpen) {
      openReturnSummary();
    }
  }

  // Click or keyboard activation on resource ledger cells opens diagnostics for that resource
  const ledger = document.getElementById('resource-ledger');
  if (ledger) {
    ledger.addEventListener('click', (e) => {
      const cell = e.target.closest('[data-res-cell]');
      if (!cell) return;
      openDiagnostics(cell.dataset.resCell);
    });
    ledger.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const cell = e.target.closest('[data-res-cell]');
      if (!cell) return;
      e.preventDefault();
      openDiagnostics(cell.dataset.resCell);
    });
  }

  const diagBtn = document.getElementById('btn-diagnostics');
  if (diagBtn) {
    diagBtn.addEventListener('click', () => openDiagnostics());
  }

  const offlineBadge = document.getElementById('offline-badge');
  if (offlineBadge) {
    offlineBadge.addEventListener('click', () => openReturnSummary());
    offlineBadge.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openReturnSummary();
      }
    });
  }

  return {
    openDiagnostics,
    openReturnSummary,
    recordReturnSummary,
    refresh() {
      if (diagDialog.open) renderDiagnosticsModal();
      if (returnDialog.open) renderReturnSummaryModal();
    }
  };
}
