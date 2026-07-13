/**
 * build-tables-reference.js
 *
 * Generates a self-contained HTML reference of every crit/fumble table.
 * For each result it renders:  Roll range | Result text | Effect actually applied
 *
 * The "Effect Applied" column mirrors the real logic in
 * src/services/EffectsManager.ts so you can compare the flavor text of a result
 * against what the module will mechanically do — and spot mismatches.
 *
 * Run:  node scripts/build-tables-reference.js
 * Out:  tables-reference.html  (module root)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'tables', 'source');
const OUT = path.join(ROOT, 'tables-reference.html');
const MODULE_ID = 'dorman-lakelys-crit-fumble-tables';

const TIERS = [
  { key: 'tier1', label: 'Tier 1 — Novice (Levels 1–4)' },
  { key: 'tier2', label: 'Tier 2 — Competent (Levels 5–8)' },
  { key: 'tier3', label: 'Tier 3 — Experienced (Levels 9–12)' },
  { key: 'tier4', label: 'Tier 4 — Legendary (Levels 13–20)' }
];

const TABLE_FILES = [
  { file: 'melee-crits.json', label: 'Melee Critical Hits', kind: 'crit' },
  { file: 'melee-fumbles.json', label: 'Melee Fumbles', kind: 'fumble' },
  { file: 'ranged-crits.json', label: 'Ranged Critical Hits', kind: 'crit' },
  { file: 'ranged-fumbles.json', label: 'Ranged Fumbles', kind: 'fumble' },
  { file: 'spell-crits.json', label: 'Spell Critical Hits', kind: 'crit' },
  { file: 'spell-fumbles.json', label: 'Spell Fumbles', kind: 'fumble' }
];

// Authoritative list from EffectsManager.isStandardCondition()
const STANDARD_CONDITIONS = new Set([
  'blinded', 'charmed', 'deafened', 'frightened', 'grappled', 'incapacitated',
  'invisible', 'paralyzed', 'petrified', 'poisoned', 'prone', 'restrained',
  'stunned', 'unconscious', 'exhaustion'
]);

const SCOPE_LABELS = {
  all: 'All Rolls',
  'attack.all': 'All Attacks',
  'attack.mwak': 'Melee Attacks',
  'attack.rwak': 'Ranged Attacks',
  'attack.msak': 'Melee Spell Attacks',
  'attack.rsak': 'Ranged Spell Attacks',
  'ability.all': 'All Ability Checks',
  'ability.str': 'STR Checks', 'ability.dex': 'DEX Checks', 'ability.con': 'CON Checks',
  'ability.int': 'INT Checks', 'ability.wis': 'WIS Checks', 'ability.cha': 'CHA Checks',
  'save.all': 'All Saves',
  'save.str': 'STR Saves', 'save.dex': 'DEX Saves', 'save.con': 'CON Saves',
  'save.int': 'INT Saves', 'save.wis': 'WIS Saves', 'save.cha': 'CHA Saves',
  concentration: 'Concentration'
};

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function scopeText(scope) {
  const arr = Array.isArray(scope) ? scope : [scope];
  return arr.map(s => SCOPE_LABELS[s] || s || '?').join(', ');
}

function durationText(d) {
  if (d === -1) return 'permanent (until healed)';
  if (d === 0 || d === undefined) return d === 0 ? 'until end of turn' : '';
  return `${d} round${d > 1 ? 's' : ''}`;
}

// Describe how a damage formula resolves at runtime (weapon/spell die syntax)
function damageFormulaText(cfg) {
  const f = cfg.damageFormula || '';
  const wb = f.match(/^(\d+)WB$/i);
  if (wb) return `${wb[1]} × full weapon base dice (e.g. 2d6 for a greatsword) — for triple/quadruple damage`;
  const sb = f.match(/^(\d+)SB$/i);
  if (sb) return `${sb[1]} × full spell base dice`;
  const w = f.match(/^(\d+)W$/i);
  if (w) return `${w[1]} × weapon damage die (e.g. ${w[1]}d8 for a longsword)`;
  const s = f.match(/^(\d+)S$/i);
  if (s) return `${s[1]} × spell damage die (e.g. ${s[1]}d10 for fire bolt)`;
  return f;
}

/**
 * Produce { html, issues[] } describing what the module actually applies,
 * mirroring EffectsManager.applyResult().
 */
function describeEffect(result) {
  const cfg = (result.flags && result.flags[MODULE_ID]) || {};
  const type = cfg.effectType || 'none';
  const issues = [];
  let html = '';

  const text = (result.text || '').toLowerCase();
  const mentionsDamage = /\bdamage\b|\btakes?\s+\d|\bextra\s+\d/.test(text);
  // dice explicitly named in the flavor text, e.g. "1d4 extra damage"
  const textDice = (result.text || '').match(/\b\d+d\d+\b/i);

  switch (type) {
    case 'none': {
      html = '<span class="eff none">No mechanical effect (damage as normal)</span>';
      if (mentionsDamage && !/as normal|no additional|no effect/.test(text)) {
        issues.push('Text mentions damage but effectType is "none".');
      }
      break;
    }

    case 'condition': {
      const c = cfg.effectCondition || '';
      const standard = STANDARD_CONDITIONS.has(c.toLowerCase());
      const label = c.charAt(0).toUpperCase() + c.slice(1).replace(/_/g, ' ');
      if (standard) {
        html = `<span class="eff cond ok">Condition: <b>${esc(label)}</b></span>` +
          ` <span class="dur">${esc(durationText(cfg.duration))}</span>` +
          ` <span class="via">via status effect</span>`;
      } else {
        html = `<span class="eff cond custom">Custom AE: <b>${esc(label)}</b></span>` +
          ` <span class="dur">${esc(durationText(cfg.duration))}</span>` +
          ` <span class="via">label only — no <code>changes</code></span>`;
        issues.push(
          `"${c}" is not a standard D&D 5e condition. It creates an Active Effect ` +
          `with a name but no mechanical changes, so nothing is actually enforced.`
        );
      }
      break;
    }

    case 'damage': {
      const dtype = cfg.damageType || 'bludgeoning';
      html = `<span class="eff dmg">Damage: <b>${esc(cfg.damageFormula || '?')}</b>` +
        ` ${esc(dtype)}</span> <span class="via">${esc(damageFormulaText(cfg))}</span>`;
      if (!cfg.damageFormula) issues.push('Damage effect has no damageFormula — nothing applies.');
      if (textDice && /^\d+[WS]$/i.test(cfg.damageFormula || '')) {
        issues.push(
          `Text says "${textDice[0]}" but formula is "${cfg.damageFormula}" ` +
          `(resolves to the weapon/spell die, which may differ from ${textDice[0]}).`
        );
      }
      break;
    }

    case 'save': {
      const dc = cfg.saveDC;
      const ab = cfg.saveAbility;
      const parts = [];
      if (cfg.effectCondition) parts.push(`condition <b>${esc(cfg.effectCondition)}</b>`);
      if (cfg.damageFormula) parts.push(`<b>${esc(cfg.damageFormula)}</b> ${esc(cfg.damageType || '')}`);
      html = `<span class="eff save">Save DC ${esc(dc ?? '?')} ${esc((ab || '?').toUpperCase())}</span>` +
        (parts.length ? ` → on fail: ${parts.join(' + ')}` : '');
      if (!dc || !ab) {
        issues.push('Save effect missing saveDC or saveAbility — handleSaveEffect() returns early, nothing applies.');
      } else if (!cfg.effectCondition && !cfg.damageFormula) {
        issues.push('Save effect has neither a condition nor damage to apply on failure.');
      }
      break;
    }

    case 'disarm': {
      html = '<span class="eff disarm">Disarm: unequip attacker\'s weapon</span>';
      break;
    }

    case 'attackAlly': {
      html =
        '<span class="eff disarm">Attack ally: the fumbler is forced to attack their nearest ally</span>';
      break;
    }

    case 'penalty': {
      const pt = cfg.penaltyType === 'ac' ? 'AC' : 'attack';
      html = `<span class="eff penalty">Penalty: <b>${esc(cfg.penaltyValue)}</b> to ${pt}</span>` +
        ` <span class="dur">${esc(durationText(cfg.duration))}</span>`;
      if (cfg.penaltyValue === undefined || !cfg.penaltyType) {
        issues.push('Penalty missing penaltyType or penaltyValue — nothing applies.');
      }
      break;
    }

    case 'advantage':
    case 'disadvantage': {
      const label = type === 'advantage' ? 'Advantage' : 'Disadvantage';
      const grants = cfg.advantageTarget === 'grants';
      html = `<span class="eff adv ${type}">${label}${grants ? ' (grants to attackers)' : ''}: ` +
        `${esc(scopeText(cfg.advantageScope))}</span> <span class="dur">${esc(durationText(cfg.duration))}</span>`;
      if (!cfg.advantageScope) {
        issues.push(`${label} effect has no advantageScope — applyAdvantageDisadvantage() returns early, nothing applies.`);
      }
      break;
    }

    default:
      html = `<span class="eff unknown">Unknown effectType: ${esc(type)}</span>`;
      issues.push(`Unknown effectType "${type}" — no handler in EffectsManager.`);
  }

  return { html, issues, type };
}

function renderTable(tableData, meta) {
  const rows = (tableData.results || [])
    .slice()
    .sort((a, b) => (a.range?.[0] ?? 0) - (b.range?.[0] ?? 0))
    .map(r => {
      const { html, issues, type } = describeEffect(r);
      const [lo, hi] = r.range || [];
      const roll = lo === hi ? `${lo}` : `${lo}–${hi}`;
      const issueHtml = issues.length
        ? `<div class="issues">${issues.map(i => `<div class="issue">⚠ ${esc(i)}</div>`).join('')}</div>`
        : '';
      return `
        <tr class="row-${esc(type)}${issues.length ? ' has-issue' : ''}">
          <td class="roll">${esc(roll)}</td>
          <td class="result">${esc(r.text || r.name || '')}</td>
          <td class="effect">${html}${issueHtml}</td>
        </tr>`;
    })
    .join('');

  return `
    <section class="table-block" data-kind="${meta.kind}">
      <h3>${esc(tableData.name || meta.label)}</h3>
      <p class="tbl-desc">${esc(tableData.description || '')}</p>
      <table>
        <thead>
          <tr><th class="roll">Roll</th><th class="result">Result</th><th class="effect">Effect Applied / Damage</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`;
}

// ---- Build ----
let totalIssues = 0;
let totalCustomConds = 0;
const customCondSet = new Set();
const tierSections = [];

for (const tier of TIERS) {
  const tierDir = path.join(SRC, tier.key);
  if (!fs.existsSync(tierDir)) continue;

  const groups = { crit: [], fumble: [] };
  for (const t of TABLE_FILES) {
    const fp = path.join(tierDir, t.file);
    if (!fs.existsSync(fp)) continue;
    const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
    // tally issues
    for (const r of data.results || []) {
      const { issues } = describeEffect(r);
      totalIssues += issues.length;
      const cfg = (r.flags && r.flags[MODULE_ID]) || {};
      if (cfg.effectType === 'condition' && !STANDARD_CONDITIONS.has((cfg.effectCondition || '').toLowerCase())) {
        totalCustomConds++;
        customCondSet.add(cfg.effectCondition);
      }
    }
    groups[t.kind].push(renderTable(data, t));
  }

  tierSections.push(`
    <div class="tier" id="${tier.key}">
      <h2>${esc(tier.label)}</h2>
      <div class="columns">
        <div class="col"><h4 class="col-head crit-head">Critical Hits</h4>${groups.crit.join('')}</div>
        <div class="col"><h4 class="col-head fumble-head">Fumbles</h4>${groups.fumble.join('')}</div>
      </div>
    </div>`);
}

const nav = TIERS.map(t => `<a href="#${t.key}">${esc(t.label.split(' — ')[0])}</a>`).join('');

const customCondList = [...customCondSet].sort().map(c => `<code>${esc(c)}</code>`).join(', ');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Crit &amp; Fumble Tables — Effect Reference</title>
<style>
  :root {
    --bg: #1a1720; --panel: #241f2e; --panel2: #2c2637; --text: #ece7f2;
    --muted: #a99fb8; --line: #3a3348; --crit: #d4a017; --fumble: #c0392b;
    --ok: #3fb950; --custom: #e0a52b; --warn: #ff8f5e; --accent: #9b7bd4;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text);
    font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  header { padding: 24px 28px; border-bottom: 1px solid var(--line); background: var(--panel);
    position: sticky; top: 0; z-index: 10; }
  header h1 { margin: 0 0 6px; font-size: 22px; }
  header .sub { color: var(--muted); font-size: 14px; }
  nav { margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap; }
  nav a { color: var(--accent); text-decoration: none; border: 1px solid var(--line);
    padding: 4px 10px; border-radius: 6px; font-size: 13px; }
  nav a:hover { background: var(--panel2); }
  .summary { margin: 20px 28px; padding: 16px 20px; background: var(--panel);
    border: 1px solid var(--line); border-left: 4px solid var(--warn); border-radius: 8px; }
  .summary h2 { margin: 0 0 8px; font-size: 16px; }
  .summary p { margin: 6px 0; color: var(--muted); font-size: 14px; }
  .summary code { background: var(--panel2); padding: 1px 6px; border-radius: 4px; color: var(--custom); }
  .legend { display: flex; gap: 16px; flex-wrap: wrap; margin: 8px 28px 0; font-size: 13px; color: var(--muted); }
  .legend span { display: inline-flex; align-items: center; gap: 6px; }
  .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
  .controls { margin: 14px 28px; }
  .controls label { font-size: 13px; color: var(--muted); cursor: pointer; user-select: none; }
  .tier { padding: 8px 28px 28px; }
  .tier > h2 { font-size: 20px; border-bottom: 2px solid var(--accent); padding-bottom: 6px; }
  .columns { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  @media (max-width: 1100px) { .columns { grid-template-columns: 1fr; } }
  .col-head { margin: 8px 0; font-size: 15px; text-transform: uppercase; letter-spacing: .5px; }
  .crit-head { color: var(--crit); }
  .fumble-head { color: var(--fumble); }
  .table-block { margin-bottom: 22px; background: var(--panel); border: 1px solid var(--line);
    border-radius: 8px; overflow: hidden; }
  .table-block h3 { margin: 0; padding: 10px 14px; font-size: 14px; background: var(--panel2); }
  .tbl-desc { margin: 0; padding: 8px 14px; font-size: 12px; color: var(--muted);
    border-bottom: 1px solid var(--line); }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 8px 12px; vertical-align: top; font-size: 13px;
    border-bottom: 1px solid var(--line); }
  th { color: var(--muted); font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: .5px; }
  td.roll, th.roll { width: 52px; white-space: nowrap; font-variant-numeric: tabular-nums; color: var(--accent); font-weight: 600; }
  td.result { width: 42%; }
  tr.has-issue { background: rgba(255,143,94,0.06); }
  .eff { font-weight: 600; }
  .eff.none { color: var(--muted); font-weight: 400; }
  .eff.cond.ok { color: var(--ok); }
  .eff.cond.custom { color: var(--custom); }
  .eff.dmg { color: #f2a86b; }
  .eff.save { color: #6bb8f2; }
  .eff.disarm { color: #d98cc9; }
  .eff.penalty { color: #e08b6b; }
  .eff.adv.advantage { color: var(--ok); }
  .eff.adv.disadvantage { color: var(--fumble); }
  .via { color: var(--muted); font-weight: 400; font-size: 12px; display: block; }
  .dur { color: var(--muted); font-weight: 400; font-size: 12px; }
  code { font-family: ui-monospace, Menlo, monospace; font-size: 12px; }
  .issues { margin-top: 6px; }
  .issue { color: var(--warn); font-size: 12px; font-weight: 400; margin-top: 2px; }
  body.hide-ok tr:not(.has-issue) { display: none; }
  footer { padding: 20px 28px; color: var(--muted); font-size: 12px; border-top: 1px solid var(--line); }
</style>
</head>
<body>
<header>
  <h1>Critical Hit &amp; Fumble Tables — Effect Reference</h1>
  <div class="sub">Roll → Result → what the module <em>actually</em> applies (from result flags, mirroring EffectsManager). Generated by <code>scripts/build-tables-reference.js</code>.</div>
  <nav>${nav}</nav>
  <div class="legend">
    <span><i class="dot" style="background:var(--ok)"></i> applies mechanically</span>
    <span><i class="dot" style="background:var(--custom)"></i> custom label only (no mechanics)</span>
    <span><i class="dot" style="background:var(--warn)"></i> potential issue flagged</span>
  </div>
</header>

<div class="summary">
  <h2>Diagnostics summary</h2>
  <p><b>${totalIssues}</b> potential issues flagged across all tables (see ⚠ rows below).</p>
  <p><b>${totalCustomConds}</b> results use non-standard "custom" conditions that only create a
  cosmetic Active Effect (a name, no <code>changes</code>) — so they are <em>not</em> mechanically enforced:</p>
  <p>${customCondList}</p>
  <p>Standard conditions that DO apply via Foundry status effects: <code>blinded</code>, <code>frightened</code>, <code>incapacitated</code>, <code>paralyzed</code>, <code>prone</code>, <code>restrained</code>, <code>stunned</code>.</p>
</div>

<div class="controls">
  <label><input type="checkbox" id="toggle-issues"> Show only rows with flagged issues</label>
</div>

${tierSections.join('')}

<footer>
  Regenerate with <code>node scripts/build-tables-reference.js</code>. This file is derived from
  <code>tables/source/**</code> and reflects the current effect flags, not the flavor text.
</footer>

<script>
  document.getElementById('toggle-issues').addEventListener('change', e => {
    document.body.classList.toggle('hide-ok', e.target.checked);
  });
</script>
</body>
</html>`;

fs.writeFileSync(OUT, html, 'utf8');
console.log(`Wrote ${OUT}`);
console.log(`  ${totalIssues} issues flagged, ${totalCustomConds} custom-condition results.`);
