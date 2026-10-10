// The quest screen: quests pinned to a board as notices, each with its
// progress, beside the player's record of wins and losses. Data comes from
// progress.js; this file only builds the screen.

import { CLASSES, classArt } from './cards.js';
import { esc } from './cardview.js';
import { artHTML } from './pixelart.js';
import { loadProgress, questStatus, winRate } from './progress.js';
import { loadUnlocks, isVisible } from './unlocks.js';
import { rewardText } from './rewards.js';

const SEEN_KEY = 'riftclash-quests-seen';

/** Completed quests the player hasn't looked at on the quest screen yet. */
export function unseenCompleted(progress = loadProgress()) {
  let seen = [];
  try { seen = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]'); } catch { /* storage unavailable */ }
  return questStatus(progress).filter(q => q.done && !seen.includes(q.id));
}

function markSeen(progress) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(questStatus(progress).filter(q => q.done).map(q => q.id))); } catch { /* ignore */ }
}

const dateText = ms => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** One quest as a pinned notice. Also used on the game-over screen (compact). */
export function questNoticeHTML(q, { fresh = false, compact = false } = {}) {
  const pct = Math.round(q.value / q.goal * 100);
  return `
    <article class="q-note${q.done ? ' done' : ''}${fresh ? ' fresh' : ''}${compact ? ' compact' : ''}" aria-label="${esc(q.title)}: ${q.done ? 'complete' : `${q.value} of ${q.goal}`}">
      ${compact ? '' : '<span class="q-pin" aria-hidden="true"></span>'}
      <h3>${esc(q.title)}</h3>
      <p class="q-text">${esc(q.text)}</p>
      <div class="q-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${q.goal}" aria-valuenow="${q.value}">
        <span style="width:${pct}%"></span>
      </div>
      <p class="q-count">${q.value} / ${q.goal}</p>
      ${rewardText(q) ? `<p class="q-reward">${rewardText(q)}</p>` : ''}
      ${q.done ? `<span class="q-stamp">Complete${q.completedAt && !compact ? `<small>${dateText(q.completedAt)}</small>` : ''}</span>` : ''}
    </article>`;
}

/**
 * Build the quest screen inside `root` and return a function that shows it
 * with fresh data.
 * @param {HTMLElement} root
 * @param {{ onBack: () => void }} opts
 */
export function mountQuests(root, { onBack }) {
  root.innerHTML = '<div class="lib-wrap q-wrap"></div>';
  const wrap = root.firstElementChild;
  root.addEventListener('click', e => { if (e.target.closest('[data-act="menu"]')) onBack(); });

  function render() {
    const progress = loadProgress();
    const quests = questStatus(progress);
    const fresh = new Set(unseenCompleted(progress).map(q => q.id));
    const s = progress.stats;
    const rate = winRate(s);
    const unlocks = loadUnlocks();
    const classes = Object.entries(CLASSES).filter(([cls]) => s.byClass[cls]?.played && isVisible(cls, unlocks));
    wrap.innerHTML = `
      <header class="lib-head">
        <button class="btn lib-back" data-act="menu" type="button">← Menu</button>
        <h2>Quest Board</h2>
        <span class="lib-count">${quests.filter(q => q.done).length} / ${quests.length} complete</span>
      </header>
      <div class="q-layout">
        <section class="q-board" aria-label="Quests">
          ${quests.map(q => questNoticeHTML(q, { fresh: fresh.has(q.id) })).join('')}
        </section>
        <aside class="q-ledger" aria-label="Your record">
          <h3>Adventurer's Record</h3>
          ${s.played ? `
            <dl class="q-stats">
              <div><dt>Games</dt><dd>${s.played}</dd></div>
              <div><dt>Wins</dt><dd class="w">${s.wins}</dd></div>
              <div><dt>Losses</dt><dd class="l">${s.losses}</dd></div>
              <div><dt>Draws</dt><dd>${s.draws}</dd></div>
              <div><dt>Win rate</dt><dd>${rate}%</dd></div>
              <div><dt>Best streak</dt><dd>${s.bestStreak}</dd></div>
            </dl>
            <table class="q-classes">
              <thead><tr><th>Champion</th><th>W</th><th>L</th><th>Win %</th></tr></thead>
              <tbody>
                ${classes.map(([cls, c]) => {
                  const r = s.byClass[cls];
                  return `<tr style="--cls:${c.color}">
                    <td><span class="q-portrait">${artHTML(classArt(cls))}</span>${c.name}</td>
                    <td>${r.wins}</td><td>${r.losses}</td><td>${winRate(r)}%</td></tr>`;
                }).join('')}
              </tbody>
            </table>`
            : '<p class="q-empty">No battles yet. Your record will be written here after your first game.</p>'}
        </aside>
      </div>`;
    markSeen(progress);
  }

  return render;
}
