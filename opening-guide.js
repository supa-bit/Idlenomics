import { RESOURCES, BUILDINGS, JOBS, CRAFT_RECIPES, TECHS } from './data.js';

export const OPENING_MILESTONES = [
  {
    id: 'gather_vital_stores',
    stepNum: 1,
    badge: 'MILESTONE 1 OF 7',
    title: 'Gather Vital Stores',
    goalText: 'Reach 30 Food and 26 Wood via manual foraging or steady gathering.',
    whyText: 'A winter buffer of Food (> 15) and Wood prepares your camp for its first timber construction and keeps settlers arriving.',
    hint: 'Tap "Forage Roots" and "Gather Deadwood" in Manual Gathering.',
    tab: 'tab-settlement',
    selector: 'button[data-gather="forage_food"]',
    actionLabel: 'Go to Manual Gathering',
    reward: { food: 10, wood: 10, hide: 2 },
    rewardText: '+10 Food, +10 Wood, +2 Hide (Hearth cache)',
    logMsg: 'First stores secured! The clan cached +10 Food, +10 Wood, and +2 Hide.',
    check(state) {
      return (state.resources?.food || 0) >= 30 && (state.resources?.wood || 0) >= 26;
    },
    progress(state) {
      const f = Math.min(30, Math.floor(state.resources?.food || 0));
      const w = Math.min(26, Math.floor(state.resources?.wood || 0));
      return {
        current: f + w,
        target: 56,
        label: `Food: ${f}/30 · Wood: ${w}/26`
      };
    }
  },
  {
    id: 'assign_idle_labor',
    stepNum: 2,
    badge: 'MILESTONE 2 OF 7',
    title: 'Put Idle Hands to Work',
    goalText: 'Assign all 3 starting citizens to jobs (e.g., +1 Woodcutter & +1 Stonecutter alongside your Farmer).',
    whyText: 'Workers gather Wood, Stone, and Food automatically every second—both live and while you are away.',
    hint: 'Tap "+1" beside Woodcutter and Stonecutter in Population & Labor.',
    tab: 'tab-settlement',
    selector: 'button[data-job-add="woodcutter"]',
    actionLabel: 'Assign Workers',
    reward: { stone: 12, wood: 10 },
    rewardText: '+12 Stone, +10 Wood (Organized labor bonus)',
    logMsg: 'All starting citizens assigned to labor! Earned +12 Stone and +10 Wood.',
    check(state) {
      const assigned = Object.values(state.jobs || {}).reduce((a, b) => a + b, 0);
      return assigned >= 3;
    },
    progress(state) {
      const assigned = Math.min(3, Object.values(state.jobs || {}).reduce((a, b) => a + b, 0));
      return {
        current: assigned,
        target: 3,
        label: `Assigned Workers: ${assigned}/3`
      };
    }
  },
  {
    id: 'build_first_structure',
    stepNum: 3,
    badge: 'MILESTONE 3 OF 7',
    title: 'Raise Your First Camp Structure',
    goalText: 'Construct a Hide Shelter, Forager Camp, or Timber Yard in Structures & Storage.',
    whyText: 'Structures provide permanent passive income, raise storage caps, or expand housing for new settlers.',
    hint: 'Build a Forager Camp (20 Wood, 10 Stone) for +0.8 Food/s & +0.15 Hide/s, or a Hide Shelter (15 Wood, 4 Hide).',
    tab: 'tab-settlement',
    selector: '#building-list',
    actionLabel: 'View Structures',
    reward: { food: 18, wood: 15 },
    rewardText: '+18 Food, +15 Wood (Founding feast)',
    logMsg: 'First permanent camp structure raised! Celebrated with +18 Food and +15 Wood.',
    check(state) {
      const totalB = Object.values(state.buildings || {}).reduce((a, b) => a + b, 0);
      return totalB >= 1;
    },
    progress(state) {
      const totalB = Math.min(1, Object.values(state.buildings || {}).reduce((a, b) => a + b, 0));
      return {
        current: totalB,
        target: 1,
        label: `Structures Built: ${totalB}/1`
      };
    }
  },
  {
    id: 'research_oral_tradition',
    stepNum: 4,
    badge: 'MILESTONE 4 OF 7',
    title: 'Kindle Oral Tradition',
    goalText: 'Open the Craft & Tech tab and research "Oral Tradition" (35 Food, 25 Wood).',
    whyText: 'Unlocks Science, the "Study Sky" action in Manual Gathering, and the Elder / Scribe job.',
    hint: 'Switch to the Craft & Tech tab and tap Research on Oral Tradition.',
    tab: 'tab-craft',
    selector: 'button[data-tech="oral_tradition"]',
    actionLabel: 'Open Craft & Tech',
    reward: { science: 12, stone: 15 },
    rewardText: '+12 Science, +15 Stone (Elder wisdom)',
    logMsg: 'Oral Tradition kindled! Star lore recorded (+12 Science, +15 Stone).',
    check(state) {
      return Array.isArray(state.techs) && state.techs.includes('oral_tradition');
    },
    progress(state) {
      const done = Array.isArray(state.techs) && state.techs.includes('oral_tradition');
      if (done) return { current: 1, target: 1, label: 'Oral Tradition Researched' };
      const f = Math.min(35, Math.floor(state.resources?.food || 0));
      const w = Math.min(25, Math.floor(state.resources?.wood || 0));
      return {
        current: f + w,
        target: 60,
        label: `Food: ${f}/35 · Wood: ${w}/25`
      };
    }
  },
  {
    id: 'unlock_science_production',
    stepNum: 5,
    badge: 'MILESTONE 5 OF 7',
    title: 'Unlock Steady Science & Hides',
    goalText: 'Assign an Elder / Scribe (or Study Sky) to reach 20 Science and research Snare Trapping or Flint Toolmaking.',
    whyText: 'Elders generate passive Science/s while Trappers provide the steady Hide needed for Tool crafting.',
    hint: 'Assign +1 Elder / Scribe in Settlement or tap "Study Sky", then research Snare Trapping (20 Science, 40 Wood) or Flint Toolmaking.',
    tab: 'tab-craft',
    selector: '#tech-list',
    actionLabel: 'View Technologies',
    reward: { hide: 8, stone: 25, wood: 20 },
    rewardText: '+8 Hide, +25 Stone, +20 Wood (Workshop stockpile)',
    logMsg: 'Early Stone Age scholarship established! Stockpiled +8 Hide, +25 Stone, and +20 Wood.',
    check(state) {
      const techs = state.techs || [];
      return techs.includes('hunting_traps') || techs.includes('toolmaking');
    },
    progress(state) {
      const techs = state.techs || [];
      if (techs.includes('hunting_traps') || techs.includes('toolmaking')) {
        return { current: 1, target: 1, label: 'Second Breakthrough Mastered' };
      }
      const sci = Math.min(20, Math.floor(state.resources?.science || 0));
      return {
        current: sci,
        target: 20,
        label: `Science: ${sci}/20 toward next tech`
      };
    }
  },
  {
    id: 'master_toolmaking_and_craft',
    stepNum: 6,
    badge: 'MILESTONE 6 OF 7',
    title: 'Forge Your First Primitive Tools',
    goalText: 'Research Flint Toolmaking and craft your first batch of Tools (or enable Auto-Craft with an Artisan).',
    whyText: 'Flint Toolmaking permanently boosts manual gathering by +50% and unlocks Tools for advanced structures and the Bronze Age.',
    hint: 'Research Flint Toolmaking (35 Science, 45 Stone, 10 Hide), then tap Craft on Knap Primitive Tools.',
    tab: 'tab-craft',
    selector: '#craft-list',
    actionLabel: 'Open Crafting Chains',
    reward: { tools: 4, science: 25, food: 30 },
    rewardText: '+4 Tools, +25 Science, +30 Food (Artisan breakthrough)',
    logMsg: 'First Primitive Tools forged! Gained +4 Tools, +25 Science, and +30 Food.',
    check(state) {
      const hasTech = Array.isArray(state.techs) && state.techs.includes('toolmaking');
      const hasTools = (state.resources?.tools || 0) >= 2 || Boolean(state.autoCraft?.craft_tools);
      return hasTech && hasTools;
    },
    progress(state) {
      const hasTech = Array.isArray(state.techs) && state.techs.includes('toolmaking');
      const tools = Math.min(2, Math.floor(state.resources?.tools || 0));
      return {
        current: (hasTech ? 1 : 0) + (tools >= 2 ? 1 : 0),
        target: 2,
        label: `${hasTech ? 'Toolmaking ✓' : 'Research Flint Toolmaking'} · Tools: ${tools}/2`
      };
    }
  },
  {
    id: 'prepare_bronze_horizon',
    stepNum: 7,
    badge: 'MILESTONE 7 OF 7',
    title: 'Build Kiln Pottery & Granary Reserves',
    goalText: 'Research Kiln Pottery (50 Science, 60 Stone, 60 Wood) or expand your settlement to 5+ total structures.',
    whyText: 'Prepares your storage caps and pottery kilns for the "Dawn of the Bronze Age" epoch milestone.',
    hint: 'Research Kiln Pottery in Craft & Tech or build additional Camps, Timber Yards, and Shelters.',
    tab: 'tab-craft',
    selector: 'button[data-tech="pottery"]',
    actionLabel: 'Prepare for Bronze Age',
    reward: { science: 40, tools: 4, food: 45 },
    rewardText: '+40 Science, +4 Tools, +45 Food (Dawn of Bronze tribute)',
    logMsg: 'Stone Age Foundation complete! Received +40 Science, +4 Tools, and +45 Food toward the Dawn of the Bronze Age.',
    check(state) {
      const hasPottery = Array.isArray(state.techs) && state.techs.includes('pottery');
      const totalB = Object.values(state.buildings || {}).reduce((a, b) => a + b, 0);
      return hasPottery || totalB >= 5 || state.era !== 'stone';
    },
    progress(state) {
      const hasPottery = Array.isArray(state.techs) && state.techs.includes('pottery');
      const totalB = Math.min(5, Object.values(state.buildings || {}).reduce((a, b) => a + b, 0));
      if (hasPottery || state.era !== 'stone') return { current: 5, target: 5, label: 'Kiln Pottery Mastered' };
      return {
        current: totalB,
        target: 5,
        label: `Research Kiln Pottery OR Structures: ${totalB}/5`
      };
    }
  }
];

export function getVisibleResources(state, allResources = RESOURCES, getEraOrderFn) {
  const eraOrder = getEraOrderFn ? getEraOrderFn(state.era) : 0;
  const techs = state.techs || [];
  const buildings = state.buildings || {};

  return allResources.filter((r) => {
    const rOrder = getEraOrderFn ? getEraOrderFn(r.unlockedAt) : 0;
    if (rOrder > eraOrder) return false;
    if (state.era !== 'stone') return true;

    // Progressive disclosure in the Stone Age so new players aren't overwhelmed by 0/cap cells
    const val = state.resources?.[r.id] || 0;
    if (r.id === 'food' || r.id === 'wood' || r.id === 'stone') return true;
    if (r.id === 'hide') {
      return val > 0 || (buildings.forager_hut || 0) > 0 || (buildings.hide_tent || 0) > 0 || techs.includes('hunting_traps') || techs.includes('toolmaking');
    }
    if (r.id === 'science') {
      return val > 0 || techs.includes('oral_tradition') || techs.length > 0;
    }
    if (r.id === 'tools') {
      return val > 0 || techs.includes('toolmaking');
    }
    return true;
  });
}

export function evaluateOpeningSession(state, caps, addLogFn, spawnFeedbackFn) {
  if (!Array.isArray(state.claimedMilestones)) {
    state.claimedMilestones = [];
  }

  // If loaded save is already past Stone Age, mark all opening milestones claimed without spamming rewards
  if (state.era && state.era !== 'stone' && state.claimedMilestones.length === 0) {
    state.claimedMilestones = OPENING_MILESTONES.map(m => m.id);
    return { newlyClaimed: [], allDone: true, activeMilestone: null, completedCount: OPENING_MILESTONES.length, totalCount: OPENING_MILESTONES.length };
  }

  const newlyClaimed = [];
  for (const m of OPENING_MILESTONES) {
    if (state.claimedMilestones.includes(m.id)) continue;
    if (m.check(state)) {
      state.claimedMilestones.push(m.id);
      if (m.reward && caps) {
        for (const [resId, amt] of Object.entries(m.reward)) {
          const cap = caps[resId] || 9999;
          state.resources[resId] = Math.min(cap, (state.resources[resId] || 0) + amt);
        }
      }
      if (addLogFn && m.logMsg) {
        addLogFn(`MILESTONE: ${m.logMsg}`);
      }
      newlyClaimed.push(m);
    }
  }

  const activeMilestone = OPENING_MILESTONES.find(m => !state.claimedMilestones.includes(m.id)) || null;
  const completedCount = state.claimedMilestones.length;
  const totalCount = OPENING_MILESTONES.length;
  const allDone = completedCount >= totalCount;

  if (newlyClaimed.length > 0 && spawnFeedbackFn) {
    const bannerEl = document.getElementById('opening-arc-card') || document.getElementById('top-bar');
    const last = newlyClaimed[newlyClaimed.length - 1];
    spawnFeedbackFn(bannerEl, `✓ ${last.title}: ${last.rewardText}`, 'ochre');
  }

  return {
    newlyClaimed,
    allDone,
    activeMilestone,
    completedCount,
    totalCount
  };
}
