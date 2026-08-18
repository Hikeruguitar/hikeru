"use strict";

/* =========================================================
   KIKUtab Ver.0.1
   - 4/4 fixed / max 2 measures
   - sequential input
   - dot / tie / slur / triplet / quintuplet
   - automatic beams
   - localStorage: score + BPM only
========================================================= */

const CONFIG = {
  beatsPerMeasure: { n: 4, d: 1 },
  storageKey: "kikutab.ver0.1.score",
  tutorialKey: "kikutab.ver0.1.hideTutorial",
  legacyStorageKey: "hikeru.ver0.1.score",
  legacyTutorialKey: "hikeru.ver0.1.hideTutorial",
  storageVersion: 16,
  scheduleIntervalMs: 25,
  scheduleAheadSeconds: 0.14,
  playbackToneHz: 440
};

const EPSILON = 0.000001;

const DURATIONS = {
  whole: { beats: { n: 4, d: 1 }, vex: "w" },
  half: { beats: { n: 2, d: 1 }, vex: "h" },
  quarter: { beats: { n: 1, d: 1 }, vex: "q" },
  eighth: { beats: { n: 1, d: 2 }, vex: "8" },
  sixteenth: { beats: { n: 1, d: 4 }, vex: "16" }
};

const GHOST_DURATIONS = [
  { beats: { n: 4, d: 1 }, vex: "w" },
  { beats: { n: 2, d: 1 }, vex: "h" },
  { beats: { n: 1, d: 1 }, vex: "q" },
  { beats: { n: 1, d: 2 }, vex: "8" },
  { beats: { n: 1, d: 4 }, vex: "16" },
  { beats: { n: 1, d: 8 }, vex: "32" }
];

const SOUND_MODES = ["synth", "kick", "snare", "hihat"];

const SYMBOL_NAMES = {
  dot: "付点",
  tie: "タイ",
  slur: "スラー",
  triplet: "3連符",
  quintuplet: "5連符"
};

const state = {
  score: {
    measures: [[], []],
    relations: {
      ties: [],
      slurs: [],
      tuplets: []
    }
  },

  bpm: 120,
  metronome: true,
  loop: false,
  speed: 1,
  soundMode: "kick",

  history: [],
  future: [],

  activeInputTab: "notes",
  activeReferenceFilter: "all",
  activeReferenceItemId: null,

  editorOpen: false,

  symbolMode: null,
  symbolSelection: []
};

const playback = {
  audioContext: null,
  schedulerTimer: null,
  rafId: null,

  scheduledNodes: new Set(),
  scheduledClicks: new Set(),

  active: false,
  paused: false,

  phase: "idle",

  snapshot: null,

  bpm: 120,
  speed: 1,
  soundMode: "kick",

  secondsPerBeat: 0.5,

  anchorAudioTime: 0,
  anchorBeat: 0,
  pausedBeat: 0,

  nextEventIndex: 0,
  nextMetronomeBeat: 0,
  countInNextBeat: 0,

  pendingPartialEvent: null,

  visualSync: true,
  autoScroll: true,

  activeItemId: null
};

const audioAssets = {
  noiseBuffer: null
};

const layoutById = new Map();
const vexNoteById = new Map();

let idCounter = 0;
let toastTimer = null;
let referenceAuditionTimer = null;
let fretInputRevealTimer = null;
let activeScoreEditItemId = null;
let storageWarningShown = false;

const dom = {
  bpm: document.getElementById("bpm"),
  bpmDown: document.getElementById("bpm-down"),
  bpmUp: document.getElementById("bpm-up"),

  metronome:
    document.getElementById("metronome-toggle"),

  soundMode:
    document.getElementById("sound-mode"),

  editorView:
    document.getElementById("editor-view"),

  referenceView:
    document.getElementById("reference-view"),

  viewTabs:
    [...document.querySelectorAll(".view-tab")],

  openReference:
    document.getElementById("open-reference"),

  backEditor:
    document.getElementById("back-editor"),

  scorePanel:
    document.getElementById("score-panel"),

  scoreScroll:
    document.getElementById("score-scroll"),

  scoreRender:
    document.getElementById("score-render"),

  scoreHitLayer:
    document.getElementById("score-hit-layer"),

  measureStatus:
    document.getElementById("measure-status"),

  inputEditToggle:
    document.getElementById("input-edit-toggle"),

  inputEditLabel:
    document.getElementById("input-edit-label"),

  editorTray:
    document.getElementById("editor-tray"),

  finishEdit:
    document.getElementById("finish-edit"),

  inputTabs:
    [...document.querySelectorAll(".input-tab")],

  palettes:
    [...document.querySelectorAll(".palette")],

  notationButtons:
    [...document.querySelectorAll(".notation-button")],

  symbolButtons:
    [
      ...document.querySelectorAll(
        ".notation-button[data-symbol]"
      )
    ],

  modeHelp:
    document.getElementById("mode-help"),

  undo:
    document.getElementById("undo"),

  redo:
    document.getElementById("redo"),

  clearScore:
    document.getElementById("clear-score"),

  playToggle:
    document.getElementById("play-toggle"),

  playIcon:
    document.getElementById("play-icon"),

  playLabel:
    document.getElementById("play-label"),

  restart:
    document.getElementById("restart"),

  loopToggle:
    document.getElementById("loop-toggle"),

  speedButtons:
    [...document.querySelectorAll("[data-speed]")],

  referenceGrid:
    document.getElementById("reference-grid"),

  referenceFilters:
    [...document.querySelectorAll(".reference-filter")],

  referenceDetailDialog:
    document.getElementById(
      "reference-detail-dialog"
    ),

  referenceDetailCategory:
    document.getElementById(
      "reference-detail-category"
    ),

  referenceDetailClose:
    document.getElementById(
      "reference-detail-close"
    ),

  referenceDetailPreview:
    document.getElementById(
      "reference-detail-preview"
    ),

  referenceDetailName:
    document.getElementById(
      "reference-detail-name"
    ),

  referenceDetailValue:
    document.getElementById(
      "reference-detail-value"
    ),

  referenceDetailSummary:
    document.getElementById(
      "reference-detail-summary"
    ),

  referenceDetailStandard:
    document.getElementById(
      "reference-detail-standard"
    ),

  referenceDetailTabLabel:
    document.getElementById(
      "reference-detail-tab-label"
    ),

  referenceDetailTabRhythm:
    document.getElementById(
      "reference-detail-tab-rhythm"
    ),

  referenceDetailTip:
    document.getElementById(
      "reference-detail-tip"
    ),

  referenceDetailPlay:
    document.getElementById(
      "reference-detail-play"
    ),

  referenceDetailTimingHeading:
    document.querySelector(
      ".reference-detail-compare .reference-detail-block:nth-child(2) > strong"
    ),

  referenceDetailTimingEyebrow:
    document.querySelector(
      ".reference-detail-compare .reference-detail-block:nth-child(2) .reference-detail-label"
    ),

  toast:
    document.getElementById("toast"),

  helpButton:
    document.getElementById("help-button"),

  tutorialDialog:
    document.getElementById("tutorial-dialog"),

  tutorialClose:
    document.getElementById("tutorial-close"),

  tutorialHide:
    document.getElementById("tutorial-hide"),

  tutorialStart:
    document.getElementById("tutorial-start"),

  clearDialog:
    document.getElementById("clear-dialog"),

  clearCancel:
    document.getElementById("clear-cancel"),

  clearConfirm:
    document.getElementById("clear-confirm")
};


/* =========================================================
   FRACTIONS
========================================================= */

function gcd(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);

  while (b) {
    [a, b] = [b, a % b];
  }

  return a || 1;
}


function frac(n, d = 1) {
  if (d === 0) {
    throw new Error(
      "Fraction denominator cannot be zero."
    );
  }

  const sign = d < 0 ? -1 : 1;

  n *= sign;
  d = Math.abs(d);

  const g = gcd(n, d);

  return {
    n: n / g,
    d: d / g
  };
}


function fAdd(a, b) {
  return frac(
    a.n * b.d + b.n * a.d,
    a.d * b.d
  );
}


function fSub(a, b) {
  return frac(
    a.n * b.d - b.n * a.d,
    a.d * b.d
  );
}


function fCmp(a, b) {
  return a.n * b.d - b.n * a.d;
}


function fEq(a, b) {
  return fCmp(a, b) === 0;
}


function fToNumber(value) {
  return value.n / value.d;
}


function zero() {
  return {
    n: 0,
    d: 1
  };
}


/* =========================================================
   SCORE DATA
========================================================= */

function makeId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  idCounter += 1;

  return `kikutab-${Date.now()}-${idCounter}`;
}


function cloneScore(score = state.score) {
  return JSON.parse(
    JSON.stringify(score)
  );
}


function flattenScoreItems(
  score = state.score
) {
  const result = [];

  let globalIndex = 0;

  score.measures.forEach(
    (measure, measureIndex) => {

      measure.forEach(
        (item, index) => {

          result.push({
            item,
            id: item.id,
            measureIndex,
            index,
            globalIndex
          });

          globalIndex += 1;
        }
      );
    }
  );

  return result;
}


function findItemLocation(
  itemId,
  score = state.score
) {
  return (
    flattenScoreItems(score)
      .find(
        entry =>
          entry.id === itemId
      )
    || null
  );
}


function itemBeats(item) {
  const duration =
    DURATIONS[item.duration];

  if (!duration) {
    throw new Error(
      `Unknown duration: ${item.duration}`
    );
  }

  let value = frac(
    duration.beats.n,
    duration.beats.d
  );

  if (item.modifiers?.dotted) {
    value = frac(
      value.n * 3,
      value.d * 2
    );
  }

  const tuplet =
    item.relations?.tuplet;

  if (
    tuplet
    &&
    Number.isFinite(
      tuplet.numNotes
    )
    &&
    Number.isFinite(
      tuplet.notesOccupied
    )
    &&
    tuplet.numNotes > 0
    &&
    tuplet.notesOccupied > 0
  ) {
    value = frac(
      value.n
        * tuplet.notesOccupied,
      value.d
        * tuplet.numNotes
    );
  }

  return value;
}


function measureBeatsForScore(
  score,
  index
) {
  return score.measures[index]
    .reduce(
      (total, item) =>
        fAdd(
          total,
          itemBeats(item)
        ),
      zero()
    );
}


function measureBeats(index) {
  return measureBeatsForScore(
    state.score,
    index
  );
}


function remainingBeats(index) {
  return fSub(
    CONFIG.beatsPerMeasure,
    measureBeats(index)
  );
}


function formatFraction(value) {
  if (value.d === 1) {
    return String(value.n);
  }

  const whole =
    Math.trunc(
      value.n / value.d
    );

  const remainder =
    Math.abs(
      value.n % value.d
    );

  if (whole === 0) {
    return `${remainder}/${value.d}`;
  }

  if (remainder === 0) {
    return String(whole);
  }

  return (
    `${whole} `
    + `${remainder}/${value.d}`
  );
}


function relinkTupletMetadata(score) {
  score.measures
    .flat()
    .forEach(item => {

      item.relations =
        item.relations || {
          tie: null,
          slurs: [],
          tuplet: null
        };

      item.relations.tuplet =
        null;
    });

  const byId =
    new Map(
      flattenScoreItems(score)
        .map(
          entry => [
            entry.id,
            entry.item
          ]
        )
    );

  score.relations.tuplets
    .forEach(relation => {

      relation.itemIds
        .forEach(itemId => {

          const item =
            byId.get(itemId);

          if (!item) {
            return;
          }

          item.relations.tuplet = {
            groupId: relation.id,
            type: relation.type,
            numNotes:
              relation.numNotes,
            notesOccupied:
              relation.notesOccupied
          };
        });
    });
}


function reflowScore(score) {
  const items =
    score.measures.flat();

  const measures = [
    [],
    []
  ];

  let measureIndex = 0;
  let used = zero();

  for (const item of items) {
    const beats =
      itemBeats(item);

    if (
      fCmp(
        beats,
        CONFIG.beatsPerMeasure
      ) > 0
    ) {
      return false;
    }

    if (
      fEq(
        used,
        CONFIG.beatsPerMeasure
      )
    ) {
      measureIndex += 1;
      used = zero();
    }

    if (measureIndex > 1) {
      return false;
    }

    const next =
      fAdd(
        used,
        beats
      );

    if (
      fCmp(
        next,
        CONFIG.beatsPerMeasure
      ) > 0
    ) {
      return false;
    }

    measures[measureIndex]
      .push(item);

    used = next;
  }

  score.measures =
    measures;

  return true;
}


function isScoreTimingValid(score) {
  const first =
    measureBeatsForScore(
      score,
      0
    );

  const second =
    measureBeatsForScore(
      score,
      1
    );

  if (
    fCmp(
      first,
      CONFIG.beatsPerMeasure
    ) > 0
  ) {
    return false;
  }

  if (
    fCmp(
      second,
      CONFIG.beatsPerMeasure
    ) > 0
  ) {
    return false;
  }

  if (
    score.measures[1].length > 0
    &&
    !fEq(
      first,
      CONFIG.beatsPerMeasure
    )
  ) {
    return false;
  }

  return true;
}


function currentMeasureIndex() {
  if (
    fCmp(
      measureBeats(0),
      CONFIG.beatsPerMeasure
    ) < 0
  ) {
    return 0;
  }

  if (
    fCmp(
      measureBeats(1),
      CONFIG.beatsPerMeasure
    ) < 0
  ) {
    return 1;
  }

  return -1;
}


function areIdsConsecutive(
  ids,
  score
) {
  const flat =
    flattenScoreItems(score);

  const indexById =
    new Map(
      flat.map(
        entry => [
          entry.id,
          entry.globalIndex
        ]
      )
    );

  const positions =
    ids.map(
      id => indexById.get(id)
    );

  if (
    positions.some(
      index =>
        index === undefined
    )
  ) {
    return false;
  }

  for (
    let i = 1;
    i < positions.length;
    i += 1
  ) {
    if (
      positions[i]
      !==
      positions[0] + i
    ) {
      return false;
    }
  }

  return true;
}


/* =========================================================
   RELATION SANITIZE
========================================================= */

function sanitizeRelations(score) {
  const flat =
    flattenScoreItems(score);

  const byId =
    new Map(
      flat.map(
        entry => [
          entry.id,
          entry
        ]
      )
    );

  const tupletUsedIds =
    new Set();

  const cleanTuplets = [];

  const tupletKeys =
    new Set();

  for (
    const relation
    of score.relations.tuplets || []
  ) {
    if (
      !relation
      ||
      ![
        "triplet",
        "quintuplet"
      ].includes(relation.type)
    ) {
      continue;
    }

    const numNotes =
      relation.type === "triplet"
        ? 3
        : 5;

    const notesOccupied =
      relation.type === "triplet"
        ? 2
        : 4;

    if (
      !Array.isArray(
        relation.itemIds
      )
      ||
      relation.itemIds.length
        !== numNotes
    ) {
      continue;
    }

    if (
      new Set(
        relation.itemIds
      ).size !== numNotes
    ) {
      continue;
    }

    if (
      !relation.itemIds.every(
        id => byId.has(id)
      )
    ) {
      continue;
    }

    if (
      !areIdsConsecutive(
        relation.itemIds,
        score
      )
    ) {
      continue;
    }

    if (
      relation.itemIds.some(
        id =>
          tupletUsedIds.has(id)
      )
    ) {
      continue;
    }

    const items =
      relation.itemIds.map(
        id =>
          byId.get(id).item
      );

    if (
      items.some(
        item =>
          item.kind !== "note"
          ||
          item.modifiers?.dotted
      )
    ) {
      continue;
    }

    if (
      items.some(
        item =>
          item.duration
          !== items[0].duration
      )
    ) {
      continue;
    }

    const key =
      `${relation.type}:`
      + relation.itemIds.join("|");

    if (
      tupletKeys.has(key)
    ) {
      continue;
    }

    tupletKeys.add(key);

    const normalized = {
      id:
        typeof relation.id
          === "string"
        &&
        relation.id
          ? relation.id
          : makeId(),

      type:
        relation.type,

      itemIds:
        [...relation.itemIds],

      numNotes,

      notesOccupied
    };

    cleanTuplets
      .push(normalized);

    normalized.itemIds
      .forEach(
        id =>
          tupletUsedIds.add(id)
      );
  }

  score.relations.tuplets =
    cleanTuplets;

  relinkTupletMetadata(score);

  if (
    !reflowScore(score)
    ||
    !isScoreTimingValid(score)
  ) {
    return false;
  }

  let canonicalFlat =
    flattenScoreItems(score);

  let canonicalById =
    new Map(
      canonicalFlat.map(
        entry => [
          entry.id,
          entry
        ]
      )
    );

  score.relations.tuplets =
    score.relations.tuplets
      .filter(relation => {

        const locations =
          relation.itemIds
            .map(
              id =>
                canonicalById
                  .get(id)
            )
            .filter(Boolean);

        return (
          locations.length
            ===
            relation.itemIds.length
          &&
          locations.every(
            location =>
              location.measureIndex
              ===
              locations[0]
                .measureIndex
          )
        );
      });

  relinkTupletMetadata(score);

  if (
    !reflowScore(score)
    ||
    !isScoreTimingValid(score)
  ) {
    return false;
  }

  canonicalFlat =
    flattenScoreItems(score);

  canonicalById =
    new Map(
      canonicalFlat.map(
        entry => [
          entry.id,
          entry
        ]
      )
    );

  const cleanTies = [];
  const tieKeys = new Set();
  const outgoing = new Set();
  const incoming = new Set();

  for (
    const relation
    of score.relations.ties || []
  ) {
    if (
      !relation
      ||
      typeof relation.fromId
        !== "string"
      ||
      typeof relation.toId
        !== "string"
    ) {
      continue;
    }

    const from =
      findItemLocation(
        relation.fromId,
        score
      );

    const to =
      findItemLocation(
        relation.toId,
        score
      );

    if (
      !from
      ||
      !to
      ||
      from.item.kind
        !== "note"
      ||
      to.item.kind
        !== "note"
    ) {
      continue;
    }

    if (
      to.globalIndex
      !==
      from.globalIndex + 1
    ) {
      continue;
    }

    if (
      outgoing.has(
        relation.fromId
      )
      ||
      incoming.has(
        relation.toId
      )
    ) {
      continue;
    }

    const key =
      `${relation.fromId}|`
      + relation.toId;

    if (
      tieKeys.has(key)
    ) {
      continue;
    }

    tieKeys.add(key);
    outgoing.add(
      relation.fromId
    );
    incoming.add(
      relation.toId
    );

    cleanTies.push({
      id:
        typeof relation.id
          === "string"
        &&
        relation.id
          ? relation.id
          : makeId(),

      fromId:
        relation.fromId,

      toId:
        relation.toId
    });
  }

  const cleanSlurs = [];
  const slurKeys = new Set();

  for (
    const relation
    of score.relations.slurs || []
  ) {
    if (
      !relation
      ||
      !Array.isArray(
        relation.itemIds
      )
      ||
      relation.itemIds.length < 2
    ) {
      continue;
    }

    if (
      !relation.itemIds.every(
        id =>
          canonicalById.has(id)
      )
    ) {
      continue;
    }

    if (
      !areIdsConsecutive(
        relation.itemIds,
        score
      )
    ) {
      continue;
    }

    const locations =
      relation.itemIds.map(
        id =>
          canonicalById.get(id)
      );

    if (
      !locations.every(
        location =>
          location.measureIndex
          ===
          locations[0]
            .measureIndex
      )
    ) {
      continue;
    }

    if (
      locations.some(
        location =>
          location.item.kind
          !== "note"
      )
    ) {
      continue;
    }

    const key =
      relation.itemIds
        .join("|");

    if (
      slurKeys.has(key)
    ) {
      continue;
    }

    slurKeys.add(key);

    cleanSlurs.push({
      id:
        typeof relation.id
          === "string"
        &&
        relation.id
          ? relation.id
          : makeId(),

      itemIds:
        [...relation.itemIds]
    });
  }

  score.relations.ties =
    cleanTies;

  score.relations.slurs =
    cleanSlurs;

  return true;
}


/* =========================================================
   SCORE MUTATION
========================================================= */

function prepareScoreMutation() {
  if (
    playback.active
    ||
    playback.paused
  ) {
    restartPlaybackPosition();
  }

  stopReferenceAudition();
}


function commitScoreMutation(
  before,
  successMessage
) {
  state.history.push(before);

  if (
    state.history.length > 100
  ) {
    state.history.shift();
  }

  state.future = [];

  saveState();
  refresh();

  if (successMessage) {
    showToast(successMessage);
  }
}


/* =========================================================
   STORAGE
========================================================= */

function durationFromLegacyBeats(
  beats
) {
  const table = {
    "4": "whole",
    "2": "half",
    "1": "quarter",
    "0.5": "eighth",
    "0.25": "sixteenth"
  };

  return (
    table[
      String(
        Number(beats)
      )
    ]
    || null
  );
}


function normalizeScore(candidate) {
  if (
    !candidate
    ||
    !Array.isArray(
      candidate.measures
    )
    ||
    candidate.measures.length !== 2
  ) {
    return null;
  }

  const measures =
    candidate.measures.map(
      measure => {

        if (
          !Array.isArray(
            measure
          )
        ) {
          return null;
        }

        const normalized =
          measure.map(
            normalizeItem
          );

        return normalized
          .every(Boolean)
            ? normalized
            : null;
      }
    );

  if (
    measures.some(
      measure => !measure
    )
  ) {
    return null;
  }

  const score = {
    measures,

    relations: {
      ties:
        Array.isArray(
          candidate.relations
            ?.ties
        )
          ? candidate.relations
              .ties
              .map(
                relation => ({
                  ...relation
                })
              )
          : [],

      slurs:
        Array.isArray(
          candidate.relations
            ?.slurs
        )
          ? candidate.relations
              .slurs
              .map(
                relation => ({
                  ...relation,

                  itemIds:
                    Array.isArray(
                      relation
                        ?.itemIds
                    )
                      ? [
                          ...relation
                            .itemIds
                        ]
                      : []
                })
              )
          : [],

      tuplets:
        Array.isArray(
          candidate.relations
            ?.tuplets
        )
          ? candidate.relations
              .tuplets
              .map(
                relation => ({
                  ...relation,

                  itemIds:
                    Array.isArray(
                      relation
                        ?.itemIds
                    )
                      ? [
                          ...relation
                            .itemIds
                        ]
                      : []
                })
              )
          : []
    }
  };

  if (
    !sanitizeRelations(score)
  ) {
    return null;
  }

  return score;
}


function showStorageWarning(error) {
  console.warn(
    "KIKUtab: 保存領域を利用できません。",
    error
  );

  if (storageWarningShown) {
    return;
  }

  storageWarningShown = true;

  window.setTimeout(
    () =>
      showToast(
        "この端末では譜面を保存できません。",
        3500
      ),
    0
  );
}


function readStorageItem(key) {
  try {
    return localStorage.getItem(key);
  }

  catch (error) {
    showStorageWarning(error);
    return null;
  }
}


function writeStorageItem(
  key,
  value
) {
  try {
    localStorage.setItem(
      key,
      value
    );

    return true;
  }

  catch (error) {
    showStorageWarning(error);
    return false;
  }
}


function saveState() {
  return writeStorageItem(
    CONFIG.storageKey,

    JSON.stringify({
      version:
        CONFIG.storageVersion,

      bpm:
        state.bpm,

      score:
        state.score
    })
  );
}


function parseSavedState(raw) {
  try {
    const saved =
      JSON.parse(raw);

    const candidate =
      saved.score
      ||
      {
        measures:
          saved.measures,

        relations: {}
      };

    const normalized =
      normalizeScore(candidate);

    if (!normalized) {
      return null;
    }

    return {
      score:
        normalized,

      bpm:
        clampBpm(
          Number(saved.bpm)
          || 120
        )
    };
  }

  catch (error) {
    console.warn(
      "KIKUtab: 保存データを読み込めませんでした。",
      error
    );

    return false;
  }
}


function restoreState() {
  const currentRaw =
    readStorageItem(
      CONFIG.storageKey
    );

  const legacyRaw =
    readStorageItem(
      CONFIG.legacyStorageKey
    );

  const candidates = [
    {
      raw:
        currentRaw,

      legacy:
        false
    },

    {
      raw:
        legacyRaw,

      legacy:
        true
    }
  ];

  for (
    const candidate
    of candidates
  ) {
    if (!candidate.raw) {
      continue;
    }

    const restored =
      parseSavedState(
        candidate.raw
      );

    if (!restored) {
      continue;
    }

    state.score =
      restored.score;

    state.bpm =
      restored.bpm;

    if (candidate.legacy) {
      saveState();
    }

    return state.score
      .measures
      .some(
        measure =>
          measure.length > 0
      );
  }

  return false;
}


/* =========================================================
   EDITOR
========================================================= */

function updateModeHelp() {
  if (state.symbolMode) {
    const instructions = {
      dot:
        "付点を付ける音符または休符を1つ選んでください。",

      tie:
        state.symbolSelection.length === 0
          ? "タイを始める音符を選んでください。"
          : "すぐ次の音符を選んでください。",

      slur:
        state.symbolSelection.length === 0
          ? "スラーを始める音符を選んでください。KIKUtabはリズム譜なので音高は扱いません。"
          : "スラーを終える音符を選んでください。",

      triplet:
        "3連符にする、同じ長さの連続3音の先頭を選んでください。",

      quintuplet:
        "5連符にする、同じ長さの連続5音の先頭を選んでください。"
    };

    dom.modeHelp.textContent =
      `${instructions[state.symbolMode]} `
      + "同じ記号をもう一度押すとキャンセルできます。";

    return;
  }

  dom.modeHelp.textContent =
    state.activeInputTab
      === "symbols"
      ? "記号を選んでから、譜面上の対象を選択します。連桁は自動です。"
      : "音符または休符を選ぶと、譜面の最後に追加されます。";
}


function switchInputTab(tab) {
  if (
    tab !== "symbols"
    &&
    state.symbolMode
  ) {
    cancelSymbolMode(false);
  }

  state.activeInputTab = tab;

  dom.inputTabs.forEach(
    button => {

      button.classList.toggle(
        "is-active",
        button.dataset.inputTab
          === tab
      );
    }
  );

  dom.palettes.forEach(
    panel => {

      panel.classList.toggle(
        "is-hidden",
        panel.dataset.panel
          !== tab
      );
    }
  );

  updateModeHelp();
}


function addItem(
  kind,
  duration
) {
  if (
    ![
      "note",
      "rest"
    ].includes(kind)
    ||
    !DURATIONS[duration]
  ) {
    return;
  }

  cancelSymbolMode(false);

  const measureIndex =
    currentMeasureIndex();

  if (measureIndex === -1) {
    showToast(
      "2小節が完成しています。"
    );

    return;
  }

  const needed =
    DURATIONS[duration]
      .beats;

  const remaining =
    remainingBeats(
      measureIndex
    );

  if (
    fCmp(
      needed,
      remaining
    ) > 0
  ) {
    showToast(
      `この長さでは残り${formatFraction(remaining)}拍を超えます。`
    );

    return;
  }

  prepareScoreMutation();

  const before =
    cloneScore();

  state.score
    .measures[measureIndex]
    .push(
      makeItem(
        kind,
        duration
      )
    );

  state.history
    .push(before);

  if (
    state.history.length > 100
  ) {
    state.history.shift();
  }

  state.future = [];

  saveState();
  refresh();

  requestAnimationFrame(
    () =>
      focusMeasure(
        measureIndex
      )
  );
}


function focusMeasure(index) {
  dom.scoreScroll.scrollTo({
    left:
      index === 0
        ? 0
        : 410,

    behavior:
      "smooth"
  });
}


/* =========================================================
   SCORE ITEM CHANGE
========================================================= */

function durationLabel(duration) {
  const labels = {
    whole: "全",
    half: "2分",
    quarter: "4分",
    eighth: "8分",
    sixteenth: "16分"
  };

  return (
    labels[duration]
    ||
    duration
  );
}


function durationBeatLabel(duration) {
  const labels = {
    whole: "4拍",
    half: "2拍",
    quarter: "1拍",
    eighth: "1/2拍",
    sixteenth: "1/4拍"
  };

  return (
    labels[duration]
    ||
    ""
  );
}


function itemDisplayName(item) {
  if (!item) {
    return "";
  }

  return (
    `${durationLabel(item.duration)}`
    +
    (
      item.kind === "note"
        ? "音符"
        : "休符"
    )
  );
}


function ensureScoreEditDialog() {
  let dialog =
    document.getElementById(
      "score-edit-dialog"
    );

  if (dialog) {
    return dialog;
  }

  dialog =
    document.createElement(
      "dialog"
    );

  dialog.id =
    "score-edit-dialog";

  dialog.className =
    "score-edit-dialog";

  dialog.setAttribute(
    "aria-labelledby",
    "score-edit-title"
  );

  dialog.innerHTML = `
    <div class="score-edit-shell">

      <div class="score-edit-head">

        <div>
          <h2 id="score-edit-title">
            音符・休符を変更
          </h2>

          <p
            id="score-edit-current"
          ></p>
        </div>

        <button
          id="score-edit-close"
          class="score-edit-close"
          type="button"
          aria-label="閉じる"
        >
          ×
        </button>

      </div>

      <div
        id="score-edit-options"
        class="score-edit-options"
      ></div>

    </div>
  `;

  document.body
    .appendChild(dialog);

  dialog
    .querySelector(
      "#score-edit-close"
    )
    ?.addEventListener(
      "click",
      closeScoreEditDialog
    );

  dialog.addEventListener(
    "click",
    event => {

      if (
        event.target === dialog
      ) {
        closeScoreEditDialog();
      }
    }
  );

  dialog.addEventListener(
    "close",
    () => {

      activeScoreEditItemId =
        null;
    }
  );

  return dialog;
}


function closeScoreEditDialog() {
  const dialog =
    document.getElementById(
      "score-edit-dialog"
    );

  activeScoreEditItemId =
    null;

  if (dialog?.open) {
    dialog.close();
  }
}


function openScoreEditDialog(
  itemId
) {
  if (
    !state.editorOpen
    ||
    state.symbolMode
  ) {
    return;
  }

  const location =
    findItemLocation(itemId);

  if (!location) {
    return;
  }

  activeScoreEditItemId =
    itemId;

  const dialog =
    ensureScoreEditDialog();

  const currentLabel =
    dialog.querySelector(
      "#score-edit-current"
    );

  const options =
    dialog.querySelector(
      "#score-edit-options"
    );

  if (currentLabel) {
    currentLabel.textContent =
      `現在：${itemDisplayName(location.item)}`;
  }

  if (!options) {
    return;
  }

  options.innerHTML = "";

  const durations = [
    "whole",
    "half",
    "quarter",
    "eighth",
    "sixteenth"
  ];

  [
    "note",
    "rest"
  ].forEach(kind => {

    durations.forEach(
      duration => {

        const button =
          document.createElement(
            "button"
          );

        button.type =
          "button";

        button.className =
          "score-edit-option";

        if (
          location.item.kind
            === kind
          &&
          location.item.duration
            === duration
        ) {
          button.classList.add(
            "is-current"
          );
        }

        button.innerHTML = `
          <span>
            ${durationLabel(duration)}
            ${
              kind === "note"
                ? "音符"
                : "休符"
            }
          </span>

          <small>
            ${durationBeatLabel(duration)}
          </small>
        `;

        button.addEventListener(
          "click",
          () => {

            if (
              changeScoreItem(
                itemId,
                kind,
                duration
              )
            ) {
              closeScoreEditDialog();
            }
          }
        );

        options.appendChild(
          button
        );
      }
    );
  });

  if (
    dialog.showModal
    &&
    !dialog.open
  ) {
    dialog.showModal();
  }
}


/* =========================================================
   SYMBOL MODE
========================================================= */

function updateSymbolButtons() {
  dom.symbolButtons.forEach(
    button => {

      const active =
        button.dataset.symbol
        === state.symbolMode;

      button.classList.toggle(
        "is-active",
        active
      );

      button.setAttribute(
        "aria-pressed",
        String(active)
      );

      button.style.borderColor =
        active
          ? "#5d7890"
          : "";

      button.style.boxShadow =
        active
          ? "0 0 0 3px rgba(144,171,195,.20)"
          : "";
    }
  );
}


function setSymbolMode(symbol) {
  if (
    !SYMBOL_NAMES[symbol]
  ) {
    return;
  }

  closeScoreEditDialog();

  if (
    state.symbolMode
      === symbol
  ) {
    cancelSymbolMode();
    return;
  }

  state.symbolMode =
    symbol;

  state.symbolSelection =
    [];

  updateSymbolButtons();
  updateModeHelp();
  renderScoreInteractionLayer();
}


function cancelSymbolMode(
  showMessage = true
) {
  const hadMode =
    Boolean(
      state.symbolMode
    );

  state.symbolMode =
    null;

  state.symbolSelection =
    [];

  updateSymbolButtons();
  updateModeHelp();
  renderScoreInteractionLayer();

  if (
    hadMode
    &&
    showMessage
  ) {
    showToast(
      "記号の選択をキャンセルしました。"
    );
  }
}


function finishSymbolMode() {
  state.symbolMode =
    null;

  state.symbolSelection =
    [];

  updateSymbolButtons();
  updateModeHelp();
  renderScoreInteractionLayer();
}


function baseTupletCandidate(
  score,
  startId,
  type
) {
  const flat =
    flattenScoreItems(score);

  const startIndex =
    flat.findIndex(
      entry =>
        entry.id === startId
    );

  if (startIndex < 0) {
    return {
      valid: false,
      reason:
        "音符が見つかりません。"
    };
  }

  const count =
    type === "triplet"
      ? 3
      : 5;

  const selectedEntries =
    flat.slice(
      startIndex,
      startIndex + count
    );

  if (
    selectedEntries.length
      !== count
  ) {
    return {
      valid: false,
      reason:
        `${count}個の音符が必要です。`
    };
  }

  const items =
    selectedEntries.map(
      entry =>
        entry.item
    );

  if (
    items.some(
      item =>
        item.kind !== "note"
    )
  ) {
    return {
      valid: false,
      reason:
        "Ver.0.1では連符は音符だけを対象にします。"
    };
  }

  if (
    items.some(
      item =>
        item.duration
        !== items[0].duration
    )
  ) {
    return {
      valid: false,
      reason:
        "同じ長さの音符を並べてください。"
    };
  }

  if (
    items.some(
      item =>
        item.modifiers?.dotted
    )
  ) {
    return {
      valid: false,
      reason:
        "Ver.0.1では付点音符を連符の対象にできません。"
    };
  }

  if (
    items.some(
      item =>
        item.relations?.tuplet
    )
  ) {
    return {
      valid: false,
      reason:
        "すでに連符になっている音符が含まれています。"
    };
  }

  return {
    valid: true,

    itemIds:
      selectedEntries.map(
        entry =>
          entry.id
      ),

    items
  };
}


function simulateTupletApplication(
  startId,
  type
) {
  const trial =
    cloneScore();

  const candidate =
    baseTupletCandidate(
      trial,
      startId,
      type
    );

  if (
    !candidate.valid
  ) {
    return candidate;
  }

  const numNotes =
    type === "triplet"
      ? 3
      : 5;

  const notesOccupied =
    type === "triplet"
      ? 2
      : 4;

  const relationId =
    "__trial_tuplet__";

  const byId =
    new Map(
      flattenScoreItems(trial)
        .map(
          entry => [
            entry.id,
            entry.item
          ]
        )
    );

  candidate.itemIds
    .forEach(id => {

      byId.get(id)
        .relations.tuplet = {
          groupId:
            relationId,

          type,

          numNotes,

          notesOccupied
        };
    });

  trial.relations.tuplets
    .push({
      id:
        relationId,

      type,

      itemIds:
        [...candidate.itemIds],

      numNotes,

      notesOccupied
    });

  if (
    !reflowScore(trial)
    ||
    !isScoreTimingValid(trial)
  ) {
    return {
      valid: false,
      reason:
        "この位置では連符にすると2小節の範囲に収まりません。"
    };
  }

  const locations =
    candidate.itemIds.map(
      id =>
        findItemLocation(
          id,
          trial
        )
    );

  if (
    locations.some(
      location => !location
    )
    ||
    !locations.every(
      location =>
        location.measureIndex
        ===
        locations[0].measureIndex
    )
  ) {
    return {
      valid: false,
      reason:
        "連符は小節線をまたがない位置にしてください。"
    };
  }

  return {
    valid: true,

    itemIds:
      candidate.itemIds
  };
}


function getSymbolTargetValidity(
  itemId
) {
  const location =
    findItemLocation(itemId);

  if (!location) {
    return {
      valid: false,
      reason:
        "対象が見つかりません。"
    };
  }

  const item =
    location.item;

  switch (
    state.symbolMode
  ) {

    case "dot": {
      if (
        item.modifiers?.dotted
      ) {
        return {
          valid: false,
          reason:
            "すでに付点があります。"
        };
      }

      if (
        item.relations?.tuplet
      ) {
        return {
          valid: false,
          reason:
            "Ver.0.1では連符の中に付点は追加できません。"
        };
      }

      const trial =
        cloneScore();

      const trialLocation =
        findItemLocation(
          itemId,
          trial
        );

      trialLocation
        .item
        .modifiers
        .dotted = true;

      if (
        !isScoreTimingValid(
          trial
        )
      ) {
        return {
          valid: false,
          reason:
            "付点を付けると小節の長さを超えます。"
        };
      }

      return {
        valid: true
      };
    }


    case "tie": {
      if (
        item.kind !== "note"
      ) {
        return {
          valid: false,
          reason:
            "タイは音符同士に付けます。"
        };
      }

      if (
        state.symbolSelection.length
          === 0
      ) {
        return {
          valid: true
        };
      }

      const first =
        findItemLocation(
          state.symbolSelection[0]
        );

      if (!first) {
        return {
          valid: false,
          reason:
            "最初の音符が見つかりません。"
        };
      }

      if (
        location.globalIndex
        !==
        first.globalIndex + 1
      ) {
        return {
          valid: false,
          reason:
            "タイは隣り合う2つの音符を選んでください。"
        };
      }

      const duplicate =
        state.score
          .relations
          .ties
          .some(
            relation =>
              relation.fromId
                === first.id
              &&
              relation.toId
                === itemId
          );

      if (duplicate) {
        return {
          valid: false,
          reason:
            "この2音にはすでにタイがあります。"
        };
      }

      const outgoing =
        state.score
          .relations
          .ties
          .some(
            relation =>
              relation.fromId
                === first.id
          );

      const incoming =
        state.score
          .relations
          .ties
          .some(
            relation =>
              relation.toId
                === itemId
          );

      if (
        outgoing
        ||
        incoming
      ) {
        return {
          valid: false,
          reason:
            "この位置にはすでに別のタイが接続されています。"
        };
      }

      return {
        valid: true
      };
    }


    case "slur": {
      if (
        item.kind !== "note"
      ) {
        return {
          valid: false,
          reason:
            "スラーは音符を選んでください。"
        };
      }

      if (
        state.symbolSelection.length
          === 0
      ) {
        return {
          valid: true
        };
      }

      const first =
        findItemLocation(
          state.symbolSelection[0]
        );

      if (!first) {
        return {
          valid: false,
          reason:
            "最初の音符が見つかりません。"
        };
      }

      if (
        first.measureIndex
        !==
        location.measureIndex
      ) {
        return {
          valid: false,
          reason:
            "Ver.0.1ではスラーは同じ小節内に付けてください。"
        };
      }

      if (
        location.index
        <= first.index
      ) {
        return {
          valid: false,
          reason:
            "最初の音符より後ろの音符を選んでください。"
        };
      }

      const between =
        state.score
          .measures[
            first.measureIndex
          ]
          .slice(
            first.index,
            location.index + 1
          );

      if (
        between.some(
          entry =>
            entry.kind
            !== "note"
        )
      ) {
        return {
          valid: false,
          reason:
            "途中に休符があるためスラーを付けられません。"
        };
      }

      const ids =
        between.map(
          entry =>
            entry.id
        );

      const duplicate =
        state.score
          .relations
          .slurs
          .some(
            relation =>
              relation.itemIds
                .join("|")
              ===
              ids.join("|")
          );

      if (duplicate) {
        return {
          valid: false,
          reason:
            "ここにはすでに同じスラーがあります。"
        };
      }

      return {
        valid: true
      };
    }


    case "triplet":
      return simulateTupletApplication(
        itemId,
        "triplet"
      );


    case "quintuplet":
      return simulateTupletApplication(
        itemId,
        "quintuplet"
      );


    default:
      return {
        valid: false,
        reason:
          "先に記号を選んでください。"
      };
  }
}


function applyDot(itemId) {
  const validity =
    getSymbolTargetValidity(
      itemId
    );

  if (!validity.valid) {
    showToast(
      validity.reason
    );

    return false;
  }

  prepareScoreMutation();

  const before =
    cloneScore();

  const location =
    findItemLocation(itemId);

  location.item
    .modifiers
    .dotted = true;

  commitScoreMutation(
    before,
    "付点を付けました。"
  );

  return true;
}


function applyTie(
  firstId,
  secondId
) {
  const first =
    findItemLocation(
      firstId
    );

  const second =
    findItemLocation(
      secondId
    );

  if (
    !first
    ||
    !second
    ||
    first.item.kind
      !== "note"
    ||
    second.item.kind
      !== "note"
    ||
    second.globalIndex
      !==
      first.globalIndex + 1
  ) {
    showToast(
      "タイは隣り合う2つの音符に付けてください。"
    );

    return false;
  }

  if (
    state.score
      .relations
      .ties
      .some(
        relation =>
          relation.fromId
            === firstId
          ||
          relation.toId
            === secondId
      )
  ) {
    showToast(
      "この位置にはすでに別のタイが接続されています。"
    );

    return false;
  }

  prepareScoreMutation();

  const before =
    cloneScore();

  state.score
    .relations
    .ties
    .push({
      id:
        makeId(),

      fromId:
        firstId,

      toId:
        secondId
    });

  commitScoreMutation(
    before,
    "タイを付けました。"
  );

  return true;
}


function applySlur(
  firstId,
  lastId
) {
  const first =
    findItemLocation(
      firstId
    );

  const last =
    findItemLocation(
      lastId
    );

  if (
    !first
    ||
    !last
    ||
    first.measureIndex
      !==
      last.measureIndex
    ||
    last.index
      <= first.index
  ) {
    showToast(
      "スラーは同じ小節内の、後ろにある音符までを選んでください。"
    );

    return false;
  }

  const items =
    state.score
      .measures[
        first.measureIndex
      ]
      .slice(
        first.index,
        last.index + 1
      );

  if (
    items.some(
      item =>
        item.kind !== "note"
    )
  ) {
    showToast(
      "途中に休符があるためスラーを付けられません。"
    );

    return false;
  }

  const itemIds =
    items.map(
      item =>
        item.id
    );

  if (
    state.score
      .relations
      .slurs
      .some(
        relation =>
          relation.itemIds
            .join("|")
          ===
          itemIds.join("|")
      )
  ) {
    showToast(
      "ここにはすでに同じスラーがあります。"
    );

    return false;
  }

  prepareScoreMutation();

  const before =
    cloneScore();

  state.score
    .relations
    .slurs
    .push({
      id:
        makeId(),

      itemIds
    });

  commitScoreMutation(
    before,
    "スラーを付けました。"
  );

  return true;
}


function applyTuplet(
  startId,
  type
) {
  const simulated =
    simulateTupletApplication(
      startId,
      type
    );

  if (!simulated.valid) {
    showToast(
      simulated.reason
    );

    return false;
  }

  prepareScoreMutation();

  const before =
    cloneScore();

  const numNotes =
    type === "triplet"
      ? 3
      : 5;

  const notesOccupied =
    type === "triplet"
      ? 2
      : 4;

  const relationId =
    makeId();

  const byId =
    new Map(
      flattenScoreItems()
        .map(
          entry => [
            entry.id,
            entry.item
          ]
        )
    );

  simulated.itemIds
    .forEach(id => {

      byId.get(id)
        .relations
        .tuplet = {
          groupId:
            relationId,

          type,

          numNotes,

          notesOccupied
        };
    });

  state.score
    .relations
    .tuplets
    .push({
      id:
        relationId,

      type,

      itemIds:
        [...simulated.itemIds],

      numNotes,

      notesOccupied
    });

  if (
    !reflowScore(
      state.score
    )
    ||
    !isScoreTimingValid(
      state.score
    )
  ) {
    state.score =
      before;

    showToast(
      "この位置には連符を適用できません。"
    );

    return false;
  }

  const locations =
    simulated.itemIds
      .map(
        id =>
          findItemLocation(id)
      );

  if (
    !locations.every(
      location =>
        location
        &&
        location.measureIndex
          ===
          locations[0]
            .measureIndex
    )
  ) {
    state.score =
      before;

    showToast(
      "連符は小節線をまたがない位置にしてください。"
    );

    return false;
  }

  commitScoreMutation(
    before,

    type === "triplet"
      ? "3連符を付けました。"
      : "5連符を付けました。"
  );

  return true;
}


function handleSymbolTargetClick(
  itemId
) {
  if (
    !state.symbolMode
  ) {
    return;
  }

  const validity =
    getSymbolTargetValidity(
      itemId
    );

  if (!validity.valid) {
    showToast(
      validity.reason,
      2300
    );

    return;
  }

  switch (
    state.symbolMode
  ) {

    case "dot":
      if (
        applyDot(itemId)
      ) {
        finishSymbolMode();
      }

      break;


    case "tie":
      if (
        state.symbolSelection.length
          === 0
      ) {
        state.symbolSelection = [
          itemId
        ];

        updateModeHelp();
        renderScoreInteractionLayer();

        showToast(
          "次につなぐ音符を選んでください。"
        );

        return;
      }

      if (
        applyTie(
          state.symbolSelection[0],
          itemId
        )
      ) {
        finishSymbolMode();
      }

      break;


    case "slur":
      if (
        state.symbolSelection.length
          === 0
      ) {
        state.symbolSelection = [
          itemId
        ];

        updateModeHelp();
        renderScoreInteractionLayer();

        showToast(
          "スラーを終える音符を選んでください。"
        );

        return;
      }

      if (
        applySlur(
          state.symbolSelection[0],
          itemId
        )
      ) {
        finishSymbolMode();
      }

      break;


    case "triplet":
      if (
        applyTuplet(
          itemId,
          "triplet"
        )
      ) {
        finishSymbolMode();
      }

      break;


    case "quintuplet":
      if (
        applyTuplet(
          itemId,
          "quintuplet"
        )
      ) {
        finishSymbolMode();
      }

      break;
  }
}


function removeDot(itemId) {
  const location =
    findItemLocation(
      itemId
    );

  if (
    !location
      ?.item
      .modifiers
      ?.dotted
  ) {
    return;
  }

  const trial =
    cloneScore();

  findItemLocation(
    itemId,
    trial
  )
    .item
    .modifiers
    .dotted = false;

  if (
    !isScoreTimingValid(
      trial
    )
  ) {
    showToast(
      "この付点を外すと1小節目が未完成のまま2小節目が残るため、今は外せません。"
    );

    return;
  }

  prepareScoreMutation();

  const before =
    cloneScore();

  findItemLocation(
    itemId
  )
    .item
    .modifiers
    .dotted = false;

  commitScoreMutation(
    before,
    "付点を外しました。"
  );
}


function removeTie(
  relationId
) {
  const exists =
    state.score
      .relations
      .ties
      .some(
        relation =>
          relation.id
            === relationId
      );

  if (!exists) {
    return;
  }

  prepareScoreMutation();

  const before =
    cloneScore();

  state.score
    .relations
    .ties =
      state.score
        .relations
        .ties
        .filter(
          relation =>
            relation.id
              !== relationId
        );

  commitScoreMutation(
    before,
    "タイを外しました。"
  );
}


function removeSlur(
  relationId
) {
  const exists =
    state.score
      .relations
      .slurs
      .some(
        relation =>
          relation.id
            === relationId
      );

  if (!exists) {
    return;
  }

  prepareScoreMutation();

  const before =
    cloneScore();

  state.score
    .relations
    .slurs =
      state.score
        .relations
        .slurs
        .filter(
          relation =>
            relation.id
              !== relationId
        );

  commitScoreMutation(
    before,
    "スラーを外しました。"
  );
}


function removeTuplet(
  relationId
) {
  const relation =
    state.score
      .relations
      .tuplets
      .find(
        item =>
          item.id
            === relationId
      );

  if (!relation) {
    return;
  }

  const trial =
    cloneScore();

  const trialRelation =
    trial.relations
      .tuplets
      .find(
        item =>
          item.id
            === relationId
      );

  const trialById =
    new Map(
      flattenScoreItems(trial)
        .map(
          entry => [
            entry.id,
            entry.item
          ]
        )
    );

  trialRelation
    .itemIds
    .forEach(
      itemId => {

        const item =
          trialById.get(
            itemId
          );

        if (
          item
          ?.relations
          ?.tuplet
          ?.groupId
          === relationId
        ) {
          item.relations
            .tuplet = null;
        }
      }
    );

  trial.relations
    .tuplets =
      trial.relations
        .tuplets
        .filter(
          item =>
            item.id
              !== relationId
        );

  if (
    !reflowScore(trial)
    ||
    !isScoreTimingValid(
      trial
    )
  ) {
    showToast(
      "連符を外すと2小節の範囲に収まらないため、今は外せません。"
    );

    return;
  }

  prepareScoreMutation();

  const before =
    cloneScore();

  const byId =
    new Map(
      flattenScoreItems()
        .map(
          entry => [
            entry.id,
            entry.item
          ]
        )
    );

  relation.itemIds
    .forEach(
      itemId => {

        const item =
          byId.get(itemId);

        if (
          item
          ?.relations
          ?.tuplet
          ?.groupId
          === relationId
        ) {
          item.relations
            .tuplet = null;
        }
      }
    );

  state.score
    .relations
    .tuplets =
      state.score
        .relations
        .tuplets
        .filter(
          item =>
            item.id
              !== relationId
        );

  if (
    !reflowScore(
      state.score
    )
  ) {
    state.score =
      before;

    showToast(
      "連符を外せませんでした。"
    );

    return;
  }

  commitScoreMutation(
    before,
    "連符を外しました。"
  );
}


/* =========================================================
   BEAMS
========================================================= */

function isWrittenBeamable(item) {
  if (
    !item
    ||
    item.kind !== "note"
  ) {
    return false;
  }

  return (
    fCmp(
      DURATIONS[
        item.duration
      ].beats,

      {
        n: 1,
        d: 1
      }
    ) < 0
  );
}


function analyzeBeamGroups(items) {
  const groups = [];

  let currentIndexes = [];
  let currentBucket = null;
  let currentTupletGroupId =
    null;

  let cursorBeat = 0;

  function flush() {
    if (
      currentIndexes.length
      >= 2
    ) {
      groups.push({
        noteIndexes:
          [...currentIndexes]
      });
    }

    currentIndexes = [];
    currentBucket = null;
    currentTupletGroupId =
      null;
  }

  items.forEach(
    (item, index) => {

      const durationBeats =
        fToNumber(
          itemBeats(item)
        );

      const startBeat =
        cursorBeat;

      cursorBeat +=
        durationBeats;

      if (
        !isWrittenBeamable(
          item
        )
      ) {
        flush();
        return;
      }

      const tupletGroupId =
        item.relations
          ?.tuplet
          ?.groupId
        || null;

      const bucket =
        Math.floor(
          startBeat
          +
          EPSILON
        );

      if (
        currentIndexes.length
        > 0
      ) {
        if (
          tupletGroupId
          ||
          currentTupletGroupId
        ) {
          if (
            tupletGroupId
            !==
            currentTupletGroupId
          ) {
            flush();
          }
        }

        else if (
          bucket
          !==
          currentBucket
        ) {
          flush();
        }
      }

      if (
        currentIndexes.length
        === 0
      ) {
        currentBucket =
          bucket;

        currentTupletGroupId =
          tupletGroupId;
      }

      currentIndexes.push(
        index
      );
    }
  );

  flush();

  return groups;
}


function makeBeamsFromGroups(
  VF,
  items,
  vexNotes
) {
  const beams = [];

  analyzeBeamGroups(items)
    .forEach(
      group => {

        const notes =
          group.noteIndexes
            .map(
              index =>
                vexNotes[index]
            )
            .filter(Boolean);

        if (
          notes.length < 2
        ) {
          return;
        }

        try {
          beams.push(
            new VF.Beam(
              notes
            )
          );
        }

        catch (error) {
          console.warn(
            "KIKUtab: 連桁を生成できませんでした。",
            error
          );
        }
      }
    );

  return beams;
}


/* =========================================================
   VEXFLOW SCORE
========================================================= */

function vf() {
  if (
    !window.Vex?.Flow
  ) {
    throw new Error(
      "VexFlow unavailable"
    );
  }

  return window.Vex.Flow;
}


function vexNote(item) {
  const VF = vf();

  const base =
    DURATIONS[
      item.duration
    ].vex;

  const duration =
    item.kind === "rest"
      ? `${base}r`
      : base;

  const dotted =
    Boolean(
      item.modifiers?.dotted
    );

  const note =
    new VF.StaveNote({
      clef:
        "percussion",

      keys:
        ["b/4"],

      duration,

      dots:
        dotted
          ? 1
          : 0
    });

  if (dotted) {
    VF.Dot
      .buildAndAttach(
        [note],
        {
          all: true
        }
      );
  }

  return note;
}


function ghostParts(
  remaining
) {
  let value =
    frac(
      remaining.n,
      remaining.d
    );

  const result = [];

  for (
    const unit
    of GHOST_DURATIONS
  ) {
    while (
      fCmp(
        value,
        unit.beats
      ) >= 0
    ) {
      result.push(
        unit.vex
      );

      value =
        fSub(
          value,
          unit.beats
        );
    }
  }

  if (
    !fEq(
      value,
      zero()
    )
  ) {
    throw new Error(
      `Ghost remainder cannot be represented: ${value.n}/${value.d}`
    );
  }

  return result;
}


function createVexTupletsForMeasure(
  VF,
  items,
  notes
) {
  const noteById =
    new Map(
      items.map(
        (item, index) => [
          item.id,
          notes[index]
        ]
      )
    );

  const tuplets = [];

  state.score
    .relations
    .tuplets
    .forEach(
      relation => {

        const relationItems =
          relation.itemIds
            .map(
              id =>
                items.find(
                  item =>
                    item.id === id
                )
            );

        const vexNotes =
          relation.itemIds
            .map(
              id =>
                noteById.get(id)
            );

        if (
          relationItems.some(
            item => !item
          )
          ||
          vexNotes.some(
            note => !note
          )
        ) {
          return;
        }

        const writtenBeamable =
          relationItems.every(
            item =>
              isWrittenBeamable(
                item
              )
          );

        try {
          tuplets.push(
            new VF.Tuplet(
              vexNotes,
              {
                num_notes:
                  relation.numNotes,

                notes_occupied:
                  relation.notesOccupied,

                bracketed:
                  !writtenBeamable,

                ratioed:
                  false,

                location:
                  VF.Tuplet
                    .LOCATION_TOP
              }
            )
          );
        }

        catch (error) {
          console.warn(
            "KIKUtab: 連符を生成できませんでした。",
            error
          );
        }
      }
    );

  return tuplets;
}


function drawMeasure(
  context,
  stave,
  items,
  measureIndex
) {
  const VF = vf();

  const notes =
    items.map(
      vexNote
    );

  const beams =
    makeBeamsFromGroups(
      VF,
      items,
      notes
    );

  const tuplets =
    createVexTupletsForMeasure(
      VF,
      items,
      notes
    );

  const used =
    items.reduce(
      (total, item) =>
        fAdd(
          total,
          itemBeats(item)
        ),

      zero()
    );

  const remaining =
    fSub(
      CONFIG.beatsPerMeasure,
      used
    );

  const ghosts =
    ghostParts(remaining)
      .map(
        duration =>
          new VF.GhostNote({
            duration
          })
      );

  const voice =
    new VF.Voice({
      numBeats: 4,
      beatValue: 4
    });

  voice.addTickables([
    ...notes,
    ...ghosts
  ]);

  const width =
    Math.max(
      110,

      stave.getNoteEndX()
      -
      stave.getNoteStartX()
      -
      12
    );

  new VF.Formatter()
    .joinVoices([voice])
    .format(
      [voice],
      width
    );

  voice.draw(
    context,
    stave
  );

  beams.forEach(
    beam =>
      beam
        .setContext(context)
        .draw()
  );

  tuplets.forEach(
    tuplet =>
      tuplet
        .setContext(context)
        .draw()
  );

  notes.forEach(
    (note, index) => {

      const item =
        items[index];

      if (!item) {
        return;
      }

      vexNoteById.set(
        item.id,
        note
      );

      layoutById.set(
        item.id,
        {
          x:
            note.getAbsoluteX(),

          measureIndex
        }
      );
    }
  );
}


function drawGlobalRelations(
  VF,
  context
) {
  state.score
    .relations
    .ties
    .forEach(
      relation => {

        const first =
          vexNoteById.get(
            relation.fromId
          );

        const last =
          vexNoteById.get(
            relation.toId
          );

        if (
          !first
          ||
          !last
        ) {
          return;
        }

        try {
          new VF.StaveTie({
            first_note:
              first,

            last_note:
              last,

            first_indices:
              [0],

            last_indices:
              [0]
          })
            .setContext(
              context
            )
            .draw();
        }

        catch (error) {
          console.warn(
            "KIKUtab: タイを描画できませんでした。",
            error
          );
        }
      }
    );

  state.score
    .relations
    .slurs
    .forEach(
      relation => {

        const first =
          vexNoteById.get(
            relation.itemIds[0]
          );

        const last =
          vexNoteById.get(
            relation.itemIds[
              relation.itemIds
                .length - 1
            ]
          );

        if (
          !first
          ||
          !last
        ) {
          return;
        }

        try {
          new VF.Curve(
            first,
            last,
            {
              position:
                VF.Curve
                  .Position
                  .NEAR_TOP,

              position_end:
                VF.Curve
                  .Position
                  .NEAR_TOP,

              invert: true,

              y_shift: 4,

              cps: [
                {
                  x: 0,
                  y: 16
                },
                {
                  x: 0,
                  y: 16
                }
              ]
            }
          )
            .setContext(
              context
            )
            .draw();
        }

        catch (error) {
          console.warn(
            "KIKUtab: スラーを描画できませんでした。",
            error
          );
        }
      }
    );
}


function renderScore() {
  dom.scoreRender.innerHTML =
    "";

  dom.scoreHitLayer.innerHTML =
    "";

  layoutById.clear();
  vexNoteById.clear();

  try {
    const VF = vf();

    const renderer =
      new VF.Renderer(
        dom.scoreRender,
        VF.Renderer
          .Backends
          .SVG
      );

    renderer.resize(
      880,
      220
    );

    const context =
      renderer.getContext();

    const first =
      new VF.Stave(
        10,
        55,
        430
      );

    const second =
      new VF.Stave(
        440,
        55,
        430
      );

    first
      .addClef(
        "percussion"
      )
      .addTimeSignature(
        "4/4"
      );

    first
      .setContext(
        context
      )
      .draw();

    second
      .setContext(
        context
      )
      .draw();

    drawMeasure(
      context,
      first,
      state.score
        .measures[0],
      0
    );

    drawMeasure(
      context,
      second,
      state.score
        .measures[1],
      1
    );

    drawGlobalRelations(
      VF,
      context
    );
  }

  catch (error) {
    console.error(error);

    dom.scoreRender.innerHTML =
      '<p class="score-error">譜面を描画できませんでした。ページを再読み込みしてください。</p>';
  }

  renderScoreInteractionLayer();
}


/* =========================================================
   SCORE INTERACTION LAYER
========================================================= */

function clearScoreControls() {
  dom.scoreHitLayer
    .querySelectorAll(
      ".kikutab-score-control"
    )
    .forEach(
      element =>
        element.remove()
    );
}


function makeScoreControlButton() {
  const button =
    document.createElement(
      "button"
    );

  button.type =
    "button";

  button.className =
    "kikutab-score-control";

  button.style.position =
    "absolute";

  button.style.pointerEvents =
    "auto";

  button.style.zIndex =
    "6";

  /*
    iOS / Safariで透明の編集ボタンが
    標準ボタンとして灰色に描画されるのを防ぐ。
  */
  button.style.margin =
    "0";

  button.style.padding =
    "0";

  button.style.border =
    "0";

  button.style.background =
    "transparent";

  button.style.boxShadow =
    "none";

  button.style.appearance =
    "none";

  button.style.webkitAppearance =
    "none";

  button.style.color =
    "transparent";

  button.style.fontSize =
    "0";

  return button;
}


function renderSymbolTargetButtons() {
  flattenScoreItems()
    .forEach(
      entry => {

        const layout =
          layoutById.get(
            entry.id
          );

        if (!layout) {
          return;
        }

        const validity =
          getSymbolTargetValidity(
            entry.id
          );

        const selected =
          state.symbolSelection
            .includes(
              entry.id
            );

        const button =
          makeScoreControlButton();

        button.setAttribute(
          "aria-label",

          entry.item.kind
            === "note"
            ? "音符を選択"
            : "休符を選択"
        );

        button.setAttribute(
          "aria-disabled",
          String(
            !validity.valid
          )
        );

        button.tabIndex =
          validity.valid
            ? 0
            : -1;

        button.style.pointerEvents =
          validity.valid
            ? "auto"
            : "none";

        button.style.left =
          `${layout.x - 23}px`;

        button.style.top =
          "54px";

        button.style.width =
          "46px";

        button.style.height =
          "104px";

        button.style.borderRadius =
          "12px";

        button.style.cursor =
          "pointer";

        button.style.border =
          selected
            ? "2px solid #607f98"
            : validity.valid
              ? "1px solid rgba(96,127,152,.28)"
              : "1px dashed rgba(120,125,130,.18)";

        button.style.background =
          selected
            ? "rgba(142,170,192,.26)"
            : validity.valid
              ? "rgba(142,170,192,.09)"
              : "rgba(210,214,218,.04)";

        button.style.opacity =
          validity.valid
            ? "1"
            : ".38";

        button.title =
          validity.valid
            ? `${SYMBOL_NAMES[state.symbolMode]}の対象にする`
            : validity.reason;

        button.addEventListener(
          "click",
          event => {

            event.preventDefault();
            event.stopPropagation();

            handleSymbolTargetClick(
              entry.id
            );
          }
        );

        dom.scoreHitLayer
          .appendChild(button);
      }
    );
}


function relationCenterX(
  itemIds
) {
  const layouts =
    itemIds
      .map(
        id =>
          layoutById.get(id)
      )
      .filter(Boolean);

  if (!layouts.length) {
    return null;
  }

  return (
    layouts.reduce(
      (total, layout) =>
        total + layout.x,
      0
    )
    /
    layouts.length
  );
}


function makeRelationBadge(
  text,
  x,
  top,
  onRemove
) {
  if (
    !Number.isFinite(x)
  ) {
    return;
  }

  const button =
    makeScoreControlButton();

  button.textContent =
    `${text} ×`;

  button.style.left =
    `${x}px`;

  button.style.top =
    `${top}px`;

  button.style.transform =
    "translateX(-50%)";

  button.style.minHeight =
    "24px";

  button.style.padding =
    "0 7px";

  button.style.border =
    "1px solid #dbe2e7";

  button.style.borderRadius =
    "999px";

  button.style.background =
    "rgba(255,255,255,.96)";

  button.style.color =
    "#607f98";

  button.style.boxShadow =
    "0 2px 8px rgba(30,40,50,.08)";

  button.style.cursor =
    "pointer";

  button.style.fontSize =
    "8px";

  button.style.fontWeight =
    "800";

  button.title =
    `${text}を外す`;

  button.addEventListener(
    "click",
    event => {

      event.preventDefault();
      event.stopPropagation();

      onRemove();
    }
  );

  dom.scoreHitLayer
    .appendChild(button);
}


function renderRelationBadges() {
  flattenScoreItems()
    .forEach(
      entry => {

        if (
          !entry.item
            .modifiers
            ?.dotted
        ) {
          return;
        }

        const layout =
          layoutById.get(
            entry.id
          );

        if (!layout) {
          return;
        }

        makeRelationBadge(
          "付点",
          layout.x,
          12,
          () =>
            removeDot(
              entry.id
            )
        );
      }
    );

  state.score
    .relations
    .ties
    .forEach(
      relation => {

        makeRelationBadge(
          "タイ",

          relationCenterX([
            relation.fromId,
            relation.toId
          ]),

          36,

          () =>
            removeTie(
              relation.id
            )
        );
      }
    );

  state.score
    .relations
    .slurs
    .forEach(
      relation => {

        makeRelationBadge(
          "スラー",

          relationCenterX(
            relation.itemIds
          ),

          12,

          () =>
            removeSlur(
              relation.id
            )
        );
      }
    );

  state.score
    .relations
    .tuplets
    .forEach(
      relation => {

        makeRelationBadge(
          relation.type
            === "triplet"
            ? "3連符"
            : "5連符",

          relationCenterX(
            relation.itemIds
          ),

          36,

          () =>
            removeTuplet(
              relation.id
            )
        );
      }
    );
}


function renderItemEditTargets() {
  flattenScoreItems()
    .forEach(
      entry => {

        const layout =
          layoutById.get(
            entry.id
          );

        if (!layout) {
          return;
        }

        const button =
          makeScoreControlButton();

        button.classList.add(
          "kikutab-item-edit-target"
        );

        button.setAttribute(
          "aria-label",
          `${itemDisplayName(entry.item)}を変更`
        );

        button.title =
          `${itemDisplayName(entry.item)}を変更`;

        button.style.left =
          `${layout.x - 23}px`;

        button.style.top =
          "54px";

        button.style.width =
          "46px";

        button.style.height =
          "104px";

        button.style.borderRadius =
          "12px";

        button.addEventListener(
          "click",
          event => {

            event.preventDefault();
            event.stopPropagation();

            openScoreEditDialog(
              entry.id
            );
          }
        );

        dom.scoreHitLayer
          .appendChild(button);
      }
    );
}


/* =========================================================
   REFERENCE DATA
========================================================= */

const referenceData = [
  {
    id: "whole-note",
    category: "notes",
    categoryLabel: "NOTE",
    name: "全音符",
    value: "4拍",
    exampleType: "single",

    summary:
      "4/4拍子では4拍ぶん、つまり1小節ぶん音を伸ばす音符です。",

    tip:
      "KIKUtabでは4/4拍子を使うので、「1・2・3・4」と数えるあいだ音を伸ばします。",

    kind: "note",
    duration: "whole",

    timingLabel:
      "最初に1回鳴らし、そのまま4拍伸ばします。",

    timingRhythm:
      "●────────────",

    soundPattern: [0],
    soundBeats: 4
  },

  {
    id: "half-note",
    category: "notes",
    categoryLabel: "NOTE",
    name: "2分音符",
    value: "2拍",
    exampleType: "single",

    summary:
      "4/4拍子では2拍ぶんの長さを持つ音符です。4分音符2つぶんの長さです。",

    tip:
      "「1・2」と2拍数えるあいだ、音を伸ばします。",

    kind: "note",
    duration: "half",

    timingLabel:
      "最初に1回鳴らし、そのまま2拍伸ばします。",

    timingRhythm:
      "●──────",

    soundPattern: [0],
    soundBeats: 2
  },

  {
    id: "quarter-note",
    category: "notes",
    categoryLabel: "NOTE",
    name: "4分音符",
    value: "1拍",
    exampleType: "single",

    summary:
      "4/4拍子では1拍ぶんの長さです。KIKUtabでリズムを考えるときの基準になります。",

    tip:
      "まず4分音符を「1拍」と覚え、8分音符や16分音符をそこから分けて考えると分かりやすくなります。",

    kind: "note",
    duration: "quarter",

    timingLabel:
      "1回鳴らし、次の拍が来るまでが4分音符1つぶんです。",

    timingRhythm:
      "●────",

    soundPattern: [0],
    soundBeats: 1
  },

  {
    id: "eighth-note",
    category: "notes",
    categoryLabel: "NOTE",
    name: "8分音符",
    value: "1/2拍",
    exampleType: "single",

    summary:
      "4/4拍子では1拍を2等分した長さです。1拍の中に8分音符が2つ入ります。",

    tip:
      "「1・と・2・と」のように、拍と拍のちょうど中間にも音を置けます。",

    kind: "note",
    duration: "eighth",

    timingLabel:
      "1拍の中を均等に2つに分けます。",

    timingRhythm:
      "●──●──",

    soundPattern: [
      0,
      0.5
    ],

    soundBeats: 1
  },

  {
    id: "sixteenth-note",
    category: "notes",
    categoryLabel: "NOTE",
    name: "16分音符",
    value: "1/4拍",
    exampleType: "single",

    summary:
      "4/4拍子では1拍を4等分した長さです。1拍の中に16分音符が4つ入ります。",

    tip:
      "細かいストロークやカッティングを読むときにも重要な音価です。",

    kind: "note",
    duration: "sixteenth",

    timingLabel:
      "1拍の中を均等に4つに分けます。",

    timingRhythm:
      "●─●─●─●─",

    soundPattern: [
      0,
      0.25,
      0.5,
      0.75
    ],

    soundBeats: 1
  },

  {
    id: "whole-rest",
    category: "rests",
    categoryLabel: "REST",
    name: "全休符",
    value: "1小節休む",
    exampleType: "single",

    summary:
      "全休符は小節全体を休むためにも使われます。KIKUtabの4/4拍子では1小節＝4拍ぶん休みます。",

    tip:
      "音を出していないあいだも拍は進みます。「1・2・3・4」と数え続けます。",

    kind: "rest",
    duration: "whole",

    timingLabel:
      "4拍ぶん音を出しません。",

    timingRhythm:
      "×────────────",

    soundPattern: [],
    soundBeats: 4
  },

  {
    id: "half-rest",
    category: "rests",
    categoryLabel: "REST",
    name: "2分休符",
    value: "2拍休む",
    exampleType: "single",

    summary:
      "4/4拍子では2拍ぶん音を出さずに休む記号です。",

    tip:
      "休んでいるあいだもテンポは止まりません。2拍を数え続けます。",

    kind: "rest",
    duration: "half",

    timingLabel:
      "2拍ぶん弾かずに待ちます。",

    timingRhythm:
      "×──────",

    soundPattern: [],
    soundBeats: 2
  },

  {
    id: "quarter-rest",
    category: "rests",
    categoryLabel: "REST",
    name: "4分休符",
    value: "1拍休む",
    exampleType: "single",

    summary:
      "4/4拍子では1拍ぶん音を出さずに休む記号です。",

    tip:
      "休符そのものもリズムです。次の音をどの拍で弾くかまで意識してみましょう。",

    kind: "rest",
    duration: "quarter",

    timingLabel:
      "1拍だけ音を出さずに待ちます。",

    timingRhythm:
      "×────",

    soundPattern: [],
    soundBeats: 1
  },

  {
    id: "eighth-rest",
    category: "rests",
    categoryLabel: "REST",
    name: "8分休符",
    value: "1/2拍休む",
    exampleType: "single",

    summary:
      "4/4拍子では半拍ぶん音を出さずに休む記号です。",

    tip:
      "拍の頭を半拍休めば、そのあとに来る裏拍から音を出すことができます。",

    kind: "rest",
    duration: "eighth",

    timingLabel:
      "半拍休んでから次の音を鳴らす例です。",

    timingRhythm:
      "×──●──",

    soundPattern: [
      0.5
    ],

    soundBeats: 1
  },

  {
    id: "sixteenth-rest",
    category: "rests",
    categoryLabel: "REST",
    name: "16分休符",
    value: "1/4拍休む",
    exampleType: "single",

    summary:
      "4/4拍子では1拍を4等分したうちの1つぶん音を出さずに休みます。",

    tip:
      "16分休符が入ると、細かなリズムのどこで音を出さないかを読む必要があります。",

    kind: "rest",
    duration: "sixteenth",

    timingLabel:
      "最初の1/4拍を休んでから鳴らす例です。",

    timingRhythm:
      "×─●─●─●─",

    soundPattern: [
      0.25,
      0.5,
      0.75
    ],

    soundBeats: 1
  },

  {
    id: "dot",
    category: "symbols",
    categoryLabel: "RHYTHM",
    name: "付点",
    value: "元の長さの1.5倍",
    exampleType: "dot",

    summary:
      "音符や休符の右側に付く点です。元の長さに、その音価の半分を加えます。",

    tip:
      "たとえば付点4分音符なら、1拍＋0.5拍で合計1.5拍になります。",

    timingLabel:
      "付点4分音符を1.5拍伸ばす例です。",

    timingRhythm:
      "●────────",

    soundPattern: [0],
    soundBeats: 1.5
  },

  {
    id: "beam",
    category: "symbols",
    categoryLabel: "RHYTHM",
    name: "連桁",
    value: "拍を読みやすくする",
    exampleType: "beam",

    summary:
      "8分音符や16分音符などの符尾を線でつなぎ、拍のまとまりを読みやすくする表記です。",

    tip:
      "連桁によって音符そのものの長さが変わるわけではありません。KIKUtabでは自動で表示します。",

    timingLabel:
      "この例では1拍を16分音符4つに分けています。",

    timingRhythm:
      "●─●─●─●─",

    soundPattern: [
      0,
      0.25,
      0.5,
      0.75
    ],

    soundBeats: 1
  },

  {
    id: "tie",
    category: "symbols",
    categoryLabel: "CONNECTION",
    name: "タイ",
    value: "同じ高さの音をつなぐ",
    exampleType: "tie",

    summary:
      "同じ高さの2つの音符を曲線でつなぎ、音価を足して1つの長い音として演奏します。",

    tip:
      "タイで結ばれた2つ目の音符は弾き直しません。KIKUtab本体はリズム譜なので音高は固定して表します。",

    timingLabel:
      "2つの4分音符をタイでつないだ例です。",

    timingRhythm:
      "●────────────",

    soundPattern: [0],
    soundBeats: 2
  },

  {
    id: "slur",
    category: "symbols",
    categoryLabel: "CONNECTION",
    name: "スラー",
    value: "なめらかにつなぐ",
    exampleType: "slur",

    summary:
      "複数の音を、ひとまとまりのフレーズとしてなめらかにつないで演奏することを示す記号です。",

    tip:
      "タイとは違い、音符の長さを足して1つの長い音にする記号ではありません。ギターではレガート奏法と関係することがあります。",

    timingLabel:
      "それぞれの音は鳴らしながら、なめらかにつなぎます。",

    timingRhythm:
      "●──●──●",

    soundPattern: [
      0,
      0.5,
      1
    ],

    soundBeats: 1.5,

    soundPitches: [
      392,
      440,
      494
    ]
  },

  {
    id: "triplet",
    category: "tuplets",
    categoryLabel: "TUPLET",
    name: "3連符",
    value: "3つを均等に入れる",
    exampleType: "triplet",

    summary:
      "3連符は、通常なら同じ音価が2つ入る時間に、同じ音価を3つ均等に入れる連符です。",

    tip:
      "代表例では、通常8分音符2つが入る1拍を3等分します。KIKUtabでは3:2の3連符を扱います。",

    timingLabel:
      "この例では1拍を3つの等しい間隔に分けています。",

    timingRhythm:
      "●───●───●",

    soundPattern: [
      0,
      1 / 3,
      2 / 3
    ],

    soundBeats: 1
  },

  {
    id: "quintuplet",
    category: "tuplets",
    categoryLabel: "TUPLET",
    name: "5連符",
    value: "5つを均等に入れる",
    exampleType: "quintuplet",

    summary:
      "5連符は、決められた時間の中へ5つの音を均等な間隔で配置して演奏する連符です。",

    tip:
      "KIKUtabでは5:4として扱います。代表例では通常16分音符4つが入る1拍の中に5つの音を入れます。",

    timingLabel:
      "この例では1拍を5つの等しい間隔に分けています。",

    timingRhythm:
      "●─●─●─●─●",

    soundPattern: [
      0,
      0.2,
      0.4,
      0.6,
      0.8
    ],

    soundBeats: 1
  }
];


/* =========================================================
   REFERENCE RENDER
========================================================= */

function referenceToneClass(
  category
) {
  switch (category) {
    case "notes":
      return "tone-blue";

    case "rests":
      return "tone-mint";

    case "symbols":
      return "tone-peach";

    case "tuplets":
      return "tone-lavender";

    default:
      return "";
  }
}


function makeReferenceNote(
  VF,
  duration,
  key = "b/4",
  dotted = false
) {
  const note =
    new VF.StaveNote({
      clef: "treble",
      keys: [key],
      duration,
      dots:
        dotted
          ? 1
          : 0
    });

  if (dotted) {
    VF.Dot.buildAndAttach(
      [note],
      {
        all: true
      }
    );
  }

  return note;
}


function makeSoftVoice(
  VF,
  notes,
  numBeats = 4,
  beatValue = 4
) {
  const voice =
    new VF.Voice({
      numBeats,
      beatValue
    });

  if (
    VF.Voice?.Mode?.SOFT
      !== undefined
  ) {
    voice.setMode(
      VF.Voice.Mode.SOFT
    );
  }

  voice.addTickables(
    notes
  );

  return voice;
}


function finalizeReferenceSvg(
  element,
  width,
  height
) {
  const svg =
    element.querySelector(
      "svg"
    );

  if (!svg) {
    return;
  }

  svg.setAttribute(
    "viewBox",
    `0 0 ${width} ${height}`
  );

  svg.setAttribute(
    "preserveAspectRatio",
    "xMidYMid meet"
  );

  svg.style.display =
    "block";

  svg.style.width =
    "100%";

  svg.style.height =
    "100%";

  svg.style.margin =
    "0 auto";

  svg.style.overflow =
    "visible";
}


function renderReferenceSingle(
  element,
  item,
  width,
  height,
  dotted = false
) {
  const VF = vf();

  element.innerHTML =
    "";

  const renderer =
    new VF.Renderer(
      element,
      VF.Renderer
        .Backends
        .SVG
    );

  renderer.resize(
    width,
    height
  );

  const context =
    renderer.getContext();

  const staveWidth =
    dotted
      ? 76
      : 58;

  const stave =
    new VF.Stave(
      width / 2
        -
        staveWidth / 2,

      height / 2
        -
        44,

      staveWidth
    );

  stave.setConfigForLines([
    { visible: false },
    { visible: false },
    { visible: false },
    { visible: false },
    { visible: false }
  ]);

  let note;

  if (dotted) {
    note =
      makeReferenceNote(
        VF,
        "q",
        "b/4",
        true
      );
  }

  else {
    const base =
      DURATIONS[
        item.duration
      ].vex;

    note =
      makeReferenceNote(
        VF,

        item.kind === "rest"
          ? `${base}r`
          : base,

        "b/4",

        false
      );
  }

  VF.Formatter
    .FormatAndDraw(
      context,
      stave,
      [note]
    );

  finalizeReferenceSvg(
    element,
    width,
    height
  );
}


function renderReferenceGroup(
  element,
  item,
  width,
  height
) {
  const VF = vf();

  element.innerHTML =
    "";

  const renderer =
    new VF.Renderer(
      element,
      VF.Renderer
        .Backends
        .SVG
    );

  renderer.resize(
    width,
    height
  );

  const context =
    renderer.getContext();

  const stave =
    new VF.Stave(
      18,
      height / 2 - 42,
      width - 36
    );

  stave.setConfigForLines([
    { visible: false },
    { visible: false },
    { visible: false },
    { visible: false },
    { visible: false }
  ]);

  let notes = [];
  let voice = null;
  let beam = null;
  let tie = null;
  let curve = null;
  let tuplet = null;

  switch (
    item.exampleType
  ) {

    case "beam":
      notes = [
        makeReferenceNote(
          VF,
          "16"
        ),
        makeReferenceNote(
          VF,
          "16"
        ),
        makeReferenceNote(
          VF,
          "16"
        ),
        makeReferenceNote(
          VF,
          "16"
        )
      ];

      beam =
        new VF.Beam(
          notes
        );

      voice =
        makeSoftVoice(
          VF,
          notes,
          1,
          4
        );

      break;


    case "tie":
      notes = [
        makeReferenceNote(
          VF,
          "q",
          "b/4"
        ),
        makeReferenceNote(
          VF,
          "q",
          "b/4"
        )
      ];

      voice =
        makeSoftVoice(
          VF,
          notes,
          2,
          4
        );

      tie =
        new VF.StaveTie({
          first_note:
            notes[0],

          last_note:
            notes[1],

          first_indices:
            [0],

          last_indices:
            [0]
        });

      break;


    case "slur":
      notes = [
        makeReferenceNote(
          VF,
          "8",
          "b/4"
        ),
        makeReferenceNote(
          VF,
          "8",
          "c/5"
        ),
        makeReferenceNote(
          VF,
          "8",
          "d/5"
        )
      ];

      voice =
        makeSoftVoice(
          VF,
          notes,
          2,
          4
        );

      curve =
        new VF.Curve(
          notes[0],
          notes[2],

          {
            position:
              VF.Curve
                .Position
                .NEAR_TOP,

            position_end:
              VF.Curve
                .Position
                .NEAR_TOP,

            invert: true,

            y_shift: 2,

            cps: [
              {
                x: 0,
                y: 12
              },
              {
                x: 0,
                y: 12
              }
            ]
          }
        );

      break;


    case "triplet":
      notes = [
        makeReferenceNote(
          VF,
          "8"
        ),
        makeReferenceNote(
          VF,
          "8"
        ),
        makeReferenceNote(
          VF,
          "8"
        )
      ];

      beam =
        new VF.Beam(
          notes
        );

      tuplet =
        new VF.Tuplet(
          notes,
          {
            num_notes: 3,
            notes_occupied: 2,
            bracketed: false,
            ratioed: false,

            location:
              VF.Tuplet
                .LOCATION_TOP
          }
        );

      voice =
        makeSoftVoice(
          VF,
          notes,
          1,
          4
        );

      break;


    case "quintuplet":
      notes = [
        makeReferenceNote(
          VF,
          "16"
        ),
        makeReferenceNote(
          VF,
          "16"
        ),
        makeReferenceNote(
          VF,
          "16"
        ),
        makeReferenceNote(
          VF,
          "16"
        ),
        makeReferenceNote(
          VF,
          "16"
        )
      ];

      beam =
        new VF.Beam(
          notes
        );

      tuplet =
        new VF.Tuplet(
          notes,
          {
            num_notes: 5,
            notes_occupied: 4,
            bracketed: false,
            ratioed: false,

            location:
              VF.Tuplet
                .LOCATION_TOP
          }
        );

      voice =
        makeSoftVoice(
          VF,
          notes,
          1,
          4
        );

      break;


    default:
      return;
  }

  new VF.Formatter()
    .joinVoices(
      [voice]
    )
    .format(
      [voice],

      Math.max(
        80,
        width - 76
      )
    );

  voice.draw(
    context,
    stave
  );

  if (beam) {
    beam
      .setContext(context)
      .draw();
  }

  if (tie) {
    tie
      .setContext(context)
      .draw();
  }

  if (curve) {
    curve
      .setContext(context)
      .draw();
  }

  if (tuplet) {
    tuplet
      .setContext(context)
      .draw();
  }

  finalizeReferenceSvg(
    element,
    width,
    height
  );
}


function renderReferenceExample(
  element,
  item,
  variant = "list"
) {
  if (
    !element
    ||
    !item
  ) {
    return;
  }

  try {
    const single =
      [
        "single",
        "dot"
      ].includes(
        item.exampleType
      );

    let width;
    let height;

    if (
      variant === "large"
    ) {
      width =
        single
          ? 170
          : 360;

      height =
        single
          ? 140
          : 170;
    }

    else if (
      variant === "standard"
    ) {
      width =
        single
          ? 140
          : 280;

      height =
        single
          ? 100
          : 125;
    }

    else {
      width =
        single
          ? 108
          : 220;

      height =
        single
          ? 100
          : 120;
    }

    if (
      item.exampleType
        === "single"
    ) {
      renderReferenceSingle(
        element,
        item,
        width,
        height,
        false
      );
    }

    else if (
      item.exampleType
        === "dot"
    ) {
      renderReferenceSingle(
        element,
        item,
        width,
        height,
        true
      );
    }

    else {
      renderReferenceGroup(
        element,
        item,
        width,
        height
      );
    }
  }

  catch (error) {
    console.warn(
      `KIKUtab: ${item.name}の譜例を描画できませんでした。`,
      error
    );

    element.innerHTML =
      '<span style="display:grid;place-items:center;width:100%;height:100%;font-size:28px;">♪</span>';
  }
}


function renderReference() {
  if (!dom.referenceGrid) {
    return;
  }

  dom.referenceGrid.innerHTML =
    "";

  const items =
    referenceData.filter(
      item =>
        state.activeReferenceFilter
          === "all"
        ||
        item.category
          ===
          state.activeReferenceFilter
    );

  items.forEach(
    item => {

      const button =
        document.createElement(
          "button"
        );

      button.type =
        "button";

      button.className =
        `reference-icon-card ${referenceToneClass(item.category)}`;

      button.dataset.referenceId =
        item.id;

      button.innerHTML = `
        <div class="reference-icon-visual">

          <div
            class="reference-icon-notation"
            data-reference-icon="${item.id}"
          ></div>

        </div>

        <strong>
          ${item.name}
        </strong>
      `;

      button.addEventListener(
        "click",
        () =>
          openReferenceDetail(
            item.id
          )
      );

      dom.referenceGrid
        .appendChild(
          button
        );
    }
  );

  document.querySelectorAll(
    "[data-reference-icon]"
  )
    .forEach(
      element => {

        const item =
          referenceData.find(
            entry =>
              entry.id
              ===
              element.dataset
                .referenceIcon
          );

        if (item) {
          renderReferenceExample(
            element,
            item,
            "list"
          );
        }
      }
    );
}


function openReferenceDetail(id) {
  const item =
    referenceData.find(
      entry =>
        entry.id === id
    );

  if (!item) {
    return;
  }

  stopReferenceAudition();

  state.activeReferenceItemId =
    id;

  dom.referenceDetailCategory
    .textContent =
      item.categoryLabel;

  dom.referenceDetailName
    .textContent =
      item.name;

  dom.referenceDetailValue
    .textContent =
      item.value;

  dom.referenceDetailSummary
    .textContent =
      item.summary;

  if (
    dom.referenceDetailTimingEyebrow
  ) {
    dom.referenceDetailTimingEyebrow
      .textContent =
        "TIMING";
  }

  if (
    dom.referenceDetailTimingHeading
  ) {
    dom.referenceDetailTimingHeading
      .textContent =
        "弾くタイミング";
  }

  dom.referenceDetailTabLabel
    .textContent =
      item.timingLabel;

  dom.referenceDetailTabRhythm
    .textContent =
      item.timingRhythm;

  dom.referenceDetailTip
    .textContent =
      item.tip;

  dom.referenceDetailPreview
    .innerHTML =
      "";

  dom.referenceDetailStandard
    .innerHTML =
      "";

  const bigPreview =
    document.createElement(
      "div"
    );

  bigPreview.className =
    "reference-detail-vex-large";

  dom.referenceDetailPreview
    .appendChild(
      bigPreview
    );

  renderReferenceExample(
    bigPreview,
    item,
    "large"
  );

  const standardPreview =
    document.createElement(
      "div"
    );

  standardPreview.className =
    "reference-detail-vex-standard";

  dom.referenceDetailStandard
    .appendChild(
      standardPreview
    );

  renderReferenceExample(
    standardPreview,
    item,
    "standard"
  );

  resetReferencePlayButton();

  openDialog(
    dom.referenceDetailDialog
  );
}


function closeReferenceDetail() {
  stopReferenceAudition();

  state.activeReferenceItemId =
    null;

  closeDialog(
    dom.referenceDetailDialog
  );
}


function setReferenceFilter(
  filter
) {
  const allowed = [
    "all",
    "notes",
    "rests",
    "symbols",
    "tuplets"
  ];

  if (
    !allowed.includes(filter)
  ) {
    filter = "all";
  }

  state.activeReferenceFilter =
    filter;

  dom.referenceFilters.forEach(
    button => {

      button.classList.toggle(
        "is-active",

        button.dataset
          .referenceFilter
          === filter
      );
    }
  );

  renderReference();
}


/* =========================================================
   STATUS
========================================================= */

function updateStatus() {
  const first =
    measureBeats(0);

  const second =
    measureBeats(1);

  if (
    fCmp(
      first,
      CONFIG.beatsPerMeasure
    ) < 0
  ) {
    dom.measureStatus
      .textContent =
        `1小節目：残り${formatFraction(
          fSub(
            CONFIG.beatsPerMeasure,
            first
          )
        )}拍`;

    return;
  }

  if (
    fCmp(
      second,
      CONFIG.beatsPerMeasure
    ) < 0
  ) {
    dom.measureStatus
      .textContent =
        `2小節目：残り${formatFraction(
          fSub(
            CONFIG.beatsPerMeasure,
            second
          )
        )}拍`;

    return;
  }

  dom.measureStatus
    .textContent =
      "2小節が完成しました";
}


/* =========================================================
   CONTROLS
========================================================= */

function clampBpm(value) {
  if (
    !Number.isFinite(value)
  ) {
    return 120;
  }

  return Math.max(
    30,
    Math.min(
      300,
      Math.round(value)
    )
  );
}


function setBpm(value) {
  const next =
    clampBpm(value);

  if (
    (
      playback.active
      ||
      playback.paused
    )
    &&
    next !== state.bpm
  ) {
    restartPlaybackPosition();
  }

  state.bpm =
    next;

  dom.bpm.value =
    String(
      state.bpm
    );

  saveState();
}


function setSoundMode(mode) {
  if (
    !SOUND_MODES.includes(mode)
  ) {
    mode = "kick";
  }

  if (
    (
      playback.active
      ||
      playback.paused
    )
    &&
    mode !== state.soundMode
  ) {
    restartPlaybackPosition();
  }

  state.soundMode =
    mode;

  if (dom.soundMode) {
    dom.soundMode.value =
      mode;
  }

  const labels = {
    synth: "シンセ",
    kick: "キック",
    snare: "スネア",
    hihat: "ハイハット"
  };

  showToast(
    `再生音：${labels[mode]}`
  );
}


function setSpeed(speed) {
  if (
    ![
      0.5,
      0.75,
      1
    ].includes(speed)
  ) {
    return;
  }

  if (
    (
      playback.active
      ||
      playback.paused
    )
    &&
    speed !== state.speed
  ) {
    restartPlaybackPosition();
  }

  state.speed =
    speed;

  dom.speedButtons.forEach(
    button => {

      button.classList.toggle(
        "is-active",

        Number(
          button.dataset.speed
        )
        === speed
      );
    }
  );
}


function switchView(view) {
  const editor =
    view === "editor";

  closeScoreEditDialog();

  if (!editor) {
    cancelSymbolMode(false);

    if (
      playback.active
      ||
      playback.paused
    ) {
      restartPlaybackPosition();
    }
  }

  else {
    stopReferenceAudition();
  }

  dom.editorView
    .classList
    .toggle(
      "is-hidden",
      !editor
    );

  dom.referenceView
    .classList
    .toggle(
      "is-hidden",
      editor
    );

  dom.viewTabs.forEach(
    button => {

      button.classList.toggle(
        "is-active",

        button.dataset.view
          === view
      );
    }
  );

  if (!editor) {
    renderReference();
  }
}


/* =========================================================
   AUDIO
========================================================= */

function getAudioContext() {
  if (
    !playback.audioContext
  ) {
    const AudioContextClass =
      window.AudioContext
      ||
      window.webkitAudioContext;

    if (
      !AudioContextClass
    ) {
      throw new Error(
        "Web Audio API is not supported."
      );
    }

    playback.audioContext =
      new AudioContextClass();

    audioAssets.noiseBuffer =
      null;
  }

  return playback.audioContext;
}


function trackNode(node) {
  playback.scheduledNodes
    .add(node);

  node.addEventListener?.(
    "ended",
    () =>
      playback.scheduledNodes
        .delete(node),
    {
      once: true
    }
  );
}


function stopScheduledNodes() {
  playback.scheduledNodes
    .forEach(
      node => {

        try {
          node.stop();
        }

        catch {
          /* already stopped */
        }
      }
    );

  playback.scheduledNodes
    .clear();

  playback.scheduledClicks
    .clear();
}


function getNoiseBuffer() {
  const context =
    getAudioContext();

  if (
    audioAssets.noiseBuffer
  ) {
    return (
      audioAssets.noiseBuffer
    );
  }

  const length =
    context.sampleRate;

  const buffer =
    context.createBuffer(
      1,
      length,
      context.sampleRate
    );

  const data =
    buffer.getChannelData(0);

  for (
    let i = 0;
    i < length;
    i += 1
  ) {
    data[i] =
      Math.random() * 2 - 1;
  }

  audioAssets.noiseBuffer =
    buffer;

  return buffer;
}


function scheduleSynth(
  startTime,
  durationSeconds,
  frequency =
    CONFIG.playbackToneHz
) {
  const context =
    getAudioContext();

  if (
    durationSeconds <= 0.005
  ) {
    return;
  }

  const oscillator =
    context.createOscillator();

  const gain =
    context.createGain();

  oscillator.type =
    "sine";

  oscillator.frequency
    .setValueAtTime(
      frequency,
      startTime
    );

  const endTime =
    startTime
    +
    Math.max(
      0.02,
      durationSeconds
    );

  gain.gain
    .setValueAtTime(
      0.0001,
      startTime
    );

  gain.gain
    .exponentialRampToValueAtTime(
      0.13,
      startTime + 0.006
    );

  gain.gain
    .setValueAtTime(
      0.13,

      Math.max(
        startTime + 0.006,
        endTime - 0.03
      )
    );

  gain.gain
    .exponentialRampToValueAtTime(
      0.0001,
      endTime
    );

  oscillator.connect(
    gain
  );

  gain.connect(
    context.destination
  );

  trackNode(
    oscillator
  );

  oscillator.start(
    startTime
  );

  oscillator.stop(
    endTime + 0.01
  );
}


function scheduleKick(
  startTime
) {
  const context =
    getAudioContext();

  const oscillator =
    context.createOscillator();

  const gain =
    context.createGain();

  oscillator.type =
    "sine";

  oscillator.frequency
    .setValueAtTime(
      150,
      startTime
    );

  oscillator.frequency
    .exponentialRampToValueAtTime(
      48,
      startTime + 0.11
    );

  gain.gain
    .setValueAtTime(
      0.9,
      startTime
    );

  gain.gain
    .exponentialRampToValueAtTime(
      0.001,
      startTime + 0.22
    );

  oscillator.connect(
    gain
  );

  gain.connect(
    context.destination
  );

  trackNode(
    oscillator
  );

  oscillator.start(
    startTime
  );

  oscillator.stop(
    startTime + 0.23
  );
}


function scheduleSnare(
  startTime
) {
  const context =
    getAudioContext();

  const noise =
    context.createBufferSource();

  noise.buffer =
    getNoiseBuffer();

  const highpass =
    context.createBiquadFilter();

  highpass.type =
    "highpass";

  highpass.frequency
    .setValueAtTime(
      900,
      startTime
    );

  const noiseGain =
    context.createGain();

  noiseGain.gain
    .setValueAtTime(
      0.42,
      startTime
    );

  noiseGain.gain
    .exponentialRampToValueAtTime(
      0.001,
      startTime + 0.15
    );

  noise.connect(
    highpass
  );

  highpass.connect(
    noiseGain
  );

  noiseGain.connect(
    context.destination
  );

  const oscillator =
    context.createOscillator();

  const bodyGain =
    context.createGain();

  oscillator.type =
    "triangle";

  oscillator.frequency
    .setValueAtTime(
      180,
      startTime
    );

  oscillator.frequency
    .exponentialRampToValueAtTime(
      110,
      startTime + 0.08
    );

  bodyGain.gain
    .setValueAtTime(
      0.30,
      startTime
    );

  bodyGain.gain
    .exponentialRampToValueAtTime(
      0.001,
      startTime + 0.11
    );

  oscillator.connect(
    bodyGain
  );

  bodyGain.connect(
    context.destination
  );

  trackNode(noise);
  trackNode(oscillator);

  noise.start(
    startTime
  );

  noise.stop(
    startTime + 0.16
  );

  oscillator.start(
    startTime
  );

  oscillator.stop(
    startTime + 0.12
  );
}


function scheduleHiHat(
  startTime
) {
  const context =
    getAudioContext();

  const noise =
    context.createBufferSource();

  noise.buffer =
    getNoiseBuffer();

  const highpass =
    context.createBiquadFilter();

  highpass.type =
    "highpass";

  highpass.frequency
    .setValueAtTime(
      6500,
      startTime
    );

  const bandpass =
    context.createBiquadFilter();

  bandpass.type =
    "bandpass";

  bandpass.frequency
    .setValueAtTime(
      10000,
      startTime
    );

  bandpass.Q
    .setValueAtTime(
      0.8,
      startTime
    );

  const gain =
    context.createGain();

  gain.gain
    .setValueAtTime(
      0.22,
      startTime
    );

  gain.gain
    .exponentialRampToValueAtTime(
      0.001,
      startTime + 0.065
    );

  noise.connect(
    highpass
  );

  highpass.connect(
    bandpass
  );

  bandpass.connect(
    gain
  );

  gain.connect(
    context.destination
  );

  trackNode(
    noise
  );

  noise.start(
    startTime
  );

  noise.stop(
    startTime + 0.075
  );
}


function scheduleInstrumentSound(
  startTime,
  durationSeconds,
  mode = playback.soundMode,
  frequency =
    CONFIG.playbackToneHz
) {
  switch (mode) {

    case "kick":
      scheduleKick(
        startTime
      );

      break;


    case "snare":
      scheduleSnare(
        startTime
      );

      break;


    case "hihat":
      scheduleHiHat(
        startTime
      );

      break;


    case "synth":

    default:
      scheduleSynth(
        startTime,
        durationSeconds,
        frequency
      );

      break;
  }
}


function scheduleClick(
  startTime,
  accented,
  countIn = false
) {
  const context =
    getAudioContext();

  const oscillator =
    context.createOscillator();

  const gain =
    context.createGain();

  oscillator.type =
    "square";

  oscillator.frequency
    .setValueAtTime(
      accented
        ? 1350
        : 900,

      startTime
    );

  gain.gain
    .setValueAtTime(
      accented
        ? 0.11
        : 0.07,

      startTime
    );

  gain.gain
    .exponentialRampToValueAtTime(
      0.0001,
      startTime + 0.045
    );

  oscillator.connect(
    gain
  );

  gain.connect(
    context.destination
  );

  trackNode(
    oscillator
  );

  const clickMeta = {
    osc:
      oscillator,

    startTime,

    countIn
  };

  playback.scheduledClicks
    .add(
      clickMeta
    );

  oscillator.addEventListener?.(
    "ended",
    () =>
      playback.scheduledClicks
        .delete(
          clickMeta
        ),
    {
      once: true
    }
  );

  oscillator.start(
    startTime
  );

  oscillator.stop(
    startTime + 0.055
  );
}


function cancelFutureScoreClicks() {
  if (
    !playback.audioContext
  ) {
    return;
  }

  const now =
    playback.audioContext
      .currentTime;

  playback.scheduledClicks
    .forEach(
      click => {

        if (
          click.countIn
          ||
          click.startTime
            <= now + 0.002
        ) {
          return;
        }

        try {
          click.osc.stop();
        }

        catch {
          /* already stopped */
        }

        playback.scheduledClicks
          .delete(
            click
          );
      }
    );

  if (
    playback.phase === "score"
    &&
    playback.snapshot
  ) {
    const beat =
      Math.max(
        0,
        currentScoreBeat(now)
      );

    playback.nextMetronomeBeat =
      Math.floor(
        beat + 0.000001
      )
      + 1;
  }
}


/* =========================================================
   REFERENCE AUDITION
========================================================= */

function resetReferencePlayButton() {
  if (
    !dom.referenceDetailPlay
  ) {
    return;
  }

  dom.referenceDetailPlay
    .classList
    .remove(
      "is-playing"
    );

  dom.referenceDetailPlay
    .innerHTML =
      '<span>▶</span><b>音で確認</b><small>BPM 90</small>';
}


function stopReferenceAudition() {
  if (
    referenceAuditionTimer
  ) {
    clearTimeout(
      referenceAuditionTimer
    );

    referenceAuditionTimer =
      null;
  }

  if (
    !playback.active
    &&
    !playback.paused
  ) {
    stopScheduledNodes();
  }

  resetReferencePlayButton();
}


async function playActiveReferenceExample() {
  const item =
    referenceData.find(
      entry =>
        entry.id
        ===
        state.activeReferenceItemId
    );

  if (!item) {
    return;
  }

  if (
    playback.active
    ||
    playback.paused
  ) {
    restartPlaybackPosition();
  }

  stopReferenceAudition();

  const context =
    getAudioContext();

  await context.resume();

  const bpm = 90;

  const secondsPerBeat =
    60 / bpm;

  const startTime =
    context.currentTime
    +
    0.06;

  dom.referenceDetailPlay
    .classList
    .add(
      "is-playing"
    );

  dom.referenceDetailPlay
    .innerHTML =
      '<span>●</span><b>再生中</b><small>BPM 90</small>';

  const clickCount =
    Math.max(
      1,
      Math.ceil(
        item.soundBeats
      )
    );

  for (
    let beat = 0;
    beat < clickCount;
    beat += 1
  ) {
    scheduleClick(
      startTime
      +
      beat
      *
      secondsPerBeat,

      beat === 0,

      true
    );
  }

  item.soundPattern
    .forEach(
      (
        offsetBeat,
        index
      ) => {

        const duration =
          item.soundPattern.length
            === 1
            ? item.soundBeats
                *
                secondsPerBeat
            : Math.max(
                0.09,

                secondsPerBeat
                *
                (
                  item.id === "slur"
                    ? 0.62
                    : 0.28
                )
              );

        const frequency =
          item.soundPitches?.[
            index
          ]
          ||
          CONFIG.playbackToneHz;

        scheduleInstrumentSound(
          startTime
          +
          offsetBeat
          *
          secondsPerBeat,

          duration,

          "synth",

          frequency
        );
      }
    );

  referenceAuditionTimer =
    window.setTimeout(
      () => {

        referenceAuditionTimer =
          null;

        resetReferencePlayButton();
      },

      Math.max(
        700,

        item.soundBeats
        *
        secondsPerBeat
        *
        1000
        +
        250
      )
    );
}


/* =========================================================
   PLAYBACK UI
========================================================= */

function setPlayButtonState(
  isPlaying
) {
  dom.playIcon.textContent =
    isPlaying
      ? "⏸"
      : "▶";

  dom.playLabel.textContent =
    isPlaying
      ? "一時停止"
      : "再生";

  dom.playToggle.setAttribute(
    "aria-label",

    isPlaying
      ? "一時停止"
      : "再生"
  );
}


function updateLoopButton() {
  dom.loopToggle
    .classList
    .toggle(
      "is-active",
      state.loop
    );

  dom.loopToggle.setAttribute(
    "aria-pressed",
    String(
      state.loop
    )
  );
}


function currentScoreBeat(
  now =
    getAudioContext()
      .currentTime
) {
  if (
    playback.phase
    !== "score"
  ) {
    return playback.pausedBeat;
  }

  return (
    playback.anchorBeat
    +
    (
      now
      -
      playback.anchorAudioTime
    )
    /
    playback.secondsPerBeat
  );
}


function clearPlaybackHighlight() {
  playback.activeItemId =
    null;

  document
    .getElementById(
      "playback-highlight"
    )
    ?.remove();
}


function showPlaybackHighlight(
  itemId
) {
  if (
    !playback.visualSync
    ||
    !itemId
  ) {
    clearPlaybackHighlight();
    return;
  }

  const layout =
    layoutById.get(
      itemId
    );

  if (!layout) {
    return;
  }

  let highlight =
    document.getElementById(
      "playback-highlight"
    );

  if (!highlight) {
    highlight =
      document.createElement(
        "div"
      );

    highlight.id =
      "playback-highlight";

    Object.assign(
      highlight.style,
      {
        position:
          "absolute",

        top:
          "52px",

        width:
          "36px",

        height:
          "110px",

        borderRadius:
          "11px",

        background:
          "rgba(95,127,155,.14)",

        border:
          "1px solid rgba(95,127,155,.28)",

        transform:
          "translateX(-50%)",

        pointerEvents:
          "none",

        transition:
          "left 60ms linear"
      }
    );

    dom.scoreHitLayer
      .appendChild(
        highlight
      );
  }

  highlight.style.left =
    `${layout.x}px`;

  playback.activeItemId =
    itemId;

  if (
    playback.autoScroll
  ) {
    const viewportLeft =
      dom.scoreScroll
        .scrollLeft;

    const viewportWidth =
      dom.scoreScroll
        .clientWidth;

    const triggerRight =
      viewportLeft
      +
      viewportWidth
      *
      0.78;

    const triggerLeft =
      viewportLeft
      +
      viewportWidth
      *
      0.15;

    if (
      layout.x > triggerRight
      ||
      layout.x < triggerLeft
    ) {
      dom.scoreScroll.scrollTo({
        left:
          Math.max(
            0,
            layout.x
            -
            viewportWidth
            *
            0.32
          ),

        behavior:
          "smooth"
      });
    }
  }
}


function findActiveEvent(beat) {
  return (
    playback.snapshot
      ?.events
      .find(
        event =>
          beat
            >= event.startBeat
          &&
          beat
            <
            event.startBeat
            +
            event.durationBeats
      )
    ||
    null
  );
}


function animationTick() {
  if (
    !playback.active
  ) {
    return;
  }

  if (
    playback.phase
      === "score"
  ) {
    const beat =
      currentScoreBeat();

    if (
      playback.visualSync
    ) {
      const event =
        findActiveEvent(beat);

      if (
        event?.id
        !==
        playback.activeItemId
      ) {
        if (event) {
          showPlaybackHighlight(
            event.id
          );
        }

        else {
          clearPlaybackHighlight();
        }
      }
    }
  }

  else {
    clearPlaybackHighlight();
  }

  playback.rafId =
    requestAnimationFrame(
      animationTick
    );
}


/* =========================================================
   SCHEDULER
========================================================= */

function clearScheduler() {
  if (
    !playback.schedulerTimer
  ) {
    return;
  }

  clearInterval(
    playback.schedulerTimer
  );

  playback.schedulerTimer =
    null;
}


function clearAnimationLoop() {
  if (!playback.rafId) {
    return;
  }

  cancelAnimationFrame(
    playback.rafId
  );

  playback.rafId =
    null;
}


function resetSchedulingIndexes(
  positionBeat
) {
  const events =
    playback.snapshot.events;

  playback.pendingPartialEvent =
    events.find(
      event =>
        event.kind === "note"
        &&
        event.attack
        &&
        positionBeat
          >
          event.startBeat
          +
          EPSILON
        &&
        positionBeat
          <
          event.startBeat
          +
          event.soundDurationBeats
          -
          EPSILON
    )
    ||
    null;

  const nextIndex =
    events.findIndex(
      event =>
        event.startBeat
        >=
        positionBeat
        -
        EPSILON
    );

  playback.nextEventIndex =
    nextIndex === -1
      ? events.length
      : nextIndex;

  playback.nextMetronomeBeat =
    Math.ceil(
      positionBeat
      -
      EPSILON
    );
}


function startScheduler() {
  clearScheduler();

  playback.schedulerTimer =
    setInterval(
      schedulerTick,
      CONFIG.scheduleIntervalMs
    );

  schedulerTick();

  clearAnimationLoop();

  playback.rafId =
    requestAnimationFrame(
      animationTick
    );
}


/* =========================================================
   TRANSPORT
========================================================= */

function beginScorePass(
  startBeat,
  anchorTime = null
) {
  const context =
    getAudioContext();

  playback.phase =
    "score";

  playback.anchorBeat =
    startBeat;

  playback.anchorAudioTime =
    anchorTime
    ??
    (
      context.currentTime
      +
      0.05
    );

  playback.pausedBeat =
    startBeat;

  resetSchedulingIndexes(
    startBeat
  );
}


function beginCountIn() {
  const context =
    getAudioContext();

  playback.phase =
    "countin";

  playback.anchorBeat =
    0;

  playback.anchorAudioTime =
    context.currentTime
    +
    0.10;

  playback.countInNextBeat =
    0;

  playback.pausedBeat =
    0;
}


function finishCurrentPass() {
  if (
    !playback.active
  ) {
    return;
  }

  stopScheduledNodes();

  if (state.loop) {
    playback.phase =
      "score";

    playback.anchorBeat =
      0;

    playback.anchorAudioTime =
      getAudioContext()
        .currentTime
      +
      0.045;

    playback.pausedBeat =
      0;

    resetSchedulingIndexes(
      0
    );

    if (
      playback.autoScroll
      &&
      playback.visualSync
    ) {
      dom.scoreScroll
        .scrollTo({
          left: 0,
          behavior: "smooth"
        });
    }

    return;
  }

  stopPlaybackAndResetView();
}


function stopPlaybackAndResetView() {
  playback.active =
    false;

  playback.paused =
    false;

  playback.phase =
    "idle";

  playback.pausedBeat =
    0;

  playback.snapshot =
    null;

  playback.visualSync =
    true;

  playback.autoScroll =
    true;

  playback.pendingPartialEvent =
    null;

  clearScheduler();
  clearAnimationLoop();
  stopScheduledNodes();
  clearPlaybackHighlight();
  setPlayButtonState(false);

  dom.scoreScroll
    .scrollTo({
      left: 0,
      behavior: "smooth"
    });
}


async function startFreshPlayback() {
  const snapshot =
    buildPlaybackSnapshot();

  if (
    snapshot.totalBeats <= 0
  ) {
    showToast(
      "先に譜面を入力してください。"
    );

    return;
  }

  stopReferenceAudition();

  const context =
    getAudioContext();

  await context.resume();

  setEditorOpen(false);

  playback.snapshot =
    snapshot;

  playback.bpm =
    state.bpm;

  playback.speed =
    state.speed;

  playback.soundMode =
    state.soundMode;

  playback.secondsPerBeat =
    60
    /
    (
      playback.bpm
      *
      playback.speed
    );

  playback.active =
    true;

  playback.paused =
    false;

  playback.visualSync =
    true;

  playback.autoScroll =
    true;

  playback.activeItemId =
    null;

  playback.pendingPartialEvent =
    null;

  dom.scoreScroll.scrollLeft =
    0;

  setPlayButtonState(true);

  beginCountIn();

  startScheduler();
}


function pausePlayback() {
  if (
    !playback.active
  ) {
    return;
  }

  playback.pausedBeat =
    playback.phase
      === "countin"
      ? 0
      : Math.max(
          0,

          Math.min(
            playback.snapshot
              .totalBeats,

            currentScoreBeat()
          )
        );

  playback.active =
    false;

  playback.paused =
    true;

  clearScheduler();
  clearAnimationLoop();
  stopScheduledNodes();
  clearPlaybackHighlight();
  setPlayButtonState(false);
}


async function resumePlayback() {
  if (
    !playback.paused
    ||
    !playback.snapshot
  ) {
    return;
  }

  const context =
    getAudioContext();

  await context.resume();

  setEditorOpen(false);

  playback.active =
    true;

  playback.paused =
    false;

  beginScorePass(
    playback.pausedBeat,

    context.currentTime
    +
    0.06
  );

  setPlayButtonState(true);

  startScheduler();
}


async function togglePlayback() {
  if (
    playback.active
  ) {
    pausePlayback();
    return;
  }

  if (
    playback.paused
    &&
    playback.snapshot
  ) {
    await resumePlayback();
    return;
  }

  await startFreshPlayback();
}


function restartPlaybackPosition() {
  if (
    playback.active
    ||
    playback.paused
    ||
    playback.snapshot
  ) {
    playback.active =
      false;

    playback.paused =
      false;

    playback.phase =
      "idle";

    playback.pausedBeat =
      0;

    playback.snapshot =
      null;

    clearScheduler();
    clearAnimationLoop();
    stopScheduledNodes();
    clearPlaybackHighlight();
    setPlayButtonState(false);
  }

  playback.visualSync =
    true;

  playback.autoScroll =
    true;

  playback.pendingPartialEvent =
    null;

  dom.scoreScroll
    .scrollTo({
      left: 0,
      behavior: "smooth"
    });
}


function toggleLoop() {
  state.loop =
    !state.loop;

  updateLoopButton();
}


/* =========================================================
   DIALOG / TOAST
========================================================= */

function showToast(
  text,
  duration = 2000
) {
  clearTimeout(
    toastTimer
  );

  dom.toast.textContent =
    text;

  dom.toast
    .classList
    .remove(
      "is-hidden"
    );

  toastTimer =
    setTimeout(
      () =>
        dom.toast
          .classList
          .add(
            "is-hidden"
          ),

      duration
    );
}


function openDialog(dialog) {
  if (
    dialog?.showModal
    &&
    !dialog.open
  ) {
    dialog.showModal();
  }
}


function closeDialog(dialog) {
  if (
    dialog?.close
    &&
    dialog.open
  ) {
    dialog.close();
  }
}


/* =========================================================
   EVENTS
========================================================= */

function bindEvents() {
  dom.inputEditToggle
    .addEventListener(
      "click",
      () =>
        setEditorOpen(
          !state.editorOpen
        )
    );

  dom.finishEdit
    .addEventListener(
      "click",
      () =>
        setEditorOpen(
          false
        )
    );

  dom.notationButtons
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            const kind =
              button.dataset.kind;

            if (kind) {
              addItem(
                kind,
                button.dataset.duration
              );

              return;
            }

            const symbol =
              button.dataset.symbol;

            if (symbol) {
              setSymbolMode(
                symbol
              );
            }
          }
        );
      }
    );

  dom.inputTabs
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () =>
            switchInputTab(
              button.dataset.inputTab
            )
        );
      }
    );

  dom.bpmDown
    .addEventListener(
      "click",
      () =>
        setBpm(
          state.bpm - 1
        )
    );

  dom.bpmUp
    .addEventListener(
      "click",
      () =>
        setBpm(
          state.bpm + 1
        )
    );

  dom.bpm
    .addEventListener(
      "change",
      () =>
        setBpm(
          Number(
            dom.bpm.value
          )
        )
    );

  dom.soundMode
    ?.addEventListener(
      "change",
      () =>
        setSoundMode(
          dom.soundMode.value
        )
    );

  dom.metronome
    .addEventListener(
      "change",
      () => {

        state.metronome =
          dom.metronome.checked;

        if (
          playback.active
          &&
          playback.phase
            === "score"
        ) {
          cancelFutureScoreClicks();
        }
      }
    );

  dom.undo
    .addEventListener(
      "click",
      undo
    );

  dom.redo
    .addEventListener(
      "click",
      redo
    );

  dom.clearScore
    .addEventListener(
      "click",
      () =>
        openDialog(
          dom.clearDialog
        )
    );

  dom.clearCancel
    .addEventListener(
      "click",
      () =>
        closeDialog(
          dom.clearDialog
        )
    );

  dom.clearConfirm
    .addEventListener(
      "click",
      clearScore
    );

  dom.viewTabs
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () =>
            switchView(
              button.dataset.view
            )
        );
      }
    );

  dom.openReference
    .addEventListener(
      "click",
      () =>
        switchView(
          "reference"
        )
    );

  dom.backEditor
    .addEventListener(
      "click",
      () =>
        switchView(
          "editor"
        )
    );

  dom.referenceFilters
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () =>
            setReferenceFilter(
              button.dataset
                .referenceFilter
            )
        );
      }
    );

  dom.referenceDetailClose
    ?.addEventListener(
      "click",
      closeReferenceDetail
    );

  dom.referenceDetailDialog
    ?.addEventListener(
      "click",
      event => {

        if (
          event.target
          ===
          dom.referenceDetailDialog
        ) {
          closeReferenceDetail();
        }
      }
    );

  dom.referenceDetailDialog
    ?.addEventListener(
      "close",
      () => {

        stopReferenceAudition();

        state.activeReferenceItemId =
          null;
      }
    );

  dom.referenceDetailPlay
    ?.addEventListener(
      "click",
      () => {

        playActiveReferenceExample()
          .catch(
            error => {

              console.error(
                error
              );

              stopReferenceAudition();

              showToast(
                "試聴を開始できませんでした。"
              );
            }
          );
      }
    );

  dom.helpButton
    .addEventListener(
      "click",
      () =>
        openDialog(
          dom.tutorialDialog
        )
    );

  dom.tutorialClose
    .addEventListener(
      "click",
      () =>
        closeDialog(
          dom.tutorialDialog
        )
    );

  dom.tutorialStart
    .addEventListener(
      "click",
      () => {

        if (
          dom.tutorialHide.checked
        ) {
          writeStorageItem(
            CONFIG.tutorialKey,
            "1"
          );
        }

        closeDialog(
          dom.tutorialDialog
        );
      }
    );

  dom.playToggle
    .addEventListener(
      "click",
      () => {

        togglePlayback()
          .catch(
            error => {

              console.error(
                error
              );

              showToast(
                "再生を開始できませんでした。"
              );

              stopPlaybackAndResetView();
            }
          );
      }
    );

  dom.restart
    .addEventListener(
      "click",
      restartPlaybackPosition
    );

  dom.loopToggle
    .addEventListener(
      "click",
      toggleLoop
    );

  dom.speedButtons
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () =>
            setSpeed(
              Number(
                button.dataset.speed
              )
            )
        );
      }
    );

  [
    "pointerdown",
    "touchstart",
    "wheel"
  ].forEach(
    eventName => {

      dom.scoreScroll
        .addEventListener(
          eventName,

          () => {

            if (
              playback.active
              ||
              playback.paused
            ) {
              playback.autoScroll =
                false;
            }
          },

          {
            passive: true
          }
        );
    }
  );

  document.addEventListener(
    "keydown",
    event => {

      if (
        event.key
        !== "Escape"
      ) {
        return;
      }

      if (
        state.symbolMode
      ) {
        cancelSymbolMode();
        return;
      }

      closeScoreEditDialog();
    }
  );

  document.addEventListener(
    "visibilitychange",
    () => {

      if (
        document.hidden
      ) {
        if (
          playback.active
        ) {
          pausePlayback();
        }

        stopReferenceAudition();

        closeScoreEditDialog();
      }
    }
  );
}


/* =========================================================
   TAB INTEGRATION
========================================================= */

Object.assign(
  state,
  {
    scoreView:
      "staff",

    tabInputMode:
      false,

    activeTabItemId:
      null,

    tabInputPhase:
      "string",

    tabPendingBefore:
      null,

    tabEditItemId:
      null,

    tabEditString:
      null
  }
);


Object.assign(
  dom,
  {
    scoreViewTitle:
      document.getElementById(
        "score-view-title"
      ),

    scoreViewToggle:
      document.getElementById(
        "score-view-toggle"
      ),

    tabScoreRender:
      document.getElementById(
        "tab-score-render"
      ),

    tabScoreNote:
      document.getElementById(
        "tab-score-note"
      ),

    tabInputPanel:
      document.getElementById(
        "tab-input-panel"
      ),

    tabInputProgress:
      document.getElementById(
        "tab-input-progress"
      ),

    tabStringStep:
      document.getElementById(
        "tab-string-step"
      ),

    tabFretStep:
      document.getElementById(
        "tab-fret-step"
      ),

    tabFretInput:
      document.getElementById(
        "tab-fret-input"
      ),

    tabFretConfirm:
      document.getElementById(
        "tab-fret-confirm"
      ),

    tabInputCancel:
      document.getElementById(
        "tab-input-cancel"
      ),

    tabStringButtons:
      [
        ...document.querySelectorAll(
          "[data-tab-string]"
        )
      ],

    itemEditPanel:
      document.getElementById(
        "item-edit-panel"
      ),

    itemEditCurrent:
      document.getElementById(
        "item-edit-current"
      ),

    itemEditKind:
      document.getElementById(
        "item-edit-kind"
      ),

    itemEditDuration:
      document.getElementById(
        "item-edit-duration"
      ),

    itemEditDotted:
      document.getElementById(
        "item-edit-dotted"
      ),

    itemEditFret:
      document.getElementById(
        "item-edit-fret"
      ),

    itemEditStringButtons:
      [
        ...document.querySelectorAll(
          "[data-edit-string]"
        )
      ],

    itemEditApply:
      document.getElementById(
        "item-edit-apply"
      ),

    itemEditBrush:
      document.getElementById(
        "item-edit-brush"
      ),

    itemEditRemoveTab:
      document.getElementById(
        "item-edit-remove-tab"
      ),

    itemEditDelete:
      document.getElementById(
        "item-edit-delete"
      ),

    itemEditClose:
      document.getElementById(
        "item-edit-close"
      )
  }
);


const TAB_OPEN_STRING_MIDI = {
  1: 64,
  2: 59,
  3: 55,
  4: 50,
  5: 45,
  6: 40
};


function makeItem(
  kind,
  duration
) {
  return {
    id:
      makeId(),

    kind,

    duration,

    modifiers: {
      dotted: false
    },

    relations: {
      tie: null,
      slurs: [],
      tuplet: null
    },

    tab: null,

    brush: false
  };
}


function normalizeItem(raw) {
  if (
    !raw
    ||
    ![
      "note",
      "rest"
    ].includes(raw.kind)
  ) {
    return null;
  }

  const duration =
    DURATIONS[raw.duration]
      ? raw.duration
      : durationFromLegacyBeats(
          raw.beats
        );

  if (!duration) {
    return null;
  }

  const stringNumber =
    Number(
      raw.tab?.string
    );

  const fretNumber =
    Number(
      raw.tab?.fret
    );

  const validString =
    Number.isInteger(
      stringNumber
    )
    &&
    stringNumber >= 1
    &&
    stringNumber <= 6;

  const validFret =
    Number.isInteger(
      fretNumber
    )
    &&
    fretNumber >= 0
    &&
    fretNumber <= 24;

  const isRest =
    raw.kind === "rest";

  const brush =
    !isRest
    &&
    Boolean(
      raw.brush
    );

  return {
    id:
      typeof raw.id
        === "string"
      &&
      raw.id
        ? raw.id
        : makeId(),

    kind:
      raw.kind,

    duration,

    modifiers: {
      dotted:
        Boolean(
          raw.modifiers?.dotted
          ??
          raw.dotted
          ??
          false
        )
    },

    relations: {
      tie: null,
      slurs: [],
      tuplet: null
    },

    tab:
      !isRest
      &&
      !brush
      &&
      validString
        ? {
            string:
              stringNumber,

            fret:
              validFret
                ? fretNumber
                : null
          }
        : null,

    brush
  };
}


function changeScoreItem(
  itemId,
  kind,
  duration
) {
  if (
    ![
      "note",
      "rest"
    ].includes(kind)
    ||
    !DURATIONS[duration]
  ) {
    return false;
  }

  const current =
    findItemLocation(
      itemId
    );

  if (!current) {
    showToast(
      "変更する音符が見つかりません。"
    );

    return false;
  }

  if (
    current.item.kind
      === kind
    &&
    current.item.duration
      === duration
  ) {
    return true;
  }

  const before =
    cloneScore();

  const trial =
    cloneScore();

  const target =
    findItemLocation(
      itemId,
      trial
    );

  if (!target) {
    return false;
  }

  target.item.kind =
    kind;

  target.item.duration =
    duration;

  if (
    kind === "rest"
  ) {
    target.item.tab =
      null;

    target.item.brush =
      false;
  }

  if (
    !sanitizeRelations(
      trial
    )
    ||
    !isScoreTimingValid(
      trial
    )
  ) {
    showToast(
      "この変更では小節の拍数が成立しません。"
    );

    return false;
  }

  prepareScoreMutation();

  state.score =
    trial;

  const changed =
    findItemLocation(
      itemId
    );

  commitScoreMutation(
    before,

    `${itemDisplayName(changed?.item)}に変更しました。`
  );

  return true;
}


/* =========================================================
   TAB SVG
========================================================= */

function tabSvgElement(
  name,
  attributes = {}
) {
  const element =
    document.createElementNS(
      "http://www.w3.org/2000/svg",
      name
    );

  Object.entries(
    attributes
  )
    .forEach(
      ([key, value]) => {

        element.setAttribute(
          key,
          String(value)
        );
      }
    );

  return element;
}


function tabText(
  target,
  text,
  x,
  y,
  options = {}
) {
  const element =
    tabSvgElement(
      "text",

      {
        x,
        y,

        "text-anchor":
          options.anchor
          ||
          "middle",

        "font-size":
          options.size
          ||
          16,

        "font-weight":
          options.weight
          ||
          600,

        fill:
          options.fill
          ||
          "#1f2933"
      }
    );

  element.textContent =
    text;

  target.appendChild(
    element
  );

  return element;
}


function tabRestSymbol(duration) {
  if (
    duration === "whole"
  ) {
    return "𝄻";
  }

  if (
    duration === "half"
  ) {
    return "𝄼";
  }

  if (
    duration === "eighth"
  ) {
    return "𝄾";
  }

  if (
    duration === "sixteenth"
  ) {
    return "𝄿";
  }

  return "𝄽";
}


function tabDisplayString(item) {
  return (
    Number.isInteger(
      item.tab?.string
    )
      ? item.tab.string
      : 4
  );
}


function tabDisplayText(
  item,
  previewFret = null
) {
  if (item.brush) {
    return "×";
  }

  if (
    Number.isInteger(
      item.tab?.fret
    )
  ) {
    return String(
      item.tab.fret
    );
  }

  if (
    Number.isInteger(
      previewFret
    )
  ) {
    return String(
      previewFret
    );
  }

  return "○";
}


function drawTabNotationEvent(
  target,
  item,
  x,
  geometry,
  options = {}
) {
  const stringYAt =
    geometry.stringYAt;

  const stemBottom =
    geometry.stemBottom;

  const restY =
    geometry.restY;

  const noteFontSize =
    geometry.noteFontSize
    ||
    17;

  const brushFontSize =
    geometry.brushFontSize
    ||
    20;

  const restFontSize =
    geometry.restFontSize
    ||
    26;

  const stemWidth =
    geometry.stemWidth
    ||
    1.7;

  const noteBoxWidth =
    geometry.noteBoxWidth
    ||
    26;

  const noteBoxHeight =
    geometry.noteBoxHeight
    ||
    20;

  const noteBoxOffsetY =
    geometry.noteBoxOffsetY
    ??
    12;

  const textOffsetY =
    geometry.textOffsetY
    ??
    5;

  const stemStartOffsetY =
    geometry.stemStartOffsetY
    ??
    11;

  const dotOffsetX =
    geometry.dotOffsetX
    ??
    12;

  if (
    item.kind === "rest"
  ) {
    tabText(
      target,

      tabRestSymbol(
        item.duration
      ),

      x,
      restY,

      {
        size:
          restFontSize,

        weight: 500
      }
    );

    if (
      item.modifiers?.dotted
    ) {
      tabText(
        target,
        "•",
        x + dotOffsetX,
        restY,

        {
          size:
            geometry.dotFontSize
            ||
            16
        }
      );
    }

    return;
  }

  const y =
    stringYAt(
      tabDisplayString(
        item
      )
    );

  target.appendChild(
    tabSvgElement(
      "rect",

      {
        x:
          x
          -
          noteBoxWidth / 2,

        y:
          y
          -
          noteBoxOffsetY,

        width:
          noteBoxWidth,

        height:
          noteBoxHeight,

        rx:
          geometry.noteBoxRadius
          ||
          3,

        fill:
          "#ffffff"
      }
    )
  );

  const durationCircle =
    !item.brush
    &&
    (
      item.duration === "half"
      ||
      item.duration === "whole"
    );

  if (durationCircle) {
    target.appendChild(
      tabSvgElement(
        "circle",

        {
          cx: x,
          cy: y,

          r:
            geometry.durationCircleRadius
            ||
            10,

          fill:
            "#ffffff",

          stroke:
            "#1f2933",

          "stroke-width":
            geometry.durationCircleWidth
            ||
            1.4
        }
      )
    );
  }

  tabText(
    target,

    tabDisplayText(
      item,
      options.previewFret
    ),

    x,

    y + textOffsetY,

    {
      size:
        item.brush
          ? brushFontSize
          : noteFontSize,

      weight:
        500
    }
  );

  if (
    item.duration !== "whole"
  ) {
    target.appendChild(
      tabSvgElement(
        "line",

        {
          x1: x,

          y1:
            y
            +
            stemStartOffsetY,

          x2: x,

          y2:
            stemBottom,

          stroke:
            "#1f2933",

          "stroke-width":
            stemWidth
        }
      )
    );
  }

  if (
    item.modifiers?.dotted
  ) {
    tabText(
      target,
      "•",

      x + dotOffsetX,

      stemBottom
      +
      (
        geometry.dotBottomOffset
        ||
        11
      ),

      {
        size:
          geometry.dotFontSize
          ||
          16
      }
    );
  }
}


function drawTabBeamLines(
  target,
  firstX,
  lastX,
  level,
  stemBottom,
  beamWidth = 4.5,
  beamGap = 8
) {
  if (
    level >= 1
  ) {
    target.appendChild(
      tabSvgElement(
        "line",

        {
          x1:
            firstX,

          y1:
            stemBottom,

          x2:
            lastX,

          y2:
            stemBottom,

          stroke:
            "#1f2933",

          "stroke-width":
            beamWidth
        }
      )
    );
  }

  if (
    level >= 2
  ) {
    target.appendChild(
      tabSvgElement(
        "line",

        {
          x1:
            firstX,

          y1:
            stemBottom
            +
            beamGap,

          x2:
            lastX,

          y2:
            stemBottom
            +
            beamGap,

          stroke:
            "#1f2933",

          "stroke-width":
            beamWidth
        }
      )
    );
  }
}


function tabBeamLevel(item) {
  if (
    !item
    ||
    item.kind !== "note"
  ) {
    return 0;
  }

  if (
    item.duration === "sixteenth"
  ) {
    return 2;
  }

  if (
    item.duration === "eighth"
  ) {
    return 1;
  }

  return 0;
}


function renderTabPalettePreview(
  element,
  kind,
  duration
) {
  element.innerHTML =
    "";

  const svg =
    tabSvgElement(
      "svg",

      {
        viewBox:
          "0 0 112 74",

        width:
          "112",

        height:
          "74",

        "aria-hidden":
          "true"
      }
    );

  element.appendChild(
    svg
  );

  const top = 9;
  const spacing = 9;

  for (
    let index = 0;
    index < 6;
    index += 1
  ) {
    const y =
      top
      +
      index
      *
      spacing;

    svg.appendChild(
      tabSvgElement(
        "line",

        {
          x1: 8,
          y1: y,
          x2: 104,
          y2: y,

          stroke:
            "#7d858c",

          "stroke-width":
            0.9
        }
      )
    );
  }

  const geometry = {
    stringYAt:
      n =>
        top
        +
        (n - 1)
        *
        spacing,

    stemBottom:
      66,

    restY:
      top
      +
      3
      *
      spacing
      +
      4,

    noteFontSize:
      14,

    brushFontSize:
      16,

    restFontSize:
      22,

    stemWidth:
      1.6,

    noteBoxWidth:
      19,

    noteBoxHeight:
      15,

    noteBoxOffsetY:
      8,

    textOffsetY:
      4.5,

    stemStartOffsetY:
      8,

    dotOffsetX:
      9,

    dotFontSize:
      13,

    durationCircleRadius:
      8,

    durationCircleWidth:
      1.2,

    noteBoxRadius:
      2,

    dotBottomOffset:
      6
  };

  const item = {
    kind,

    duration,

    modifiers: {
      dotted: false
    },

    tab:
      kind === "note"
        ? {
            string: 4,
            fret: 3
          }
        : null,

    brush: false
  };

  if (
    kind === "note"
    &&
    [
      "eighth",
      "sixteenth"
    ].includes(duration)
  ) {
    const xs = [
      43,
      69
    ];

    xs.forEach(
      x =>
        drawTabNotationEvent(
          svg,
          item,
          x,
          geometry,

          {
            previewFret: 3
          }
        )
    );

    drawTabBeamLines(
      svg,
      xs[0],
      xs[1],

      duration
        === "sixteenth"
        ? 2
        : 1,

      geometry.stemBottom,

      3.5,
      6
    );
  }

  else {
    drawTabNotationEvent(
      svg,
      item,
      56,
      geometry,

      {
        previewFret: 3
      }
    );
  }
}


function renderTabTupletIcon(
  target,
  type
) {
  if (!target) {
    return;
  }

  target.innerHTML =
    "";

  const count =
    type === "triplet"
      ? 3
      : 5;

  const level =
    type === "triplet"
      ? 1
      : 2;

  const svg =
    tabSvgElement(
      "svg",

      {
        viewBox:
          "0 0 150 82",

        width:
          "150",

        height:
          "82",

        "aria-hidden":
          "true"
      }
    );

  target.appendChild(
    svg
  );

  const top = 13;
  const spacing = 8;

  for (
    let index = 0;
    index < 6;
    index += 1
  ) {
    const y =
      top
      +
      index
      *
      spacing;

    svg.appendChild(
      tabSvgElement(
        "line",

        {
          x1: 8,
          y1: y,
          x2: 142,
          y2: y,

          stroke:
            "#7d858c",

          "stroke-width":
            0.8
        }
      )
    );
  }

  const geometry = {
    stringYAt:
      n =>
        top
        +
        (n - 1)
        *
        spacing,

    stemBottom:
      69,

    restY:
      41,

    noteFontSize:
      12,

    stemWidth:
      1.4,

    noteBoxWidth:
      16,

    noteBoxHeight:
      14,

    noteBoxOffsetY:
      7,

    textOffsetY:
      4,

    stemStartOffsetY:
      7,

    durationCircleRadius:
      7,

    noteBoxRadius:
      2
  };

  const startX = 32;
  const endX = 118;

  const xs =
    Array.from(
      {
        length: count
      },

      (_, index) =>
        startX
        +
        (
          endX
          -
          startX
        )
        *
        (
          index
          /
          (count - 1)
        )
    );

  const duration =
    type === "triplet"
      ? "eighth"
      : "sixteenth";

  xs.forEach(
    x =>
      drawTabNotationEvent(
        svg,

        {
          kind: "note",

          duration,

          modifiers: {
            dotted: false
          },

          tab: {
            string: 4,
            fret: 3
          },

          brush: false
        },

        x,
        geometry,

        {
          previewFret: 3
        }
      )
  );

  drawTabBeamLines(
    svg,

    xs[0],

    xs[
      xs.length - 1
    ],

    level,

    geometry.stemBottom,

    3.6,

    6
  );

  tabText(
    svg,

    String(count),

    75,

    10,

    {
      size: 12,
      weight: 800
    }
  );
}


function renderNotationIcons() {
  let VF;

  try {
    VF = vf();
  }

  catch {
    return;
  }

  const quickDot =
    document.querySelector(
      ".quick-cards button:nth-child(5) span"
    );

  if (
    quickDot
    &&
    !quickDot.classList
      .contains(
        "vf-icon"
      )
  ) {
    quickDot.className =
      "vf-icon";

    quickDot.dataset.iconKind =
      "note";

    quickDot.dataset.duration =
      "quarter";

    quickDot.dataset.dotted =
      "true";

    quickDot.setAttribute(
      "aria-hidden",
      "true"
    );
  }

  document
    .querySelectorAll(
      ".vf-icon"
    )
    .forEach(
      element => {

        const kind =
          element.dataset.iconKind;

        const duration =
          element.dataset.duration;

        if (
          ![
            "note",
            "rest"
          ].includes(kind)
          ||
          !DURATIONS[duration]
        ) {
          return;
        }

        const isEditorPaletteIcon =
          Boolean(
            element.closest(
              "#editor-tray .notation-button[data-kind]"
            )
          );

        if (
          state.scoreView === "tab"
          &&
          isEditorPaletteIcon
        ) {
          renderTabPalettePreview(
            element,
            kind,
            duration
          );

          return;
        }

        element.innerHTML =
          "";

        try {
          const renderer =
            new VF.Renderer(
              element,
              VF.Renderer
                .Backends
                .SVG
            );

          renderer.resize(
            54,
            54
          );

          const context =
            renderer.getContext();

          const stave =
            new VF.Stave(
              -5,
              -13,
              65
            );

          stave.setConfigForLines([
            { visible: false },
            { visible: false },
            { visible: false },
            { visible: false },
            { visible: false }
          ]);

          const note =
            vexNote({
              kind,

              duration,

              modifiers: {
                dotted:
                  element.dataset.dotted
                    === "true"
              },

              relations: {
                tie: null,
                slurs: [],
                tuplet: null
              }
            });

          VF.Formatter
            .FormatAndDraw(
              context,
              stave,
              [note]
            );
        }

        catch (error) {
          console.warn(
            "KIKUtab: 音符アイコンを描画できませんでした。",
            error
          );
        }
      }
    );
}


function renderInputTupletIcons() {
  [
    "triplet",
    "quintuplet"
  ]
    .forEach(
      type => {

        const target =
          document.querySelector(
            `.tuplet-input-icon[data-tuplet-icon="${type}"]`
          )
          ||
          document.querySelector(
            `.notation-button[data-symbol="${type}"] .symbol-preview.tuplet`
          );

        if (!target) {
          return;
        }

        if (
          state.scoreView
            === "tab"
        ) {
          renderTabTupletIcon(
            target,
            type
          );

          return;
        }

        const item =
          referenceData.find(
            entry =>
              entry.id
                === type
          );

        if (!item) {
          return;
        }

        target.textContent =
          "";

        renderReferenceExample(
          target,
          item,
          "list"
        );
      }
    );
}


function tabMeasureLayout() {
  const layouts = [];

  const measureLeft = [
    82,
    450
  ];

  const measureWidth =
    350;

  state.score
    .measures
    .forEach(
      (
        measure,
        measureIndex
      ) => {

        let beatCursor = 0;

        measure.forEach(
          item => {

            const beats =
              fToNumber(
                itemBeats(item)
              );

            const x =
              measureLeft[
                measureIndex
              ]
              +
              (
                beatCursor / 4
              )
              *
              measureWidth;

            layouts.push({
              id:
                item.id,

              item,

              measureIndex,

              x,

              localBeat:
                beatCursor,

              beats
            });

            beatCursor +=
              beats;
          }
        );
      }
    );

  return layouts;
}


function drawTabScoreLines(svg) {
  const labels = [
    "e",
    "B",
    "G",
    "D",
    "A",
    "E"
  ];

  const top = 52;
  const spacing = 19;

  labels.forEach(
    (label, index) => {

      const y =
        top
        +
        index
        *
        spacing;

      svg.appendChild(
        tabSvgElement(
          "line",

          {
            x1: 54,
            y1: y,
            x2: 860,
            y2: y,

            stroke:
              "#7d858c",

            "stroke-width":
              1
          }
        )
      );

      tabText(
        svg,
        label,
        34,
        y + 4,

        {
          size: 12,
          weight: 700
        }
      );
    }
  );

  tabText(
    svg,
    "TAB",
    22,

    top
    +
    3
    *
    spacing
    +
    4,

    {
      size: 14,
      weight: 800
    }
  );

  [
    66,
    440,
    862
  ]
    .forEach(
      (x, index) => {

        svg.appendChild(
          tabSvgElement(
            "line",

            {
              x1: x,

              y1:
                top - 11,

              x2: x,

              y2:
                top
                +
                5
                *
                spacing
                +
                11,

              stroke:
                "#3f464c",

              "stroke-width":
                index === 1
                  ? 1.2
                  : 1
            }
          )
        );
      }
    );
}


function drawTabScoreBeams(
  svg,
  layouts,
  geometry
) {
  let group = [];

  const flush = () => {
    if (
      group.length >= 2
    ) {
      const maxLevel =
        Math.max(
          ...group.map(
            layout =>
              tabBeamLevel(
                layout.item
              )
          )
        );

      drawTabBeamLines(
        svg,

        group[0].x,

        group[
          group.length - 1
        ].x,

        maxLevel,

        geometry.stemBottom,

        4.2,

        7.5
      );
    }

    group = [];
  };

  layouts.forEach(
    (layout, index) => {

      const level =
        tabBeamLevel(
          layout.item
        );

      if (
        !level
        ||
        layout.item.kind
          !== "note"
      ) {
        flush();
        return;
      }

      if (group.length) {
        const previous =
          group[
            group.length - 1
          ];

        const sameMeasure =
          previous.measureIndex
          ===
          layout.measureIndex;

        const sameBeatBucket =
          Math.floor(
            previous.localBeat
            +
            EPSILON
          )
          ===
          Math.floor(
            layout.localBeat
            +
            EPSILON
          );

        if (
          !sameMeasure
          ||
          !sameBeatBucket
        ) {
          flush();
        }
      }

      group.push(
        layout
      );

      if (
        !layouts[index + 1]
      ) {
        flush();
      }
    }
  );

  flush();
}


function drawTabTuplets(
  svg,
  layouts,
  geometry
) {
  const byId =
    new Map(
      layouts.map(
        layout => [
          layout.id,
          layout
        ]
      )
    );

  state.score
    .relations
    .tuplets
    .forEach(
      relation => {

        const members =
          relation.itemIds
            .map(
              id =>
                byId.get(id)
            )
            .filter(Boolean);

        if (
          members.length
            !==
            relation.itemIds.length
          ||
          members.length < 2
        ) {
          return;
        }

        const first =
          members[0];

        const last =
          members[
            members.length - 1
          ];

        const y =
          geometry.stemBottom
          +
          18;

        svg.appendChild(
          tabSvgElement(
            "line",

            {
              x1:
                first.x,

              y1:
                y,

              x2:
                last.x,

              y2:
                y,

              stroke:
                "#5d6670",

              "stroke-width":
                1
            }
          )
        );

        tabText(
          svg,

          relation.type
            === "triplet"
            ? "3"
            : "5",

          (
            first.x
            +
            last.x
          )
          /
          2,

          y + 4,

          {
            size: 12,
            weight: 800,
            fill: "#3f464c"
          }
        );
      }
    );
}


function drawTabRelations(
  svg,
  layouts
) {
  const byId =
    new Map(
      layouts.map(
        layout => [
          layout.id,
          layout
        ]
      )
    );

  const stringY =
    n =>
      52
      +
      (n - 1)
      *
      19;

  state.score
    .relations
    .ties
    .forEach(
      relation => {

        const first =
          byId.get(
            relation.fromId
          );

        const last =
          byId.get(
            relation.toId
          );

        if (
          !first
          ||
          !last
        ) {
          return;
        }

        const y1 =
          stringY(
            tabDisplayString(
              first.item
            )
          )
          -
          12;

        const y2 =
          stringY(
            tabDisplayString(
              last.item
            )
          )
          -
          12;

        const midX =
          (
            first.x
            +
            last.x
          )
          /
          2;

        const path =
          `M ${first.x + 7} ${y1} `
          +
          `Q ${midX} ${Math.min(y1, y2) - 16} `
          +
          `${last.x - 7} ${y2}`;

        svg.appendChild(
          tabSvgElement(
            "path",

            {
              d: path,

              fill:
                "none",

              stroke:
                "#3f464c",

              "stroke-width":
                1.3
            }
          )
        );
      }
    );

  state.score
    .relations
    .slurs
    .forEach(
      relation => {

        const members =
          relation.itemIds
            .map(
              id =>
                byId.get(id)
            )
            .filter(Boolean);

        if (
          members.length < 2
        ) {
          return;
        }

        const first =
          members[0];

        const last =
          members[
            members.length - 1
          ];

        const y1 =
          stringY(
            tabDisplayString(
              first.item
            )
          )
          -
          22;

        const y2 =
          stringY(
            tabDisplayString(
              last.item
            )
          )
          -
          22;

        const midX =
          (
            first.x
            +
            last.x
          )
          /
          2;

        const path =
          `M ${first.x + 5} ${y1} `
          +
          `Q ${midX} ${Math.min(y1, y2) - 20} `
          +
          `${last.x - 5} ${y2}`;

        svg.appendChild(
          tabSvgElement(
            "path",

            {
              d: path,

              fill:
                "none",

              stroke:
                "#7a8289",

              "stroke-width":
                1,

              "stroke-dasharray":
                "3 2"
            }
          )
        );
      }
    );
}


function renderTabScore() {
  if (
    !dom.tabScoreRender
  ) {
    return;
  }

  dom.tabScoreRender.innerHTML =
    "";

  layoutById.clear();
  vexNoteById.clear();

  dom.scoreHitLayer.innerHTML =
    "";

  drawTabScoreLines(
    dom.tabScoreRender
  );

  const layouts =
    tabMeasureLayout();

  const geometry = {
    stringYAt:
      n =>
        52
        +
        (n - 1)
        *
        19,

    stemBottom:
      183,

    restY:
      113,

    noteFontSize:
      16,

    brushFontSize:
      19,

    restFontSize:
      25,

    stemWidth:
      1.7,

    noteBoxWidth:
      25,

    noteBoxHeight:
      19,

    noteBoxOffsetY:
      11,

    textOffsetY:
      5,

    stemStartOffsetY:
      10,

    dotOffsetX:
      11,

    dotFontSize:
      15,

    durationCircleRadius:
      9.5,

    durationCircleWidth:
      1.3,

    noteBoxRadius:
      3,

    dotBottomOffset:
      9
  };

  layouts.forEach(
    layout => {

      drawTabNotationEvent(
        dom.tabScoreRender,
        layout.item,
        layout.x,
        geometry
      );

      layoutById.set(
        layout.id,

        {
          x:
            layout.x,

          measureIndex:
            layout.measureIndex
        }
      );
    }
  );

  drawTabScoreBeams(
    dom.tabScoreRender,
    layouts,
    geometry
  );

  drawTabTuplets(
    dom.tabScoreRender,
    layouts,
    geometry
  );

  drawTabRelations(
    dom.tabScoreRender,
    layouts
  );

  renderScoreInteractionLayer();
}


function updateScoreViewUI() {
  const isTab =
    state.scoreView
      === "tab";

  dom.scorePanel
    .classList
    .toggle(
      "is-tab-view",
      isTab
    );

  dom.scoreViewTitle
    .textContent =
      isTab
        ? "TAB譜"
        : "五線譜";

  dom.scoreViewToggle
    .textContent =
      isTab
        ? "五線譜に切り替え"
        : "TAB譜に切り替え";

  dom.scoreViewToggle
    .setAttribute(
      "aria-pressed",
      String(isTab)
    );

  dom.tabScoreRender
    .classList
    .toggle(
      "is-hidden",
      !isTab
    );

  dom.scoreRender
    .classList
    .toggle(
      "is-hidden",
      isTab
    );

  dom.tabScoreNote
    .classList
    .toggle(
      "is-hidden",
      !isTab
    );
}


function switchScoreView() {
  if (
    state.symbolMode
  ) {
    cancelSymbolMode(false);
  }

  closeScoreEditDialog();
  closeTabItemEdit(false);
  endTabInput(false, true);

  state.scoreView =
    state.scoreView
      === "staff"
      ? "tab"
      : "staff";

  updateScoreViewUI();
  renderNotationIcons();
  renderInputTupletIcons();
  refresh();
}


function getUnfilledTabNotes() {
  return (
    flattenScoreItems()
      .map(
        entry =>
          entry.item
      )
      .filter(
        item =>
          item.kind === "note"
          &&
          !item.brush
          &&
          !Number.isInteger(
            item.tab?.fret
          )
      )
  );
}


function getFirstUnfilledTabNote() {
  return (
    getUnfilledTabNotes()[0]
    ||
    null
  );
}


function getActiveTabItem() {
  return (
    findItemLocation(
      state.activeTabItemId
    )
      ?.item
    ||
    null
  );
}


function getTabEditItem() {
  return (
    findItemLocation(
      state.tabEditItemId
    )
      ?.item
    ||
    null
  );
}


function getFocusedFretInput() {
  const activeElement =
    document.activeElement;

  if (
    activeElement
      === dom.tabFretInput
  ) {
    return activeElement;
  }

  return null;
}


function calculateRevealScrollDelta(
  rectTop,
  rectBottom,
  visibleTop,
  visibleBottom
) {
  if (rectTop < visibleTop) {
    return rectTop - visibleTop;
  }

  if (rectBottom > visibleBottom) {
    return rectBottom - visibleBottom;
  }

  return 0;
}


function stickyObstructionBottom(
  element,
  viewportTop
) {
  if (!element) {
    return viewportTop;
  }

  const style =
    window.getComputedStyle(
      element
    );

  if (
    style.display === "none"
    ||
    style.visibility === "hidden"
    ||
    ![
      "fixed",
      "sticky"
    ].includes(
      style.position
    )
  ) {
    return viewportTop;
  }

  const rect =
    element.getBoundingClientRect();

  const declaredTop =
    Number.parseFloat(
      style.top
    );

  const stuckTop =
    viewportTop
    +
    (
      Number.isFinite(
        declaredTop
      )
        ? declaredTop
        : 0
    );

  if (
    style.position === "sticky"
    &&
    rect.top > stuckTop + 2
  ) {
    return viewportTop;
  }

  return Math.max(
    viewportTop,
    rect.bottom
  );
}


function revealFocusedFretInput() {
  if (
    !document.documentElement
      .classList.contains(
        "is-fret-input-focused"
      )
  ) {
    return;
  }

  const input =
    getFocusedFretInput();

  if (!input) {
    return;
  }

  const rect =
    (
      input.closest(
        ".tab-fret-row"
      )
      ||
      input
    )
      .getBoundingClientRect();

  const viewport =
    window.visualViewport;

  const viewportTop =
    viewport?.offsetTop
    ||
    0;

  const viewportHeight =
    viewport?.height
    ||
    window.innerHeight;

  const visibleTop =
    Math.max(
      viewportTop + 12,

      stickyObstructionBottom(
        dom.scorePanel
          ?.querySelector(
            ".score-sticky"
          ),
        viewportTop
      ) + 12,

      stickyObstructionBottom(
        dom.editorTray
          ?.querySelector(
            ".input-tabs"
          ),
        viewportTop
      ) + 12
    );

  const visibleBottom =
    viewportTop
    + viewportHeight
    - 12;

  const scrollDelta =
    calculateRevealScrollDelta(
      rect.top,
      rect.bottom,
      visibleTop,
      visibleBottom
    );

  if (!scrollDelta) {
    return;
  }

  window.scrollTo({
    top:
      Math.max(
        0,
        window.scrollY
        + scrollDelta
      ),

    left:
      window.scrollX,

    behavior:
      "auto"
  });
}


function scheduleFocusedFretInputReveal(
  delay = 80
) {
  if (!getFocusedFretInput()) {
    return;
  }

  if (
    fretInputRevealTimer
      !== null
  ) {
    window.clearTimeout(
      fretInputRevealTimer
    );
  }

  fretInputRevealTimer =
    window.setTimeout(
      () => {
        fretInputRevealTimer =
          null;

        revealFocusedFretInput();
      },
      delay
    );
}


function handleFretInputFocus() {
  if (
    !window.matchMedia(
      "(max-width: 760px)"
    ).matches
  ) {
    return;
  }

  document.documentElement
    .classList.add(
      "is-fret-input-focused"
    );

  scheduleFocusedFretInputReveal(
    240
  );
}


function handleFretInputBlur() {
  if (
    fretInputRevealTimer
      !== null
  ) {
    window.clearTimeout(
      fretInputRevealTimer
    );

    fretInputRevealTimer =
      null;
  }

  window.setTimeout(
    () => {
      if (getFocusedFretInput()) {
        return;
      }

      document.documentElement
        .classList.remove(
          "is-fret-input-focused"
        );
    },
    180
  );
}


function startTabInput() {
  const first =
    getFirstUnfilledTabNote();

  if (!first) {
    showToast(
      "入力する○はありません。"
    );

    return;
  }

  setEditorOpen(true);
  closeTabItemEdit(false);

  state.tabInputMode =
    true;

  state.activeTabItemId =
    first.id;

  state.tabInputPhase =
    "string";

  state.tabPendingBefore =
    null;

  if (
    dom.tabFretInput
  ) {
    dom.tabFretInput.value =
      "";
  }

  refresh();
}


function endTabInput(
  shouldRefresh = true,
  revertPending = true
) {
  if (
    revertPending
    &&
    state.tabPendingBefore
  ) {
    state.score =
      state.tabPendingBefore;
  }

  state.tabInputMode =
    false;

  state.activeTabItemId =
    null;

  state.tabInputPhase =
    "string";

  state.tabPendingBefore =
    null;

  if (
    dom.tabFretInput
  ) {
    dom.tabFretInput.value =
      "";
  }

  if (
    shouldRefresh
  ) {
    refresh();
  }
}


function selectTabString(
  stringNumber
) {
  const item =
    getActiveTabItem();

  if (
    !item
    ||
    item.kind !== "note"
    ||
    item.brush
  ) {
    return;
  }

  if (
    !state.tabPendingBefore
  ) {
    state.tabPendingBefore =
      cloneScore();
  }

  item.tab = {
    string:
      stringNumber,

    fret:
      null
  };

  state.tabInputPhase =
    "fret";

  if (
    dom.tabFretInput
  ) {
    dom.tabFretInput.value =
      "";
  }

  refresh();

  requestAnimationFrame(
    () =>
      dom.tabFretInput
        ?.focus({
          preventScroll: true
        })
  );
}


function confirmTabFret() {
  const item =
    getActiveTabItem();

  if (!item) {
    return;
  }

  if (
    !Number.isInteger(
      item.tab?.string
    )
  ) {
    showToast(
      "先に弦を選んでください。"
    );

    return;
  }

  const fret =
    Number(
      dom.tabFretInput
        ?.value
    );

  if (
    !Number.isInteger(
      fret
    )
    ||
    fret < 0
    ||
    fret > 24
  ) {
    showToast(
      "フレット番号は0〜24で入力してください。"
    );

    return;
  }

  const before =
    state.tabPendingBefore
    ||
    cloneScore();

  item.tab.fret =
    fret;

  state.history.push(
    before
  );

  if (
    state.history.length > 100
  ) {
    state.history.shift();
  }

  state.future =
    [];

  state.tabPendingBefore =
    null;

  saveState();

  const next =
    getFirstUnfilledTabNote();

  if (!next) {
    state.tabInputMode =
      false;

    state.activeTabItemId =
      null;

    state.tabInputPhase =
      "string";

    if (
      dom.tabFretInput
    ) {
      dom.tabFretInput.value =
        "";
    }

    refresh();

    showToast(
      "TAB情報の入力が完了しました。"
    );

    return;
  }

  state.activeTabItemId =
    next.id;

  state.tabInputPhase =
    "string";

  if (
    dom.tabFretInput
  ) {
    dom.tabFretInput.value =
      "";
  }

  refresh();
}


function updateTabInputUI() {
  if (
    !dom.tabInputPanel
  ) {
    return;
  }

  dom.tabInputPanel
    .classList
    .toggle(
      "is-hidden",
      !state.tabInputMode
    );

  if (
    !state.tabInputMode
  ) {
    return;
  }

  const item =
    getActiveTabItem();

  if (!item) {
    endTabInput(
      false,
      true
    );

    dom.tabInputPanel
      .classList
      .add(
        "is-hidden"
      );

    return;
  }

  const noteItems =
    flattenScoreItems()
      .map(
        entry =>
          entry.item
      )
      .filter(
        entry =>
          entry.kind === "note"
          &&
          !entry.brush
      );

  const currentIndex =
    noteItems.findIndex(
      entry =>
        entry.id === item.id
    );

  dom.tabInputProgress
    .textContent =
      `${currentIndex + 1}個目の音を入力中`;

  dom.tabStringButtons
    .forEach(
      button => {

        button.classList.toggle(
          "is-active",

          item.tab?.string
          ===
          Number(
            button.dataset
              .tabString
          )
        );
      }
    );

  dom.tabFretStep
    .classList
    .toggle(
      "is-hidden",

      state.tabInputPhase
      !== "fret"
    );
}


function openTabItemEdit(
  itemId
) {
  const location =
    findItemLocation(
      itemId
    );

  if (!location) {
    return;
  }

  endTabInput(
    false,
    true
  );

  setEditorOpen(true);

  state.tabEditItemId =
    itemId;

  state.tabEditString =
    Number.isInteger(
      location.item
        .tab?.string
    )
      ? location.item
          .tab.string
      : null;

  refresh();
}


function closeTabItemEdit(
  shouldRefresh = true
) {
  state.tabEditItemId =
    null;

  state.tabEditString =
    null;

  if (
    shouldRefresh
  ) {
    refresh();
  }
}


function updateTabItemEditUI() {
  if (
    !dom.itemEditPanel
  ) {
    return;
  }

  const item =
    getTabEditItem();

  dom.itemEditPanel
    .classList
    .toggle(
      "is-hidden",
      !item
    );

  if (!item) {
    return;
  }

  const base =
    item.kind === "rest"
      ? `${durationLabel(item.duration)}休符`
      : `${durationLabel(item.duration)}音符`;

  const extras = [];

  if (
    item.modifiers?.dotted
  ) {
    extras.push(
      "付点"
    );
  }

  if (
    item.brush
  ) {
    extras.push(
      "ブラッシング"
    );
  }

  if (
    Number.isInteger(
      item.tab?.fret
    )
  ) {
    extras.push(
      `${item.tab.string}弦 ${item.tab.fret}F`
    );
  }

  dom.itemEditCurrent
    .textContent =
      `${base}${
        extras.length
          ? ` / ${extras.join(" / ")}`
          : ""
      }を編集中`;

  dom.itemEditKind.value =
    item.kind;

  dom.itemEditDuration.value =
    item.duration;

  dom.itemEditDotted.value =
    item.modifiers?.dotted
      ? "yes"
      : "no";

  dom.itemEditFret.value =
    Number.isInteger(
      item.tab?.fret
    )
      ? String(
          item.tab.fret
        )
      : "";

  const tabDisabled =
    item.kind === "rest"
    ||
    item.brush;

  dom.itemEditFret.disabled =
    tabDisabled;

  dom.itemEditStringButtons
    .forEach(
      button => {

        button.disabled =
          tabDisabled;

        button.classList.toggle(
          "is-active",

          state.tabEditString
          ===
          Number(
            button.dataset
              .editString
          )
        );
      }
    );
}


function commitTabTrial(
  before,
  trial,
  successMessage = ""
) {
  if (
    !sanitizeRelations(
      trial
    )
    ||
    !isScoreTimingValid(
      trial
    )
  ) {
    showToast(
      "この変更では小節の拍数が成立しません。"
    );

    return false;
  }

  prepareScoreMutation();

  state.score =
    trial;

  state.history.push(
    before
  );

  if (
    state.history.length > 100
  ) {
    state.history.shift();
  }

  state.future =
    [];

  saveState();
  refresh();

  if (
    successMessage
  ) {
    showToast(
      successMessage
    );
  }

  return true;
}


function applyTabItemEdit() {
  const current =
    findItemLocation(
      state.tabEditItemId
    );

  if (!current) {
    return;
  }

  const nextKind =
    dom.itemEditKind.value;

  const nextDuration =
    dom.itemEditDuration.value;

  const nextDotted =
    dom.itemEditDotted.value
      === "yes";

  if (
    ![
      "note",
      "rest"
    ].includes(nextKind)
    ||
    !DURATIONS[nextDuration]
  ) {
    return;
  }

  const before =
    cloneScore();

  const trial =
    cloneScore();

  const target =
    findItemLocation(
      state.tabEditItemId,
      trial
    );

  if (!target) {
    return;
  }

  target.item.kind =
    nextKind;

  target.item.duration =
    nextDuration;

  target.item.modifiers =
    target.item.modifiers
    ||
    {};

  target.item
    .modifiers
    .dotted =
      nextDotted;

  if (
    nextKind === "rest"
  ) {
    target.item.tab =
      null;

    target.item.brush =
      false;

    state.tabEditString =
      null;
  }

  else if (
    !target.item.brush
  ) {
    const fretText =
      dom.itemEditFret
        .value
        .trim();

    if (
      fretText !== ""
    ) {
      const fret =
        Number(
          fretText
        );

      if (
        !Number.isInteger(
          fret
        )
        ||
        fret < 0
        ||
        fret > 24
      ) {
        showToast(
          "フレット番号は0〜24で入力してください。"
        );

        return;
      }

      if (
        !Number.isInteger(
          state.tabEditString
        )
      ) {
        showToast(
          "フレットを設定する場合は弦も選んでください。"
        );

        return;
      }

      target.item.tab = {
        string:
          state.tabEditString,

        fret
      };
    }

    else if (
      Number.isInteger(
        target.item
          .tab?.fret
      )
      &&
      Number.isInteger(
        state.tabEditString
      )
    ) {
      target.item.tab.string =
        state.tabEditString;
    }
  }

  commitTabTrial(
    before,
    trial,
    "変更を反映しました。"
  );
}


function toggleTabItemBrush() {
  const current =
    findItemLocation(
      state.tabEditItemId
    );

  if (
    !current
    ||
    current.item.kind
      === "rest"
  ) {
    showToast(
      "休符はブラッシングにできません。"
    );

    return;
  }

  const before =
    cloneScore();

  const trial =
    cloneScore();

  const target =
    findItemLocation(
      state.tabEditItemId,
      trial
    );

  target.item.brush =
    !target.item.brush;

  if (
    target.item.brush
  ) {
    target.item.tab =
      null;

    state.tabEditString =
      null;

    trial.relations.ties =
      trial.relations
        .ties
        .filter(
          relation =>
            relation.fromId
              !== target.id
            &&
            relation.toId
              !== target.id
        );

    trial.relations.slurs =
      trial.relations
        .slurs
        .filter(
          relation =>
            !relation.itemIds
              .includes(
                target.id
              )
        );
  }

  commitTabTrial(
    before,

    trial,

    target.item.brush
      ? "ブラッシングに変更しました。"
      : "ブラッシングを解除しました。"
  );
}


function removeTabFromItem() {
  const current =
    findItemLocation(
      state.tabEditItemId
    );

  if (
    !current
    ||
    current.item.kind
      === "rest"
  ) {
    return;
  }

  const before =
    cloneScore();

  const trial =
    cloneScore();

  const target =
    findItemLocation(
      state.tabEditItemId,
      trial
    );

  target.item.tab =
    null;

  state.tabEditString =
    null;

  commitTabTrial(
    before,
    trial,
    "TAB数字を外しました。"
  );
}


function deleteTabEditedItem() {
  const current =
    findItemLocation(
      state.tabEditItemId
    );

  if (!current) {
    return;
  }

  const before =
    cloneScore();

  const trial =
    cloneScore();

  trial.measures[
    current.measureIndex
  ] =
    trial.measures[
      current.measureIndex
    ]
    .filter(
      item =>
        item.id
        !==
        state.tabEditItemId
    );

  trial.relations.ties =
    trial.relations
      .ties
      .filter(
        relation =>
          relation.fromId
            !==
            state.tabEditItemId
          &&
          relation.toId
            !==
            state.tabEditItemId
      );

  trial.relations.slurs =
    trial.relations
      .slurs
      .filter(
        relation =>
          !relation.itemIds
            .includes(
              state.tabEditItemId
            )
      );

  trial.relations.tuplets =
    trial.relations
      .tuplets
      .filter(
        relation =>
          !relation.itemIds
            .includes(
              state.tabEditItemId
            )
      );

  state.tabEditItemId =
    null;

  state.tabEditString =
    null;

  commitTabTrial(
    before,
    trial,
    "削除しました。"
  );
}


function renderTabItemTargets() {
  flattenScoreItems()
    .forEach(
      entry => {

        const layout =
          layoutById.get(
            entry.id
          );

        if (!layout) {
          return;
        }

        const button =
          makeScoreControlButton();

        button.classList.add(
          "kikutab-item-edit-target",
          "tab-item-target"
        );

        const isUnfilled =
          entry.item.kind
            === "note"
          &&
          !entry.item.brush
          &&
          !Number.isInteger(
            entry.item
              .tab?.fret
          );

        button.setAttribute(
          "aria-label",

          isUnfilled
            ? "TAB情報を入力"
            : `${itemDisplayName(entry.item)}を編集`
        );

        button.title =
          isUnfilled
            ? "TAB情報を入力"
            : `${itemDisplayName(entry.item)}を編集`;

        button.style.left =
          `${layout.x - 22}px`;

        button.style.top =
          "38px";

        button.style.width =
          "44px";

        button.style.height =
          "152px";

        button.style.borderRadius =
          "10px";

        const active =
          state.activeTabItemId
            === entry.id
          ||
          state.tabEditItemId
            === entry.id;

        if (active) {
          button.style.background =
            "rgba(144,171,195,.14)";

          button.style.border =
            "1.5px solid #90abc3";
        }

        button.addEventListener(
          "click",
          event => {

            event.preventDefault();
            event.stopPropagation();

            if (isUnfilled) {
              startTabInput();
            }

            else {
              openTabItemEdit(
                entry.id
              );
            }
          }
        );

        dom.scoreHitLayer
          .appendChild(
            button
          );
      }
    );
}


function renderScoreInteractionLayer() {
  if (
    !dom.scoreHitLayer
  ) {
    return;
  }

  clearScoreControls();

  if (
    !state.editorOpen
  ) {
    return;
  }

  if (
    state.symbolMode
  ) {
    renderSymbolTargetButtons();
    return;
  }

  if (
    state.scoreView === "tab"
  ) {
    renderTabItemTargets();
    renderRelationBadges();

    return;
  }

  renderItemEditTargets();
  renderRelationBadges();
}


function refresh() {
  updateScoreViewUI();

  if (
    state.scoreView === "tab"
  ) {
    renderTabScore();
  }

  else {
    renderScore();
  }

  updateStatus();
  updateTabInputUI();
  updateTabItemEditUI();

  dom.undo.disabled =
    state.history.length
      === 0;

  dom.redo.disabled =
    state.future.length
      === 0;
}


/* =========================================================
   TAB AUDIO
========================================================= */

function midiToFrequency(
  midi
) {
  return (
    440
    *
    Math.pow(
      2,
      (midi - 69) / 12
    )
  );
}


function tabItemFrequency(item) {
  if (
    !Number.isInteger(
      item?.tab?.string
    )
    ||
    !Number.isInteger(
      item?.tab?.fret
    )
  ) {
    return null;
  }

  return midiToFrequency(
    TAB_OPEN_STRING_MIDI[
      item.tab.string
    ]
    +
    item.tab.fret
  );
}


function scheduleGuitarPluck(
  startTime,
  durationSeconds,
  frequency
) {
  const context =
    getAudioContext();

  const oscillatorA =
    context.createOscillator();

  const oscillatorB =
    context.createOscillator();

  const filter =
    context.createBiquadFilter();

  const gain =
    context.createGain();

  oscillatorA.type =
    "triangle";

  oscillatorB.type =
    "sine";

  oscillatorA.frequency
    .setValueAtTime(
      frequency,
      startTime
    );

  oscillatorB.frequency
    .setValueAtTime(
      frequency * 2,
      startTime
    );

  oscillatorB.detune
    .setValueAtTime(
      -7,
      startTime
    );

  filter.type =
    "lowpass";

  filter.frequency
    .setValueAtTime(
      Math.min(
        4200,

        Math.max(
          1000,
          frequency * 8
        )
      ),

      startTime
    );

  filter.frequency
    .exponentialRampToValueAtTime(
      Math.max(
        500,
        frequency * 2.5
      ),

      startTime
      +
      Math.min(
        0.35,
        durationSeconds
      )
    );

  filter.Q
    .setValueAtTime(
      0.8,
      startTime
    );

  gain.gain
    .setValueAtTime(
      0.0001,
      startTime
    );

  gain.gain
    .exponentialRampToValueAtTime(
      0.16,
      startTime + 0.006
    );

  gain.gain
    .exponentialRampToValueAtTime(
      0.055,

      startTime
      +
      Math.min(
        0.09,
        durationSeconds * 0.35
      )
    );

  gain.gain
    .exponentialRampToValueAtTime(
      0.0001,

      startTime
      +
      Math.max(
        0.08,
        durationSeconds
      )
    );

  const overtoneGain =
    context.createGain();

  overtoneGain.gain
    .setValueAtTime(
      0.035,
      startTime
    );

  overtoneGain.gain
    .exponentialRampToValueAtTime(
      0.0001,

      startTime
      +
      Math.min(
        0.12,
        durationSeconds
      )
    );

  oscillatorA.connect(
    filter
  );

  filter.connect(
    gain
  );

  gain.connect(
    context.destination
  );

  oscillatorB.connect(
    overtoneGain
  );

  overtoneGain.connect(
    context.destination
  );

  trackNode(
    oscillatorA
  );

  trackNode(
    oscillatorB
  );

  oscillatorA.start(
    startTime
  );

  oscillatorB.start(
    startTime
  );

  oscillatorA.stop(
    startTime
    +
    Math.max(
      0.1,
      durationSeconds
    )
    +
    0.03
  );

  oscillatorB.stop(
    startTime
    +
    Math.min(
      0.15,

      Math.max(
        0.1,
        durationSeconds
      )
    )
    +
    0.02
  );
}


function scheduleBrushSound(
  startTime
) {
  const context =
    getAudioContext();

  const noise =
    context.createBufferSource();

  noise.buffer =
    getNoiseBuffer();

  const highpass =
    context.createBiquadFilter();

  highpass.type =
    "highpass";

  highpass.frequency
    .setValueAtTime(
      1300,
      startTime
    );

  const gain =
    context.createGain();

  gain.gain
    .setValueAtTime(
      0.16,
      startTime
    );

  gain.gain
    .exponentialRampToValueAtTime(
      0.001,
      startTime + 0.085
    );

  noise.connect(
    highpass
  );

  highpass.connect(
    gain
  );

  gain.connect(
    context.destination
  );

  trackNode(
    noise
  );

  noise.start(
    startTime
  );

  noise.stop(
    startTime + 0.09
  );
}


function scheduleScoreEventSound(
  event,
  startTime,
  durationSeconds
) {
  if (
    event.brush
  ) {
    scheduleBrushSound(
      startTime
    );

    return;
  }

  if (
    Number.isFinite(
      event.frequency
    )
  ) {
    scheduleGuitarPluck(
      startTime,
      durationSeconds,
      event.frequency
    );

    return;
  }

  scheduleInstrumentSound(
    startTime,
    durationSeconds
  );
}


function buildPlaybackSnapshot() {
  const score =
    cloneScore();

  const events = [];

  let cursor = 0;

  score.measures[0]
    .forEach(
      item => {

        const durationBeats =
          fToNumber(
            itemBeats(item)
          );

        events.push({
          id:
            item.id,

          kind:
            item.kind,

          startBeat:
            cursor,

          durationBeats,

          soundDurationBeats:
            durationBeats,

          attack:
            true,

          measureIndex:
            0,

          brush:
            Boolean(
              item.brush
            ),

          frequency:
            tabItemFrequency(
              item
            )
        });

        cursor +=
          durationBeats;
      }
    );

  const firstUsed =
    cursor;

  if (
    score.measures[1].length
      > 0
  ) {
    cursor = 4;

    score.measures[1]
      .forEach(
        item => {

          const durationBeats =
            fToNumber(
              itemBeats(item)
            );

          events.push({
            id:
              item.id,

            kind:
              item.kind,

            startBeat:
              cursor,

            durationBeats,

            soundDurationBeats:
              durationBeats,

            attack:
              true,

            measureIndex:
              1,

            brush:
              Boolean(
                item.brush
              ),

            frequency:
              tabItemFrequency(
                item
              )
          });

          cursor +=
            durationBeats;
        }
      );
  }

  const eventById =
    new Map(
      events.map(
        event => [
          event.id,
          event
        ]
      )
    );

  const tieNext =
    new Map();

  const tiedFromPrevious =
    new Set();

  score.relations.ties
    .forEach(
      relation => {

        tieNext.set(
          relation.fromId,
          relation.toId
        );

        tiedFromPrevious.add(
          relation.toId
        );
      }
    );

  events.forEach(
    event => {

      if (
        tiedFromPrevious.has(
          event.id
        )
      ) {
        event.attack =
          false;

        return;
      }

      let currentId =
        event.id;

      let guard = 0;

      while (
        tieNext.has(
          currentId
        )
        &&
        guard < 20
      ) {
        const nextId =
          tieNext.get(
            currentId
          );

        const nextEvent =
          eventById.get(
            nextId
          );

        if (
          !nextEvent
          ||
          nextEvent.kind
            !== "note"
        ) {
          break;
        }

        event.soundDurationBeats +=
          nextEvent.durationBeats;

        currentId =
          nextId;

        guard += 1;
      }
    }
  );

  const totalBeats =
    score.measures[1].length
      > 0
      ? 8
      : firstUsed > 0
        ? firstUsed
        : 0;

  return {
    score,
    events,
    totalBeats
  };
}


function schedulePartialEventIfNeeded(
  now
) {
  const event =
    playback.pendingPartialEvent;

  if (!event) {
    return;
  }

  playback.pendingPartialEvent =
    null;

  const beat =
    currentScoreBeat(now);

  const remainingBeats =
    event.startBeat
    +
    event.soundDurationBeats
    -
    beat;

  if (
    remainingBeats <= 0
  ) {
    return;
  }

  scheduleScoreEventSound(
    event,

    now + 0.006,

    remainingBeats
    *
    playback.secondsPerBeat
  );
}


function schedulerTick() {
  if (
    !playback.active
  ) {
    return;
  }

  const context =
    getAudioContext();

  const now =
    context.currentTime;

  const horizon =
    now
    +
    CONFIG.scheduleAheadSeconds;

  if (
    playback.phase
      === "countin"
  ) {
    while (
      playback.countInNextBeat < 4
    ) {
      const clickTime =
        playback.anchorAudioTime
        +
        playback.countInNextBeat
        *
        playback.secondsPerBeat;

      if (
        clickTime > horizon
      ) {
        break;
      }

      if (
        clickTime
          >=
          now - 0.02
      ) {
        scheduleClick(
          Math.max(
            clickTime,
            now + 0.002
          ),

          playback.countInNextBeat
            === 0,

          true
        );
      }

      playback.countInNextBeat +=
        1;
    }

    const countInEnd =
      playback.anchorAudioTime
      +
      4
      *
      playback.secondsPerBeat;

    if (
      countInEnd > horizon
    ) {
      return;
    }

    beginScorePass(
      0,
      countInEnd
    );
  }

  if (
    playback.phase
      !== "score"
  ) {
    return;
  }

  schedulePartialEventIfNeeded(
    now
  );

  const currentBeat =
    currentScoreBeat(
      now
    );

  const totalBeats =
    playback.snapshot
      .totalBeats;

  while (
    playback.nextEventIndex
    <
    playback.snapshot
      .events
      .length
  ) {
    const event =
      playback.snapshot
        .events[
          playback.nextEventIndex
        ];

    if (
      event.startBeat
      +
      event.durationBeats
      <=
      playback.anchorBeat
      +
      EPSILON
    ) {
      playback.nextEventIndex +=
        1;

      continue;
    }

    const eventTime =
      playback.anchorAudioTime
      +
      (
        event.startBeat
        -
        playback.anchorBeat
      )
      *
      playback.secondsPerBeat;

    if (
      eventTime > horizon
    ) {
      break;
    }

    if (
      event.kind === "note"
      &&
      event.attack
    ) {
      const latenessSeconds =
        Math.max(
          0,
          now - eventTime
        );

      const fullDurationSeconds =
        event.soundDurationBeats
        *
        playback.secondsPerBeat;

      const remainingDuration =
        fullDurationSeconds
        -
        latenessSeconds;

      if (
        remainingDuration > 0.01
      ) {
        scheduleScoreEventSound(
          event,

          Math.max(
            eventTime,
            now + 0.003
          ),

          remainingDuration
        );
      }
    }

    playback.nextEventIndex +=
      1;
  }

  while (
    playback.nextMetronomeBeat
      < totalBeats
  ) {
    const beatNumber =
      playback.nextMetronomeBeat;

    const clickTime =
      playback.anchorAudioTime
      +
      (
        beatNumber
        -
        playback.anchorBeat
      )
      *
      playback.secondsPerBeat;

    if (
      clickTime > horizon
    ) {
      break;
    }

    if (
      state.metronome
    ) {
      scheduleClick(
        Math.max(
          clickTime,
          now + 0.002
        ),

        beatNumber % 4
          === 0,

        false
      );
    }

    playback.nextMetronomeBeat +=
      1;
  }

  if (
    currentBeat
      >=
      totalBeats
      -
      0.002
  ) {
    finishCurrentPass();
  }
}


/* =========================================================
   HISTORY
========================================================= */

function undo() {
  if (
    !state.history.length
  ) {
    return;
  }

  endTabInput(
    false,
    true
  );

  closeTabItemEdit(false);

  prepareScoreMutation();

  state.future.push(
    cloneScore()
  );

  state.score =
    state.history.pop();

  cancelSymbolMode(false);

  saveState();
  refresh();
}


function redo() {
  if (
    !state.future.length
  ) {
    return;
  }

  endTabInput(
    false,
    true
  );

  closeTabItemEdit(false);

  prepareScoreMutation();

  state.history.push(
    cloneScore()
  );

  state.score =
    state.future.pop();

  cancelSymbolMode(false);

  saveState();
  refresh();
}


/* =========================================================
   EDITOR OPEN
========================================================= */

function setEditorOpen(open) {
  state.editorOpen =
    Boolean(open);

  if (
    !state.editorOpen
  ) {
    endTabInput(
      false,
      true
    );

    closeTabItemEdit(false);

    cancelSymbolMode(false);

    closeScoreEditDialog();
  }

  dom.editorTray
    .classList
    .toggle(
      "is-hidden",
      !state.editorOpen
    );

  dom.scorePanel
    .classList
    .toggle(
      "is-editing",
      state.editorOpen
    );

  dom.inputEditToggle
    .classList
    .toggle(
      "is-active",
      state.editorOpen
    );

  dom.inputEditToggle
    .setAttribute(
      "aria-expanded",
      String(
        state.editorOpen
      )
    );

  dom.inputEditLabel
    .textContent =
      state.editorOpen
        ? "完了"
        : "入力・編集";

  renderScoreInteractionLayer();
  updateTabInputUI();
  updateTabItemEditUI();
}


/* =========================================================
   CLEAR
========================================================= */

function clearScore() {
  prepareScoreMutation();

  endTabInput(
    false,
    false
  );

  closeTabItemEdit(false);

  cancelSymbolMode(false);

  closeScoreEditDialog();

  state.score = {
    measures: [
      [],
      []
    ],

    relations: {
      ties: [],
      slurs: [],
      tuplets: []
    }
  };

  state.history = [];
  state.future = [];

  saveState();
  refresh();

  dom.scoreScroll.scrollLeft =
    0;

  closeDialog(
    dom.clearDialog
  );

  showToast(
    "譜面をクリアしました。"
  );
}


/* =========================================================
   TAB EVENTS
========================================================= */

function bindTabEvents() {
  dom.scoreViewToggle
    ?.addEventListener(
      "click",
      switchScoreView
    );

  dom.tabStringButtons
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () =>
            selectTabString(
              Number(
                button.dataset
                  .tabString
              )
            )
        );
      }
    );

  dom.tabFretConfirm
    ?.addEventListener(
      "click",
      confirmTabFret
    );

  dom.tabFretInput
    ?.addEventListener(
      "keydown",
      event => {

        if (
          event.key === "Enter"
        ) {
          confirmTabFret();
        }
      }
    );

  dom.tabFretInput
    ?.addEventListener(
      "focus",
      handleFretInputFocus
    );

  dom.tabFretInput
    ?.addEventListener(
      "blur",
      handleFretInputBlur
    );

  window.visualViewport
    ?.addEventListener(
      "resize",
      () =>
        scheduleFocusedFretInputReveal(
          80
        )
    );

  dom.tabInputCancel
    ?.addEventListener(
      "click",
      () =>
        endTabInput(
          true,
          true
        )
    );

  dom.itemEditStringButtons
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            state.tabEditString =
              Number(
                button.dataset
                  .editString
              );

            updateTabItemEditUI();
          }
        );
      }
    );

  dom.itemEditApply
    ?.addEventListener(
      "click",
      applyTabItemEdit
    );

  dom.itemEditBrush
    ?.addEventListener(
      "click",
      toggleTabItemBrush
    );

  dom.itemEditRemoveTab
    ?.addEventListener(
      "click",
      removeTabFromItem
    );

  dom.itemEditDelete
    ?.addEventListener(
      "click",
      deleteTabEditedItem
    );

  dom.itemEditClose
    ?.addEventListener(
      "click",
      () =>
        closeTabItemEdit(
          true
        )
    );

  document.addEventListener(
    "keydown",
    event => {

      if (
        event.key !== "Escape"
      ) {
        return;
      }

      if (
        state.tabInputMode
      ) {
        endTabInput(
          true,
          true
        );

        return;
      }

      if (
        state.tabEditItemId
      ) {
        closeTabItemEdit(
          true
        );
      }
    }
  );
}


/* =========================================================
   RESPONSIVE UI
========================================================= */

function updateResponsiveUiClasses() {
  const compact =
    window.matchMedia(
      "(max-width: 760px)"
    ).matches;

  const touch =
    window.matchMedia(
      "(pointer: coarse)"
    ).matches
    ||
    navigator.maxTouchPoints
      > 0;

  document.documentElement
    .classList
    .toggle(
      "is-compact-ui",
      compact
    );

  document.documentElement
    .classList
    .toggle(
      "is-touch-ui",
      touch
    );
}


/* =========================================================
   START
========================================================= */

function start() {
  updateResponsiveUiClasses();

  window.addEventListener(
    "resize",

    updateResponsiveUiClasses,

    {
      passive: true
    }
  );

  window.addEventListener(
    "orientationchange",

    updateResponsiveUiClasses,

    {
      passive: true
    }
  );

  const restored =
    restoreState();

  dom.bpm.value =
    String(
      state.bpm
    );

  state.metronome =
    true;

  state.loop =
    false;

  state.speed =
    1;

  state.soundMode =
    "kick";

  state.symbolMode =
    null;

  state.symbolSelection =
    [];

  state.scoreView =
    "staff";

  state.tabInputMode =
    false;

  state.activeTabItemId =
    null;

  state.tabInputPhase =
    "string";

  state.tabPendingBefore =
    null;

  state.tabEditItemId =
    null;

  state.tabEditString =
    null;

  dom.metronome.checked =
    true;

  if (
    dom.soundMode
  ) {
    dom.soundMode.value =
      state.soundMode;
  }

  bindEvents();
  bindTabEvents();

  switchInputTab(
    "notes"
  );

  setEditorOpen(
    false
  );

  updateScoreViewUI();
  renderNotationIcons();
  renderReference();
  renderInputTupletIcons();
  refresh();

  updateLoopButton();
  updateSymbolButtons();

  setSpeed(1);

  setPlayButtonState(
    false
  );

  if (restored) {
    setTimeout(
      () =>
        showToast(
          "前回の譜面を復元しました。"
        ),

      300
    );
  }

  const hideTutorial =
    readStorageItem(
      CONFIG.tutorialKey
    )
      === "1"
    ||
    readStorageItem(
      CONFIG.legacyTutorialKey
    )
      === "1";

  if (
    readStorageItem(
      CONFIG.tutorialKey
    )
      !== "1"
    &&
    readStorageItem(
      CONFIG.legacyTutorialKey
    )
      === "1"
  ) {
    writeStorageItem(
      CONFIG.tutorialKey,
      "1"
    );
  }

  if (
    !hideTutorial
    &&
    !restored
  ) {
    setTimeout(
      () =>
        openDialog(
          dom.tutorialDialog
        ),

      450
    );
  }
}


start();
