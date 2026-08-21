"use strict";

const DURATION_INFO = {
  whole: {
    beats: 4,
    beatLabel: "4拍",
    label: "全音符",
    restLabel: "全休符",
    symbol: "𝅝"
  },
  half: {
    beats: 2,
    beatLabel: "2拍",
    label: "2分音符",
    restLabel: "2分休符",
    symbol: "𝅗𝅥"
  },
  quarter: {
    beats: 1,
    beatLabel: "1拍",
    label: "4分音符",
    restLabel: "4分休符",
    symbol: "♩"
  },
  eighth: {
    beats: 0.5,
    beatLabel: "1/2拍",
    label: "8分音符",
    restLabel: "8分休符",
    symbol: "♪"
  },
  sixteenth: {
    beats: 0.25,
    beatLabel: "1/4拍",
    label: "16分音符",
    restLabel: "16分休符",
    symbol: "♬"
  }
};

const MAX_BEATS = 8;
const BASE_MILLISECONDS_PER_BEAT = 500;

const dom = {
  undoButton: document.getElementById("undo-button"),
  redoButton: document.getElementById("redo-button"),
  scoreScroll: document.getElementById("score-scroll"),
  emptyScore: document.getElementById("empty-score"),
  scoreNotes: document.getElementById("score-notes"),
  playbackCursor: document.getElementById("playback-cursor"),
  measureStatus: document.getElementById("measure-status"),
  playButton: document.getElementById("play-button"),
  playIcon: document.getElementById("play-icon"),
  playLabel: document.getElementById("play-label"),
  restartButton: document.getElementById("restart-button"),
  loopButton: document.getElementById("loop-button"),
  speedButton: document.getElementById("speed-button"),
  speedLabel: document.getElementById("speed-label"),
  stepMarkers: [...document.querySelectorAll("[data-step-marker]")],
  stepKicker: document.getElementById("step-kicker"),
  stepTitle: document.getElementById("step-title"),
  stepGuide: document.getElementById("step-guide"),
  closeSelectionButton: document.getElementById("close-selection-button"),
  durationStep: document.getElementById("duration-step"),
  stringStep: document.getElementById("string-step"),
  fretStep: document.getElementById("fret-step"),
  editStep: document.getElementById("edit-step"),
  kindButtons: [...document.querySelectorAll("[data-kind]")],
  durationButtons: [...document.querySelectorAll("[data-duration]")],
  selectedDurationSummary: document.getElementById("selected-duration-summary"),
  stringButtons: [...document.querySelectorAll("[data-string]")],
  selectedStringLabel: document.getElementById("selected-string-label"),
  backToStringButton: document.getElementById("back-to-string-button"),
  fretDisplay: document.getElementById("fret-display"),
  digitButtons: [...document.querySelectorAll("[data-digit]")],
  fretClearButton: document.getElementById("fret-clear-button"),
  fretBackspaceButton: document.getElementById("fret-backspace-button"),
  confirmFretButton: document.getElementById("confirm-fret-button"),
  editSummary: document.getElementById("edit-summary"),
  editTabButton: document.getElementById("edit-tab-button"),
  deleteNoteButton: document.getElementById("delete-note-button"),
  feedback: document.getElementById("feedback")
};

const state = {
  items: [],
  history: [],
  future: [],
  kind: "note",
  step: "duration",
  activeId: null,
  fretText: "",
  editingExisting: false,
  editHistoryPushed: false,
  loop: false,
  speed: 1,
  playing: false,
  playbackIndex: -1,
  playbackTimer: null,
  audioContext: null,
  idCounter: 0
};

function cloneItems(items = state.items) {
  return JSON.parse(JSON.stringify(items));
}

function makeId() {
  state.idCounter += 1;
  return `prototype-note-${state.idCounter}`;
}

function totalBeats() {
  return state.items.reduce((sum, item) => sum + item.beats, 0);
}

function activeItem() {
  return state.items.find(item => item.id === state.activeId) || null;
}

function itemNumber(item) {
  return state.items.findIndex(entry => entry.id === item?.id) + 1;
}

function itemLabel(item) {
  if (!item) {
    return "";
  }

  const info = DURATION_INFO[item.duration];
  return item.kind === "rest" ? info.restLabel : info.label;
}

function pushHistory() {
  state.history.push(cloneItems());

  if (state.history.length > 50) {
    state.history.shift();
  }

  state.future = [];
}

function setFeedback(message, isError = false) {
  dom.feedback.textContent = message;
  dom.feedback.classList.toggle("is-error", isError);
}

function stopPlayback(resetScroll = false) {
  if (state.playbackTimer !== null) {
    window.clearTimeout(state.playbackTimer);
    state.playbackTimer = null;
  }

  state.playing = false;
  state.playbackIndex = -1;
  dom.playButton.classList.remove("is-playing");
  dom.playIcon.textContent = "▶";
  dom.playLabel.textContent = "再生";
  dom.playbackCursor.classList.remove("is-visible");

  if (resetScroll) {
    dom.scoreScroll.scrollTo({ left: 0, behavior: "smooth" });
  }

  renderScore();
}

function resetWorkflow() {
  state.step = "duration";
  state.activeId = null;
  state.fretText = "";
  state.editingExisting = false;
  state.editHistoryPushed = false;
}

function undo() {
  if (!state.history.length) {
    return;
  }

  stopPlayback();
  state.future.push(cloneItems());
  state.items = state.history.pop();
  resetWorkflow();
  setFeedback("1つ前の状態に戻しました。");
  render();
}

function redo() {
  if (!state.future.length) {
    return;
  }

  stopPlayback();
  state.history.push(cloneItems());
  state.items = state.future.pop();
  resetWorkflow();
  setFeedback("やり直しました。");
  render();
}

function updateHistoryButtons() {
  dom.undoButton.disabled = state.history.length === 0;
  dom.redoButton.disabled = state.future.length === 0;
}

function updateMeasureStatus() {
  const used = totalBeats();

  if (used >= MAX_BEATS) {
    dom.measureStatus.textContent = "2小節完成";
    return;
  }

  if (used < 4) {
    dom.measureStatus.textContent = `1小節目：残り${formatBeats(4 - used)}拍`;
    return;
  }

  dom.measureStatus.textContent = `2小節目：残り${formatBeats(8 - used)}拍`;
}

function formatBeats(value) {
  if (Number.isInteger(value)) {
    return String(value);
  }

  if (value === 0.5) {
    return "1/2";
  }

  if (value === 0.25) {
    return "1/4";
  }

  if (value === 0.75) {
    return "3/4";
  }

  return String(value);
}

function startBeatForIndex(index) {
  return state.items
    .slice(0, index)
    .reduce((sum, item) => sum + item.beats, 0);
}

function xForIndex(index) {
  return 68 + startBeatForIndex(index) * 95;
}

function tabTopForItem(item) {
  if (item.kind === "rest") {
    return 125;
  }

  if (!Number.isInteger(item.string)) {
    return 125;
  }

  return 100 + (item.string - 1) * 12;
}

function renderScore() {
  dom.emptyScore.classList.toggle("is-hidden", state.items.length > 0);
  dom.scoreNotes.innerHTML = "";

  state.items.forEach((item, index) => {
    const button = document.createElement("button");
    const info = DURATION_INFO[item.duration];
    const isActive = item.id === state.activeId;
    const isPlaying = index === state.playbackIndex;
    const tabText = item.kind === "rest"
      ? "休"
      : Number.isInteger(item.fret)
        ? String(item.fret)
        : "○";

    button.type = "button";
    button.className = "score-note";
    button.dataset.itemId = item.id;
    button.style.left = `${xForIndex(index)}px`;
    button.style.setProperty("--tab-top", `${tabTopForItem(item)}px`);
    button.setAttribute(
      "aria-label",
      `${index + 1}個目、${itemLabel(item)}、${info.beatLabel}${item.kind === "note" && Number.isInteger(item.fret) ? `、${item.string}弦${item.fret}フレット` : ""}`
    );

    button.classList.toggle("is-rest", item.kind === "rest");
    button.classList.toggle("is-pending", item.kind === "note" && !Number.isInteger(item.fret));
    button.classList.toggle("is-selected", isActive);
    button.classList.toggle("is-playing", isPlaying);

    const staffSymbol = document.createElement("span");
    staffSymbol.className = "staff-symbol";
    staffSymbol.textContent = item.kind === "rest" ? "休" : info.symbol;

    const indexLabel = document.createElement("span");
    indexLabel.className = "note-index";
    indexLabel.textContent = `${index + 1}個目`;

    const tabNumber = document.createElement("span");
    tabNumber.className = "tab-number";
    tabNumber.textContent = tabText;

    button.append(staffSymbol, indexLabel, tabNumber);
    button.addEventListener("click", () => openItemEditor(item.id));
    dom.scoreNotes.appendChild(button);
  });

  if (state.playbackIndex >= 0 && state.playbackIndex < state.items.length) {
    dom.playbackCursor.style.left = `${xForIndex(state.playbackIndex) + 25}px`;
    dom.playbackCursor.classList.add("is-visible");
  } else {
    dom.playbackCursor.classList.remove("is-visible");
  }
}

function scrollItemIntoView(itemId) {
  const index = state.items.findIndex(item => item.id === itemId);

  if (index < 0) {
    return;
  }

  const targetLeft = xForIndex(index) - dom.scoreScroll.clientWidth / 2 + 25;
  dom.scoreScroll.scrollTo({
    left: Math.max(0, targetLeft),
    behavior: "smooth"
  });
}

function setStep(step) {
  state.step = step;
  const item = activeItem();
  const number = itemNumber(item);

  dom.durationStep.classList.toggle("is-hidden", step !== "duration");
  dom.stringStep.classList.toggle("is-hidden", step !== "string");
  dom.fretStep.classList.toggle("is-hidden", step !== "fret");
  dom.editStep.classList.toggle("is-hidden", step !== "edit");
  dom.closeSelectionButton.classList.toggle("is-hidden", step !== "edit");

  dom.stepMarkers.forEach((marker, index) => {
    const order = ["duration", "string", "fret"];
    const currentIndex = order.indexOf(step);
    marker.classList.toggle("is-current", marker.dataset.stepMarker === step);
    marker.classList.toggle("is-done", currentIndex > index || step === "edit");
  });

  if (step === "duration") {
    dom.stepKicker.textContent = totalBeats() >= MAX_BEATS ? "2 MEASURES COMPLETE" : "STEP 1";
    dom.stepTitle.textContent = totalBeats() >= MAX_BEATS
      ? "2小節が完成しました"
      : `${state.items.length + 1}個目の音を入力`;
    dom.stepGuide.textContent = totalBeats() >= MAX_BEATS
      ? "再生してリズムを確認できます。戻す操作で入力を修正できます。"
      : "音符か休符を選び、音の長さを選んでください。";
  }

  if (step === "string" && item) {
    dom.stepKicker.textContent = "STEP 2";
    dom.stepTitle.textContent = `${number}個目：弦を選ぶ`;
    dom.stepGuide.textContent = "手元のTAB譜と同じ弦を、そのまま選んでください。";
    dom.selectedDurationSummary.textContent = `${itemLabel(item)}：${DURATION_INFO[item.duration].beatLabel}`;
  }

  if (step === "fret" && item) {
    dom.stepKicker.textContent = "STEP 3";
    dom.stepTitle.textContent = `${number}個目：フレットを入力`;
    dom.stepGuide.textContent = "画面内の数字キーを使うため、スマホのキーボードは開きません。";
    dom.selectedStringLabel.textContent = `${item.string}弦`;
  }

  if (step === "edit" && item) {
    dom.stepKicker.textContent = "SELECTED NOTE";
    dom.stepTitle.textContent = `${number}個目を選択中`;
    dom.stepGuide.textContent = "選んだ音に関係する操作だけを表示しています。";
    renderEditSummary(item);
  }
}

function renderEditSummary(item) {
  const info = DURATION_INFO[item.duration];
  const tabInfo = item.kind === "rest"
    ? "TAB情報なし"
    : Number.isInteger(item.fret)
      ? `${item.string}弦・${item.fret}フレット`
      : "TAB情報は未入力";

  dom.editSummary.innerHTML = "";

  const title = document.createElement("strong");
  title.textContent = `${itemLabel(item)}：${info.beatLabel}`;

  const detail = document.createElement("span");
  detail.textContent = tabInfo;

  dom.editSummary.append(title, detail);
  dom.editTabButton.disabled = item.kind === "rest";
}

function updateKindButtons() {
  dom.kindButtons.forEach(button => {
    const selected = button.dataset.kind === state.kind;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });

  dom.durationButtons.forEach(button => {
    const info = DURATION_INFO[button.dataset.duration];
    const symbol = button.querySelector(".duration-symbol");
    const name = button.querySelector("b");
    const unavailable = totalBeats() + info.beats > MAX_BEATS;

    symbol.textContent = state.kind === "rest" ? "休" : info.symbol;
    symbol.classList.toggle("is-rest-symbol", state.kind === "rest");
    name.textContent = state.kind === "rest" ? info.restLabel : info.label;
    button.disabled = unavailable;
  });
}

function render() {
  renderScore();
  updateMeasureStatus();
  updateHistoryButtons();
  updateKindButtons();
  setStep(state.step);
  dom.fretDisplay.textContent = state.fretText || "—";
}

function chooseDuration(duration) {
  const info = DURATION_INFO[duration];

  if (!info || totalBeats() + info.beats > MAX_BEATS) {
    setFeedback("2小節を超える長さは追加できません。", true);
    return;
  }

  stopPlayback();
  pushHistory();

  const item = {
    id: makeId(),
    kind: state.kind,
    duration,
    beats: info.beats,
    string: null,
    fret: null
  };

  state.items.push(item);
  state.activeId = item.id;
  state.fretText = "";
  state.editingExisting = false;
  state.editHistoryPushed = false;

  if (item.kind === "rest") {
    state.step = "duration";
    setFeedback(`${info.restLabel}（${info.beatLabel}）を追加しました。`);
  } else {
    state.step = "string";
    setFeedback(`${info.label}を追加しました。次は弦を選びます。`);
  }

  render();
  window.setTimeout(() => scrollItemIntoView(item.id), 0);
}

function chooseString(stringNumber) {
  const item = activeItem();

  if (!item || item.kind !== "note") {
    return;
  }

  if (state.editingExisting && !state.editHistoryPushed) {
    pushHistory();
    state.editHistoryPushed = true;
  }

  item.string = stringNumber;
  item.fret = null;
  state.fretText = "";
  state.step = "fret";
  setFeedback(`${stringNumber}弦を選びました。フレット番号を入力してください。`);
  render();
}

function appendFretDigit(digit) {
  const nextText = state.fretText === "0" ? digit : `${state.fretText}${digit}`;
  const nextValue = Number(nextText);

  if (nextText.length > 2 || nextValue > 24) {
    setFeedback("フレット番号は0〜24で入力してください。", true);
    return;
  }

  state.fretText = nextText;
  setFeedback("0〜24の範囲で入力できます。");
  render();
}

function clearFret() {
  state.fretText = "";
  render();
}

function backspaceFret() {
  state.fretText = state.fretText.slice(0, -1);
  render();
}

function confirmFret() {
  const item = activeItem();
  const fret = Number(state.fretText);

  if (!item || !Number.isInteger(item.string)) {
    setFeedback("先に弦を選んでください。", true);
    return;
  }

  if (state.fretText === "" || !Number.isInteger(fret) || fret < 0 || fret > 24) {
    setFeedback("フレット番号は0〜24で入力してください。", true);
    return;
  }

  item.fret = fret;
  const number = itemNumber(item);
  state.step = "duration";
  state.fretText = "";
  state.editingExisting = false;
  state.editHistoryPushed = false;
  setFeedback(`${number}個目：${item.string}弦・${item.fret}フレットで決定しました。`);
  render();
  scrollItemIntoView(item.id);
}

function backToString() {
  const item = activeItem();

  if (!item) {
    return;
  }

  state.fretText = "";
  state.step = "string";
  setFeedback("弦を選び直せます。");
  render();
}

function openItemEditor(itemId) {
  stopPlayback();
  state.activeId = itemId;
  state.step = "edit";
  state.fretText = "";
  state.editingExisting = false;
  state.editHistoryPushed = false;
  setFeedback("選択中の音だけを編集できます。");
  render();
  scrollItemIntoView(itemId);
}

function closeItemEditor() {
  resetWorkflow();
  setFeedback("音の長さを選ぶと、次の音を追加できます。");
  render();
}

function startExistingTabEdit() {
  const item = activeItem();

  if (!item || item.kind === "rest") {
    return;
  }

  state.editingExisting = true;
  state.editHistoryPushed = false;
  state.step = "string";
  setFeedback("新しい弦を選んでください。");
  render();
}

function deleteActiveItem() {
  const item = activeItem();

  if (!item) {
    return;
  }

  stopPlayback();
  pushHistory();
  state.items = state.items.filter(entry => entry.id !== item.id);
  resetWorkflow();
  setFeedback("選択していた音を削除しました。");
  render();
}

function ensureAudioContext() {
  if (state.audioContext) {
    return state.audioContext;
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;

  if (!AudioContextClass) {
    return null;
  }

  state.audioContext = new AudioContextClass();
  return state.audioContext;
}

function playTone(item) {
  if (item.kind === "rest") {
    return;
  }

  const context = ensureAudioContext();

  if (!context) {
    return;
  }

  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const frequency = Number.isInteger(item.string)
    ? 164 + (7 - item.string) * 22
    : 220;

  oscillator.type = "sine";
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.13);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.14);
}

function renderPlaybackPosition() {
  renderScore();

  if (state.playbackIndex < 0) {
    return;
  }

  const item = state.items[state.playbackIndex];
  if (item) {
    scrollItemIntoView(item.id);
  }
}

function playNextItem() {
  if (!state.playing) {
    return;
  }

  if (state.playbackIndex >= state.items.length) {
    if (state.loop && state.items.length) {
      state.playbackIndex = 0;
    } else {
      stopPlayback();
      setFeedback("再生が終わりました。");
      return;
    }
  }

  const item = state.items[state.playbackIndex];
  playTone(item);
  renderPlaybackPosition();

  const wait = Math.max(
    90,
    item.beats * BASE_MILLISECONDS_PER_BEAT / state.speed
  );

  state.playbackTimer = window.setTimeout(() => {
    state.playbackIndex += 1;
    playNextItem();
  }, wait);
}

async function togglePlayback() {
  if (state.playing) {
    stopPlayback();
    setFeedback("停止しました。");
    return;
  }

  if (!state.items.length) {
    setFeedback("先に音を入力してください。", true);
    return;
  }

  const context = ensureAudioContext();

  if (context?.state === "suspended") {
    try {
      await context.resume();
    } catch (error) {
      console.warn("Prototype audio could not resume.", error);
    }
  }

  state.playing = true;
  state.playbackIndex = 0;
  dom.playButton.classList.add("is-playing");
  dom.playIcon.textContent = "■";
  dom.playLabel.textContent = "停止";
  setFeedback("譜面上の赤いカーソルが現在位置です。");
  playNextItem();
}

function restartPlayback() {
  stopPlayback(true);
  setFeedback("先頭に戻しました。");
}

function toggleLoop() {
  state.loop = !state.loop;
  dom.loopButton.setAttribute("aria-pressed", String(state.loop));
  setFeedback(state.loop ? "ループ再生をオンにしました。" : "ループ再生をオフにしました。");
}

function cycleSpeed() {
  const speeds = [0.75, 1, 1.25];
  const currentIndex = speeds.indexOf(state.speed);
  state.speed = speeds[(currentIndex + 1) % speeds.length];
  dom.speedLabel.textContent = `${Math.round(state.speed * 100)}%`;
  setFeedback(`再生速度を${Math.round(state.speed * 100)}%にしました。`);
}

function bindEvents() {
  dom.undoButton.addEventListener("click", undo);
  dom.redoButton.addEventListener("click", redo);
  dom.playButton.addEventListener("click", () => {
    togglePlayback().catch(error => {
      console.error(error);
      stopPlayback();
      setFeedback("再生を開始できませんでした。", true);
    });
  });
  dom.restartButton.addEventListener("click", restartPlayback);
  dom.loopButton.addEventListener("click", toggleLoop);
  dom.speedButton.addEventListener("click", cycleSpeed);
  dom.closeSelectionButton.addEventListener("click", closeItemEditor);

  dom.kindButtons.forEach(button => {
    button.addEventListener("click", () => {
      state.kind = button.dataset.kind;
      setFeedback(state.kind === "note"
        ? "音符を追加します。音の長さを選んでください。"
        : "休符を追加します。音の長さを選んでください。"
      );
      render();
    });
  });

  dom.durationButtons.forEach(button => {
    button.addEventListener("click", () => chooseDuration(button.dataset.duration));
  });

  dom.stringButtons.forEach(button => {
    button.addEventListener("click", () => chooseString(Number(button.dataset.string)));
  });

  dom.digitButtons.forEach(button => {
    button.addEventListener("click", () => appendFretDigit(button.dataset.digit));
  });

  dom.fretClearButton.addEventListener("click", clearFret);
  dom.fretBackspaceButton.addEventListener("click", backspaceFret);
  dom.confirmFretButton.addEventListener("click", confirmFret);
  dom.backToStringButton.addEventListener("click", backToString);
  dom.editTabButton.addEventListener("click", startExistingTabEdit);
  dom.deleteNoteButton.addEventListener("click", deleteActiveItem);
}

function start() {
  bindEvents();
  render();

  window.KIKUtabPrototype = {
    getState() {
      return {
        items: cloneItems(),
        step: state.step,
        loop: state.loop,
        speed: state.speed,
        playing: state.playing
      };
    }
  };
}

start();
