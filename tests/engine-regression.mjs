import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
const main = scripts.sort((a, b) => b.length - a.length)[0];

class Component {
  constructor(props) {
    this.props = props || {};
    this.state = {};
  }
  setState(next) {
    this.state = typeof next === 'function' ? next(this.state) : next;
  }
}

const noop = () => {};
const context = vm.createContext({
  console,
  setTimeout,
  clearTimeout,
  URL: { createObjectURL: () => '', revokeObjectURL: noop },
  Blob: class Blob {},
  navigator: {},
  alert: noop,
  confirm: () => true,
  document: {
    getElementById: () => ({}),
    createElement: () => ({ style: {}, click: noop }),
    documentElement: { setAttribute: noop },
    body: { appendChild: noop, removeChild: noop }
  },
  window: { storage: null },
  React: {
    Component,
    Fragment: Symbol('Fragment'),
    createElement: () => ({}),
    useState: initial => [typeof initial === 'function' ? initial() : initial, noop],
    useEffect: noop,
    useMemo: fn => fn(),
    useRef: value => ({ current: value })
  },
  ReactDOM: { createRoot: () => ({ render: noop }) }
});
vm.runInContext(main, context, { filename: 'index.html', timeout: 10_000 });
const get = name => vm.runInContext(name, context);
const cloneDefault = () => vm.runInContext('JSON.parse(JSON.stringify(DEFAULT_STATE))', context);

// Months Ahead: the 12-month model must preserve the weekly baseline, apply workforce
// lifecycle timing, carry permanent volume changes forward, and keep seasonality month-only.
const makeMonthsAheadRows = get('makeMonthsAheadRows');
const nextCalendarMonthIso = get('nextCalendarMonthIso');
const averageCohortProductivity = get('averageCohortProductivity');
const computeMonthsAheadForecast = get('computeMonthsAheadForecast');
const buildFullScheduleForMonths = get('buildFullSchedule');
const computeAvailabilityForMonths = get('computeAvailability');
const monthRows = makeMonthsAheadRows();
assert.equal(monthRows.length, 12);
assert.ok(monthRows.every(row => row.seasonalityPct === 100), 'seasonality must default to a neutral 100%');
assert.ok(monthRows.every(row => row.shrinkagePct === null && row.callsOffered === null), 'monthly imports must start as optional blank assumptions');
assert.equal(nextCalendarMonthIso(new Date(2026, 6, 30, 12)), '2026-08', 'default month must use the local calendar rather than UTC month boundaries');
const firstMonthRamp = averageCohortProductivity(0, 0, '2026-08', 4, 8);
assert.ok(firstMonthRamp > 0 && firstMonthRamp < 0.1, 'a four-week training period should leave only a small end-of-month floor contribution');
assert.equal(averageCohortProductivity(0, 0, '2026-08', 100, 8), 0, 'hires must remain fully off-floor during training');
assert.equal(averageCohortProductivity(0, 6, '2026-08', 4, 8), 1, 'a completed cohort must reach full productivity');

const monthsState = cloneDefault();
monthsState.monthsAhead = {
  startMonth: '2026-08',
  trainingWeeks: 4,
  proficientWeeks: 8,
  rows: makeMonthsAheadRows()
};
monthsState.monthsAhead.rows[0].hires = 10;
monthsState.monthsAhead.rows[1].attrition = 2;
monthsState.monthsAhead.rows[2].manualIn = 3;
monthsState.monthsAhead.rows[3].manualOut = 1;
monthsState.monthsAhead.rows[4].volumeDelta = 500;
monthsState.monthsAhead.rows[5].seasonalityPct = 120;
const monthsSchedule = buildFullScheduleForMonths(monthsState);
const monthsAvailability = computeAvailabilityForMonths(monthsSchedule.grid, monthsState.agents);
const monthsForecast = computeMonthsAheadForecast(monthsState, monthsSchedule.grid, monthsAvailability);
assert.equal(monthsForecast.months.length, 12);
assert.equal(monthsForecast.months[0].staffHeadcount, 25, 'hires start at the beginning of their selected month');
assert.equal(monthsForecast.months[1].staffHeadcount, 23, 'monthly attrition must reduce projected headcount');
assert.equal(monthsForecast.months[2].staffHeadcount, 26, 'manual joins must enter as proficient headcount');
assert.equal(monthsForecast.months[3].staffHeadcount, 25, 'manual exits must reduce projected headcount');
assert.ok(monthsForecast.months[0].floorFTE < monthsForecast.months[0].staffHeadcount, 'training and proficiency ramp must separate floor FTE from payroll headcount');
assert.ok(Math.abs(monthsForecast.months[4].weeklyVolume - (monthsForecast.baselineWeeklyVolume + 500)) < 1e-6, 'volume step-change must start in the selected month');
assert.ok(Math.abs(monthsForecast.months[5].weeklyVolume - (monthsForecast.baselineWeeklyVolume + 500) * 1.2) < 1e-6, 'seasonality must multiply the month after permanent volume changes');
assert.ok(Math.abs(monthsForecast.months[6].weeklyVolume - (monthsForecast.baselineWeeklyVolume + 500)) < 1e-6, 'seasonality must not leak into following months');
assert.ok(monthsForecast.months.every(month => Number.isFinite(month.sl) && Number.isFinite(month.abandonPct)), 'every month needs a usable SLA and abandonment forecast');
const parseMonthsAheadXLSX = get('parseMonthsAheadXLSX');
const applyMonthlyResultsToPlan = get('applyMonthlyResultsToPlan');
const fakeMonthlyXLSX = {
  read: () => ({
    SheetNames: ['Monthly Export'],
    Sheets: { 'Monthly Export': {} }
  }),
  utils: {
    sheet_to_json: () => [{
      Month: 'July 2025',
      'Calls Offered': 31000,
      'Shrinkage %': 0.32
    }, {
      Month: 'August 2025',
      'Calls Offered': 37200,
      'Shrinkage %': 35
    }]
  },
  SSF: { parse_date_code: () => null }
};
const parsedMonthly = parseMonthsAheadXLSX(fakeMonthlyXLSX, new ArrayBuffer(0));
assert.deepEqual(Array.from(parsedMonthly, row => row.monthIso), ['2025-07', '2025-08']);
assert.equal(parsedMonthly[0].shrinkagePct, 32, 'decimal shrinkage percentages must import as percentage points');
const componentMonthlyXLSX = {
  read: fakeMonthlyXLSX.read,
  utils: {
    sheet_to_json: () => [{
      Month: 'June 2025',
      'Calls Offered': 30000,
      'hrinkage % (Div)': 0.1,
      'hrinkage % (Downtime)': 0.05,
      'hrinkage % (PL)': 0.04,
      'hrinkage % (UPL)': 0.03
    }]
  },
  SSF: fakeMonthlyXLSX.SSF
};
assert.equal(parseMonthsAheadXLSX(componentMonthlyXLSX, new ArrayBuffer(0))[0].shrinkagePct, 22, 'misspelled export component headers must provide a total shrinkage fallback');
const importedPlan = applyMonthlyResultsToPlan({
  startMonth: '2026-08',
  trainingWeeks: 4,
  proficientWeeks: 8,
  rows: makeMonthsAheadRows()
}, parsedMonthly);
assert.equal(importedPlan.rows[0].callsOffered, 37200, 'historical August calls must map to the forecast August row');
assert.equal(importedPlan.rows[0].shrinkagePct, 35, 'monthly shrinkage must map by calendar month');
assert.ok(importedPlan.rows[0].seasonalityPct > 100, 'above-average weekly call run-rate must produce a seasonal uplift');
assert.equal(importedPlan.rows[11].sourceMonth, '2025-07', 'calendar seasonality must repeat into the matching future month');

const shrinkageState = cloneDefault();
shrinkageState.monthsAhead = {
  startMonth: '2026-08',
  trainingWeeks: 4,
  proficientWeeks: 8,
  rows: makeMonthsAheadRows()
};
const shrinkageSchedule = buildFullScheduleForMonths(shrinkageState);
const shrinkageAvailability = computeAvailabilityForMonths(shrinkageSchedule.grid, shrinkageState.agents);
const baselineMonth = computeMonthsAheadForecast(shrinkageState, shrinkageSchedule.grid, shrinkageAvailability).months[0];
shrinkageState.monthsAhead.rows[0].shrinkagePct = 50;
const highShrinkageMonth = computeMonthsAheadForecast(shrinkageState, shrinkageSchedule.grid, shrinkageAvailability).months[0];
assert.ok(highShrinkageMonth.floorFTE < baselineMonth.floorFTE, 'higher monthly shrinkage must reduce productive floor capacity');
assert.ok(highShrinkageMonth.sl <= baselineMonth.sl, 'higher monthly shrinkage must not improve SLA');
const noStaffState = cloneDefault();
noStaffState.monthsAhead = {
  startMonth: '2026-08',
  trainingWeeks: 4,
  proficientWeeks: 8,
  rows: makeMonthsAheadRows()
};
noStaffState.monthsAhead.rows[0].manualOut = noStaffState.agents.length;
const noStaffSchedule = buildFullScheduleForMonths(noStaffState);
const noStaffAvailability = computeAvailabilityForMonths(noStaffSchedule.grid, noStaffState.agents);
const noStaffForecast = computeMonthsAheadForecast(noStaffState, noStaffSchedule.grid, noStaffAvailability);
assert.equal(noStaffForecast.months[0].staffHeadcount, 0);
assert.equal(noStaffForecast.months[0].abandonPct, 1, 'Erlang C abandonment overlay must forecast all offered calls abandoning when no staff remain');

const averageGrids = get('averageGrids');
const mkGrid = code => Array.from({ length: 7 }, () => [new Array(96).fill(code)]);
const mixed = averageGrids([mkGrid('work'), mkGrid('break')]);
const mixedCells = mixed[0][0];
assert.equal(mixedCells.filter(x => x === 'work').length, 48, '50% work must not round to 100%');
assert.equal(mixedCells.filter(x => x === 'break').length, 48, '50% break must be preserved across the day');
const halfPresent = averageGrids([mkGrid('work'), mkGrid('off')]);
assert.equal(halfPresent[0][0].filter(x => x === 'work').length, 48, '0.5 average staffing must remain 0.5 over time');

// Verint employee names must be removed before parser output or retained raw import text
// enters application state. Quoted names and repeated multi-day rows keep stable placeholders.
const redactVerintScheduleText = get('redactVerintScheduleText');
const parseVerintSchedule = get('parseVerintSchedule');
const startEndWithNames = [
  'Name,Start Date,27/07/2026,28/07/2026',
  '"Jane, Doe",27/07/2026,Standard 27/07/2026 9:00 AM-27/07/2026 5:00 PM,Standard 28/07/2026 9:00 AM-28/07/2026 5:00 PM',
  'John Smith,27/07/2026,Early 27/07/2026 8:00 AM-27/07/2026 4:00 PM,Early 28/07/2026 8:00 AM-28/07/2026 4:00 PM'
].join('\n');
const redactedStartEnd = redactVerintScheduleText(startEndWithNames);
assert.ok(!redactedStartEnd.includes('Jane'), 'quoted Verint names must not survive retained raw text');
assert.ok(!redactedStartEnd.includes('John Smith'), 'plain Verint names must not survive retained raw text');
assert.match(redactedStartEnd, /Verint-Import-01/);
assert.match(redactedStartEnd, /Verint-Import-02/);
const parsedRedactedStartEnd = parseVerintSchedule(startEndWithNames);
assert.deepEqual(Array.from(parsedRedactedStartEnd.agents, a => a.name), ['Verint-Import-01', 'Verint-Import-02']);
assert.equal(parsedRedactedStartEnd.shiftRecords.length, 4, 'start/end imports must expose one insight record per actual shift');

const activitiesWithNames = [
  'Name,Scheduled SP Draft Hours,Start Date,Scheduling Period,Before Overtime,After Overtime,Shift Assignment,Shift Events',
  '27/07/2026',
  'Jane Doe,,,,,,Standard 27/07/2026 9:00 AM-27/07/2026 5:00 PM,',
  '28/07/2026',
  'Jane Doe,,,,,,Standard 28/07/2026 9:00 AM-28/07/2026 5:00 PM,',
  'John Smith,,,,,,Early 28/07/2026 8:00 AM-28/07/2026 4:00 PM,'
].join('\n');
const redactedActivities = redactVerintScheduleText(activitiesWithNames);
assert.ok(!redactedActivities.includes('Jane Doe'), 'activity exports must redact repeated employee names');
assert.equal((redactedActivities.match(/Verint-Import-01/g) || []).length, 2, 'the same employee must keep one placeholder across date sections');
const parsedRedactedActivities = parseVerintSchedule(activitiesWithNames);
assert.deepEqual(Array.from(parsedRedactedActivities.agents, a => a.name), ['Verint-Import-01', 'Verint-Import-02']);
assert.equal(parsedRedactedActivities.shiftRecords.length, 3, 'activity imports must expose assignment records without counting shift events');

const computeLoadedRosterInsights = get('computeLoadedRosterInsights');
const multiWeekWeekendRoster = [
  'Name,Start Date,01/08/2026,02/08/2026,08/08/2026,09/08/2026',
  'Jane Doe,01/08/2026,Late 01/08/2026 12:00 PM-01/08/2026 8:00 PM,Late 02/08/2026 12:00 PM-02/08/2026 8:00 PM,Late 08/08/2026 12:00 PM-08/08/2026 8:00 PM,Late 09/08/2026 12:00 PM-09/08/2026 8:00 PM',
  'John Smith,01/08/2026,Day 01/08/2026 9:00 AM-01/08/2026 5:00 PM,Off,Day 08/08/2026 9:00 AM-08/08/2026 5:00 PM,Off'
].join('\n');
const parsedWeekendRoster = parseVerintSchedule(multiWeekWeekendRoster);
const weekendInsightState = cloneDefault();
weekendInsightState.agents = parsedWeekendRoster.agents;
weekendInsightState.importedSchedule = {
  rawText: redactVerintScheduleText(multiWeekWeekendRoster),
  grid: parsedWeekendRoster.grid,
  agentCount: parsedWeekendRoster.agents.length,
  agentIds: parsedWeekendRoster.agents.map(a => a.id),
  weeks: parsedWeekendRoster.weeks,
  selectedWeekIso: parsedWeekendRoster.selectedWeekIso
};
const weekendInsights = computeLoadedRosterInsights(weekendInsightState, '19:00', '00:00');
assert.equal(weekendInsights.sampleWeeks, 2, 'roster insights must analyse every loaded Verint week');
assert.equal(weekendInsights.employeeCount, 2);
assert.equal(weekendInsights.shiftCount, 6);
assert.ok(Math.abs(weekendInsights.saturday.avg - 52 / 12) < 1e-8, 'two sampled Saturdays per employee must normalise to 4.33/month');
assert.ok(Math.abs(weekendInsights.sunday.avg - 52 / 24) < 1e-8, 'one of two employees working Sunday must average 2.17/month');
assert.ok(Math.abs(weekendInsights.lateFinish.avg - 52 / 12) < 1e-8, 'actual 20:00 finishes across both weeks must feed the monthly average');
const finishFallsInWindow = get('finishFallsInWindow');
assert.equal(finishFallsInWindow(60, '19:00', '02:00'), true, 'finish windows may cross midnight');
assert.equal(finishFallsInWindow(360, '19:00', '02:00'), false, 'cross-midnight windows must exclude later morning finishes');

const anonymizeImportedScheduleState = get('anonymizeImportedScheduleState');
const legacyNamedState = cloneDefault();
legacyNamedState.agents = [{
  id: 'V001',
  name: 'Real Imported Name',
  shiftStart: '09:00',
  shiftEnd: '17:00',
  workDays: [0]
}, {
  id: 'A01',
  name: 'Scenario Hire',
  shiftStart: '09:00',
  shiftEnd: '17:00',
  workDays: [0],
  source: 'manual'
}];
legacyNamedState.importedSchedule = {
  grid: mkGrid('work'),
  agentCount: 1,
  agentIds: ['V001'],
  filename: 'Jane Doe schedule.csv',
  rawText: startEndWithNames
};
const anonymizedLegacyState = anonymizeImportedScheduleState(legacyNamedState);
assert.equal(anonymizedLegacyState.agents[0].name, 'Verint-Import-01', 'older saved imports must be anonymized on load');
assert.equal(anonymizedLegacyState.agents[1].name, 'Scenario Hire', 'scenario-added names must be preserved');
assert.ok(!anonymizedLegacyState.importedSchedule.rawText.includes('Jane'), 'older retained raw imports must be scrubbed on load');
assert.equal(anonymizedLegacyState.importedSchedule.filename, 'Verint schedule import', 'potentially identifying filenames must not be retained');

// Scenario-added staff must be layered onto an imported Verint grid and their ramp
// productivity must flow through as fractional effective capacity.
const importedPlusHire = cloneDefault();
importedPlusHire.config.includeBreaks = false;
importedPlusHire.config.includeLunch = false;
importedPlusHire.config.downtimePct = 0;
importedPlusHire.agents = [{
  id: 'V1',
  name: 'Verint agent',
  shiftStart: '09:00',
  shiftEnd: '10:00',
  workDays: [0],
  source: 'imported',
  productivityPct: 100
}, {
  id: 'M1',
  name: 'New starter',
  shiftStart: '09:00',
  shiftEnd: '10:00',
  workDays: [0],
  source: 'manual',
  productivityPct: 50
}];
const importedGrid = Array.from({ length: 7 }, (_, d) => {
  const row = new Array(96).fill('off');
  if (d === 0) for (let i = 36; i < 40; i++) row[i] = 'work';
  return [row];
});
importedPlusHire.importedSchedule = {
  grid: importedGrid,
  source: 'verint',
  agentCount: 1,
  agentIds: ['V1']
};
const buildFullSchedule = get('buildFullSchedule');
const computeAvailability = get('computeAvailability');
const combinedSchedule = buildFullSchedule(importedPlusHire);
assert.equal(combinedSchedule.grid[0].length, 2, 'manual hires must receive rows alongside the imported grid');
assert.equal(combinedSchedule.grid[0][1][36], 'work', 'manual hire roster must be generated on top of Verint');
const combinedAvailability = computeAvailability(combinedSchedule.grid, importedPlusHire.agents);
assert.equal(combinedAvailability[0][36], 1.5, '50% ramp productivity must contribute 0.5 effective agent to SLA');
importedPlusHire.agents[1].productivityPct = 100;
const fullRampAvailability = computeAvailability(combinedSchedule.grid, importedPlusHire.agents);
assert.equal(fullRampAvailability[0][36], 2, 'raising productivity must immediately raise effective SLA staffing');

const erlangA = get('erlangA');
const eaLo = erlangA(9.49, 30, 300, 90, 20, 900);
const eaHi = erlangA(9.50, 30, 300, 90, 20, 900);
assert.ok(eaHi.sl >= eaLo.sl, 'Erlang A must improve monotonically with staffing');
assert.ok(eaHi.sl - eaLo.sl < 0.005, 'Erlang A must not jump at half-agent boundaries');
const eaAnswered = erlangA(10, 40, 300, 1200, 30, 900);
assert.ok(Math.abs(eaAnswered.asa - 336.069246) < 0.01, 'Erlang A ASA must measure wait among answered contacts');
assert.ok(Math.abs(eaAnswered.avgWaitOffered - 303.585996) < 0.01, 'offered-contact queue time must remain available separately');

// An overloaded interval cannot be discarded or reset at the next quarter hour. This
// pattern previously reported about 2m09s because the 90-call spike was excluded; carrying
// its backlog through the quieter intervals produces the roughly 20-minute operational wait.
const computeSLA = get('computeSLA');
const computeDailyMetrics = get('computeDailyMetrics');
const queueConfig = cloneDefault().config;
queueConfig.deskStart = '07:00';
queueConfig.deskEnd = '09:15';
queueConfig.dayHours = { 1: 'closed', 2: 'closed', 3: 'closed', 4: 'closed', 5: 'closed', 6: 'closed' };
queueConfig.model = 'C';
queueConfig.ahtSec = 300;
queueConfig.downtimePct = 0;
const queueVolume = Array.from({ length: 7 }, () => new Array(96).fill(0));
const queueAvailability = Array.from({ length: 7 }, () => new Array(96).fill(0));
[90, 26, 26, 26, 26, 26, 26, 26, 26].forEach((calls, offset) => {
  queueVolume[0][28 + offset] = calls;
  queueAvailability[0][28 + offset] = 10;
});
const backlogSla = computeSLA(queueVolume, queueAvailability, queueConfig);
const backlogDay = computeDailyMetrics(backlogSla, queueConfig)[0];
assert.ok(backlogDay.asa > 1000 && backlogDay.asa < 1400, 'backlog carryover must forecast the reproduced scenario near 20 minutes');
assert.equal(backlogDay.unstableIntervals, 1, 'the overloaded spike must remain visible as a diagnostic interval');
assert.ok(backlogSla[0][29].backlogStart > 50, 'the next interval must inherit the spike queue');
assert.ok(Number.isFinite(backlogSla[0][28].asa), 'a transient overload with active agents must have a finite virtual wait');
const sustainedVolume = queueVolume.map(row => row.slice());
for (let i = 28; i < 37; i++) sustainedVolume[0][i] = 90;
const sustainedDay = computeDailyMetrics(computeSLA(sustainedVolume, queueAvailability, queueConfig), queueConfig)[0];
assert.ok(Number.isFinite(sustainedDay.asa) && sustainedDay.asa > 1000, 'an all-overloaded day must never collapse to a zero ASA');

const parseQueueAnalytics = get('parseQueueAnalytics');
const queueCsv = [
  'Queue Name,Date,Time,Volume (Absolute Act)',
  '"Customer Service, Tier 1",01/07/2026,07:00 AM,5'
].join('\n');
const parsedQueue = parseQueueAnalytics(queueCsv);
assert.equal(parsedQueue.intervals.length, 1, 'quoted commas must not shift Queue Analytics columns');
assert.equal(parsedQueue.intervals[0].volAct, 5);
assert.equal(parsedQueue.queueName, 'Customer Service, Tier 1');
const escapedQueue = parseQueueAnalytics([
  'Queue Name,Date,Time,Volume (Absolute Act)',
  '"Customer ""Care"", Tier 2",01/07/2026,07:15 AM,7'
].join('\n'));
assert.equal(escapedQueue.queueName, 'Customer "Care", Tier 2', 'escaped CSV quotes must round-trip');
assert.equal(escapedQueue.intervals[0].volAct, 7);
const answeredWeightedQueue = parseQueueAnalytics([
  'Queue Name,Date,Time,Volume (Absolute Act),Abandons (Absolute Act),Average Speed to Answer (Absolute Act)',
  'Queue,01/07/2026,07:00 AM,100,90,600',
  'Queue,01/07/2026,07:15 AM,100,0,60'
].join('\n'));
assert.ok(Math.abs(answeredWeightedQueue.dailyRollup[0].asaAct - 12000 / 110) < 1e-8, 'imported ASA must be weighted by answered rather than offered contacts');
assert.equal(answeredWeightedQueue.dailyRollup[0].answeredAct, 110);

const regenerateVolumeFromUI = get('regenerateVolumeFromUI');
const volumeState = cloneDefault();
volumeState.config.dayHours = { 5: 'closed', 6: 'closed' };
volumeState.volume = Array.from({ length: 7 }, () => new Array(96).fill(0));
volumeState.volumeUI = {
  source: 'builtin',
  quickInput: 'daily',
  dailyTotal: 600,
  shape: 'standard',
  profile: 'seven_day_flat',
  overrides: {}
};
const dailyAverageGrid = regenerateVolumeFromUI(volumeState);
const dailyAverageTotal = dailyAverageGrid.flat().reduce((a, b) => a + b, 0);
assert.ok(Math.abs(dailyAverageTotal - 3000) < 1e-8, '600 daily average across five open days must equal 3000 weekly');
volumeState.volumeUI.dailyTotal = 1;
const lowVolumeGrid = regenerateVolumeFromUI(volumeState);
assert.ok(lowVolumeGrid.flat().filter(v => v > 0).length > 5, 'low-volume forecasts must remain distributed fractional rates');
assert.ok(lowVolumeGrid.flat().some(v => v > 0 && v < 1), 'fractional expected calls must survive generation');
assert.ok(Math.abs(lowVolumeGrid.flat().reduce((a, b) => a + b, 0) - 5) < 1e-8, 'fractional generation must conserve the weekly total');

const generateRotation = get('generateRotation');
const rotationState = cloneDefault();
rotationState.agents = [0, 1].map(i => ({
  id: `A${i + 1}`,
  name: `Agent ${i + 1}`,
  shiftStart: '07:00',
  shiftEnd: '15:00',
  workDays: [0, 1, 2, 3, 4],
  rotationExempt: false
}));
rotationState.rotation = {
  cycleWeeks: 1,
  workDaysPerWeek: 5,
  seed: 7,
  bandStepMin: 30,
  fteWeeklyHours: 40,
  templates: [{ id: 'T1', name: 'Day', start: '07:00', bandLatest: '07:00', end: '15:00', evening: false, demand: [1, 0, 0, 0, 0, 0, 0] }],
  rules: { mode: 'daily', minEveningShiftsPerCycle: 0, maxWeekendDaysPerCycle: 0, noConsecutiveWeekends: false, minStartVarianceMin: 0, maxStartVarianceMin: 0 }
};
const fluidRotation = generateRotation(rotationState);
for (const agent of rotationState.agents) {
  assert.equal(fluidRotation.weeks[0].byAgent[agent.id].filter(t => t !== -1).length, 5, 'fluid mode must roster every contract day');
}

const bandState = cloneDefault();
bandState.agents = [{ id: 'A1', name: 'Agent 1', shiftStart: '07:00', shiftEnd: '09:00', workDays: [0], rotationExempt: false }];
bandState.volume = Array.from({ length: 7 }, () => new Array(96).fill(0));
bandState.volume[0][37] = 1; // 09:15: only a later band start covers this interval.
bandState.rotation = {
  cycleWeeks: 2,
  workDaysPerWeek: 1,
  seed: 3,
  bandStepMin: 30,
  fteWeeklyHours: 40,
  templates: [{ id: 'T1', name: 'Band', start: '07:00', bandLatest: '08:00', end: '09:00', evening: false, demand: [1, 0, 0, 0, 0, 0, 0] }],
  rules: { mode: 'weekBlock', fixedTemplateAcrossCycle: false, minEveningShiftsPerCycle: 0, maxWeekendDaysPerCycle: 0, noConsecutiveWeekends: false, minStartVarianceMin: 0, maxStartVarianceMin: 0 }
};
const bandRotation = generateRotation(bandState);
const firstOffset = bandRotation.weeks[0].offsetByAgent.A1[0];
const secondOffset = bandRotation.weeks[1].offsetByAgent.A1[0];
assert.ok(firstOffset > 0, 'the forecast should select a later start inside the band');
assert.equal(secondOffset, firstOffset, 'each cycle week must optimize against a fresh coverage grid');

const sevenDayState = cloneDefault();
sevenDayState.agents = [{ id: 'A1', name: 'Agent 1', shiftStart: '07:00', shiftEnd: '15:00', workDays: [0], rotationExempt: false }];
sevenDayState.rotation = {
  cycleWeeks: 1,
  workDaysPerWeek: 7,
  seed: 1,
  bandStepMin: 30,
  fteWeeklyHours: 40,
  templates: [{ id: 'T1', name: 'Seven day', start: '07:00', bandLatest: '07:00', end: '15:00', evening: false, demand: [1, 0, 0, 0, 0, 0, 0] }],
  rules: { mode: 'weekBlock', minEveningShiftsPerCycle: 0, maxWeekendDaysPerCycle: 0, noConsecutiveWeekends: false, minStartVarianceMin: 0, maxStartVarianceMin: 0 }
};
const sevenDayRotation = generateRotation(sevenDayState);
assert.equal(sevenDayRotation.weeks[0].byAgent.A1.filter(t => t !== -1).length, 7, 'week-block mode must support six/seven-day contracts');

const saveState = get('saveState');
context.window.storage = { set: () => Promise.reject(new Error('quota exceeded')) };
await assert.rejects(saveState({ name: 'large scenario' }), /quota exceeded/, 'scenario save errors must reach the UI');
context.window.storage = null;

assert.match(main, /JSON\.stringify\(state\.config\.dayHours \|\| \{\}\)/, 'per-day desk hours must trigger volume regeneration');
assert.match(main, /Scenario auto-save failed:/, 'the app must render a visible persistence warning');

console.log('engine regression checks passed');
