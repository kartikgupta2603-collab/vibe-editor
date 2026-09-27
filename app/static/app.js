/**
 * Anime Song Reel Creator - Vibrant 2D Studio Engine
 */

// Application State
const state = {
  videoFile: null,
  sourceGeneration: 0,
  _uploadPromise: null,
  videoPath: "",
  videoTitle: "",
  videoMeta: null,
  isPlaying: false,
  currentTime: 0.0,
  startTime: 0.0,
  endTime: 35.0,
  aspectRatio: "9:16",
  dayNumber: 1,
  seriesFormat: "POV: That one anime opening you will NEVER skip ⚡",
  songName: "",
  animeName: "",
  caption: "",
  showMetadata: false,
  showSeriesText: true,
  trackPillEnabled: false,
  hookPill: false,
  activeTemplate: "viral_creator",
  templateData: null,
  templatesList: [],
  adjustments: {
    bgType: "blur",
    blur: 35,
    brightness: -0.25,
    scale: 1.0,
    radius: 12,
    curvedBorder: true,
    waveform: false
  },
  colorFilter: "original",
  filterIntensity: 100,
  colorAdjustments: {
    brightness: 0,
    contrast: 100,
    saturation: 100,
    warmth: 0,
    vignette: 0
  },
  aiAnalysis: null,
  isLooping: true,
  playMode: "normal",
  playbackStartPos: 0,
  activeMoment: "rec",
  lyrics: [],
  lyricsByMoment: {},
  showLyrics: true,
  subtitleStyle: "minimal",
  subtitleLanguage: "both",
  smartLoop: true,
  loopMode: "circular",
  loopFadeDuration: 0.35,
  fadeTransition: {
    mode: "none", // 'none', 'in', 'out', 'both'
    duration: 0.50
  },
  timelineZoom: 1.0,
  watermark: {
    enabled: false,
    text: "lap_lac7"
  },
  creatorBadge: {
    enabled: false,
    text: "@Lap_lac7"
  },
  textElements: {
    series: { x: 540, y: 320, size: 38 },
    creatorBadge: { x: 540, y: 160, size: 30, color: "#ffffff" },
    watermark: { x: 140, y: 90, size: 28, color: "#ffffff" },
    subtitles: { x: 540, y: 1690, size: 38, color: "#ffffff" }
  },
  selectedTextElem: "series",
  isTextElementSelected: false,
  hoveredTextElem: null,
  _textBoxes: {}
};

// DOM Elements
const el = {
  // Navigation
  navTabs: document.querySelectorAll(".nav-tab"),
  tabContents: document.querySelectorAll(".panel-tab-content"),
  btnExportQuick: document.getElementById("btn-export-quick"),
  btnExportQuickText: document.getElementById("btn-export-quick-text"),
  btnExportMain: document.getElementById("btn-export-main"),
  btnExportMainText: document.getElementById("btn-export-main-text"),
  btnResetSession: document.getElementById("btn-reset-session"),
  
  // File & Source Selector Tabs
  tabSrcLocal: document.getElementById("tab-src-local"),
  tabSrcYt: document.getElementById("tab-src-yt"),
  panelSrcLocal: document.getElementById("panel-src-local"),
  panelSrcYt: document.getElementById("panel-src-yt"),

  // YouTube Downloader
  inputYtUrl: document.getElementById("input-yt-url"),
  btnYtDownload: document.getElementById("btn-yt-download"),
  btnYtText: document.getElementById("btn-yt-text"),
  ytProgressBox: document.getElementById("yt-progress-box"),
  ytProgressBar: document.getElementById("yt-progress-bar"),
  ytProgressLabel: document.getElementById("yt-progress-label"),
  ytProgressPercent: document.getElementById("yt-progress-percent"),

  // File & Dropzone
  dropzone: document.getElementById("file-dropzone"),
  btnBrowse: document.getElementById("btn-browse-file"),
  inputNativeFile: document.getElementById("input-file-native"),
  activeFilePill: document.getElementById("active-file-pill"),
  activeFileName: document.getElementById("active-file-name"),
  activeFileMeta: document.getElementById("active-file-meta"),
  videoInfoCard: document.getElementById("video-info-card"),
  metaRes: document.getElementById("meta-res"),
  metaAspect: document.getElementById("meta-aspect"),
  metaFps: document.getElementById("meta-fps"),
  metaAudio: document.getElementById("meta-audio"),

  // Metadata Inputs
  inputDay: document.getElementById("input-day-number"),
  btnDayDec: document.getElementById("btn-day-dec"),
  btnDayInc: document.getElementById("btn-day-inc"),
  inputSeriesText: document.getElementById("input-series-text"),
  btnGenerateAiHooks: document.getElementById("btn-generate-ai-hooks"),
  aiHooksContainer: document.getElementById("ai-hooks-container"),
  inputSongName: document.getElementById("input-song-name"),
  inputAnimeName: document.getElementById("input-anime-name"),
  checkTrackPill: document.getElementById("check-track-pill"),
  checkShowMetadata: document.getElementById("check-show-metadata"),
  checkWatermark: document.getElementById("check-watermark"),
  inputWatermarkText: document.getElementById("input-watermark-text"),
  watermarkInputGroup: document.getElementById("watermark-input-group"),
  checkCreatorBadge: document.getElementById("check-creator-badge"),
  inputCreatorTag: document.getElementById("input-creator-tag"),
  creatorBadgeInputGroup: document.getElementById("creator-badge-input-group"),
  btnResetTextLayout: document.getElementById("btn-reset-text-layout"),
  textElemBtns: document.querySelectorAll(".text-elem-btn"),
  checkElemVisible: document.getElementById("check-elem-visible"),
  labelElemVisible: document.getElementById("label-elem-visible"),
  tagElemVisibleStatus: document.getElementById("tag-elem-visible-status"),
  sliderTextSize: document.getElementById("slider-text-size"),
  valTextSize: document.getElementById("val-text-size"),
  sliderTextY: document.getElementById("slider-text-y"),
  valTextY: document.getElementById("val-text-y"),
  sliderTextX: document.getElementById("slider-text-x"),
  valTextX: document.getElementById("val-text-x"),
  btnCenterTextX: document.getElementById("btn-center-text-x"),
  pickerTextColor: document.getElementById("picker-text-color"),
  inputTextHex: document.getElementById("input-text-color-hex"),
  textColorSwatches: document.getElementById("text-color-swatches"),

  // AI Box
  btnAnalyzeAI: document.getElementById("btn-analyze-ai"),
  aiLoading: document.getElementById("ai-loading"),
  aiResults: document.getElementById("ai-results"),
  aiScoreNum: document.getElementById("ai-score-num"),
  aiRecTimes: document.getElementById("ai-rec-times"),
  btnApplyRec: document.getElementById("btn-apply-rec"),
  aiReason: document.getElementById("ai-reason"),
  aiAltsList: document.getElementById("ai-alts-list"),

  // Trim Controls
  inputStartTime: document.getElementById("input-start-time"),
  inputEndTime: document.getElementById("input-end-time"),
  labelClipDuration: document.getElementById("label-clip-duration"),

  // Live Dual Subtitles (JP + EN)
  checkSubtitles: document.getElementById("check-subtitles"),
  btnSyncFullLyrics: document.getElementById("btn-sync-full-lyrics"),
  btnSyncFullText: document.getElementById("btn-sync-full-text"),
  subStyleBtns: document.querySelectorAll(".sub-style-btn"),
  subStyleCards: document.querySelectorAll(".sub-style-card"),
  subLangBtns: document.querySelectorAll(".sub-lang-btn"),
  lyricsLoading: document.getElementById("lyrics-loading"),
  lyricsListContainer: document.getElementById("lyrics-list-container"),
  lyricsEmptyHint: document.getElementById("lyrics-empty-hint"),
  lyricsTimelineList: document.getElementById("lyrics-timeline-list"),


  // Style & Templates
  tplQuickButtons: document.querySelectorAll(".tpl-btn"),
  activeTplBadge: document.getElementById("active-template-badge"),
  sliderBlur: document.getElementById("slider-blur"),
  sliderDim: document.getElementById("slider-dim"),
  sliderScale: document.getElementById("slider-scale"),
  sliderRadius: document.getElementById("slider-radius"),
  checkWaveform: document.getElementById("check-waveform"),
  checkSmartLoop: document.getElementById("check-smart-loop"),
  rowLoopMode: document.getElementById("row-loop-mode"),
  loopModeBtns: document.querySelectorAll(".loop-mode-btn"),
  bgModeBtns: document.querySelectorAll(".bg-mode-btn"),
  borderModeBtns: document.querySelectorAll(".border-mode-btn"),
  rowCornerRadius: document.getElementById("row-corner-radius"),
  rowBgBlur: document.getElementById("row-bg-blur"),
  rowBgDim: document.getElementById("row-bg-dim"),
  valBlur: document.getElementById("val-blur"),
  valDim: document.getElementById("val-dim"),
  valScale: document.getElementById("val-scale"),
  valRadius: document.getElementById("val-radius"),

  // Viewport, Studio Monitor & Timeline
  dockFilters: document.getElementById("dock-filters"),
  dockAdjustments: document.getElementById("dock-adjustments"),
  btnToggleFiltersDock: document.getElementById("btn-toggle-filters-dock"),
  btnToggleAdjustmentsDock: document.getElementById("btn-toggle-adjustments-dock"),
  filterActiveName: document.getElementById("filter-active-name"),
  sliderFilterIntensity: document.getElementById("slider-filter-intensity"),
  valFilterIntensity: document.getElementById("val-filter-intensity"),
  filtersGrid: document.getElementById("filters-grid"),
  btnResetAdjustments: document.getElementById("btn-reset-adjustments"),
  sliderAdjBrightness: document.getElementById("slider-adj-brightness"),
  valAdjBrightness: document.getElementById("val-adj-brightness"),
  sliderAdjContrast: document.getElementById("slider-adj-contrast"),
  valAdjContrast: document.getElementById("val-adj-contrast"),
  sliderAdjSaturation: document.getElementById("slider-adj-saturation"),
  valAdjSaturation: document.getElementById("val-adj-saturation"),
  sliderAdjWarmth: document.getElementById("slider-adj-warmth"),
  valAdjWarmth: document.getElementById("val-adj-warmth"),
  sliderAdjVignette: document.getElementById("slider-adj-vignette"),
  valAdjVignette: document.getElementById("val-adj-vignette"),
  studioMonitor: document.getElementById("studio-monitor"),
  canvasSpecPill: document.getElementById("canvas-spec-pill"),
  btnFitView: document.getElementById("btn-fit-view"),
  hiddenVideo: document.getElementById("hidden-video"),
  reelCanvas: document.getElementById("reel-canvas"),
  btnPlayPause: document.getElementById("btn-play-pause"),
  btnLoopClip: document.getElementById("btn-loop-clip"),
  timeCurrent: document.getElementById("time-current"),
  timeDuration: document.getElementById("time-duration"),
  scrubberTrack: document.getElementById("scrubber-track"),
  scrubberRange: document.getElementById("scrubber-range"),
  scrubberDimLeft: document.getElementById("scrubber-dim-left"),
  scrubberDimRight: document.getElementById("scrubber-dim-right"),
  rangeClipDuration: document.getElementById("range-clip-duration"),
  scrubberPlayhead: document.getElementById("scrubber-playhead"),
  tooltipPlayhead: document.getElementById("tooltip-playhead"),
  markerStart: document.getElementById("marker-start"),
  markerEnd: document.getElementById("marker-end"),
  tooltipStart: document.getElementById("tooltip-start"),
  tooltipEnd: document.getElementById("tooltip-end"),
  scrubberHoverTooltip: document.getElementById("scrubber-hover-tooltip"),
  selectionDurationTag: document.getElementById("selection-duration-tag"),

  // CapCut Professional Multi-Track Timeline
  timelineRoot: document.getElementById("capcut-timeline-root"),
  timelineScrollContainer: document.getElementById("timeline-scroll-container"),
  timelineContentWrapper: document.getElementById("timeline-content-wrapper"),
  rulerCanvas: document.getElementById("timeline-ruler-canvas"),
  thumbnailCanvas: document.getElementById("timeline-thumbnail-canvas"),
  waveformCanvas: document.getElementById("timeline-waveform-canvas"),
  tlInputStart: document.getElementById("tl-input-start"),
  tlInputEnd: document.getElementById("tl-input-end"),
  tlValDuration: document.getElementById("tl-val-duration"),
  sliderTimelineZoom: document.getElementById("slider-timeline-zoom"),
  btnZoomIn: document.getElementById("btn-zoom-in"),
  btnZoomOut: document.getElementById("btn-zoom-out"),
  btnZoomFit: document.getElementById("btn-zoom-fit"),
  btnPrevFrame: document.getElementById("btn-prev-frame"),
  btnNextFrame: document.getElementById("btn-next-frame"),

  // Export Modal
  exportModal: document.getElementById("export-modal"),
  exportStatusLabel: document.getElementById("export-status-label"),
  exportProgressBar: document.getElementById("export-progress-bar"),
  exportPercentage: document.getElementById("export-percentage"),
  exportCompleteBox: document.getElementById("export-complete-box"),
  exportFilePath: document.getElementById("export-file-path"),
  btnOpenFolder: document.getElementById("btn-open-folder"),
  btnDownloadExport: document.getElementById("btn-download-export"),
  btnCloseModal: document.getElementById("btn-close-modal"),
  btnModalDismiss: document.getElementById("btn-modal-dismiss"),

  // Settings & History
  settingsKey: document.getElementById("settings-gemini-key"),
  btnSaveKey: document.getElementById("btn-save-key"),
  settingsExportDir: document.getElementById("settings-export-dir"),
  historyList: document.getElementById("history-list"),
  templatesCatalog: document.getElementById("templates-catalog"),
  toast: document.getElementById("toast"),
  toastMsg: document.getElementById("toast-msg"),

  // Schedule
  schedReelSelect: document.getElementById("sched-reel-select"),
  schedDatetime: document.getElementById("sched-datetime"),
  schedCaption: document.getElementById("sched-caption"),
  schedHashtags: document.getElementById("sched-hashtags"),
  btnSchedAdd: document.getElementById("btn-sched-add"),
  btnSchedRefresh: document.getElementById("btn-sched-refresh-reels"),
  schedQueueList: document.getElementById("sched-queue-list"),
  schedQueueCount: document.getElementById("sched-queue-count"),
  schedStatusDot: document.getElementById("scheduler-status-dot"),
  schedStatusText: document.getElementById("scheduler-status-text"),
  statPending: document.getElementById("stat-pending"),
  statPosting: document.getElementById("stat-posting"),
  statPosted: document.getElementById("stat-posted"),
  statFailed: document.getElementById("stat-failed"),
  igAccessToken: document.getElementById("ig-access-token"),
  igUserId: document.getElementById("ig-user-id"),
  igVideoBaseUrl: document.getElementById("ig-video-base-url"),
  btnSaveIg: document.getElementById("btn-save-ig"),
  igStatusMsg: document.getElementById("ig-status-msg"),
};

// Preloaded enhanced creator avatar image
const _creatorAvatarImg = new Image();
_creatorAvatarImg.src = "/creator_avatar_laplace.png";
_creatorAvatarImg.onload = () => {
  if (state.creatorBadge && state.creatorBadge.enabled) {
    renderReel();
  }
};

// -------------------------------------------------------------
// VISUAL FILTERS & COLOR GRADING CATALOG
// -------------------------------------------------------------
const VIDEO_FILTERS = {
  original: {
    id: "original",
    name: "Original",
    thumbGrad: "linear-gradient(135deg, #4f46e5, #06b6d4)",
    contrast: 0,
    saturate: 0,
    brightness: 0,
    sepia: 0,
    grayscale: 0,
    hueRotate: 0
  },
  clarendon: {
    id: "clarendon",
    name: "Clarendon",
    thumbGrad: "linear-gradient(135deg, #1e3a8a, #38bdf8, #f59e0b)",
    contrast: 0.20,
    saturate: 0.25,
    brightness: 0.05,
    sepia: 0,
    grayscale: 0,
    hueRotate: 0
  },
  crema: {
    id: "crema",
    name: "Crema",
    thumbGrad: "linear-gradient(135deg, #d97706, #fef3c7, #78350f)",
    contrast: 0.05,
    saturate: -0.10,
    brightness: 0.03,
    sepia: 0.20,
    grayscale: 0,
    hueRotate: -10
  },
  gingham: {
    id: "gingham",
    name: "Gingham",
    thumbGrad: "linear-gradient(135deg, #71717a, #e4e4e7, #a1a1aa)",
    contrast: -0.08,
    saturate: -0.15,
    brightness: 0.08,
    sepia: 0.08,
    grayscale: 0,
    hueRotate: 0
  },
  juno: {
    id: "juno",
    name: "Juno",
    thumbGrad: "linear-gradient(135deg, #dc2626, #f59e0b, #ec4899)",
    contrast: 0.15,
    saturate: 0.35,
    brightness: 0.03,
    sepia: 0,
    grayscale: 0,
    hueRotate: -8
  },
  lark: {
    id: "lark",
    name: "Lark",
    thumbGrad: "linear-gradient(135deg, #0284c7, #38bdf8, #f0fdf4)",
    contrast: 0.10,
    saturate: 0.15,
    brightness: 0.08,
    sepia: 0,
    grayscale: 0,
    hueRotate: 5
  },
  ludwig: {
    id: "ludwig",
    name: "Ludwig",
    thumbGrad: "linear-gradient(135deg, #991b1b, #f97316, #fbbf24)",
    contrast: 0.12,
    saturate: 0.10,
    brightness: 0.03,
    sepia: 0.12,
    grayscale: 0,
    hueRotate: 0
  },
  moon: {
    id: "moon",
    name: "Moon",
    thumbGrad: "linear-gradient(135deg, #18181b, #71717a, #fafafa)",
    contrast: 0.25,
    saturate: -1.0,
    brightness: 0.05,
    sepia: 0,
    grayscale: 1.0,
    hueRotate: 0
  },
  perpetua: {
    id: "perpetua",
    name: "Perpetua",
    thumbGrad: "linear-gradient(135deg, #065f46, #34d399, #6ee7b7)",
    contrast: 0.08,
    saturate: 0.10,
    brightness: 0.04,
    sepia: 0,
    grayscale: 0,
    hueRotate: 15
  },
  reyes: {
    id: "reyes",
    name: "Reyes",
    thumbGrad: "linear-gradient(135deg, #b45309, #fde68a, #d97706)",
    contrast: -0.10,
    saturate: -0.15,
    brightness: 0.12,
    sepia: 0.25,
    grayscale: 0,
    hueRotate: 0
  },
  slumber: {
    id: "slumber",
    name: "Slumber",
    thumbGrad: "linear-gradient(135deg, #581c87, #c084fc, #fbbf24)",
    contrast: 0.05,
    saturate: -0.25,
    brightness: 0.03,
    sepia: 0.30,
    grayscale: 0,
    hueRotate: 0
  },
  aden: {
    id: "aden",
    name: "Aden",
    thumbGrad: "linear-gradient(135deg, #be185d, #f472b6, #fbcfe8)",
    contrast: -0.05,
    saturate: 0.10,
    brightness: 0.08,
    sepia: 0,
    grayscale: 0,
    hueRotate: -15
  },
  anime_vivid: {
    id: "anime_vivid",
    name: "Anime Vivid",
    thumbGrad: "linear-gradient(135deg, #ff007a, #00f2fe, #4facfe)",
    contrast: 0.22,
    saturate: 0.40,
    brightness: 0.04,
    sepia: 0,
    grayscale: 0,
    hueRotate: 0
  },
  cyberpunk: {
    id: "cyberpunk",
    name: "Cyberpunk",
    thumbGrad: "linear-gradient(135deg, #f000ff, #0011ff, #00ffff)",
    contrast: 0.28,
    saturate: 0.45,
    brightness: 0.02,
    sepia: 0,
    grayscale: 0,
    hueRotate: -20
  }
};

function computeVideoFilterCss() {
  const fId = state.colorFilter || "original";
  const f = VIDEO_FILTERS[fId] || VIDEO_FILTERS.original;
  const intensity = (state.filterIntensity !== undefined ? state.filterIntensity : 100) / 100;
  const adj = state.colorAdjustments || { brightness: 0, contrast: 100, saturation: 100, warmth: 0, vignette: 0 };

  const baseContrast = (adj.contrast !== undefined ? adj.contrast : 100) / 100;
  const finalContrast = Math.max(0.1, baseContrast * (1 + (f.contrast || 0) * intensity));

  const baseBrightness = 1 + ((adj.brightness !== undefined ? adj.brightness : 0) / 100);
  const finalBrightness = Math.max(0.1, baseBrightness + ((f.brightness || 0) * intensity));

  const baseSaturation = (adj.saturation !== undefined ? adj.saturation : 100) / 100;
  const finalSaturation = Math.max(0, baseSaturation * (1 + (f.saturate || 0) * intensity));

  const finalGrayscale = Math.min(1, Math.max(0, (f.grayscale || 0) * intensity));
  const finalSepia = Math.min(1, Math.max(0, (f.sepia || 0) * intensity + (adj.warmth > 0 ? (adj.warmth / 100) * 0.25 : 0)));

  let finalHueRotate = ((f.hueRotate || 0) * intensity);
  if (adj.warmth !== 0) {
    finalHueRotate += (adj.warmth > 0 ? -adj.warmth * 0.15 : -adj.warmth * 0.25);
  }

  const parts = [
    `brightness(${finalBrightness.toFixed(3)})`,
    `contrast(${finalContrast.toFixed(3)})`,
    `saturate(${finalSaturation.toFixed(3)})`
  ];
  if (finalGrayscale > 0.01) parts.push(`grayscale(${finalGrayscale.toFixed(3)})`);
  if (finalSepia > 0.01) parts.push(`sepia(${finalSepia.toFixed(3)})`);
  if (Math.abs(finalHueRotate) > 0.1) parts.push(`hue-rotate(${finalHueRotate.toFixed(1)}deg)`);

  return parts.join(" ");
}

const ctx = el.reelCanvas.getContext("2d");
let waveOffset = 0;
const lastPreviewFrame = document.createElement("canvas");
const lastPreviewFrameCtx = lastPreviewFrame.getContext("2d", { alpha: false });

function cachePreviewFrame(video) {
  if (!video || !video.videoWidth || !video.videoHeight) return;
  // A compact copy prevents the monitor from going blank while the browser is
  // decoding a new frame after a timeline seek.
  const width = 640;
  const height = Math.max(1, Math.round(width * video.videoHeight / video.videoWidth));
  if (lastPreviewFrame.width !== width || lastPreviewFrame.height !== height) {
    lastPreviewFrame.width = width;
    lastPreviewFrame.height = height;
  }
  try {
    lastPreviewFrameCtx.drawImage(video, 0, 0, width, height);
  } catch (_) {}
}

function applySubtitleStyle(styleKey, reason = "") {
  const allowed = ["minimal", "bold_lyrics", "neon_glow", "retro_90s", "karaoke", "cinematic", "impact", "lofi_pastel", "jp_en", "anime"];
  const targetStyle = allowed.includes(styleKey) ? styleKey : "minimal";
  state.subtitleStyle = targetStyle;
  let styleTitle = targetStyle;
  document.querySelectorAll(".sub-style-card, .sub-style-btn").forEach(button => {
    const match = button.dataset.style === targetStyle;
    button.classList.toggle("active", match);
    if (match) {
      const nameEl = button.querySelector(".style-card-name");
      styleTitle = nameEl ? nameEl.textContent.trim() : button.textContent.trim();
    }
  });
  renderReel();
  saveProjectState();
  if (reason) showToast(`✨ Styled Subtitles: ${styleTitle} — ${reason}`);
}

// -------------------------------------------------------------
// VIEWPORT MONITOR CONTROLS
// -------------------------------------------------------------
function setupFitView() {
  let isFillMode = false;
  if (el.btnFitView) {
    el.btnFitView.addEventListener("click", () => {
      isFillMode = !isFillMode;
      el.reelCanvas.style.objectFit = isFillMode ? "cover" : "contain";
      el.btnFitView.textContent = isFillMode ? "⛶ Fill View" : "⛶ Fit View";
      showToast(isFillMode ? "Display: Fill Screen" : "Display: 100% Fit");
    });
  }
}

// -------------------------------------------------------------
// REAL-TIME 9:16 VERTICAL REEL COMPOSITING ENGINE
// -------------------------------------------------------------
function startRenderLoop() {
  let lastDraw = 0;
  const previewFrameInterval = 1000 / 30;
  function draw(now) {
    // Source footage is normally 24/30 fps. Rendering it at 60 fps only repeats
    // expensive 9:16 compositing work and makes the monitor stutter.
    if (now - lastDraw >= previewFrameInterval) {
      try {
        renderReel();
      } catch (err) {
        console.error("renderReel error:", err);
      }
      lastDraw = now;
    }
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
}

// -------------------------------------------------------------
// VOCAL-SYNCHRONIZED WORD-BY-WORD SUBTITLE ANIMATION ENGINE
// -------------------------------------------------------------
function getOrComputeWordTimings(line, isJp) {
  if (!line) return [];
  if (isJp) {
    if (line.words_jp && Array.isArray(line.words_jp) && line.words_jp.length > 0) {
      return line.words_jp;
    }
    if (line._cachedWordsJp) return line._cachedWordsJp;
    const text = (line.text_jp || line.text || "").trim();
    if (!text) return [];

    let tokens = [];
    const hasJpChars = /[\u3040-\u30ff\u4e00-\u9faf]/.test(text);
    if (!hasJpChars) {
      tokens = text.split(/\s+/).filter(Boolean);
    } else if (typeof Intl !== "undefined" && Intl.Segmenter) {
      try {
        const seg = new Intl.Segmenter("ja", { granularity: "word" });
        tokens = Array.from(seg.segment(text)).map(s => s.segment).filter(s => s.trim().length > 0);
      } catch (e) {
        tokens = [];
      }
    }
    if (!tokens || tokens.length === 0) {
      tokens = text.match(/[a-zA-Z0-9]+(?:['’\-][a-zA-Z0-9]+)*|[\u4e00-\u9faf]+|[ぁ-ん]+|[ァ-ヴー]+|[^\s\w]/g) || text.split(/\s+/).filter(Boolean);
    }

    const lineDur = Math.max(0.2, (line.end || 0) - (line.start || 0));
    const weights = tokens.map(t => Math.max(1, t.length));
    const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;
    let cur = line.start || 0;
    const words = tokens.map((tok, i) => {
      const wDur = lineDur * (weights[i] / totalWeight);
      const wObj = { word: tok, start: cur, end: cur + wDur };
      cur += wDur;
      return wObj;
    });
    line._cachedWordsJp = words;
    return words;
  } else {
    if (line.words_en && Array.isArray(line.words_en) && line.words_en.length > 0) {
      return line.words_en;
    }
    if (line._cachedWordsEn) return line._cachedWordsEn;
    const text = (line.text_en || "").trim();
    if (!text) return [];

    const tokens = text.split(/\s+/).filter(Boolean);
    const lineDur = Math.max(0.2, (line.end || 0) - (line.start || 0));
    const weights = tokens.map(t => Math.max(1, t.length));
    const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;
    let cur = line.start || 0;
    const words = tokens.map((tok, i) => {
      const wDur = lineDur * (weights[i] / totalWeight);
      const wObj = { word: tok, start: cur, end: cur + wDur };
      cur += wDur;
      return wObj;
    });
    line._cachedWordsEn = words;
    return words;
  }
}

function getSubtitleLines(text, isSecondary) {
  if (!text || !text.trim()) return [];
  text = text.trim();
  if (text.includes("\n")) {
    return text.split("\n").map(l => l.trim()).filter(Boolean);
  }
  const hasJpChars = /[\u3040-\u30ff\u4e00-\u9faf]/.test(text);
  const maxChars = hasJpChars ? 22 : 40;
  if (text.length > maxChars) {
    if (!hasJpChars || isSecondary) {
      const words = text.split(/\s+/);
      const mid = Math.ceil(words.length / 2);
      return [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
    } else {
      const puncIdx = Math.max(text.indexOf("、"), text.indexOf(" "), text.indexOf("。"), text.indexOf("！"), text.indexOf("？"));
      const splitIdx = puncIdx !== -1 ? puncIdx + 1 : Math.ceil(text.length / 2);
      return [text.slice(0, splitIdx).trim(), text.slice(splitIdx).trim()];
    }
  }
  return [text];
}

function isDarkColor(hex) {
  if (!hex || typeof hex !== "string") return false;
  const c = hex.replace("#", "").trim();
  if (c.length !== 6 && c.length !== 3) return false;
  const r = parseInt(c.length === 3 ? c[0] + c[0] : c.slice(0, 2), 16);
  const g = parseInt(c.length === 3 ? c[1] + c[1] : c.slice(2, 4), 16);
  const b = parseInt(c.length === 3 ? c[2] + c[2] : c.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return false;
  return (0.299 * r + 0.587 * g + 0.114 * b) < 130;
}

function isNearWhite(hex) {
  if (!hex || typeof hex !== "string") return false;
  const c = hex.replace("#", "").trim();
  if (c.length !== 6 && c.length !== 3) return false;
  const r = parseInt(c.length === 3 ? c[0] + c[0] : c.slice(0, 2), 16);
  const g = parseInt(c.length === 3 ? c[1] + c[1] : c.slice(2, 4), 16);
  const b = parseInt(c.length === 3 ? c[2] + c[2] : c.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) >= 220;
}

function adaptTextColorsForBackground(bgType) {
  if (!state.textElements) state.textElements = {};
  const isWhite = (bgType === "white");

  if (isWhite) {
    state.textElements.series = { ...state.textElements.series, color: "#0284c7" };
    state.textElements.song = { ...state.textElements.song, color: "#0f172a" };
    state.textElements.anime = { ...state.textElements.anime, color: "#0284c7" };
    state.textElements.creatorBadge = { ...state.textElements.creatorBadge, color: "#0f172a" };
    state.textElements.watermark = { ...state.textElements.watermark, color: "#0f172a" };
    state.textElements.subtitles = { ...state.textElements.subtitles, color: "#0f172a" };
  } else {
    state.textElements.series = { ...state.textElements.series, color: "#38bdf8" };
    state.textElements.song = { ...state.textElements.song, color: "#ffffff" };
    state.textElements.anime = { ...state.textElements.anime, color: "#38bdf8" };
    state.textElements.creatorBadge = { ...state.textElements.creatorBadge, color: "#ffffff" };
    state.textElements.watermark = { ...state.textElements.watermark, color: "#ffffff" };
    state.textElements.subtitles = { ...state.textElements.subtitles, color: "#ffffff" };
  }

  const selKey = state.selectedTextElem || "series";
  if (state.textElements[selKey]) {
    const curCol = state.textElements[selKey].color;
    if (el.pickerTextColor) el.pickerTextColor.value = curCol;
    if (el.inputTextHex) el.inputTextHex.value = curCol.toUpperCase();
    if (el.textColorSwatches && typeof el.textColorSwatches.querySelectorAll === 'function') {
      el.textColorSwatches.querySelectorAll(".color-swatch-btn").forEach(swatch => {
        swatch.classList.toggle("active", swatch.dataset.color.toLowerCase() === curCol.toLowerCase());
      });
    }
  }
}

function renderDualSubtitles(ctx, jpRaw, enRaw, elapsed, totalDur, stylePreset, canvasWidth, canvasHeight, activeLine = null) {
  const isWhiteBg = (state.adjustments && state.adjustments.bgType === "white");
  const subColor = (state.textElements && state.textElements.subtitles && state.textElements.subtitles.color)
    ? state.textElements.subtitles.color
    : null;
  let baseColor = subColor || (isWhiteBg ? "#0f172a" : "#ffffff");
  if (isWhiteBg) {
    if (!isDarkColor(baseColor)) {
      baseColor = "#0f172a";
    }
  } else {
    if (isDarkColor(baseColor)) {
      baseColor = "#ffffff";
    }
  }

  const isPureEnglish = jpRaw && enRaw && jpRaw.trim().toLowerCase() === enRaw.trim().toLowerCase();
  let jpLines = [];
  let enLines = [];

  if (isPureEnglish) {
    // Vocal sung purely in English — format and display cleanly as English subtitles
    enLines = getSubtitleLines(enRaw || jpRaw, true);
  } else {
    if (jpRaw) jpLines = getSubtitleLines(jpRaw, false);
    if (enRaw) enLines = getSubtitleLines(enRaw, true);
  }

  if (stylePreset === "bold_lyrics" || stylePreset === "impact") {
    enLines = enLines.map(l => l.toUpperCase());
  }
  if (stylePreset === "lofi_pastel") {
    enLines = enLines.map(l => l.toLowerCase());
  }

  // Smooth subtle fade during active playback
  let alpha = 1.0;
  if (state.isPlaying && totalDur > 0) {
    const fadeIn = Math.min(1.0, elapsed / 0.10);
    const fadeOut = Math.min(1.0, (totalDur - elapsed) / 0.10);
    alpha = Math.max(0.3, Math.min(fadeIn, fadeOut));
  }

  // Subtitle color — most styles share baseColor, some override
  let jpFill = baseColor;
  let enFill = baseColor;
  if (!isWhiteBg) {
    if (stylePreset === "neon_glow") {
      jpFill = "#00F0FF";
      enFill = "rgba(0, 240, 255, 0.8)";
    } else if (stylePreset === "retro_90s") {
      jpFill = "#FFDE00";
      enFill = "#FFDE00";
    } else if (stylePreset === "impact") {
      jpFill = "#FFE600";
      enFill = "#FFE600";
    } else if (stylePreset === "lofi_pastel") {
      jpFill = "#F5F5DC";
      enFill = "#E0B0FF";
    } else if (stylePreset === "cinematic") {
      jpFill = "#FBFBFB";
      enFill = "rgba(251, 251, 251, 0.65)";
    } else if (stylePreset === "karaoke") {
      jpFill = "rgba(255, 255, 255, 0.55)";
      enFill = "rgba(255, 255, 255, 0.55)";
    }
  } else if (stylePreset === "karaoke") {
    jpFill = "rgba(15, 23, 42, 0.40)";
    enFill = "rgba(15, 23, 42, 0.40)";
  }

  // Typography & strokes definition
  let jpFont, jpStroke, jpLineWidth;
  let enFont, enStroke, enLineWidth;
  let jpH = 48;
  let enH = 34;

  if (stylePreset === "bold_lyrics") {
    jpFont = "900 44px 'Cabinet Grotesk', 'Noto Sans JP', sans-serif";
    jpStroke = isWhiteBg ? "rgba(15, 23, 42, 0.12)" : "#000000";
    jpLineWidth = isWhiteBg ? 1.0 : 8.0;
    jpH = 54;
    enFont = "900 27px 'Cabinet Grotesk', 'Plus Jakarta Sans', sans-serif";
    enStroke = isWhiteBg ? "rgba(15, 23, 42, 0.12)" : "#000000";
    enLineWidth = isWhiteBg ? 1.0 : 6.0;
    enH = 38;
  } else if (stylePreset === "neon_glow") {
    jpFont = "800 42px 'Noto Sans JP', 'Outfit', sans-serif";
    jpStroke = isWhiteBg ? "rgba(15, 23, 42, 0.12)" : "#001a1f";
    jpLineWidth = isWhiteBg ? 1.0 : 3.0;
    jpH = 52;
    enFont = "700 24px 'Outfit', 'Plus Jakarta Sans', sans-serif";
    enStroke = isWhiteBg ? "rgba(15, 23, 42, 0.12)" : "#001a1f";
    enLineWidth = isWhiteBg ? 1.0 : 2.0;
    enH = 34;
  } else if (stylePreset === "retro_90s") {
    jpFont = "700 40px 'Noto Sans JP', Arial, sans-serif";
    jpStroke = isWhiteBg ? "rgba(100, 80, 0, 0.2)" : "#000000";
    jpLineWidth = isWhiteBg ? 1.5 : 5.0;
    jpH = 50;
    enFont = "700 25px Arial, 'Plus Jakarta Sans', sans-serif";
    enStroke = isWhiteBg ? "rgba(100, 80, 0, 0.2)" : "#000000";
    enLineWidth = isWhiteBg ? 1.0 : 4.0;
    enH = 34;
  } else if (stylePreset === "karaoke") {
    jpFont = "800 42px 'Noto Sans JP', sans-serif";
    jpStroke = isWhiteBg ? "rgba(15, 23, 42, 0.12)" : "#000000";
    jpLineWidth = isWhiteBg ? 1.0 : 5.0;
    jpH = 52;
    enFont = "700 24px 'Plus Jakarta Sans', sans-serif";
    enStroke = isWhiteBg ? "rgba(15, 23, 42, 0.12)" : "#000000";
    enLineWidth = isWhiteBg ? 1.0 : 4.0;
    enH = 34;
  } else if (stylePreset === "cinematic") {
    jpFont = "400 36px 'Noto Sans JP', 'Plus Jakarta Sans', sans-serif";
    jpStroke = isWhiteBg ? "rgba(15, 23, 42, 0.08)" : null;
    jpLineWidth = isWhiteBg ? 0.5 : 0;
    jpH = 46;
    enFont = "400 20px 'Plus Jakarta Sans', sans-serif";
    enStroke = isWhiteBg ? "rgba(15, 23, 42, 0.08)" : null;
    enLineWidth = isWhiteBg ? 0.5 : 0;
    enH = 30;
  } else if (stylePreset === "impact") {
    jpFont = "900 50px 'Cabinet Grotesk', 'Noto Sans JP', Impact, sans-serif";
    jpStroke = isWhiteBg ? "rgba(15, 23, 42, 0.15)" : "#000000";
    jpLineWidth = isWhiteBg ? 1.5 : 9.0;
    jpH = 60;
    enFont = "900 30px Impact, 'Cabinet Grotesk', 'Plus Jakarta Sans', sans-serif";
    enStroke = isWhiteBg ? "rgba(15, 23, 42, 0.15)" : "#000000";
    enLineWidth = isWhiteBg ? 1.5 : 7.0;
    enH = 40;
  } else if (stylePreset === "lofi_pastel") {
    jpFont = "500 36px 'Noto Sans JP', 'Plus Jakarta Sans', sans-serif";
    jpStroke = null;
    jpLineWidth = 0;
    jpH = 46;
    enFont = "400 22px 'Plus Jakarta Sans', sans-serif";
    enStroke = null;
    enLineWidth = 0;
    enH = 32;
  } else if (stylePreset === "jp_en") {
    jpFont = "800 40px 'Noto Sans JP', sans-serif";
    jpStroke = isWhiteBg ? "rgba(15, 23, 42, 0.12)" : "#000000";
    jpLineWidth = isWhiteBg ? 1.0 : 6.0;
    jpH = 50;
    enFont = "700 24px 'Plus Jakarta Sans', sans-serif";
    enStroke = isWhiteBg ? "rgba(15, 23, 42, 0.12)" : "#000000";
    enLineWidth = isWhiteBg ? 1.0 : 4.0;
    enH = 34;
  } else if (stylePreset === "anime") {
    jpFont = "900 42px 'Noto Sans JP', sans-serif";
    jpStroke = isWhiteBg ? "rgba(15, 23, 42, 0.12)" : "#000000";
    jpLineWidth = isWhiteBg ? 1.0 : 4.0;
    jpH = 52;
    enFont = "700 24px 'Plus Jakarta Sans', sans-serif";
    enStroke = isWhiteBg ? "rgba(15, 23, 42, 0.12)" : "#000000";
    enLineWidth = isWhiteBg ? 1.0 : 4.0;
    enH = 34;
  } else {
    // minimal
    jpFont = "700 38px 'Noto Sans JP', 'Plus Jakarta Sans', sans-serif";
    jpStroke = isWhiteBg ? "rgba(15, 23, 42, 0.12)" : null;
    jpLineWidth = isWhiteBg ? 1.0 : 0;
    jpH = 48;
    enFont = "600 23px 'Plus Jakarta Sans', sans-serif";
    enStroke = isWhiteBg ? "rgba(15, 23, 42, 0.12)" : null;
    enLineWidth = isWhiteBg ? 1.0 : 0;
    enH = 34;
  }

  const subtitleLayout = (state.textElements && state.textElements.subtitles) || {};
  const subtitleScale = (subtitleLayout.size || 38) / 38;
  const subtitleCenterX = subtitleLayout.x ?? canvasWidth / 2;
  jpFont = jpFont.replace(/([\d.]+)px/, (_, size) => `${Number(size) * subtitleScale}px`);
  enFont = enFont.replace(/([\d.]+)px/, (_, size) => `${Number(size) * subtitleScale}px`);
  jpH *= subtitleScale;
  enH *= subtitleScale;
  jpLineWidth *= subtitleScale;
  enLineWidth *= subtitleScale;

  // Consistent drop shadow for both Japanese and English
  let shadowColor, shadowBlur, shadowOffsetY;
  if (isWhiteBg) {
    shadowColor = null;
    shadowBlur = 0;
    shadowOffsetY = 0;
  } else if (stylePreset === "neon_glow") {
    shadowColor = "rgba(0, 240, 255, 0.7)";
    shadowBlur = 22;
    shadowOffsetY = 0;
  } else if (stylePreset === "cinematic") {
    shadowColor = "rgba(0, 0, 0, 0.8)";
    shadowBlur = 18;
    shadowOffsetY = 3;
  } else if (stylePreset === "impact") {
    shadowColor = "rgba(0, 0, 0, 0.95)";
    shadowBlur = 4;
    shadowOffsetY = 4;
  } else if (stylePreset === "lofi_pastel") {
    shadowColor = "rgba(0, 0, 0, 0.5)";
    shadowBlur = 16;
    shadowOffsetY = 2;
  } else if (stylePreset === "anime") {
    shadowColor = "rgba(139, 92, 246, 0.5)";
    shadowBlur = 14;
    shadowOffsetY = 2;
  } else if (isDarkColor(baseColor)) {
    shadowColor = "rgba(255, 255, 255, 0.4)";
    shadowBlur = 6;
    shadowOffsetY = 1;
  } else {
    shadowColor = "rgba(0, 0, 0, 0.9)";
    shadowBlur = 10;
    shadowOffsetY = 3;
  }

  // Guaranteed zero-overlap vertical stacking
  const subGap = 20 * subtitleScale;
  const jpBlockH = jpLines.length * jpH;
  const enBlockH = enLines.length * enH;
  const hasBoth = jpLines.length > 0 && enLines.length > 0;
  const totalH = jpBlockH + (hasBoth ? subGap : 0) + enBlockH;

  const defaultCenterY = canvasHeight - 230;
  const subCenterY = (state.textElements && state.textElements.subtitles && state.textElements.subtitles.y != null)
    ? state.textElements.subtitles.y
    : defaultCenterY;

  const blockTop = subCenterY - totalH / 2;
  const jpTop = blockTop;
  const enTop = (jpLines.length > 0) ? (jpTop + jpBlockH + subGap) : blockTop;
  // Do not portray estimated phrase timings as word-accurate karaoke alignment.
  // Audio-aligned word timing can opt in later; ordinary cues change cleanly at
  // their verified phrase boundaries instead of sweeping at a fabricated pace.
  const karaokeProgress = stylePreset === "karaoke"
    ? (activeLine && activeLine.timing_source === "audio_aligned"
      ? Math.max(0, Math.min(1, elapsed / Math.max(0.1, totalDur)))
      : 1)
    : 0;
  const karaokeFill = isWhiteBg ? "#0284c7" : "#ffe600";

  let maxJpW = 0;
  let maxEnW = 0;

  // 1. Draw Japanese lines
  if (jpLines.length > 0) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = jpFont;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";

    if (shadowColor) {
      ctx.shadowColor = shadowColor;
      ctx.shadowBlur = shadowBlur;
      ctx.shadowOffsetY = shadowOffsetY;
    }

    jpLines.forEach((line, idx) => {
      const lineY = jpTop + (idx + 0.5) * jpH;
      const lineW = ctx.measureText(line).width;
      maxJpW = Math.max(maxJpW, lineW);
      let scale = 1;
      if (lineW > canvasWidth - 100) {
        scale = Math.max(0.80, (canvasWidth - 100) / lineW);
      }
      ctx.save();
      ctx.translate(subtitleCenterX, lineY);
      if (scale < 1) ctx.scale(scale, scale);
      if (jpStroke && jpLineWidth > 0) {
        ctx.strokeStyle = jpStroke;
        ctx.lineWidth = jpLineWidth;
        ctx.strokeText(line, 0, 0);
      }
      ctx.fillStyle = jpFill;
      ctx.fillText(line, 0, 0);
      if (stylePreset === "karaoke") {
        ctx.save();
        ctx.beginPath();
        ctx.rect(-lineW / 2 - 4, -jpH / 2, (lineW + 8) * karaokeProgress, jpH);
        ctx.clip();
        ctx.fillStyle = karaokeFill;
        ctx.fillText(line, 0, 0);
        ctx.restore();
      }
      ctx.restore();
    });
    ctx.restore();
  }

  // 2. Draw English lines (same color, strictly below Japanese with subGap)
  if (enLines.length > 0) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = enFont;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";

    if (shadowColor) {
      ctx.shadowColor = shadowColor;
      ctx.shadowBlur = shadowBlur;
      ctx.shadowOffsetY = shadowOffsetY;
    }

    enLines.forEach((line, idx) => {
      const lineY = enTop + (idx + 0.5) * enH;
      const lineW = ctx.measureText(line).width;
      maxEnW = Math.max(maxEnW, lineW);
      let scale = 1;
      if (lineW > canvasWidth - 100) {
        scale = Math.max(0.80, (canvasWidth - 100) / lineW);
      }
      ctx.save();
      ctx.translate(subtitleCenterX, lineY);
      if (scale < 1) ctx.scale(scale, scale);
      if (enStroke && enLineWidth > 0) {
        ctx.strokeStyle = enStroke;
        ctx.lineWidth = enLineWidth;
        ctx.strokeText(line, 0, 0);
      }
      ctx.fillStyle = enFill;
      ctx.fillText(line, 0, 0);
      if (stylePreset === "karaoke") {
        ctx.save();
        ctx.beginPath();
        ctx.rect(-lineW / 2 - 4, -enH / 2, (lineW + 8) * karaokeProgress, enH);
        ctx.clip();
        ctx.fillStyle = karaokeFill;
        ctx.fillText(line, 0, 0);
        ctx.restore();
      }
      ctx.restore();
    });
    ctx.restore();
  }

  // Unified interactive selection box enclosing entire subtitle group
  if (jpLines.length > 0 || enLines.length > 0) {
    const combinedW = Math.max(maxJpW, maxEnW);
    const boxW = Math.round(Math.max(260, combinedW + 40));
    state._textBoxes.subtitles = {
      x: Math.round(subtitleCenterX - boxW / 2),
      y: Math.round(blockTop - 6),
      width: boxW,
      height: Math.round(totalH + 12)
    };
  } else {
    delete state._textBoxes.subtitles;
  }
  delete state._textBoxes.subtitles_en;
}

function renderReel() {
  const vid = el.hiddenVideo;
  const liveVideoReady = vid && vid.readyState >= 1 && vid.videoWidth > 0;
  if (liveVideoReady && vid.readyState >= 2) cachePreviewFrame(vid);
  const videoSource = (vid && vid.readyState >= 2 && vid.videoWidth > 0)
    ? vid
    : (lastPreviewFrame.width > 0 ? lastPreviewFrame : (liveVideoReady ? vid : null));
  const hasVideo = !!videoSource;
  const w = 1080;
  const h = 1920;
  const previewScale = el.reelCanvas.width / w;

  // Draw in final-export coordinates while using the lighter monitor canvas.
  // This keeps all layout values unchanged and reduces preview pixel work by 75%.
  ctx.setTransform(previewScale, 0, 0, previewScale, 0, 0);

  // Clear
  ctx.fillStyle = "#080b15";
  ctx.fillRect(0, 0, w, h);

  const bgType = (state.adjustments && state.adjustments.bgType) || "blur";

  // Natural Video Aspect Ratio & Dynamic Frame Height
  // The video is always rendered in its full proper length without any vertical cropping
  const rawW = videoSource ? (videoSource.videoWidth || videoSource.width || 1920) : 1920;
  const rawH = videoSource ? (videoSource.videoHeight || videoSource.height || 1080) : 1080;
  const vidAspect = (rawW > 0 && rawH > 0) ? (rawW / rawH) : (16 / 9);

  // 1. BACKGROUND (Option 1: Blur Video, Option 2: Black, Option 3: White)
  if (bgType === "black") {
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, w, h);
  } else if (bgType === "white") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
  } else {
    // 1. BLURRED BACKGROUND (Default)
    ctx.fillStyle = "#080b15";
    ctx.fillRect(0, 0, w, h);

    if (hasVideo) {
      ctx.save();
      const blurPx = Math.round(state.adjustments.blur);
      const brightVal = 1.0 + state.adjustments.brightness;
      ctx.filter = `blur(${blurPx}px) brightness(${brightVal})`;

      const canvasAspect = 9 / 16;
      let drawW, drawH, drawX, drawY;

      if (vidAspect > canvasAspect) {
        drawH = h * 1.25;
        drawW = drawH * vidAspect;
        drawX = (w - drawW) / 2;
        drawY = (h - drawH) / 2;
      } else {
        drawW = w * 1.25;
        drawH = drawW / vidAspect;
        drawX = (w - drawW) / 2;
        drawY = (h - drawH) / 2;
      }

      ctx.drawImage(videoSource, 0, 0, rawW, rawH, drawX, drawY, drawW, drawH);
      ctx.restore();

      // Vibrant anime color wash gradient overlay
      const wash = ctx.createLinearGradient(0, 0, 0, h);
      wash.addColorStop(0, "rgba(10, 13, 24, 0.6)");
      wash.addColorStop(0.3, "rgba(139, 92, 246, 0.15)");
      wash.addColorStop(0.7, "rgba(6, 182, 212, 0.12)");
      wash.addColorStop(1, "rgba(10, 13, 24, 0.8)");
      ctx.fillStyle = wash;
      ctx.fillRect(0, 0, w, h);
    } else {
      // Vibrant Placeholder Anime Canvas
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "#1e1b4b");
      grad.addColorStop(0.4, "#0f172a");
      grad.addColorStop(0.8, "#311042");
      grad.addColorStop(1, "#090d1a");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }
  }

  // 2. FOREGROUND VIDEO FRAME (Dynamically fits active aspect ratio)
  const fgScale = state.adjustments.scale;
  const fgWidth = Math.round(w * fgScale);
  const fgHeight = Math.round(fgWidth / vidAspect);
  const fgX = Math.round((w - fgWidth) / 2);
  const fgY = Math.round((h - fgHeight) / 2 - 40);
  const isCurved = (state.adjustments && state.adjustments.curvedBorder !== false);
  const maxPossibleRadius = Math.floor(Math.min(fgWidth, fgHeight) / 2);
  const rawRadius = isCurved ? (state.adjustments.radius !== undefined ? state.adjustments.radius : 16) : 0;
  const radius = Math.min(Math.max(0, rawRadius), maxPossibleRadius);

  if (hasVideo) {
    ctx.save();
    ctx.shadowColor = (bgType === "white") ? "rgba(0, 0, 0, 0.2)" : "rgba(139, 92, 246, 0.5)";
    ctx.shadowBlur = (bgType === "white") ? 20 : 35;
    ctx.shadowOffsetY = 15;
    ctx.beginPath();
    ctx.roundRect(fgX, fgY, fgWidth, fgHeight, radius);
    ctx.fillStyle = "#000";
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.clip();

    // Live Video Grading Filter
    const filterCss = computeVideoFilterCss();
    ctx.filter = filterCss;
    ctx.drawImage(videoSource, 0, 0, rawW, rawH, fgX, fgY, fgWidth, fgHeight);
    ctx.filter = "none";

    // Radial Vignette Overlay
    const vignetteVal = (state.colorAdjustments && state.colorAdjustments.vignette) || 0;
    if (vignetteVal > 0) {
      const vCx = fgX + fgWidth / 2;
      const vCy = fgY + fgHeight / 2;
      const vInner = Math.min(fgWidth, fgHeight) * 0.25;
      const vOuter = Math.max(fgWidth, fgHeight) * 0.72;
      const vigGrad = ctx.createRadialGradient(vCx, vCy, vInner, vCx, vCy, vOuter);
      vigGrad.addColorStop(0, "rgba(0, 0, 0, 0)");
      vigGrad.addColorStop(0.5, `rgba(0, 0, 0, ${(vignetteVal / 100 * 0.35).toFixed(3)})`);
      vigGrad.addColorStop(1, `rgba(0, 0, 0, ${(vignetteVal / 100 * 0.88).toFixed(3)})`);
      ctx.fillStyle = vigGrad;
      ctx.fillRect(fgX, fgY, fgWidth, fgHeight);
    }

    ctx.restore();

    ctx.save();
    ctx.strokeStyle = (bgType === "white") ? "rgba(0, 0, 0, 0.15)" : "rgba(255, 255, 255, 0.35)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(fgX, fgY, fgWidth, fgHeight, radius);
    ctx.stroke();
    ctx.restore();
  } else {
    // Placeholder Frame
    ctx.save();
    ctx.fillStyle = (bgType === "white") ? "rgba(241, 245, 249, 0.95)" : "rgba(17, 24, 42, 0.9)";
    ctx.beginPath();
    ctx.roundRect(fgX, fgY, fgWidth, fgHeight, radius);
    ctx.fill();
    ctx.strokeStyle = (bgType === "white") ? "rgba(2, 132, 199, 0.6)" : "rgba(6, 182, 212, 0.6)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = (bgType === "white") ? "#0284c7" : "#38bdf8";
    ctx.font = "800 28px 'Cabinet Grotesk', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("ANIME FOOTAGE", w / 2, fgY + fgHeight / 2 - 12);
    ctx.fillStyle = (bgType === "white") ? "#64748b" : "#94a3b8";
    ctx.font = "500 18px 'Plus Jakarta Sans', sans-serif";
    ctx.fillText("Select an MP4 from your PC to load", w / 2, fgY + fgHeight / 2 + 22);
    ctx.restore();
  }

  // Ensure textElements state initialized
  const defaultSongY = fgY + fgHeight + 120;
  const defaultAnimeY = defaultSongY + 54;
  const defaultWmX = fgX + 35;
  const defaultWmY = fgY + 45;

  if (!state.textElements) {
    state.textElements = {
      series: { x: 540, y: 320, size: 38, color: "#38bdf8" },
      song: { x: 540, y: defaultSongY, size: 54, color: "#ffffff" },
      anime: { x: 540, y: defaultAnimeY, size: 32, color: "#38bdf8" },
      watermark: { x: defaultWmX, y: defaultWmY, size: 28, color: "#ffffff" },
      subtitles: { x: 540, y: 1690, size: 38, color: "#ffffff" }
    };
  }
  if (!state.textElements.series) state.textElements.series = { x: 540, y: 320, size: 38, color: "#38bdf8" };
  if (!state.textElements.series.color) state.textElements.series.color = "#38bdf8";
  if (!state.textElements.song) state.textElements.song = { x: 540, y: defaultSongY, size: 54, color: "#ffffff" };
  if (!state.textElements.song.color) state.textElements.song.color = "#ffffff";
  if (!state.textElements.anime) state.textElements.anime = { x: 540, y: defaultAnimeY, size: 32, color: "#38bdf8" };
  if (!state.textElements.anime.color) state.textElements.anime.color = "#38bdf8";
  if (!state.textElements.creatorBadge) {
    state.textElements.creatorBadge = { x: 540, y: 160, size: 30, color: "#ffffff" };
  }
  if (!state.textElements.creatorBadge.color) state.textElements.creatorBadge.color = "#ffffff";
  if (!state.textElements.watermark) {
    state.textElements.watermark = { x: defaultWmX, y: defaultWmY, size: 28, color: "#ffffff" };
  }
  if (!state.textElements.watermark.color) state.textElements.watermark.color = "#ffffff";
  if (state.textElements.watermark.x === undefined || state.textElements.watermark.x === null) {
    state.textElements.watermark.x = defaultWmX;
  }
  if (state.textElements.watermark.y === undefined || state.textElements.watermark.y === null) {
    state.textElements.watermark.y = defaultWmY;
  }
  if (!state.textElements.song._custom) {
    state.textElements.song.y = defaultSongY;
  }
  if (!state.textElements.anime._custom) {
    state.textElements.anime.y = defaultAnimeY;
  }
  if (!state.textElements.subtitles) {
    state.textElements.subtitles = { x: 540, y: 1690, size: 38, color: "#ffffff" };
  }
  if (!state.textElements.subtitles.color) state.textElements.subtitles.color = "#ffffff";
  state._textBoxes = state._textBoxes || {};

  // 4. SERIES HEADER TEXT / VIRAL HOOK (Movable & Resizable)
  if (state.showSeriesText !== false) {
    const seriesCfg = state.textElements.series;
    const seriesText = state.seriesFormat.replace("{day}", state.dayNumber);
    const seriesLines = seriesText.toUpperCase().split("\n");
    const sSize = seriesCfg.size || 38;
    const sLineHeight = sSize * 1.25;
    const sFont = `900 ${sSize}px 'Cabinet Grotesk', sans-serif`;

    ctx.save();
    ctx.textAlign = "center";
    ctx.font = sFont;

    let maxSeriesW = 0;
    seriesLines.forEach((line) => {
      const lw = ctx.measureText(line).width;
      if (lw > maxSeriesW) maxSeriesW = lw;
    });

    ctx.shadowColor = (bgType === "white") ? "rgba(0, 0, 0, 0.12)" : "rgba(0, 0, 0, 0.9)";
    ctx.shadowBlur = (bgType === "white") ? 4 : 14;

    seriesLines.forEach((line, i) => {
      let lineCol = seriesCfg.color;
      if (bgType === "white") {
        if (!lineCol || !isDarkColor(lineCol)) {
          lineCol = (i === 0) ? "#0284c7" : "#0f172a";
        }
      } else {
        if (!lineCol || isDarkColor(lineCol)) {
          lineCol = (i === 0) ? "#38bdf8" : "#ffffff";
        }
      }
      ctx.fillStyle = lineCol;
      ctx.fillText(line, seriesCfg.x, seriesCfg.y + i * sLineHeight);
    });
    ctx.restore();

    // Save bounding box for series text
    state._textBoxes.series = {
      x: seriesCfg.x - maxSeriesW / 2 - 16,
      y: seriesCfg.y - sSize + 4,
      width: maxSeriesW + 32,
      height: seriesLines.length * sLineHeight + 10
    };

  } else {
    delete state._textBoxes.series;
  }

  // Omit Song Name, Anime Name, and Track Pill overlays from video canvas
  delete state._textBoxes.song;
  delete state._textBoxes.anime;

  // 6b. USERNAME WATERMARK (Clean text watermark)
  const isWmEnabled = !!(state.watermark && state.watermark.enabled);
  const wmText = (state.watermark && state.watermark.text && state.watermark.text.trim()) 
    ? state.watermark.text.trim() 
    : ((el.inputWatermarkText && el.inputWatermarkText.value && el.inputWatermarkText.value.trim()) 
       ? el.inputWatermarkText.value.trim() 
       : "lap_lac7");
  const wmCfg = (state.textElements && state.textElements.watermark) ? state.textElements.watermark : { x: defaultWmX, y: defaultWmY, size: 28, color: "#ffffff" };

  if (isWmEnabled && wmText) {
    const wmSize = wmCfg.size || 28;
    const wmFont = `800 ${wmSize}px 'Cabinet Grotesk', 'Space Grotesk', sans-serif`;
    ctx.save();
    ctx.font = wmFont;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    let wColor = wmCfg.color;
    if (bgType === "white") {
      if (!wColor || !isDarkColor(wColor)) wColor = "#0f172a";
      ctx.fillStyle = wColor;
      ctx.shadowColor = "rgba(0, 0, 0, 0.12)";
      ctx.shadowBlur = 4;
      ctx.fillText(wmText, wmCfg.x, wmCfg.y);
    } else {
      if (!wColor || isDarkColor(wColor)) wColor = "#ffffff";
      ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
      ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
      ctx.shadowBlur = 6;
      ctx.fillText(wmText, wmCfg.x + 1, wmCfg.y + 2);
      ctx.fillStyle = wColor;
      ctx.shadowColor = "transparent";
      ctx.fillText(wmText, wmCfg.x, wmCfg.y);
    }
    const nameW = ctx.measureText(wmText).width;
    ctx.restore();

    state._textBoxes.watermark = {
      x: wmCfg.x - 6,
      y: wmCfg.y - wmSize / 2 - 6,
      width: nameW + 12,
      height: wmSize + 12
    };
  } else {
    delete state._textBoxes.watermark;
  }

  // 6c. CREATOR PROFILE HEADER (avatar above display name, handle, and follow CTA)
  const isBadgeEnabled = !!(state.creatorBadge && state.creatorBadge.enabled);
  let badgeTag = (state.creatorBadge && state.creatorBadge.text && state.creatorBadge.text.trim()) 
    ? state.creatorBadge.text.trim() 
    : "@Lap_lac7";
  if (badgeTag.toLowerCase() === "@lap_lac7") badgeTag = "@Lap_lac7";
  const badgeCfg = (state.textElements && state.textElements.creatorBadge) ? state.textElements.creatorBadge : { x: 540, y: 160, size: 28, color: "#ffffff" };

  if (isBadgeEnabled) {
    const bSize = badgeCfg.size || 28;
    const avatarD = Math.round(bSize * 2.3);
    const hasAvatar = _creatorAvatarImg && _creatorAvatarImg.complete && _creatorAvatarImg.naturalWidth > 0;
    const spacing = Math.round(bSize * 0.34);
    const displayName = "Lap_lac7";
    const displaySize = Math.max(16, Math.round(bSize * 0.75));
    const handleSize = Math.max(13, Math.round(bSize * 0.48));
    const followText = "Follow for more";
    const handleLine = `${badgeTag}  •  ${followText}`;

    ctx.save();
    ctx.font = `800 ${displaySize}px 'Cabinet Grotesk', 'Space Grotesk', sans-serif`;
    const displayW = ctx.measureText(displayName).width;
    ctx.font = `700 ${handleSize}px 'Cabinet Grotesk', 'Space Grotesk', sans-serif`;
    const handleW = ctx.measureText(handleLine).width;
    const totalW = Math.max(avatarD, displayW, handleW);
    const totalH = avatarD + spacing + displaySize + Math.round(bSize * 0.12) + handleSize;
    const topY = badgeCfg.y - totalH / 2;
    const avX = badgeCfg.x - avatarD / 2;
    const avY = topY;
    const radius = avatarD / 2;

    // 1. Draw the circular Laplace avatar at the top.
    if (hasAvatar) {
      ctx.save();
      // Drop shadow for avatar
      ctx.shadowColor = (bgType === "white") ? "rgba(0, 0, 0, 0.18)" : "rgba(0, 0, 0, 0.7)";
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(avX + radius, avY + radius, radius, 0, Math.PI * 2);
      ctx.fillStyle = (bgType === "white") ? "#ffffff" : "#1e293b";
      ctx.fill();

      // Clip image in circle
      ctx.clip();
      ctx.drawImage(_creatorAvatarImg, avX, avY, avatarD, avatarD);
      ctx.restore();

      // Subtle stylish ring around avatar
      ctx.save();
      ctx.beginPath();
      ctx.arc(avX + radius, avY + radius, radius, 0, Math.PI * 2);
      ctx.strokeStyle = (bgType === "white") ? "rgba(0, 0, 0, 0.15)" : "rgba(255, 255, 255, 0.45)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    // 2. Draw the display name and handle beneath the avatar, as in the reference.
    const nameY = avY + avatarD + spacing + displaySize;
    const handleY = nameY + handleSize + Math.round(bSize * 0.12);
    let bColor = badgeCfg.color;
    ctx.textAlign = "center";
    ctx.font = `800 ${displaySize}px 'Cabinet Grotesk', 'Space Grotesk', sans-serif`;
    if (bgType === "white") {
      if (!bColor || !isDarkColor(bColor)) bColor = "#0f172a";
      ctx.fillStyle = bColor;
      ctx.shadowColor = "rgba(0, 0, 0, 0.12)";
      ctx.shadowBlur = 4;
      ctx.fillText(displayName, badgeCfg.x, nameY);
    } else {
      if (!bColor || isDarkColor(bColor)) bColor = "#ffffff";
      ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
      ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
      ctx.shadowBlur = 6;
      ctx.fillText(displayName, badgeCfg.x + 1, nameY + 2);
      ctx.fillStyle = bColor;
      ctx.shadowColor = "transparent";
      ctx.fillText(displayName, badgeCfg.x, nameY);
    }

    ctx.font = `700 ${handleSize}px 'Cabinet Grotesk', 'Space Grotesk', sans-serif`;
    ctx.fillStyle = bgType === "white" ? "#475569" : "rgba(255, 255, 255, 0.82)";
    ctx.fillText(handleLine, badgeCfg.x, handleY);

    ctx.restore();

    state._textBoxes.creatorBadge = {
      x: badgeCfg.x - totalW / 2 - 8,
      y: topY - 6,
      width: totalW + 16,
      height: totalH + 12
    };
  } else {
    delete state._textBoxes.creatorBadge;
  }

  // 7. DUAL-LANGUAGE LIVE SUBTITLES
  if (state.showLyrics !== false && state.lyrics && state.lyrics.length > 0) {
    const curTime = (hasVideo && vid && !vid.paused) ? vid.currentTime : (state.currentTime !== undefined ? state.currentTime : (vid ? vid.currentTime : 0));
    if (typeof updateLyricsActiveState === "function") {
      updateLyricsActiveState(curTime);
    }
    const matchingLines = state.lyrics.filter(l => {
      const s = parseFloat(l.start) || 0;
      const e = parseFloat(l.end) || 0;
      return curTime >= s && curTime <= e;
    });
    // Pick the most recent active phrase to prevent lagging onto previous lines
    let activeLine = matchingLines.length > 0
      ? matchingLines.reduce((prev, curr) => ((parseFloat(curr.start) || 0) > (parseFloat(prev.start) || 0) ? curr : prev))
      : null;
    if (!activeLine) {
      const orderedLyrics = state.lyrics
        .filter(line => Number.isFinite(parseFloat(line.start)) && Number.isFinite(parseFloat(line.end)))
        .slice()
        .sort((a, b) => parseFloat(a.start) - parseFloat(b.start));
      const nextLine = orderedLyrics.find(line => parseFloat(line.start) > curTime);
      const previousLine = orderedLyrics.filter(line => parseFloat(line.end) < curTime).pop();
      // Leave even short vocal pauses empty. Exported ASS subtitles do the same,
      // so preview and final video never disagree about a cue's end time.
    }
    if (activeLine) {
      const lineStart = parseFloat(activeLine.start) || 0;
      const lineEnd = parseFloat(activeLine.end) || (lineStart + 2.5);
      const totalDur = Math.max(0.3, lineEnd - lineStart);
      const elapsed = Math.max(0, curTime - lineStart);
      const stylePreset = state.subtitleStyle || "minimal";

      const lang = state.subtitleLanguage || "both";
      const rawJp = (activeLine.text_jp || "").trim();
      const rawEn = (activeLine.text_en || "").trim();
      const rawRomaji = (activeLine.text_romaji || "").trim();
      const rawText = (activeLine.text || "").trim();
      const hasJp = /[\u3040-\u30ff\u4e00-\u9fff]/.test(rawJp || rawText || rawEn);

      let jpText = "";
      let enText = "";

      if (lang === "en") {
        enText = rawEn || (!hasJp ? (rawJp || rawText) : (rawRomaji || rawJp || rawText));
      } else if (lang === "jp") {
        jpText = rawJp || rawText || rawEn;
      } else {
        // both
        jpText = rawJp || (hasJp ? rawText : "");
        enText = rawEn || (!hasJp ? (rawJp || rawText) : "");
        if (!jpText && !enText) {
          if (hasJp) jpText = rawText;
          else enText = rawText;
        }
      }

      renderDualSubtitles(ctx, jpText, enText, elapsed, totalDur, stylePreset, w, h, activeLine);
    } else {
      renderDualSubtitles(ctx, "", "", 0, 1, state.subtitleStyle || "minimal", w, h);
    }
  } else {
    delete state._textBoxes.subtitles;
    delete state._textBoxes.subtitles_en;
  }

  // 8. FADE TRANSITION OVERLAY (Only during active playback; never blacks out canvas when paused)
  if (state.fadeTransition && state.fadeTransition.mode !== "none" && state.isPlaying) {
    const curTime = (hasVideo && vid) ? vid.currentTime : state.currentTime;
    const clipStart = state.startTime || 0;
    const clipEnd = (state.endTime && state.endTime > clipStart) ? state.endTime : 35;
    const clipDur = Math.max(0.1, clipEnd - clipStart);
    const fadeDur = Math.min(state.fadeTransition.duration || 0.50, clipDur / 2);
    const relTime = Math.max(0, curTime - clipStart);
    let fadeAlpha = 0;

    if ((state.fadeTransition.mode === "in" || state.fadeTransition.mode === "both") && relTime < fadeDur) {
      fadeAlpha = Math.max(0, Math.min(1, 1 - (relTime / fadeDur)));
    }
    if ((state.fadeTransition.mode === "out" || state.fadeTransition.mode === "both") && (clipDur - relTime) < fadeDur) {
      const outAlpha = Math.max(0, Math.min(1, 1 - ((clipDur - relTime) / fadeDur)));
      fadeAlpha = Math.max(fadeAlpha, outAlpha);
    }

    if (fadeAlpha > 0) {
      ctx.save();
      ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(1, Math.max(0, fadeAlpha))})`;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }

  // 9. INTERACTIVE SELECTION BOUNDING BOX & 8 RESIZE HANDLES
  if (state.isTextElementSelected && state.selectedTextElem && state._textBoxes && state._textBoxes[state.selectedTextElem]) {
    const box = state._textBoxes[state.selectedTextElem];
    const elem = state.textElements[state.selectedTextElem];
    ctx.save();

    // Selection dashed border
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 2.5;
    ctx.setLineDash([8, 5]);
    ctx.strokeRect(box.x, box.y, box.width, box.height);
    ctx.setLineDash([]);

    // 8 resize handles (4 corners + 4 sides)
    const handles = [
      { id: "nw", x: box.x, y: box.y },
      { id: "n",  x: box.x + box.width / 2, y: box.y },
      { id: "ne", x: box.x + box.width, y: box.y },
      { id: "e",  x: box.x + box.width, y: box.y + box.height / 2 },
      { id: "se", x: box.x + box.width, y: box.y + box.height },
      { id: "s",  x: box.x + box.width / 2, y: box.y + box.height },
      { id: "sw", x: box.x, y: box.y + box.height },
      { id: "w",  x: box.x, y: box.y + box.height / 2 }
    ];

    const hSize = 14;
    handles.forEach(h => {
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#0284c7";
      ctx.lineWidth = 2;
      ctx.fillRect(h.x - hSize / 2, h.y - hSize / 2, hSize, hSize);
      ctx.strokeRect(h.x - hSize / 2, h.y - hSize / 2, hSize, hSize);
    });

    // Floating Label Badge above bounding box
    const elemLabels = { series: "Series Header", creatorBadge: "Profile Header", watermark: "Username", subtitles: "Subtitles" };
    const sizeStr = (elem && elem.size) ? `: ${elem.size}px` : "";
    const labelText = `🎯 ${elemLabels[state.selectedTextElem] || "Text"}${sizeStr}`;
    ctx.font = "700 20px 'Plus Jakarta Sans', sans-serif";
    const badgeW = ctx.measureText(labelText).width + 24;
    const badgeH = 32;
    const badgeX = box.x + (box.width - badgeW) / 2;
    const badgeY = Math.max(12, box.y - badgeH - 8);

    ctx.fillStyle = "rgba(10, 15, 30, 0.92)";
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#38bdf8";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(labelText, badgeX + badgeW / 2, badgeY + badgeH / 2);

    ctx.restore();
  } else if (state.hoveredTextElem && state._textBoxes && state._textBoxes[state.hoveredTextElem]) {
    // Subtle hover indicator
    const box = state._textBoxes[state.hoveredTextElem];
    ctx.save();
    ctx.strokeStyle = "rgba(56, 189, 248, 0.45)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(box.x, box.y, box.width, box.height);
    ctx.restore();
  }
}

function formatTime(secs, precision = 0) {
  if (precision === 0) {
    const rounded = Math.round(secs);
    const m = Math.floor(rounded / 60);
    const s = Math.floor(rounded % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  const factor = Math.pow(10, precision);
  const ms = Math.floor(Math.round((secs % 1) * factor));
  if (ms >= factor) {
    return formatTime(secs + 1 / factor, precision);
  }
  return `${m}:${s.toString().padStart(2, "0")}.${ms.toString().padStart(precision, "0")}`;
}

function parseTime(str) {
  if (typeof str !== "string") str = String(str || "0");
  str = str.trim();
  if (str.includes(":")) {
    const parts = str.split(":");
    if (parts.length === 2) {
      const mins = parseFloat(parts[0]) || 0;
      const secs = parseFloat(parts[1]) || 0;
      return Math.max(0, mins * 60 + secs);
    }
  }
  return Math.max(0, parseFloat(str) || 0);
}

function updateLyricsActiveState(currentTime) {
  if (!el.lyricsTimelineList || el.lyricsTimelineList.classList.contains("hidden")) return;
  const items = el.lyricsTimelineList.querySelectorAll(".lyric-line-item");
  let activeItem = null;
  let maxStart = -1;
  items.forEach(item => {
    const s = parseFloat(item.dataset.start) || 0;
    const e = parseFloat(item.dataset.end) || 0;
    if (currentTime >= (s - 0.05) && currentTime <= (e + 0.05)) {
      if (s > maxStart) {
        maxStart = s;
        activeItem = item;
      }
    }
  });
  items.forEach(item => {
    if (item === activeItem) {
      if (!item.classList.contains("active")) item.classList.add("active");
    } else if (item.classList.contains("active")) {
      item.classList.remove("active");
    }
  });
}

function ensureAbsoluteLyricTimes(lyrics) {
  // Preserve true audio timestamps across the full video
  return lyrics || [];
}

function renderLyricsList(lyrics) {
  if (!lyrics || lyrics.length === 0) {
    if (el.lyricsEmptyHint) el.lyricsEmptyHint.classList.remove("hidden");
    if (el.lyricsTimelineList) {
      el.lyricsTimelineList.innerHTML = "";
      el.lyricsTimelineList.classList.add("hidden");
    }
    return;
  }

  // Sort by start timestamp cleanly
  lyrics.sort((a, b) => (parseFloat(a.start) || 0) - (parseFloat(b.start) || 0));

  if (el.lyricsEmptyHint) el.lyricsEmptyHint.classList.add("hidden");
  if (el.lyricsTimelineList) {
    el.lyricsTimelineList.classList.remove("hidden");
    el.lyricsTimelineList.innerHTML = lyrics.map((line, idx) => {
      const s = parseFloat(line.start) || 0;
      const e = parseFloat(line.end) || 0;
      const inClip = (e >= (state.startTime - 0.1) && s <= (state.endTime + 0.1));
      return `
      <div class="lyric-line-item ${inClip ? 'in-clip' : ''}" data-idx="${idx}" data-start="${s}" data-end="${e}" title="Click to jump playhead to ${formatTime(s)}">
        <div class="lyric-line-header">
          <span class="lyric-line-time">${formatTime(s)} → ${formatTime(e)}</span>
          <span style="font-size:10px;font-weight:700;color:${inClip ? 'var(--accent-cyan)' : 'var(--text-muted)'};">${inClip ? '🎯 Clip' : `Line ${idx + 1}`}</span>
        </div>
        <div class="lyric-line-jp">${line.text_jp || line.text || ""}</div>
        <div class="lyric-line-en">${line.text_en || ""}</div>
      </div>
    `;
    }).join("");

    el.lyricsTimelineList.querySelectorAll(".lyric-line-item").forEach(item => {
      item.addEventListener("click", () => {
        const start = parseFloat(item.dataset.start);
        if (!isNaN(start)) {
          if (el.hiddenVideo) el.hiddenVideo.currentTime = start;
          updatePlayheadUI(start);
          showToast(`Jumped to: ${formatTime(start)}`);
        }
      });
    });
  }
}


// -------------------------------------------------------------
// CAPCUT PROFESSIONAL TIMELINE ENGINE & COORDINATE SYSTEM
// -------------------------------------------------------------
function getTimelineMetrics() {
  const container = el.timelineScrollContainer;
  const viewportW = (container && container.clientWidth > 0) ? container.clientWidth : Math.max(600, window.innerWidth - 380);
  const dur = Math.max(0.1, (el.hiddenVideo && isFinite(el.hiddenVideo.duration) && el.hiddenVideo.duration > 0)
    ? el.hiddenVideo.duration
    : ((state.videoMeta && isFinite(state.videoMeta.duration) && state.videoMeta.duration > 0) ? state.videoMeta.duration : 35.0));
  const zoom = Math.max(1, state.timelineZoom || 1);
  // Fit the whole duration 100% into the visible timeline width without horizontal scrolling
  const contentW = (zoom > 1.01) ? Math.round(viewportW * zoom) : viewportW;
  return { viewportW, contentW, dur, zoom };
}

function timeToPx(time) {
  const { contentW, dur } = getTimelineMetrics();
  return (Math.max(0, Math.min(dur, time)) / dur) * contentW;
}

function pxToTime(px) {
  const { contentW, dur } = getTimelineMetrics();
  return (Math.max(0, Math.min(contentW, px)) / contentW) * dur;
}

// -------------------------------------------------------------
// DYNAMIC TIME RULER CANVAS
// -------------------------------------------------------------
function drawRulerCanvas() {
  const canvas = el.rulerCanvas;
  if (!canvas) return;
  const { contentW, dur } = getTimelineMetrics();
  const dpr = window.devicePixelRatio || 1;
  const h = 20;

  if (canvas.width !== Math.round(contentW * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(contentW * dpr);
    canvas.height = Math.round(h * dpr);
  }
  canvas.style.width = `${contentW}px`;
  canvas.style.height = `${h}px`;

  const ctxRuler = canvas.getContext("2d");
  ctxRuler.save();
  ctxRuler.scale(dpr, dpr);
  ctxRuler.clearRect(0, 0, contentW, h);

  // Background
  ctxRuler.fillStyle = "#0F0F0F";
  ctxRuler.fillRect(0, 0, contentW, h);

  const pps = contentW / dur; // Pixels per second
  const candidateSteps = [
    { step: 0.1, sub: 0.02, fmt: 3 },
    { step: 0.2, sub: 0.05, fmt: 2 },
    { step: 0.5, sub: 0.1, fmt: 1 },
    { step: 1.0, sub: 0.2, fmt: 0 },
    { step: 2.0, sub: 0.5, fmt: 0 },
    { step: 5.0, sub: 1.0, fmt: 0 },
    { step: 10.0, sub: 2.0, fmt: 0 },
    { step: 15.0, sub: 5.0, fmt: 0 },
    { step: 30.0, sub: 5.0, fmt: 0 },
    { step: 60.0, sub: 10.0, fmt: 0 },
    { step: 120.0, sub: 30.0, fmt: 0 },
    { step: 300.0, sub: 60.0, fmt: 0 }
  ];

  let chosen = candidateSteps[candidateSteps.length - 1];
  for (const c of candidateSteps) {
    if (c.step * pps >= 65) {
      chosen = c;
      break;
    }
  }

  // Draw minor sub-ticks
  ctxRuler.strokeStyle = "#2A2A2A";
  ctxRuler.lineWidth = 1;
  ctxRuler.beginPath();
  for (let t = 0; t <= dur; t += chosen.sub) {
    const x = Math.round((t / dur) * contentW) + 0.5;
    ctxRuler.moveTo(x, h - 4);
    ctxRuler.lineTo(x, h);
  }
  ctxRuler.stroke();

  // Draw major graduation ticks and time markers
  ctxRuler.strokeStyle = "#8A8A8A";
  ctxRuler.fillStyle = "#8A8A8A";
  ctxRuler.font = "8.5px 'Space Grotesk', monospace, sans-serif";
  ctxRuler.textBaseline = "top";
  ctxRuler.textAlign = "left";

  ctxRuler.beginPath();
  for (let t = 0; t <= dur + 0.001; t += chosen.step) {
    const x = Math.round((t / dur) * contentW) + 0.5;
    ctxRuler.moveTo(x, h - 7);
    ctxRuler.lineTo(x, h);
    const label = formatTime(t, chosen.fmt);
    if (x + 35 <= contentW - 25) {
      ctxRuler.fillText(label, x + 3, 1);
    }
  }
  // Draw final duration boundary tick & label at the right edge
  const endX = Math.round(contentW) - 0.5;
  ctxRuler.moveTo(endX, h - 9);
  ctxRuler.lineTo(endX, h);
  ctxRuler.stroke();
  const endLabel = formatTime(dur, 0);
  ctxRuler.fillText(endLabel, Math.max(0, contentW - 30), 1);

  ctxRuler.restore();
}

// -------------------------------------------------------------
// VIDEO THUMBNAIL STRIP CANVAS & GENERATION
// -------------------------------------------------------------
const thumbnailCache = new Map();
let isGeneratingThumbnails = false;
let activeDrag = null;

async function generateThumbnailStrip() {
  const vid = el.hiddenVideo;
  if (!vid || !vid.src || isGeneratingThumbnails) return;
  const dur = vid.duration;
  if (!dur || isNaN(dur)) return;

  const { contentW } = getTimelineMetrics();
  // Lightweight thumbnail count (max 10) to avoid HTTP connection pool saturation
  const thumbCount = Math.min(10, Math.max(6, Math.ceil(contentW / 120)));
  const interval = dur / thumbCount;

  let needsExtraction = false;
  for (let i = 0; i < thumbCount; i++) {
    const key = Math.round(i * interval * 10) / 10;
    if (!thumbnailCache.has(key)) {
      needsExtraction = true;
      break;
    }
  }
  if (!needsExtraction) {
    drawThumbnailStrip();
    return;
  }

  isGeneratingThumbnails = true;
  const offVideo = document.createElement("video");
  offVideo.crossOrigin = "anonymous";
  offVideo.muted = true;
  offVideo.preload = "auto";
  offVideo.src = vid.src;

  const offCanvas = document.createElement("canvas");
  offCanvas.width = 160;
  offCanvas.height = 90;
  const offCtx = offCanvas.getContext("2d");

  await new Promise((resolve) => {
    offVideo.addEventListener("loadeddata", resolve, { once: true });
    offVideo.addEventListener("error", resolve, { once: true });
    setTimeout(resolve, 800);
  });

  for (let i = 0; i < thumbCount; i++) {
    // If playback started, abort thumbnail generation immediately to free resources
    if (state.isPlaying) break;

    const t = Math.min(dur - 0.05, i * interval);
    const key = Math.round(t * 10) / 10;
    if (thumbnailCache.has(key)) continue;

    try {
      offVideo.currentTime = t;
      await new Promise((resolve) => {
        offVideo.addEventListener("seeked", resolve, { once: true });
        setTimeout(resolve, 150);
      });
      const vW = offVideo.videoWidth || 160;
      const vH = offVideo.videoHeight || 90;
      const vRatio = vW / vH;
      const targetRatio = offCanvas.width / offCanvas.height;
      let sx = 0, sy = 0, sw = vW, sh = vH;
      if (vRatio > targetRatio) {
        sw = vH * targetRatio;
        sx = (vW - sw) / 2;
      } else {
        sh = vW / targetRatio;
        sy = (vH - sh) / 2;
      }
      offCtx.drawImage(offVideo, sx, sy, sw, sh, 0, 0, offCanvas.width, offCanvas.height);
      const imgData = offCanvas.toDataURL("image/jpeg", 0.60);
      const img = new Image();
      img.src = imgData;
      thumbnailCache.set(key, img);
      drawThumbnailStrip();
    } catch (_) {
      break;
    }
  }

  try {
    offVideo.src = "";
    offVideo.load();
  } catch (_) {}
  isGeneratingThumbnails = false;
  drawThumbnailStrip();
}

function drawThumbnailStrip() {
  const canvas = el.thumbnailCanvas;
  if (!canvas) return;
  const { contentW, dur } = getTimelineMetrics();
  const dpr = window.devicePixelRatio || 1;
  const h = 54;

  if (canvas.width !== Math.round(contentW * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(contentW * dpr);
    canvas.height = Math.round(h * dpr);
  }
  canvas.style.width = `${contentW}px`;
  canvas.style.height = `${h}px`;

  const ctxThumb = canvas.getContext("2d");
  ctxThumb.save();
  ctxThumb.scale(dpr, dpr);
  ctxThumb.clearRect(0, 0, contentW, h);

  ctxThumb.fillStyle = "#141414";
  ctxThumb.fillRect(0, 0, contentW, h);

  const thumbWidth = Math.round(h * (16 / 9)); // 96px for 16:9 widescreen
  const thumbCount = Math.max(6, Math.ceil(contentW / thumbWidth));
  const interval = dur / thumbCount;

  for (let i = 0; i < thumbCount; i++) {
    const x = Math.round(i * (contentW / thumbCount));
    const nextX = Math.round((i + 1) * (contentW / thumbCount));
    const w = nextX - x;
    const t = i * interval;
    const key = Math.round(t * 10) / 10;
    let img = thumbnailCache.get(key);
    if (!img || !img.complete) {
      let closestDiff = Infinity;
      for (const [k, v] of thumbnailCache.entries()) {
        if (v && v.complete) {
          const diff = Math.abs(k - key);
          if (diff < closestDiff && diff <= 3.0) {
            closestDiff = diff;
            img = v;
          }
        }
      }
    }

    if (img && img.complete) {
      const imgW = img.naturalWidth || img.width || 160;
      const imgH = img.naturalHeight || img.height || 90;
      const imgRatio = imgW / imgH;
      const tileRatio = w / h;
      let sx = 0, sy = 0, sw = imgW, sh = imgH;
      if (imgRatio > tileRatio) {
        sw = imgH * tileRatio;
        sx = (imgW - sw) / 2;
      } else {
        sh = imgW / tileRatio;
        sy = (imgH - sh) / 2;
      }
      ctxThumb.drawImage(img, sx, sy, sw, sh, x, 0, w, h);
    } else {
      ctxThumb.fillStyle = i % 2 === 0 ? "#1A1A1A" : "#141414";
      ctxThumb.fillRect(x, 0, w, h);
      ctxThumb.fillStyle = "#8A8A8A";
      ctxThumb.font = "8px monospace";
      ctxThumb.fillText(formatTime(t, 0), x + 4, h - 8);
    }

    // Filmstrip frame separator
    ctxThumb.strokeStyle = "#2A2A2A";
    ctxThumb.lineWidth = 1;
    ctxThumb.beginPath();
    ctxThumb.moveTo(x + 0.5, 0);
    ctxThumb.lineTo(x + 0.5, h);
    ctxThumb.stroke();
  }

  ctxThumb.restore();
}

// -------------------------------------------------------------
// AUDIO WAVEFORM CANVAS
// -------------------------------------------------------------
function drawWaveformCanvas() {
  const canvas = el.waveformCanvas;
  if (!canvas) return;
  const { contentW, dur } = getTimelineMetrics();
  const dpr = window.devicePixelRatio || 1;
  const h = 54;

  if (canvas.width !== Math.round(contentW * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(contentW * dpr);
    canvas.height = Math.round(h * dpr);
  }
  canvas.style.width = `${contentW}px`;
  canvas.style.height = `${h}px`;

  const ctxWave = canvas.getContext("2d");
  ctxWave.save();
  ctxWave.scale(dpr, dpr);
  ctxWave.clearRect(0, 0, contentW, h);

  ctxWave.fillStyle = "#0A0A0A";
  ctxWave.fillRect(0, 0, contentW, h);

  // Center baseline
  ctxWave.strokeStyle = "#2A2A2A";
  ctxWave.lineWidth = 1;
  ctxWave.beginPath();
  ctxWave.moveTo(0, h / 2 + 0.5);
  ctxWave.lineTo(contentW, h / 2 + 0.5);
  ctxWave.stroke();

  // Peak bars
  const barWidth = 3;
  const barGap = 1.5;
  const step = barWidth + barGap;
  const totalBars = Math.floor(contentW / step);

  const startPx = timeToPx(state.startTime);
  const endPx = timeToPx(state.endTime);

  for (let i = 0; i < totalBars; i++) {
    const x = i * step;
    const barTime = (x / contentW) * dur;
    
    // Deterministic procedural waveform pattern
    const freq1 = Math.sin(barTime * 3.4 + 0.2);
    const freq2 = Math.cos(barTime * 8.1);
    const freq3 = Math.sin(barTime * 15.3);
    const rawVal = Math.abs(freq1 * 0.45 + freq2 * 0.35 + freq3 * 0.2);
    const amp = Math.max(3, Math.min(h / 2 - 4, rawVal * (h / 2 - 3)));

    const isSelected = x >= startPx && x <= endPx;

    if (isSelected) {
      ctxWave.fillStyle = "#EDEDED";
    } else {
      ctxWave.fillStyle = "#2A2A2A";
    }

    const barH = amp * 2;
    const barY = h / 2 - amp;
    ctxWave.fillRect(x, barY, barWidth, barH);
  }

  ctxWave.restore();
}

// -------------------------------------------------------------
// PLAYHEAD & TIMELINE UI SYNCHRONIZATION
// -------------------------------------------------------------
function updatePlayheadUI(currentTime) {
  const px = timeToPx(currentTime);

  if (el.scrubberPlayhead) {
    el.scrubberPlayhead.style.left = `${px}px`;
  }
  const isDraggingPlayhead = (activeDrag === "playhead");
  const timeStr = formatTime(currentTime, isDraggingPlayhead ? 2 : 0);
  if (el.timeCurrent) el.timeCurrent.textContent = timeStr;
  if (el.tooltipPlayhead) el.tooltipPlayhead.textContent = timeStr;

  // Auto-scroll when playing to keep playhead visible
  if (state.isPlaying && el.timelineScrollContainer && el.timelineScrollContainer.scrollWidth > el.timelineScrollContainer.clientWidth) {
    const container = el.timelineScrollContainer;
    const viewL = container.scrollLeft;
    const viewR = viewL + container.clientWidth;
    if (px > viewR - 60) {
      container.scrollLeft = px - 60;
    } else if (px < viewL + 20) {
      container.scrollLeft = Math.max(0, px - 20);
    }
  }
}

function updateTimelineUI() {
  const { contentW } = getTimelineMetrics();

  if (el.timelineScrollContainer) {
    el.timelineScrollContainer.style.overflowX = (state.timelineZoom > 1.01) ? "auto" : "hidden";
    if (state.timelineZoom <= 1.01) {
      el.timelineScrollContainer.scrollLeft = 0;
    }
  }

  // Resize content wrapper to match current zoom scale
  if (el.timelineContentWrapper) {
    el.timelineContentWrapper.style.width = (state.timelineZoom > 1.01) ? `${contentW}px` : "100%";
  }

  const startPx = timeToPx(state.startTime);
  const endPx = timeToPx(state.endTime);
  const rangeW = Math.max(4, endPx - startPx);

  if (el.scrubberRange) {
    el.scrubberRange.style.left = `${startPx}px`;
    el.scrubberRange.style.width = `${rangeW}px`;
  }
  if (el.scrubberDimLeft) {
    el.scrubberDimLeft.style.width = `${startPx}px`;
  }
  if (el.scrubberDimRight) {
    el.scrubberDimRight.style.left = `${endPx}px`;
    el.scrubberDimRight.style.width = `${Math.max(0, contentW - endPx)}px`;
  }

  const isDraggingStart = (activeDrag === "start" || document.activeElement === el.tlInputStart);
  const isDraggingEnd = (activeDrag === "end" || document.activeElement === el.tlInputEnd);

  const startStr = formatTime(state.startTime, isDraggingStart ? 2 : 0);
  const endStr = formatTime(state.endTime, isDraggingEnd ? 2 : 0);
  const clipDur = Math.max(0, state.endTime - state.startTime);
  const durStr = formatTime(clipDur, 0);

  if (el.tooltipStart) el.tooltipStart.textContent = startStr;
  if (el.tooltipEnd) el.tooltipEnd.textContent = endStr;
  if (el.rangeClipDuration) el.rangeClipDuration.textContent = durStr;

  // Sync timeline direct inputs (do not overwrite while user is actively typing)
  if (el.tlInputStart && document.activeElement !== el.tlInputStart) {
    el.tlInputStart.value = startStr;
  }
  if (el.tlInputEnd && document.activeElement !== el.tlInputEnd) {
    el.tlInputEnd.value = endStr;
  }
  if (el.tlValDuration) {
    el.tlValDuration.textContent = durStr;
  }

  // Sync sidebar inputs
  if (el.inputStartTime && document.activeElement !== el.inputStartTime) {
    el.inputStartTime.value = state.startTime.toFixed(3);
  }
  if (el.inputEndTime && document.activeElement !== el.inputEndTime) {
    el.inputEndTime.value = state.endTime.toFixed(3);
  }
  if (el.labelClipDuration) el.labelClipDuration.textContent = `${clipDur.toFixed(3)}s`;
  if (el.selectionDurationTag) el.selectionDurationTag.textContent = `Clip: ${clipDur.toFixed(3)}s`;

  // Redraw tracks
  drawRulerCanvas();
  drawThumbnailStrip();
  drawWaveformCanvas();

  // Dynamically update in-clip highlights on subtitle list
  if (el.lyricsTimelineList && !el.lyricsTimelineList.classList.contains("hidden")) {
    const items = el.lyricsTimelineList.querySelectorAll(".lyric-line-item");
    items.forEach(item => {
      const s = parseFloat(item.dataset.start) || 0;
      const e = parseFloat(item.dataset.end) || 0;
      const inClip = (e >= (state.startTime - 0.1) && s <= (state.endTime + 0.1));
      item.classList.toggle("in-clip", inClip);
      const badge = item.querySelector(".lyric-line-header span:last-child");
      if (badge) {
        badge.textContent = inClip ? "🎯 Clip" : `Line ${parseInt(item.dataset.idx) + 1}`;
        badge.style.color = inClip ? "var(--accent-cyan)" : "var(--text-muted)";
      }
    });
  }
}

function stepFrame(numFrames) {
  const vid = el.hiddenVideo;
  if (!vid) return;
  const fps = (state.videoMeta && state.videoMeta.fps) || 30;
  const delta = numFrames / fps;
  const dur = vid.duration || 0;
  const nextTime = Math.max(0, Math.min(dur, vid.currentTime + delta));
  vid.currentTime = nextTime;
  state.currentTime = nextTime;
  state.playbackStartPos = nextTime;
  updatePlayheadUI(nextTime);
}

let playRequestId = 0;
let playPending = false;
let isRecoveringVideo = false;

async function recoverVideoPipeline(seekTimeAfter) {
  if (isRecoveringVideo) return;
  const vid = el.hiddenVideo;
  if (!vid) return;
  const targetPath = state.videoPath;
  const generation = state.sourceGeneration;
  if (!targetPath || targetPath.startsWith("blob:") || targetPath.startsWith("http")) {
    state.isPlaying = false;
    if (el.btnPlayPause) el.btnPlayPause.textContent = "▶";
    return;
  }

  isRecoveringVideo = true;
  showToast("⚡ Auto-optimizing video for instant scrubbing & playback...");
  try {
    const cRes = await fetch("/api/video/ensure-compatible", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_path: targetPath, force: true })
    });
    if (cRes.ok) {
      const cData = await cRes.json();
      if (generation !== state.sourceGeneration) return;
      if (cData.file_path) {
        state.videoPath = cData.file_path;
        const targetTime = (seekTimeAfter !== undefined) ? seekTimeAfter : (state.currentTime || state.startTime || 0);
        const wasPlaying = state.isPlaying;
        vid.src = `/api/media/stream?path=${encodeURIComponent(cData.file_path)}`;
        vid.load();
        const onLoaded = () => {
          vid.removeEventListener("loadedmetadata", onLoaded);
          try {
            vid.currentTime = targetTime;
            state.currentTime = targetTime;
            updatePlayheadUI(targetTime);
          } catch (_) {}
          renderReel();
          showToast("✨ Video optimized & playback restored!");
          isRecoveringVideo = false;
          if (wasPlaying) {
            setTimeout(playVideo, 100);
          }
        };
        vid.addEventListener("loadedmetadata", onLoaded, { once: true });
        return;
      }
    }
  } catch (err) {
    console.warn("Auto-recovery error:", err);
  } finally {
    setTimeout(() => { isRecoveringVideo = false; }, 1500);
  }
}

function playVideo() {
  const vid = el.hiddenVideo;
  if (!vid || !vid.src) {
    showToast("⚠️ No video loaded. Please select a video file or YouTube URL first.");
    if (el.btnBrowse) el.btnBrowse.focus();
    return;
  }

  if (vid.error) {
    recoverVideoPipeline(state.currentTime);
    return;
  }

  state.isPlaying = true;
  playPending = true;
  if (el.btnPlayPause) el.btnPlayPause.textContent = "❚❚";

  const currentReq = ++playRequestId;

  // Validate bounds
  const dur = (vid && isFinite(vid.duration) && vid.duration > 0) ? vid.duration : ((state.videoMeta && state.videoMeta.duration) || 35.0);
  const clipStart = state.startTime || 0;
  const clipEnd = (state.endTime && state.endTime > clipStart) ? state.endTime : Math.min(dur, clipStart + 35.0);

  // If playhead is outside the clip range or not at target start, silence audio until seek to clipStart finishes
  const needsRewind = (vid.currentTime < clipStart - 0.05 || vid.currentTime >= clipEnd - 0.1 || Math.abs(vid.currentTime - (state.currentTime !== undefined ? state.currentTime : clipStart)) > 0.08);
  if (needsRewind) {
    const targetSeek = (state.currentTime >= clipStart && state.currentTime < clipEnd - 0.1) ? state.currentTime : clipStart;
    const prevMuted = vid.muted;
    vid.muted = true; // Mute immediately to guarantee zero audio leak from 0.00s
    try {
      vid.currentTime = targetSeek;
      state.currentTime = targetSeek;
      updatePlayheadUI(targetSeek);
    } catch (_) {}

    let seekDone = false;
    const onSeekFinished = () => {
      if (seekDone) return;
      seekDone = true;
      vid.removeEventListener("seeked", onSeekFinished);
      clearTimeout(safetyTimer);
      vid.volume = 0.0;
      if (!prevMuted) {
        vid.muted = false;
      }
      if (currentReq === playRequestId && state.isPlaying) {
        attemptPlay();
      }
    };
    const safetyTimer = setTimeout(() => {
      vid.volume = 0.0;
      if (!prevMuted) vid.muted = false;
      onSeekFinished();
    }, 350);
    vid.addEventListener("seeked", onSeekFinished, { once: true });
    return;
  }
  state.playbackStartPos = vid.currentTime;

  let attempts = 0;
  const maxAttempts = 8;

  function attemptPlay() {
    if (currentReq !== playRequestId || !state.isPlaying) {
      playPending = false;
      return;
    }

    if (vid.seeking) {
      let fired = false;
      const onSeeked = () => {
        if (fired) return;
        fired = true;
        vid.removeEventListener("seeked", onSeeked);
        clearTimeout(seekTimeout);
        if (currentReq === playRequestId && state.isPlaying) {
          attemptPlay();
        }
      };
      const seekTimeout = setTimeout(onSeeked, 600);
      vid.addEventListener("seeked", onSeeked, { once: true });
      return;
    }

    const targetVol = (state.smartLoop && state.isLooping && state.currentTime - clipStart < 0.22) ? 0.2 : 1.0;
    vid.volume = 0.0;
    const playPromise = vid.play();
    if (playPromise !== undefined) {
      playPromise.then(() => {
        playPending = false;
        if (currentReq !== playRequestId || !state.isPlaying) {
          try { vid.pause(); } catch (_) {}
          return;
        }
        state.isPlaying = true;
        if (el.btnPlayPause) el.btnPlayPause.textContent = "❚❚";
        setTimeout(() => {
          if (currentReq === playRequestId && state.isPlaying) {
            vid.volume = targetVol;
          }
        }, 25);
      }).catch(err => {
        if (currentReq !== playRequestId || !state.isPlaying) {
          playPending = false;
          return;
        }

        if (err && err.name === "AbortError") {
          attempts++;
          if (attempts < maxAttempts) {
            if (vid.seeking) {
              let fired = false;
              const onSeeked = () => {
                if (fired) return;
                fired = true;
                vid.removeEventListener("seeked", onSeeked);
                clearTimeout(seekTimeout);
                if (currentReq === playRequestId && state.isPlaying) attemptPlay();
              };
              const seekTimeout = setTimeout(onSeeked, 120);
              vid.addEventListener("seeked", onSeeked, { once: true });
            } else {
              setTimeout(() => {
                if (currentReq === playRequestId && state.isPlaying) attemptPlay();
              }, 40 * attempts);
            }
            return;
          }
        }

        if (err && err.name === "NotAllowedError") {
          vid.muted = true;
          vid.play().then(() => {
            playPending = false;
            if (currentReq === playRequestId && state.isPlaying) {
              state.isPlaying = true;
              if (el.btnPlayPause) el.btnPlayPause.textContent = "❚❚";
              showToast("Playing (audio muted by browser policy — click anywhere to unmute)");
            }
          }).catch(err2 => {
            playPending = false;
            console.error("Muted playback failed:", err2);
            state.isPlaying = false;
            if (el.btnPlayPause) el.btnPlayPause.textContent = "▶";
            showToast("Video playback error - click Play again");
          });
          return;
        }

        playPending = false;
        console.warn("Direct playback error:", err);
        state.isPlaying = false;
        if (el.btnPlayPause) el.btnPlayPause.textContent = "▶";
      });
    } else {
      playPending = false;
    }
  }

  attemptPlay();
}

function pauseVideo() {
  playRequestId++;
  playPending = false;
  state.isPlaying = false;
  if (el.btnPlayPause) el.btnPlayPause.textContent = "▶";
  const vid = el.hiddenVideo;
  if (vid) {
    try { vid.pause(); } catch (_) {}
  }
}

function togglePlay() {
  const vid = el.hiddenVideo;
  if (!vid || !vid.src) {
    showToast("⚠️ No video loaded. Please select a video file or YouTube URL first.");
    if (el.btnBrowse) el.btnBrowse.focus();
    return;
  }

  if (vid.error) {
    recoverVideoPipeline(state.currentTime);
    return;
  }

  if (state.isPlaying && !vid.paused) {
    pauseVideo();
  } else {
    playVideo();
  }
}

function toggleLoop() {
  state.isLooping = !state.isLooping;
  if (el.btnLoopClip) {
    el.btnLoopClip.classList.toggle("active", state.isLooping);
  }
  showToast(state.isLooping ? "🔁 Clip Looping: Enabled" : "Clip Looping: Disabled");
  saveProjectState();
}

function setupTimeline() {
  const vid = el.hiddenVideo;
  let pendingSeekTime = null;
  let seekTimer = null;

  function commitPendingSeek() {
    seekTimer = null;
    if (pendingSeekTime === null) return;
    if (!vid) return;
    if (vid.seeking) {
      // Don't collide with active in-flight browser seek; seeked will commit pending
      return;
    }
    const target = pendingSeekTime;
    pendingSeekTime = null;
    try {
      vid.currentTime = target;
      state.currentTime = target;
      updatePlayheadUI(target);
    } catch (_) {}
  }

  function queueSeek(time, immediate = false) {
    pendingSeekTime = time;
    if (immediate) {
      if (seekTimer) clearTimeout(seekTimer);
      commitPendingSeek();
      return;
    }
    // Browsers cannot decode dozens of random frames per second.  Limit
    // dragging to a responsive 25 seeks/sec and let the final pointer position
    // win.
    if (!seekTimer) seekTimer = setTimeout(commitPendingSeek, 40);
  }

  vid.addEventListener("loadedmetadata", () => {
    const dur = (vid && isFinite(vid.duration) && vid.duration > 0) ? vid.duration : ((state.videoMeta && state.videoMeta.duration) || 0);
    if (el.timeDuration) el.timeDuration.textContent = formatTime(dur, 0);
    if (state.endTime > dur) {
      state.endTime = dur;
    }
    if (state.startTime >= state.endTime) {
      state.startTime = 0;
      state.endTime = Math.min(35.0, dur);
    }
    if (state.endTime <= 0) {
      state.endTime = Math.min(35.0, dur);
    }
    if (el.timelineScrollContainer) {
      el.timelineScrollContainer.scrollLeft = 0;
    }
    updateTimelineUI();
    try {
      queueSeek(state.startTime);
    } catch (_) {}
    updatePlayheadUI(state.startTime);
    thumbnailCache.clear();
    generateThumbnailStrip();
    if (!state.aiAnalysis || state.aiAnalysis.isInitialPlaceholder) {
      initDynamicClipForVideo(dur);
    }
  });

  vid.addEventListener("timeupdate", () => {
    if (activeDrag) return;
    if (vid.seeking) return;
    state.currentTime = vid.currentTime;
    updatePlayheadUI(state.currentTime);

    if (state.isPlaying) {
      if (state.isLooping) {
        if (state.smartLoop) {
          const distToEnd = state.endTime - state.currentTime;
          if (distToEnd > 0 && distToEnd < 0.22) {
            vid.volume = Math.max(0.12, distToEnd / 0.22);
          } else if (state.currentTime - state.startTime < 0.22) {
            vid.volume = Math.min(1.0, Math.max(0.12, (state.currentTime - state.startTime) / 0.22));
          } else {
            vid.volume = 1.0;
          }
        } else {
          vid.volume = 1.0;
        }

        const clipEnd = (state.endTime && state.endTime > state.startTime) ? state.endTime : (vid.duration || 35);
        if (state.currentTime >= clipEnd) {
          try {
            vid.muted = true;
            vid.volume = 0.0;
            vid.currentTime = state.startTime;
            state.playbackStartPos = state.startTime;
            const onLoopSeeked = () => {
              vid.removeEventListener("seeked", onLoopSeeked);
              vid.muted = false;
              vid.volume = state.smartLoop ? 0.15 : 1.0;
            };
            vid.addEventListener("seeked", onLoopSeeked, { once: true });
            setTimeout(() => {
              if (vid.muted) {
                vid.muted = false;
                vid.volume = state.smartLoop ? 0.15 : 1.0;
              }
            }, 300);
          } catch (_) {}
        }
      } else {
        vid.volume = 1.0;
        const clipEnd = (state.endTime && state.endTime > state.startTime) ? state.endTime : (vid.duration || 35);
        if (state.currentTime >= clipEnd) {
          vid.pause();
          state.isPlaying = false;
          if (el.btnPlayPause) el.btnPlayPause.textContent = "▶";
        }
      }
    }
  });

  vid.addEventListener("play", () => {
    state.isPlaying = true;
    if (el.btnPlayPause) el.btnPlayPause.textContent = "❚❚";
  });

  vid.addEventListener("pause", () => {
    if (!playPending) {
      state.isPlaying = false;
      if (el.btnPlayPause) el.btnPlayPause.textContent = "▶";
    }
  });

  vid.addEventListener("seeked", () => {
    if (pendingSeekTime !== null) {
      commitPendingSeek();
    }
    if (vid && vid.videoWidth > 0) cachePreviewFrame(vid);
    renderReel();
  });
  vid.addEventListener("error", () => {
    console.warn("HTML5 video error during playback/scrubbing:", vid.error);
    recoverVideoPipeline(state.currentTime);
  });
  vid.addEventListener("loadeddata", () => {
    if (vid && vid.videoWidth > 0) cachePreviewFrame(vid);
    renderReel();
  });
  vid.addEventListener("canplay", () => {
    if (vid && vid.videoWidth > 0) cachePreviewFrame(vid);
    renderReel();
  });

  vid.addEventListener("ended", () => {
    state.isPlaying = false;
    if (el.btnPlayPause) el.btnPlayPause.textContent = "▶";
  });

  if (el.btnPlayPause) el.btnPlayPause.addEventListener("click", togglePlay);
  if (el.btnLoopClip) el.btnLoopClip.addEventListener("click", toggleLoop);
  if (el.btnPrevFrame) el.btnPrevFrame.addEventListener("click", () => stepFrame(-1));
  if (el.btnNextFrame) el.btnNextFrame.addEventListener("click", () => stepFrame(1));

  function getPointerTime(clientX) {
    const rect = el.timelineContentWrapper ? el.timelineContentWrapper.getBoundingClientRect() : el.scrubberTrack.getBoundingClientRect();
    const px = clientX - rect.left;
    return pxToTime(px);
  }

  activeDrag = null;
  let dragInitialStart = 0;
  let dragInitialEnd = 0;
  let dragClickTime = 0;
  let wasPlayingBeforeDrag = false;
  let autoScrollRaf = null;
  let lastClientX = 0;

  function performDragUpdate(clientX) {
    if (!activeDrag) return;
    const { dur } = getTimelineMetrics();
    const t = getPointerTime(clientX);

    if (activeDrag === "start") {
      const clamped = Math.max(0, Math.min(state.endTime - 0.05, t));
      state.startTime = Math.round(clamped * 1000) / 1000;
      queueSeek(state.startTime);
      state.currentTime = state.startTime;
      state.playbackStartPos = state.startTime;
      updateTimelineUI();
      updatePlayheadUI(state.startTime);
      renderReel();
    } else if (activeDrag === "end") {
      const clamped = Math.max(state.startTime + 0.05, Math.min(dur, t));
      state.endTime = Math.round(clamped * 1000) / 1000;
      queueSeek(state.endTime);
      state.currentTime = state.endTime;
      state.playbackStartPos = state.endTime;
      updateTimelineUI();
      updatePlayheadUI(state.endTime);
      renderReel();
    } else if (activeDrag === "range") {
      const deltaTime = t - dragClickTime;
      const clipLen = dragInitialEnd - dragInitialStart;
      let newStart = dragInitialStart + deltaTime;
      if (newStart < 0) newStart = 0;
      if (newStart + clipLen > dur) newStart = Math.max(0, dur - clipLen);
      state.startTime = Math.round(newStart * 1000) / 1000;
      state.endTime = Math.round((newStart + clipLen) * 1000) / 1000;
      queueSeek(state.startTime);
      state.currentTime = state.startTime;
      state.playbackStartPos = state.startTime;
      updateTimelineUI();
      updatePlayheadUI(state.startTime);
      renderReel();
    } else if (activeDrag === "playhead" || activeDrag === "track") {
      const clamped = Math.max(0, Math.min(dur, t));
      queueSeek(clamped);
      state.currentTime = clamped;
      state.playbackStartPos = clamped;
      updatePlayheadUI(clamped);
      renderReel();
    }
  }

  function startAutoScrollLoop() {
    if (autoScrollRaf) return;
    function loop() {
      if (!activeDrag || !el.timelineScrollContainer) {
        autoScrollRaf = null;
        return;
      }
      const container = el.timelineScrollContainer;
      if (container.scrollWidth <= container.clientWidth) {
        autoScrollRaf = null;
        return;
      }
      const rect = container.getBoundingClientRect();
      const margin = 45;
      let delta = 0;

      if (lastClientX > rect.right - margin) {
        const ratio = Math.min(1.5, (lastClientX - (rect.right - margin)) / margin);
        delta = Math.max(4, Math.round(18 * ratio));
      } else if (lastClientX < rect.left + margin) {
        const ratio = Math.min(1.5, ((rect.left + margin) - lastClientX) / margin);
        delta = -Math.max(4, Math.round(18 * ratio));
      }

      if (delta !== 0) {
        const prev = container.scrollLeft;
        container.scrollLeft += delta;
        if (container.scrollLeft !== prev) {
          performDragUpdate(lastClientX);
        }
      }
      autoScrollRaf = requestAnimationFrame(loop);
    }
    autoScrollRaf = requestAnimationFrame(loop);
  }

  function stopAutoScrollLoop() {
    if (autoScrollRaf) {
      cancelAnimationFrame(autoScrollRaf);
      autoScrollRaf = null;
    }
  }

  function beginDrag(type, clientX) {
    activeDrag = type;
    lastClientX = clientX;
    wasPlayingBeforeDrag = state.isPlaying;
    if (wasPlayingBeforeDrag) {
      pauseVideo();
    }
    startAutoScrollLoop();
  }

  function endDrag() {
    stopAutoScrollLoop();
    const wasPlaying = wasPlayingBeforeDrag;
    activeDrag = null;
    queueSeek(state.currentTime, true);
    updateTimelineUI();
    updatePlayheadUI(state.currentTime);
    renderReel();
    if (wasPlaying) {
      if (vid && vid.seeking) {
        vid.addEventListener("seeked", () => {
          if (!activeDrag && !state.isPlaying) playVideo();
        }, { once: true });
      } else {
        playVideo();
      }
    }
    saveProjectState();
  }

  // CapCut Left Trim Handle (Start)
  if (el.markerStart) {
    el.markerStart.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      beginDrag("start", e.clientX);
      el.markerStart.classList.add("dragging");
      el.markerStart.setPointerCapture(e.pointerId);
    });
    el.markerStart.addEventListener("pointermove", (e) => {
      if (activeDrag !== "start") return;
      lastClientX = e.clientX;
      performDragUpdate(e.clientX);
    });
    const finishStartDrag = (e) => {
      if (activeDrag === "start") {
        el.markerStart.classList.remove("dragging");
        try { el.markerStart.releasePointerCapture(e.pointerId); } catch (_) {}
        endDrag();
      }
    };
    el.markerStart.addEventListener("pointerup", finishStartDrag);
    el.markerStart.addEventListener("pointercancel", finishStartDrag);
  }

  // CapCut Right Trim Handle (End)
  if (el.markerEnd) {
    el.markerEnd.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      beginDrag("end", e.clientX);
      el.markerEnd.classList.add("dragging");
      el.markerEnd.setPointerCapture(e.pointerId);
    });
    el.markerEnd.addEventListener("pointermove", (e) => {
      if (activeDrag !== "end") return;
      lastClientX = e.clientX;
      performDragUpdate(e.clientX);
    });
    const finishEndDrag = (e) => {
      if (activeDrag === "end") {
        el.markerEnd.classList.remove("dragging");
        try { el.markerEnd.releasePointerCapture(e.pointerId); } catch (_) {}
        endDrag();
      }
    };
    el.markerEnd.addEventListener("pointerup", finishEndDrag);
    el.markerEnd.addEventListener("pointercancel", finishEndDrag);
  }

  // CapCut Playhead Needle Dragging
  if (el.scrubberPlayhead) {
    el.scrubberPlayhead.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      beginDrag("playhead", e.clientX);
      el.scrubberPlayhead.classList.add("dragging");
      el.scrubberPlayhead.setPointerCapture(e.pointerId);
      performDragUpdate(e.clientX);
    });

    el.scrubberPlayhead.addEventListener("pointermove", (e) => {
      if (activeDrag !== "playhead") return;
      e.preventDefault();
      e.stopPropagation();
      lastClientX = e.clientX;
      performDragUpdate(e.clientX);
    });

    const finishPlayheadDrag = (e) => {
      if (activeDrag === "playhead") {
        el.scrubberPlayhead.classList.remove("dragging");
        try { el.scrubberPlayhead.releasePointerCapture(e.pointerId); } catch (_) {}
        endDrag();
      }
    };

    el.scrubberPlayhead.addEventListener("pointerup", finishPlayheadDrag);
    el.scrubberPlayhead.addEventListener("pointercancel", finishPlayheadDrag);
  }

  // CapCut Draggable Selection Box (slides clip window)
  if (el.scrubberRange) {
    el.scrubberRange.addEventListener("pointerdown", (e) => {
      if (
        e.target === el.markerStart || (el.markerStart && el.markerStart.contains(e.target)) ||
        e.target === el.markerEnd || (el.markerEnd && el.markerEnd.contains(e.target)) ||
        e.target === el.scrubberPlayhead || (el.scrubberPlayhead && el.scrubberPlayhead.contains(e.target))
      ) return;
      e.preventDefault();
      e.stopPropagation();
      beginDrag("range", e.clientX);
      dragInitialStart = state.startTime;
      dragInitialEnd = state.endTime;
      dragClickTime = getPointerTime(e.clientX);
      el.scrubberRange.classList.add("dragging");
      el.scrubberRange.setPointerCapture(e.pointerId);
    });

    el.scrubberRange.addEventListener("pointermove", (e) => {
      if (activeDrag !== "range") return;
      lastClientX = e.clientX;
      performDragUpdate(e.clientX);
    });

    const finishRangeDrag = (e) => {
      if (activeDrag === "range") {
        el.scrubberRange.classList.remove("dragging");
        try { el.scrubberRange.releasePointerCapture(e.pointerId); } catch (_) {}
        endDrag();
      }
    };
    el.scrubberRange.addEventListener("pointerup", finishRangeDrag);
    el.scrubberRange.addEventListener("pointercancel", finishRangeDrag);
  }

  // Timeline Track Click-to-Seek, Double-Click Seek, and Hover
  if (el.scrubberTrack) {
    el.scrubberTrack.addEventListener("pointerdown", (e) => {
      if (
        activeDrag ||
        e.target === el.markerStart || (el.markerStart && el.markerStart.contains(e.target)) ||
        e.target === el.markerEnd || (el.markerEnd && el.markerEnd.contains(e.target)) ||
        e.target === el.scrubberPlayhead || (el.scrubberPlayhead && el.scrubberPlayhead.contains(e.target))
      ) return;
      beginDrag("track", e.clientX);
      try { el.scrubberTrack.setPointerCapture(e.pointerId); } catch (_) {}
      performDragUpdate(e.clientX);
    });

    el.scrubberTrack.addEventListener("pointermove", (e) => {
      if (activeDrag === "track") {
        lastClientX = e.clientX;
        performDragUpdate(e.clientX);
      } else if (!activeDrag && el.scrubberHoverTooltip) {
        const t = getPointerTime(e.clientX);
        const rect = el.timelineContentWrapper ? el.timelineContentWrapper.getBoundingClientRect() : el.scrubberTrack.getBoundingClientRect();
        const px = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
        el.scrubberHoverTooltip.style.left = `${px}px`;
        el.scrubberHoverTooltip.textContent = formatTime(t, 0);
        el.scrubberHoverTooltip.classList.remove("hidden");
      }
    });

    el.scrubberTrack.addEventListener("pointerup", (e) => {
      if (activeDrag === "track") {
        try { el.scrubberTrack.releasePointerCapture(e.pointerId); } catch (_) {}
        endDrag();
      }
    });

    el.scrubberTrack.addEventListener("mouseleave", () => {
      if (el.scrubberHoverTooltip && !activeDrag) {
        el.scrubberHoverTooltip.classList.add("hidden");
      }
    });

    // Double-click to seek with precision
    el.scrubberTrack.addEventListener("dblclick", (e) => {
      const t = getPointerTime(e.clientX);
      vid.currentTime = t;
      state.currentTime = t;
      state.playbackStartPos = t;
      updatePlayheadUI(t);
      renderReel();
    });
  }

  // Global safety net: ensure any active drag is cleanly finalized on pointer release anywhere
  const handleGlobalPointerRelease = () => {
    if (activeDrag) {
      if (el.markerStart) el.markerStart.classList.remove("dragging");
      if (el.markerEnd) el.markerEnd.classList.remove("dragging");
      if (el.scrubberPlayhead) el.scrubberPlayhead.classList.remove("dragging");
      if (el.scrubberRange) el.scrubberRange.classList.remove("dragging");
      endDrag();
    }
  };
  window.addEventListener("pointerup", handleGlobalPointerRelease);
  window.addEventListener("pointercancel", handleGlobalPointerRelease);

  // Direct Precision Trim Input Handlers
  function handleStartInputChange() {
    if (!el.tlInputStart) return;
    const { dur } = getTimelineMetrics();
    const val = parseTime(el.tlInputStart.value);
    state.startTime = Math.max(0, Math.min(state.endTime - 0.05, val));
    state.startTime = Math.round(state.startTime * 1000) / 1000;
    updateTimelineUI();
    vid.currentTime = state.startTime;
    updatePlayheadUI(state.startTime);
    saveProjectState();
  }

  function handleEndInputChange() {
    if (!el.tlInputEnd) return;
    const { dur } = getTimelineMetrics();
    const val = parseTime(el.tlInputEnd.value);
    state.endTime = Math.min(dur, Math.max(state.startTime + 0.05, val));
    state.endTime = Math.round(state.endTime * 1000) / 1000;
    updateTimelineUI();
    vid.currentTime = state.endTime;
    updatePlayheadUI(state.endTime);
    saveProjectState();
  }

  if (el.tlInputStart) {
    el.tlInputStart.addEventListener("focus", () => {
      el.tlInputStart.value = formatTime(state.startTime, 2);
      el.tlInputStart.select();
    });
    el.tlInputStart.addEventListener("change", handleStartInputChange);
    el.tlInputStart.addEventListener("blur", () => {
      handleStartInputChange();
      el.tlInputStart.value = formatTime(state.startTime, 0);
    });
    el.tlInputStart.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        el.tlInputStart.blur();
      }
    });
  }

  if (el.tlInputEnd) {
    el.tlInputEnd.addEventListener("focus", () => {
      el.tlInputEnd.value = formatTime(state.endTime, 2);
      el.tlInputEnd.select();
    });
    el.tlInputEnd.addEventListener("change", handleEndInputChange);
    el.tlInputEnd.addEventListener("blur", () => {
      handleEndInputChange();
      el.tlInputEnd.value = formatTime(state.endTime, 0);
    });
    el.tlInputEnd.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        el.tlInputEnd.blur();
      }
    });
  }

  // Timeline Zoom & Pan Engine
  function setZoom(newZoom, anchorClientX = null) {
    const container = el.timelineScrollContainer;
    const prevZoom = state.timelineZoom || 1;
    newZoom = Math.max(1, Math.min(10, Math.round(newZoom * 10) / 10));
    if (newZoom === prevZoom && anchorClientX === null) return;

    let anchorTime = null;
    let anchorOffset = 0;
    if (container && anchorClientX !== null) {
      const rect = container.getBoundingClientRect();
      anchorOffset = anchorClientX - rect.left;
      anchorTime = pxToTime(container.scrollLeft + anchorOffset);
    }

    state.timelineZoom = newZoom;
    if (el.sliderTimelineZoom) el.sliderTimelineZoom.value = newZoom;

    updateTimelineUI();
    updatePlayheadUI(vid.currentTime);

    if (container && anchorTime !== null) {
      const newPx = timeToPx(anchorTime);
      container.scrollLeft = Math.max(0, newPx - anchorOffset);
    }
  }

  if (el.sliderTimelineZoom) {
    el.sliderTimelineZoom.addEventListener("input", (e) => {
      setZoom(parseFloat(e.target.value) || 1);
    });
  }

  if (el.btnZoomIn) {
    el.btnZoomIn.addEventListener("click", () => {
      setZoom((state.timelineZoom || 1) + 0.5);
    });
  }

  if (el.btnZoomOut) {
    el.btnZoomOut.addEventListener("click", () => {
      setZoom((state.timelineZoom || 1) - 0.5);
    });
  }

  if (el.btnZoomFit) {
    el.btnZoomFit.addEventListener("click", () => {
      if (el.timelineScrollContainer) el.timelineScrollContainer.scrollLeft = 0;
      setZoom(1.0);
    });
  }

  // Ctrl + Mouse Wheel for Zoom, regular Wheel for horizontal scrolling
  if (el.timelineScrollContainer) {
    el.timelineScrollContainer.addEventListener("wheel", (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.18 : 0.85;
        const currentZoom = state.timelineZoom || 1;
        setZoom(currentZoom * factor, e.clientX);
      } else {
        const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        if (delta !== 0) {
          e.preventDefault();
          el.timelineScrollContainer.scrollLeft += delta;
        }
      }
    }, { passive: false });
  }

  // Redraw on window resize
  window.addEventListener("resize", () => {
    updateTimelineUI();
    updatePlayheadUI(vid.currentTime);
  });

  // Keyboard Shortcuts
  window.addEventListener("keydown", (e) => {
    if (["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) return;
    if (e.code === "Space") {
      e.preventDefault();
      togglePlay();
    } else if (e.code === "KeyL") {
      e.preventDefault();
      toggleLoop();
    } else if (e.code === "ArrowLeft") {
      e.preventDefault();
      stepFrame(e.shiftKey ? -10 : -1);
    } else if (e.code === "ArrowRight") {
      e.preventDefault();
      stepFrame(e.shiftKey ? 10 : 1);
    }
  });
}

// -------------------------------------------------------------
// YOUTUBE DOWNLOAD & IMPORT ENGINE
// -------------------------------------------------------------
function setupYouTubeDownloader() {
  // Source selector tabs switching
  if (el.tabSrcLocal && el.tabSrcYt) {
    el.tabSrcLocal.addEventListener("click", () => {
      el.tabSrcLocal.classList.add("active");
      el.tabSrcYt.classList.remove("active");
      el.panelSrcLocal.classList.remove("hidden");
      el.panelSrcYt.classList.add("hidden");
      saveProjectState();
    });
    el.tabSrcYt.addEventListener("click", () => {
      el.tabSrcYt.classList.add("active");
      el.tabSrcLocal.classList.remove("active");
      el.panelSrcYt.classList.remove("hidden");
      el.panelSrcLocal.classList.add("hidden");
      saveProjectState();
    });
  }

  // YouTube URL input auto-save
  if (el.inputYtUrl) {
    el.inputYtUrl.addEventListener("input", (e) => {
      localStorage.setItem("reel_yt_url", e.target.value.trim());
      localStorage.removeItem("reel_yt_url_loaded");
      saveProjectState();
    });
  }

  // YouTube download execution
  if (el.btnYtDownload) {
    el.btnYtDownload.addEventListener("click", async () => {
      const url = el.inputYtUrl.value.trim();
      if (!url) {
        showToast("Please enter a YouTube video URL");
        return;
      }
      localStorage.setItem("reel_yt_url", url);
      saveProjectState();

      el.btnYtDownload.disabled = true;
      el.btnYtText.textContent = "Connecting to YouTube...";
      el.ytProgressBox.classList.remove("hidden");
      el.ytProgressBar.style.width = "10%";
      el.ytProgressPercent.textContent = "10%";
      el.ytProgressLabel.textContent = "Fetching video details...";

      try {
        const startRes = await fetch("/api/youtube/download", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url })
        });

        if (!startRes.ok) {
          const err = await startRes.json();
          throw new Error(err.detail || "Download failed");
        }

        const { task_id } = await startRes.json();

        // Poll download progress
        const pollInterval = setInterval(async () => {
          try {
            const statusRes = await fetch(`/api/youtube/status/${task_id}`);
            const task = await statusRes.json();

            el.ytProgressBar.style.width = `${task.progress}%`;
            el.ytProgressPercent.textContent = `${Math.round(task.progress)}%`;
            el.ytProgressLabel.textContent = task.message || "Downloading...";

            if (task.status === "completed") {
              clearInterval(pollInterval);
              localStorage.setItem("reel_yt_url_loaded", url);
              el.btnYtDownload.disabled = false;
              el.btnYtText.textContent = "⚡ Download & Generate Full Subtitles";
              el.ytProgressLabel.textContent = "Download & Full Subtitles complete!";

              // Load the downloaded video file into studio
              await loadFile(task.file_path, task.title);

              // Auto-fill song / anime name if recognized
              if (task.song_name) {
                state.songName = task.song_name;
                if (el.inputSongName) el.inputSongName.value = task.song_name;
              }
              if (task.anime_name) {
                state.animeName = task.anime_name;
                if (el.inputAnimeName) el.inputAnimeName.value = task.anime_name;
              }

              // Auto-apply AI hook moments if available
              if (task.ai_analysis && task.ai_analysis.recommended_start !== undefined) {
                state.aiAnalysis = task.ai_analysis;
                renderAIResults(task.ai_analysis, "rec");
                applyAIClip(task.ai_analysis.recommended_start, task.ai_analysis.recommended_end, "rec");
              }

              // Auto-apply recommended subtitle style preset
              if (task.subtitle_style) {
                applySubtitleStyle(task.subtitle_style, task.subtitle_style_reason);
              }

              // Automatically populate vocal-synchronized subtitles for the whole video
              if (task.lyrics && task.lyrics.length > 0) {
                state.lyrics = task.lyrics;
                state.fullLyrics = task.lyrics;
                if (!state.lyricsByMoment) state.lyricsByMoment = {};
                state.lyricsByMoment["full"] = task.lyrics;
                state.lyricsByMoment["rec"] = task.lyrics;
                renderLyricsList(state.lyrics);
                renderReel();
                showToast(`✨ Generated ${task.lyrics.length} vocal-synchronized subtitles for the entire video!`);
              } else {
                showToast("YouTube Video Downloaded Successfully!");
              }

              saveProjectState();

              setTimeout(() => {
                el.ytProgressBox.classList.add("hidden");
              }, 4000);

            } else if (task.status === "error") {
              clearInterval(pollInterval);
              el.btnYtDownload.disabled = false;
              el.btnYtText.textContent = "⚡ Download & Generate Full Subtitles";
              el.ytProgressLabel.textContent = "Error: " + task.message;
              showToast("Download failed: " + task.message);
            }
          } catch (pollErr) {
            clearInterval(pollInterval);
            el.btnYtDownload.disabled = false;
            el.btnYtText.textContent = "⚡ Download & Generate Full Subtitles";
            showToast("Error tracking download status");
          }
        }, 800);

      } catch (err) {
        el.btnYtDownload.disabled = false;
        el.btnYtText.textContent = "⚡ Download & Load Video";
        el.ytProgressLabel.textContent = "Error: " + err.message;
        showToast("Error: " + err.message);
      }
    });

    // Press Enter to download
    el.inputYtUrl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        el.btnYtDownload.click();
      }
    });
  }
}

// -------------------------------------------------------------
// FILE SELECTION & PROBING
// -------------------------------------------------------------
function setupFileHandling() {
  el.btnBrowse.addEventListener("click", async () => {
    try {
      showToast("Opening file dialog...");
      const res = await fetch("/api/system/browse-file");
      const data = await res.json();
      if (data.file_path) {
        loadFile(data.file_path);
      }
    } catch (e) {
      el.inputNativeFile.click();
    }
  });

  async function handleFileInput(file) {
    if (!file) return;
    const blobUrl = URL.createObjectURL(file);
    const loading = loadFile(blobUrl, file.name, file);
    const generation = state.sourceGeneration;

    // Concurrently persist to server so FFmpeg can analyze full audio track
    state._uploadPromise = (async () => {
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/video/upload", { method: "POST", body: fd });
        if (res.ok) {
          const data = await res.json();
          if (data.file_path && generation === state.sourceGeneration) {
            state.videoPath = data.file_path;
            console.log("Server video path registered:", state.videoPath);
            saveProjectState();
            return data.file_path;
          }
        }
      } catch (err) {
        console.warn("Video upload to server warning:", err);
      }
      return null;
    })();
    await loading;
  }

  el.inputNativeFile.addEventListener("change", (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFileInput(e.target.files[0]);
    }
  });

  // Drag & drop
  el.dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    el.dropzone.classList.add("dragover");
  });
  el.dropzone.addEventListener("dragleave", () => {
    el.dropzone.classList.remove("dragover");
  });
  el.dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    el.dropzone.classList.remove("dragover");
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileInput(e.dataTransfer.files[0]);
    }
  });
}

async function ensureServerVideoPathForAnalysis() {
  const generation = state.sourceGeneration;
  const pendingUpload = state._uploadPromise;
  if (pendingUpload) {
    const uploadedPath = await pendingUpload;
    if (generation !== state.sourceGeneration) {
      throw new Error("The selected video changed. Please try again for the current video.");
    }
    if (uploadedPath) state.videoPath = uploadedPath;
  }

  if (!state.videoPath || String(state.videoPath).startsWith("blob:")) {
    throw new Error("The video upload did not finish. Please try loading the file again.");
  }
  return state.videoPath;
}

function extractSongMetaFromTitle(title) {
  if (!title) return { song: "", anime: "" };
  let cleaned = title.replace(/\.[a-zA-Z0-9]+$/, "").trim();
  cleaned = cleaned.replace(/\[(?:1080p|720p|4k|HD|FHD|Official|MV|Lyrics|CC|LIVE)[^\]]*\]/gi, "").trim();
  cleaned = cleaned.replace(/\((?:Official Video|Music Video|Official Audio|Audio|Video|MV)[^\)]*\)/gi, "").trim();
  
  // Check Japanese brackets: e.g. 【LIVE映像】結束バンド「ギターと孤独と蒼い惑星」LIVE at STARRY / 「ぼっち・ざ・ろっく！」劇中曲
  const bracketMatches = cleaned.match(/「([^」]+)」/g);
  if (bracketMatches && bracketMatches.length >= 2) {
    const song = bracketMatches[0].replace(/[「」]/g, "").trim();
    const anime = bracketMatches[1].replace(/[「」]/g, "").trim();
    return { song, anime };
  } else if (bracketMatches && bracketMatches.length === 1) {
    const song = bracketMatches[0].replace(/[「」]/g, "").trim();
    return { song, anime: "" };
  }

  // Check 'Artist - Song' or 'Anime - Song'
  const parts = cleaned.split(/\s+[-–—]\s+/);
  if (parts.length >= 2) {
    return {
      anime: parts[0].trim(),
      song: parts.slice(1).join(" - ").trim()
    };
  }

  return { song: cleaned.replace(/[_-]/g, " ").trim(), anime: "" };
}

function initDynamicClipForVideo(dur) {
  if (!dur || dur <= 0) return;
  const analysis = getDefaultAIAnalysis(dur);
  state.aiAnalysis = analysis;
  renderAIResults(analysis, "rec");
  applyAIClip(analysis.recommended_start, analysis.recommended_end, "rec");
}

async function loadFile(pathOrUrl, optionalName, localFile = null) {
  const generation = ++state.sourceGeneration;
  state._uploadPromise = null;
  state.videoFile = localFile;
  state.videoMeta = null;
  state.videoPath = pathOrUrl;
  const filename = optionalName || pathOrUrl.split(/[\\/]/).pop();
  state.videoTitle = optionalName || filename;

  // Reset previous song's AI moments & lyrics
  state.aiAnalysis = null;
  state.activeMoment = "rec";
  state.lyrics = [];
  if (el.lyricsTimelineList) el.lyricsTimelineList.innerHTML = "";

  // Auto-detect song and anime name hints from filename or title
  const hints = extractSongMetaFromTitle(filename);
  if (hints.song) {
    state.songName = hints.song;
    if (el.inputSongName) el.inputSongName.value = hints.song;
  } else {
    state.songName = filename.replace(/\.[a-zA-Z0-9]+$/, "").trim();
    if (el.inputSongName) el.inputSongName.value = state.songName;
  }
  if (hints.anime) {
    state.animeName = hints.anime;
    if (el.inputAnimeName) el.inputAnimeName.value = hints.anime;
  } else {
    state.animeName = "";
    if (el.inputAnimeName) el.inputAnimeName.value = "";
  }

  el.activeFileName.textContent = filename;
  el.activeFilePill.classList.remove("hidden");
  el.btnExportQuick.disabled = false;
  el.btnExportMain.disabled = false;

  const vid = el.hiddenVideo;
  if (pathOrUrl.startsWith("blob:") || pathOrUrl.startsWith("http")) {
    vid.src = pathOrUrl;
  } else {
    vid.src = `/api/media/stream?path=${encodeURIComponent(pathOrUrl)}`;
  }

  // Auto-recovery if browser cannot decode video stream (e.g. AV1 / 4K on Windows)
  vid.onerror = async () => {
    console.warn("HTML5 video playback error:", vid.error);
    if (!pathOrUrl.startsWith("blob:") && !pathOrUrl.startsWith("http")) {
      showToast("⚠️ Optimizing video codec for browser playback...");
      try {
        const cRes = await fetch("/api/video/ensure-compatible", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ file_path: pathOrUrl })
        });
        if (cRes.ok) {
          const cData = await cRes.json();
          if (generation !== state.sourceGeneration) return;
          if (cData.file_path && cData.file_path !== pathOrUrl) {
            state.videoPath = cData.file_path;
            vid.onerror = null;
            vid.src = `/api/media/stream?path=${encodeURIComponent(cData.file_path)}`;
            vid.load();
            showToast("✨ Video optimized & loaded successfully!");
            renderReel();
            return;
          }
        }
      } catch (err) {
        console.warn("Video compatibility optimization error:", err);
      }
    }
  };

  vid.load();

  try {
    const probeRes = await fetch("/api/video/probe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_path: pathOrUrl })
    });
    if (probeRes.ok) {
      const meta = await probeRes.json();
      if (generation !== state.sourceGeneration) return;
      state.videoMeta = meta;
      state.clientCrop = null;
      el.metaRes.textContent = meta.resolution;
      el.metaAspect.textContent = meta.aspect_ratio;
      el.metaFps.textContent = `${meta.fps} FPS`;
      el.metaAudio.textContent = meta.has_audio ? `${meta.audio_codec}` : "No Audio";
      el.activeFileMeta.textContent = meta.resolution;
      el.videoInfoCard.classList.remove("hidden");
      renderReel();
      showToast(`Loaded: ${filename}`);

      if (meta.duration && meta.duration > 0) {
        initDynamicClipForVideo(meta.duration);
      }

      // Proactively ensure video stream has closed GOP & faststart for crash-free canvas playback
      const isAlreadyOptimized = pathOrUrl.includes("_h264.mp4");
      if (!isAlreadyOptimized && !pathOrUrl.startsWith("blob:") && !pathOrUrl.startsWith("http")) {
        try {
          const cRes = await fetch("/api/video/ensure-compatible", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ file_path: pathOrUrl, force: true })
          });
          if (cRes.ok) {
            const cData = await cRes.json();
          if (generation !== state.sourceGeneration) return;
            if (cData.file_path && cData.file_path !== pathOrUrl) {
              state.videoPath = cData.file_path;
              vid.onerror = null;
              vid.src = `/api/media/stream?path=${encodeURIComponent(cData.file_path)}`;
              vid.load();
              renderReel();
            }
          }
        } catch (err) {
          console.warn("Proactive compat check error:", err);
        }
      }
    }
  } catch (e) {
    console.warn("Probe skipped or local blob:", e);
  }
  if (generation === state.sourceGeneration) saveProjectState();
}

// -------------------------------------------------------------
// METADATA & AI HOOK ANALYSIS
// -------------------------------------------------------------
function applyAIClip(start, end, momentId = "rec") {
  const vid = el.hiddenVideo;
  const dur = (state.videoMeta && state.videoMeta.duration) || (vid && vid.duration) || 35.0;
  state.startTime = Math.max(0, Math.min(dur, Math.round(start * 1000) / 1000));
  state.endTime = Math.max(state.startTime + 0.05, Math.min(dur, Math.round(end * 1000) / 1000));
  state.activeMoment = momentId;
  state.currentTime = state.startTime;
  state.playbackStartPos = state.startTime;
  if (vid) {
    try { vid.currentTime = state.startTime; } catch (_) {}
    if (vid.readyState < 1) {
      vid.addEventListener("loadedmetadata", () => {
        try { vid.currentTime = state.startTime; } catch (_) {}
      }, { once: true });
    }
    if (vid.seeking) {
      vid.addEventListener("seeked", () => {
        if (vid && vid.videoWidth > 0) cachePreviewFrame(vid);
        renderReel();
      }, { once: true });
    } else if (vid.readyState >= 1) {
      if (vid.videoWidth > 0) cachePreviewFrame(vid);
      renderReel();
    }
  }

  updateTimelineUI();
  updatePlayheadUI(state.startTime);

  // Auto-scroll timeline only if timeline is zoomed in and scrollable
  if (el.timelineScrollContainer) {
    if (el.timelineScrollContainer.scrollWidth > el.timelineScrollContainer.clientWidth) {
      const startPx = timeToPx(state.startTime);
      const endPx = timeToPx(state.endTime);
      const midPx = (startPx + endPx) / 2;
      const viewportW = el.timelineScrollContainer.clientWidth;
      el.timelineScrollContainer.scrollLeft = Math.max(0, midPx - viewportW / 2);
    } else {
      el.timelineScrollContainer.scrollLeft = 0;
    }
  }

  // Preserve whole video subtitles across all clip moments
  if (state.fullLyrics && state.fullLyrics.length > 0) {
    state.lyrics = state.fullLyrics;
  }
  renderLyricsList(state.lyrics);

  renderReel();
  if (state.aiAnalysis) {
    renderAIResults(state.aiAnalysis, momentId);
  }
  saveProjectState();
}

function getDefaultAIAnalysis(dur = 90) {
  dur = Math.max(5.0, Number(dur) || 90);
  
  // Deliver the complete, untruncated best part of the song no matter how long.
  let recStart = 0.0;
  let recEnd = dur;
  let clipLabel = "Full Reel Section";

  if (dur <= 60.0) {
    // For <= 60s clips, deliver the full continuous clip
    recStart = 0.0;
    recEnd = dur;
    clipLabel = `Full Clip (${Math.round(dur * 10) / 10}s)`;
  } else if (dur <= 95.0) {
    // For standard TV-size anime openings (~90s), deliver the full chorus, climax & cadence
    recStart = Math.min(35.0, Math.round(dur * 0.38 * 10) / 10);
    recEnd = dur;
    clipLabel = `Later Section (${Math.round((recEnd - recStart) * 10) / 10}s)`;
  } else {
    // For longer full-length tracks (>95s), deliver the entire complete chorus & build arc
    recStart = Math.round(dur * 0.28 * 10) / 10;
    const generousLen = Math.min(dur - recStart, Math.max(55.0, dur * 0.4));
    recEnd = Math.round(Math.min(dur, recStart + generousLen) * 10) / 10;
    clipLabel = `Middle Section (${Math.round((recEnd - recStart) * 10) / 10}s)`;
  }

  // Alternative 1: Full Opening & Verse 1 (complete intro build)
  let alt1Start = 0.0;
  let alt1End = (dur <= 60.0)
    ? Math.round(Math.min(dur, Math.max(15.0, dur * 0.5)) * 10) / 10
    : Math.round(Math.min(dur, Math.max(30.0, dur * 0.42)) * 10) / 10;

  // Alternative 2: Dramatic Ending Section (to the very end)
  let alt2Start = Math.round(Math.max(0.0, dur * 0.55) * 10) / 10;
  let alt2End = dur;

  const songLabel = state.songName || (state.videoTitle ? state.videoTitle.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ").trim() : "Anime Song");
  const animeLabel = state.animeName || "";

  return {
    song_name: songLabel,
    anime_name: animeLabel,
    model_used: "Default trim (not analyzed)",
    isDefaultSuggestion: true,
    score: null,
    recommended_start: recStart,
    recommended_end: recEnd,
    clip_type: clipLabel,
    reason: "Suggested from video duration only. Run audio analysis to identify musical moments.",
    alternatives: [
      {
        start: alt1Start,
        end: alt1End,
        duration: Math.round((alt1End - alt1Start) * 10) / 10,
        clip_type: `Opening Section (${Math.round((alt1End - alt1Start) * 10) / 10}s)`,
        score: null,
        reason: "Opening portion of the video; not audio-analyzed."
      },
      {
        start: alt2Start,
        end: alt2End,
        duration: Math.round((alt2End - alt2Start) * 10) / 10,
        clip_type: `Ending Section (${Math.round((alt2End - alt2Start) * 10) / 10}s)`,
        score: null,
        reason: "Ending portion of the video; not audio-analyzed."
      }
    ]
  };
}

function renderAIResults(data, activeMoment = "rec") {
  if (!data) return;
  state.aiAnalysis = data;
  state.activeMoment = activeMoment;

  const modelBadge = document.getElementById("ai-model-badge");
  if (modelBadge && data.model_used) {
    modelBadge.textContent = data.model_used.replace("models/", "");
  }

  const identifiedPill = document.getElementById("ai-identified-song");
  const identifiedText = document.getElementById("ai-identified-text");
  if (identifiedPill && identifiedText) {
    const sName = data.song_name || state.songName;
    const aName = data.anime_name || state.animeName;
    if (sName) {
      identifiedText.textContent = `${sName}${aName ? ' · ' + aName : ''}`;
      identifiedPill.classList.remove("hidden");
    } else {
      identifiedPill.classList.add("hidden");
    }
  }

  if (el.aiScoreNum) el.aiScoreNum.textContent = data.score ?? "—";
  const recDur = Math.round((data.recommended_end - data.recommended_start) * 10) / 10;
  const typeTag = data.clip_type ? ` · ${data.clip_type}` : "";
  if (el.aiRecTimes) el.aiRecTimes.textContent = `${formatTime(data.recommended_start, 1)} → ${formatTime(data.recommended_end, 1)} (${recDur}s)${typeTag}`;
  if (el.aiReason) el.aiReason.textContent = `"${data.reason || 'No analysis explanation available.'}"`;

  // Highlight recommended button if active
  if (el.btnApplyRec) {
    if (activeMoment === "rec") {
      el.btnApplyRec.textContent = "✓ Active Recommended";
      el.btnApplyRec.classList.add("active");
    } else {
      el.btnApplyRec.textContent = "Use Recommended";
      el.btnApplyRec.classList.remove("active");
    }
  }

  // Render Alternatives
  const alternatives = Array.isArray(data.alternatives) ? data.alternatives : [];

  if (el.aiAltsList) {
    el.aiAltsList.innerHTML = "";
    alternatives.forEach((alt, idx) => {
      const item = document.createElement("div");
      const isAltActive = (activeMoment === idx || activeMoment === `alt_${idx}`);
      item.className = `alt-item ${isAltActive ? 'active' : ''}`;
      item.style.cursor = "pointer";
      const altDur = Math.round((alt.end - alt.start) * 10) / 10;
      const altTag = alt.clip_type ? ` · ${alt.clip_type}` : "";
      const altBtnText = isAltActive ? `✓ Active Alt ${idx + 1}` : `Use Alt ${idx + 1}`;
      item.innerHTML = `
        <div class="alt-info">
          <span class="alt-title"><strong>Alt ${idx + 1}:</strong> ${formatTime(alt.start, 1)} → ${formatTime(alt.end, 1)} (${altDur}s)${altTag}</span>
        </div>
        <div class="alt-actions">
          <span class="alt-score">${alt.score == null ? "Not scored" : `${alt.score}/100`}</span>
          <button type="button" class="btn btn-sm select-alt-btn ${isAltActive ? 'active' : ''}">${altBtnText}</button>
        </div>
      `;
      item.addEventListener("click", () => {
        applyAIClip(alt.start, alt.end, idx);
        showToast(`✓ Applied Alt ${idx + 1} to Playbar!`);
      });
      el.aiAltsList.appendChild(item);
    });
  }

  if (el.aiLoading) el.aiLoading.classList.add("hidden");
  if (el.aiResults) el.aiResults.classList.remove("hidden");
}


// -------------------------------------------------------------
// INTERACTIVE TEXT MOBILIZATION & RESIZING ENGINE
// -------------------------------------------------------------
let _textDragState = null;

function selectTextElement(elemKey) {
  if (elemKey === "song" || elemKey === "anime" || !elemKey) {
    elemKey = "series";
  }
  state.selectedTextElem = elemKey;
  state.isTextElementSelected = true;
  if (el.textElemBtns) {
    el.textElemBtns.forEach(btn => {
      btn.classList.toggle("active", btn.dataset.elem === elemKey);
    });
  }

  // Ensure element state initialized
  if (!state.textElements) state.textElements = {};
  if (!state.textElements[elemKey]) {
    const defaults = {
      series: { x: 540, y: 320, size: 38, color: "#38bdf8" },
      creatorBadge: { x: 540, y: 160, size: 30, color: "#ffffff" },
      watermark: { x: 35, y: 661, size: 28, color: "#ffffff" },
      subtitles: { x: 540, y: 1690, size: 38, color: "#ffffff" }
    };
    state.textElements[elemKey] = defaults[elemKey] || { x: 540, y: 960, size: 30, color: "#ffffff" };
  }

  const elem = state.textElements && state.textElements[elemKey];
  if (elem) {
    syncTextSliders(elem);
  }
  syncElemVisibleToggle();
  renderReel();
}

function syncElemVisibleToggle() {
  if (!el.checkElemVisible) return;
  const key = state.selectedTextElem || "series";
  let isVis = true;
  let label = "Show on Reel";
  if (key === "watermark") {
    isVis = !!(state.watermark && state.watermark.enabled);
    label = "Show Username Watermark";
  } else if (key === "creatorBadge") {
    isVis = !!(state.creatorBadge && state.creatorBadge.enabled);
    label = "Show Profile Header";
  } else if (key === "subtitles") {
    isVis = state.showLyrics !== false;
    label = "Show Subtitles";
  } else if (key === "series") {
    isVis = state.showSeriesText !== false;
    label = "Show Viral Hook Text";
  }
  el.checkElemVisible.checked = isVis;
  if (el.labelElemVisible) el.labelElemVisible.textContent = label;
  if (el.tagElemVisibleStatus) {
    el.tagElemVisibleStatus.textContent = isVis ? "Active" : "Hidden";
    el.tagElemVisibleStatus.style.color = isVis ? "var(--neon-cyan)" : "var(--text-muted)";
  }
}

function syncTextSliders(elem) {
  if (!elem) return;
  if (el.sliderTextSize) el.sliderTextSize.value = elem.size || 38;
  if (el.valTextSize) el.valTextSize.textContent = `${elem.size || 38}px`;
  if (el.sliderTextY) el.sliderTextY.value = elem.y || 320;
  if (el.valTextY) el.valTextY.textContent = `${elem.y || 320}px`;
  if (el.sliderTextX) el.sliderTextX.value = elem.x || 540;
  if (el.valTextX) el.valTextX.textContent = (elem.x === 540) ? "Center" : `${elem.x}px`;

  let color = elem.color;
  if (!color) {
    if (state.selectedTextElem === "subtitles") color = "#ffffff";
    else color = "#38bdf8";
  }
  if (el.pickerTextColor) el.pickerTextColor.value = color;
  if (el.inputTextHex) el.inputTextHex.value = color.toUpperCase();
  if (el.textColorSwatches) {
    el.textColorSwatches.querySelectorAll(".color-swatch-btn").forEach(swatch => {
      swatch.classList.toggle("active", swatch.dataset.color.toLowerCase() === color.toLowerCase());
    });
  }
}

function resetTextLayout() {
  const vid = el.hiddenVideo;
  const rawW = (vid && vid.videoWidth) ? vid.videoWidth : ((state.videoMeta && state.videoMeta.width) || 1920);
  const rawH = (vid && vid.videoHeight) ? vid.videoHeight : ((state.videoMeta && state.videoMeta.height) || 1080);
  const vidAspect = (rawW > 0 && rawH > 0) ? (rawW / rawH) : (16 / 9);

  const fgScale = (state.adjustments && state.adjustments.scale) || 1.0;
  const fgWidth = Math.round(1080 * fgScale);
  const fgHeight = Math.round(fgWidth / vidAspect);
  const fgY = Math.round((1920 - fgHeight) / 2 - 40);
  const fgX = Math.round((1080 - fgWidth) / 2);
  const defaultWmX = fgX + 35;
  const defaultWmY = fgY + 45;

  state.textElements = {
    series: { x: 540, y: 320, size: 38, color: "#38bdf8" },
    creatorBadge: { x: 540, y: 160, size: 30, color: "#ffffff" },
    watermark: { x: defaultWmX, y: defaultWmY, size: 28, color: "#ffffff" },
    subtitles: { x: 540, y: 1690, size: 38, color: "#ffffff" }
  };
  selectTextElement(state.selectedTextElem || "series");
  renderReel();
  saveProjectState();
}

function setupTextCanvasInteraction() {
  const canvas = el.reelCanvas;
  if (!canvas) return;

  function getCanvasCoords(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = 1080 / rect.width;
    const scaleY = 1920 / rect.height;
    const clientX = e.touches && e.touches.length ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches && e.touches.length ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  }

  function getHandleUnderMouse(pt, box) {
    if (!box) return null;
    const handles = [
      { id: "nw", x: box.x, y: box.y },
      { id: "n",  x: box.x + box.width / 2, y: box.y },
      { id: "ne", x: box.x + box.width, y: box.y },
      { id: "e",  x: box.x + box.width, y: box.y + box.height / 2 },
      { id: "se", x: box.x + box.width, y: box.y + box.height },
      { id: "s",  x: box.x + box.width / 2, y: box.y + box.height },
      { id: "sw", x: box.x, y: box.y + box.height },
      { id: "w",  x: box.x, y: box.y + box.height / 2 }
    ];
    const threshold = 28;
    for (const h of handles) {
      if (Math.abs(pt.x - h.x) <= threshold && Math.abs(pt.y - h.y) <= threshold) {
        return h.id;
      }
    }
    return null;
  }

  function getElementUnderMouse(pt) {
    const boxes = state._textBoxes || {};
    for (const key of ["creatorBadge", "watermark", "series", "subtitles"]) {
      const b = boxes[key];
      if (b && pt.x >= b.x && pt.x <= b.x + b.width && pt.y >= b.y && pt.y <= b.y + b.height) {
        return key;
      }
    }
    return null;
  }

  const handlePointerDown = (e) => {
    if (e.type === "mousedown" && e.button !== 0) return;
    const pt = getCanvasCoords(e);

    // 1. Check if clicking on handle of currently selected element
    if (state.selectedTextElem) {
      const box = (state._textBoxes || {})[state.selectedTextElem];
      const handleId = getHandleUnderMouse(pt, box);
      if (handleId) {
        const elem = state.textElements[state.selectedTextElem];
        elem._custom = true;
        _textDragState = {
          mode: "resize",
          handle: handleId,
          elemKey: state.selectedTextElem,
          startX: pt.x,
          startY: pt.y,
          startSize: elem.size,
          startElemX: elem.x,
          startElemY: elem.y,
          startBox: { ...box }
        };
        e.preventDefault();
        return;
      }
    }

    // 2. Check if clicking on any text element
    const clickedElem = getElementUnderMouse(pt);
    if (clickedElem) {
      selectTextElement(clickedElem);
      const elem = state.textElements[clickedElem];
      elem._custom = true;
      _textDragState = {
        mode: "move",
        elemKey: clickedElem,
        startX: pt.x,
        startY: pt.y,
        startElemX: elem.x,
        startElemY: elem.y
      };
      e.preventDefault();
      return;
    }

    // 3. Hide the canvas outline while retaining the selected inspector controls.
    state.isTextElementSelected = false;
    state.hoveredTextElem = null;
    renderReel();
  };

  const handlePointerMove = (e) => {
    const pt = getCanvasCoords(e);

    if (_textDragState) {
      const elem = state.textElements[_textDragState.elemKey];
      if (!elem) return;

      if (_textDragState.mode === "move") {
        const dx = pt.x - _textDragState.startX;
        const dy = pt.y - _textDragState.startY;
        elem.x = Math.round(Math.max(50, Math.min(1030, _textDragState.startElemX + dx)));
        elem.y = Math.round(Math.max(40, Math.min(1880, _textDragState.startElemY + dy)));
        elem._custom = true;
        syncTextSliders(elem);
      } else if (_textDragState.mode === "resize") {
        const h = _textDragState.handle;
        let delta = 0;
        if (h === "se" || h === "e") {
          delta = (pt.x - _textDragState.startX) * 0.4;
        } else if (h === "s") {
          delta = (pt.y - _textDragState.startY) * 0.4;
        } else if (h === "nw" || h === "w") {
          delta = (_textDragState.startX - pt.x) * 0.4;
        } else if (h === "n") {
          delta = (_textDragState.startY - pt.y) * 0.4;
        } else if (h === "ne") {
          delta = ((pt.x - _textDragState.startX) + (_textDragState.startY - pt.y)) * 0.25;
        } else if (h === "sw") {
          delta = ((_textDragState.startX - pt.x) + (pt.y - _textDragState.startY)) * 0.25;
        }
        const newSize = Math.round(Math.max(14, Math.min(120, _textDragState.startSize + delta)));
        elem.size = newSize;
        elem._custom = true;
        syncTextSliders(elem);
      }
      renderReel();
      e.preventDefault();
      return;
    }

    // Hover cursor updates
    if (state.selectedTextElem) {
      const box = (state._textBoxes || {})[state.selectedTextElem];
      const handleId = getHandleUnderMouse(pt, box);
      if (handleId) {
        const cursors = {
          nw: "nwse-resize", se: "nwse-resize",
          ne: "nesw-resize", sw: "nesw-resize",
          n: "ns-resize", s: "ns-resize",
          w: "ew-resize", e: "ew-resize"
        };
        canvas.style.cursor = cursors[handleId] || "pointer";
        return;
      }
      if (box && pt.x >= box.x && pt.x <= box.x + box.width && pt.y >= box.y && pt.y <= box.y + box.height) {
        canvas.style.cursor = "move";
        return;
      }
    }

    const hoverElem = getElementUnderMouse(pt);
    state.hoveredTextElem = hoverElem;
    if (hoverElem) {
      canvas.style.cursor = "grab";
    } else {
      canvas.style.cursor = "default";
    }
  };

  const handlePointerUp = () => {
    if (_textDragState) {
      _textDragState = null;
      renderReel();
      saveProjectState();
    }
  };

  canvas.addEventListener("mousedown", handlePointerDown);
  window.addEventListener("mousemove", handlePointerMove);
  window.addEventListener("mouseup", handlePointerUp);

  canvas.addEventListener("touchstart", handlePointerDown, { passive: false });
  window.addEventListener("touchmove", handlePointerMove, { passive: false });
  window.addEventListener("touchend", handlePointerUp);

  // Controls retain their inspector target, but no outside click leaves a resize box on the reel.
  document.addEventListener("pointerdown", (e) => {
    if (!canvas.contains(e.target) && state.isTextElementSelected) {
      state.isTextElementSelected = false;
      state.hoveredTextElem = null;
      renderReel();
    }
  });
}

function setupMetadataAndAI() {
  // Text Element Selector Pills
  if (el.textElemBtns) {
    el.textElemBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        selectTextElement(btn.dataset.elem);
      });
    });
  }

  // Direct Visibility Toggle for Selected Text Element
  if (el.checkElemVisible) {
    el.checkElemVisible.addEventListener("change", (e) => {
      const key = state.selectedTextElem || "series";
      const checked = e.target.checked;
      if (key === "watermark") {
        state.watermark = state.watermark || { enabled: false, text: "lap_lac7" };
        state.watermark.enabled = checked;
        if (el.checkWatermark) el.checkWatermark.checked = checked;
        if (el.watermarkInputGroup) el.watermarkInputGroup.classList.toggle("hidden", !checked);
        if (checked && (!state.watermark.text || !state.watermark.text.trim())) {
          state.watermark.text = (el.inputWatermarkText && el.inputWatermarkText.value && el.inputWatermarkText.value.trim()) 
            ? el.inputWatermarkText.value.trim() 
            : "lap_lac7";
        }
        if (el.inputWatermarkText) el.inputWatermarkText.value = state.watermark.text;
      } else if (key === "creatorBadge") {
        state.creatorBadge = state.creatorBadge || { enabled: false, text: "@lap_lac7" };
        state.creatorBadge.enabled = checked;
        if (el.checkCreatorBadge) el.checkCreatorBadge.checked = checked;
        if (el.creatorBadgeInputGroup) el.creatorBadgeInputGroup.classList.toggle("hidden", !checked);
        if (checked && (!state.creatorBadge.text || !state.creatorBadge.text.trim())) {
          state.creatorBadge.text = (el.inputCreatorTag && el.inputCreatorTag.value && el.inputCreatorTag.value.trim()) 
            ? el.inputCreatorTag.value.trim() 
            : "@lap_lac7";
        }
        if (el.inputCreatorTag) el.inputCreatorTag.value = state.creatorBadge.text;
      } else if (key === "subtitles") {
        state.showLyrics = checked;
        if (el.checkSubtitles) el.checkSubtitles.checked = checked;
      } else if (key === "series") {
        state.showSeriesText = checked;
      }
      syncElemVisibleToggle();
      renderReel();
      saveProjectState();
    });
  }

  // Text Color Controls
  function setElementColor(color) {
    if (!state.textElements) state.textElements = {};
    const elemKey = state.selectedTextElem || "series";
    if (!state.textElements[elemKey]) {
      state.textElements[elemKey] = { color };
    } else {
      state.textElements[elemKey].color = color;
      state.textElements[elemKey]._custom = true;
    }

    if (el.pickerTextColor) el.pickerTextColor.value = color;
    if (el.inputTextHex) el.inputTextHex.value = color.toUpperCase();
    if (el.textColorSwatches && typeof el.textColorSwatches.querySelectorAll === 'function') {
      el.textColorSwatches.querySelectorAll(".color-swatch-btn").forEach(swatch => {
        swatch.classList.toggle("active", swatch.dataset.color.toLowerCase() === color.toLowerCase());
      });
    }
    renderReel();
    saveProjectState();
  }

  if (el.pickerTextColor) {
    el.pickerTextColor.addEventListener("input", (e) => {
      setElementColor(e.target.value.toLowerCase());
    });
  }

  if (el.inputTextHex) {
    const handleHexChange = (e) => {
      let val = e.target.value.trim();
      if (!val.startsWith("#")) val = "#" + val;
      if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
        setElementColor(val.toLowerCase());
      }
    };
    el.inputTextHex.addEventListener("input", handleHexChange);
    el.inputTextHex.addEventListener("change", handleHexChange);
  }

  if (el.textColorSwatches) {
    el.textColorSwatches.addEventListener("click", (e) => {
      const btn = e.target.closest(".color-swatch-btn");
      if (btn && btn.dataset.color) {
        setElementColor(btn.dataset.color.toLowerCase());
      }
    });
  }

  // Text Layout Sliders
  if (el.sliderTextSize) {
    el.sliderTextSize.addEventListener("input", (e) => {
      const val = parseInt(e.target.value) || 38;
      const key = state.selectedTextElem || "series";
      if (!state.textElements) state.textElements = {};
      if (!state.textElements[key]) {
        state.textElements[key] = { size: val, _custom: true };
      } else {
        state.textElements[key].size = val;
        state.textElements[key]._custom = true;
      }
      // If user adjusts size for watermark and it was disabled, auto-enable so user sees the resize live
      if (key === "watermark" && (!state.watermark || !state.watermark.enabled)) {
        state.watermark = state.watermark || { enabled: false, text: "lap_lac7" };
        state.watermark.enabled = true;
        if (el.checkWatermark) el.checkWatermark.checked = true;
        if (el.watermarkInputGroup) el.watermarkInputGroup.classList.remove("hidden");
        syncElemVisibleToggle();
      } else if (key === "creatorBadge" && (!state.creatorBadge || !state.creatorBadge.enabled)) {
        state.creatorBadge = state.creatorBadge || { enabled: false, text: "@lap_lac7" };
        state.creatorBadge.enabled = true;
        if (el.checkCreatorBadge) el.checkCreatorBadge.checked = true;
        if (el.creatorBadgeInputGroup) el.creatorBadgeInputGroup.classList.remove("hidden");
        syncElemVisibleToggle();
      }
      if (el.valTextSize) el.valTextSize.textContent = `${val}px`;
      renderReel();
      saveProjectState();
    });
  }

  if (el.sliderTextY) {
    el.sliderTextY.addEventListener("input", (e) => {
      const val = parseInt(e.target.value) || 320;
      const key = state.selectedTextElem || "series";
      if (!state.textElements) state.textElements = {};
      if (!state.textElements[key]) {
        state.textElements[key] = { y: val, _custom: true };
      } else {
        state.textElements[key].y = val;
        state.textElements[key]._custom = true;
      }
      if (el.valTextY) el.valTextY.textContent = `${val}px`;
      renderReel();
      saveProjectState();
    });
  }

  if (el.sliderTextX) {
    el.sliderTextX.addEventListener("input", (e) => {
      const val = parseInt(e.target.value) || 540;
      const key = state.selectedTextElem || "series";
      if (!state.textElements) state.textElements = {};
      if (!state.textElements[key]) {
        state.textElements[key] = { x: val, _custom: true };
      } else {
        state.textElements[key].x = val;
        state.textElements[key]._custom = true;
      }
      if (el.valTextX) el.valTextX.textContent = (val === 540) ? "Center" : `${val}px`;
      renderReel();
      saveProjectState();
    });
  }

  if (el.btnCenterTextX) {
    el.btnCenterTextX.addEventListener("click", () => {
      if (state.textElements && state.textElements[state.selectedTextElem]) {
        state.textElements[state.selectedTextElem].x = 540;
        state.textElements[state.selectedTextElem]._custom = true;
        if (el.sliderTextX) el.sliderTextX.value = 540;
        if (el.valTextX) el.valTextX.textContent = "Center";
        renderReel();
        saveProjectState();
      }
    });
  }

  if (el.btnResetTextLayout) {
    el.btnResetTextLayout.addEventListener("click", () => {
      resetTextLayout();
      showToast("Text layout reset to default positions");
    });
  }

  el.btnDayDec.addEventListener("click", () => {
    state.dayNumber = Math.max(1, state.dayNumber - 1);
    el.inputDay.value = state.dayNumber;
    renderReel();
    saveProjectState();
  });
  el.btnDayInc.addEventListener("click", () => {
    state.dayNumber += 1;
    el.inputDay.value = state.dayNumber;
    renderReel();
    saveProjectState();
  });
  el.inputDay.addEventListener("change", (e) => {
    state.dayNumber = parseInt(e.target.value) || 1;
    renderReel();
    saveProjectState();
  });

  if (el.inputSeriesText) {
    el.inputSeriesText.addEventListener("input", (e) => {
      state.seriesFormat = e.target.value;
      renderReel();
      saveProjectState();
    });
  }
  if (el.inputSongName) {
    el.inputSongName.addEventListener("input", (e) => {
      state.songName = e.target.value;
      renderReel();
      saveProjectState();
    });
  }
  if (el.inputAnimeName) {
    el.inputAnimeName.addEventListener("input", (e) => {
      state.animeName = e.target.value;
      renderReel();
      saveProjectState();
    });
  }

  // Creator Layout Toggles (Track Sound Pill & Big Metadata)
  if (el.checkTrackPill) {
    el.checkTrackPill.addEventListener("change", (e) => {
      state.trackPillEnabled = e.target.checked;
      renderReel();
      saveProjectState();
      showToast(e.target.checked ? "Track credit sound pill enabled" : "Track credit pill disabled");
    });
  }

  if (el.checkShowMetadata) {
    el.checkShowMetadata.addEventListener("change", (e) => {
      state.showMetadata = e.target.checked;
      renderReel();
      saveProjectState();
      showToast(e.target.checked ? "Large song/anime titles visible" : "Large song/anime titles hidden (clean look)");
    });
  }

  // AI Viral Hook Generator Button
  if (el.btnGenerateAiHooks) {
    el.btnGenerateAiHooks.addEventListener("click", async () => {
      const origText = el.btnGenerateAiHooks.textContent;
      el.btnGenerateAiHooks.textContent = "⏳ Generating...";
      el.btnGenerateAiHooks.disabled = true;
      try {
        const res = await fetch("/api/ai/viral-hooks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            song_name: state.songName || "",
            anime_name: state.animeName || "",
            video_title: state.videoTitle || ""
          })
        });
        const data = await res.json();
        const hooks = data.hooks || [];
        if (el.aiHooksContainer) {
          el.aiHooksContainer.innerHTML = "";
          el.aiHooksContainer.classList.remove("hidden");
          hooks.forEach((h) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "btn btn-sm";
            btn.style.cssText = "font-size:11px; padding:4px 9px; background:rgba(255,255,255,0.06); border:1px solid #38bdf844; color:#38bdf8; border-radius:14px; cursor:pointer; text-align:left; max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;";
            btn.textContent = h.hook;
            btn.title = "Click to apply this viral hook";
            btn.addEventListener("click", () => {
              state.seriesFormat = h.hook;
              if (el.inputSeriesText) el.inputSeriesText.value = h.hook;
              renderReel();
              saveProjectState();
              showToast("Applied viral hook: " + h.hook.slice(0, 30) + "...");
            });
            el.aiHooksContainer.appendChild(btn);
          });
        }
        showToast("✨ Generated viral hooks!");
      } catch (err) {
        showToast("Error generating hooks: " + err.message);
      } finally {
        el.btnGenerateAiHooks.textContent = origText;
        el.btnGenerateAiHooks.disabled = false;
      }
    });
  }

  // Username Watermark Toggle & Input (Separate)
  if (el.checkWatermark) {
    el.checkWatermark.addEventListener("change", (e) => {
      state.watermark = state.watermark || { enabled: false, text: "lap_lac7" };
      state.watermark.enabled = e.target.checked;
      if (el.watermarkInputGroup) {
        el.watermarkInputGroup.classList.toggle("hidden", !e.target.checked);
      }
      if (e.target.checked) {
        if (!state.watermark.text || !state.watermark.text.trim()) {
          state.watermark.text = (el.inputWatermarkText && el.inputWatermarkText.value && el.inputWatermarkText.value.trim()) 
            ? el.inputWatermarkText.value.trim() 
            : "lap_lac7";
        }
        if (el.inputWatermarkText) {
          el.inputWatermarkText.value = state.watermark.text;
        }
        selectTextElement("watermark");
      } else {
        syncElemVisibleToggle();
      }
      renderReel();
      saveProjectState();
      showToast(e.target.checked ? "Username watermark enabled" : "Username watermark disabled");
    });
  }

  if (el.inputWatermarkText) {
    el.inputWatermarkText.addEventListener("input", (e) => {
      state.watermark = state.watermark || { enabled: true, text: "lap_lac7" };
      state.watermark.text = e.target.value;
      renderReel();
      saveProjectState();
    });
  }

  // Laplace Creator Avatar & Follow Tag Toggle & Input (Separate)
  if (el.checkCreatorBadge) {
    el.checkCreatorBadge.addEventListener("change", (e) => {
      state.creatorBadge = state.creatorBadge || { enabled: false, text: "@lap_lac7" };
      state.creatorBadge.enabled = e.target.checked;
      if (el.creatorBadgeInputGroup) {
        el.creatorBadgeInputGroup.classList.toggle("hidden", !e.target.checked);
      }
      if (e.target.checked) {
        if (!state.creatorBadge.text || !state.creatorBadge.text.trim()) {
          state.creatorBadge.text = (el.inputCreatorTag && el.inputCreatorTag.value && el.inputCreatorTag.value.trim()) 
            ? el.inputCreatorTag.value.trim() 
            : "@lap_lac7";
        }
        if (el.inputCreatorTag) {
          el.inputCreatorTag.value = state.creatorBadge.text;
        }
        selectTextElement("creatorBadge");
      } else {
        syncElemVisibleToggle();
      }
      renderReel();
      saveProjectState();
      showToast(e.target.checked ? "Laplace profile header enabled" : "Laplace profile header disabled");
    });
  }

  if (el.inputCreatorTag) {
    el.inputCreatorTag.addEventListener("input", (e) => {
      state.creatorBadge = state.creatorBadge || { enabled: true, text: "@lap_lac7" };
      state.creatorBadge.text = e.target.value;
      renderReel();
      saveProjectState();
    });
  }

  el.inputStartTime.addEventListener("change", (e) => {
    const val = parseFloat(e.target.value) || 0;
    state.startTime = Math.round(Math.max(0, Math.min(state.endTime - 0.05, val)) * 1000) / 1000;
    updateTimelineUI();
    el.hiddenVideo.currentTime = state.startTime;
    updatePlayheadUI(state.startTime);
    saveProjectState();
  });
  el.inputEndTime.addEventListener("change", (e) => {
    const dur = el.hiddenVideo.duration || 35;
    const val = parseFloat(e.target.value) || 35;
    state.endTime = Math.round(Math.min(dur, Math.max(state.startTime + 0.05, val)) * 1000) / 1000;
    updateTimelineUI();
    el.hiddenVideo.currentTime = state.endTime;
    updatePlayheadUI(state.endTime);
    saveProjectState();
  });

  // AI Hook Analysis
  el.btnAnalyzeAI.addEventListener("click", async () => {
    // If user has a new YouTube URL in the input that hasn't been downloaded yet, download it first
    const pendingYtUrl = el.inputYtUrl ? el.inputYtUrl.value.trim() : "";
    const loadedUrl = localStorage.getItem("reel_yt_url_loaded");
    if (pendingYtUrl && (loadedUrl !== pendingYtUrl || !state.videoPath)) {
      showToast("⚡ Downloading video from YouTube first...");
      if (el.btnYtDownload) {
        el.btnYtDownload.click();
      }
      return;
    }

    if (state._uploadPromise || String(state.videoPath || "").startsWith("blob:")) {
      try {
        await ensureServerVideoPathForAnalysis();
      } catch (err) {
        showToast(err.message);
        return;
      }
    }

    const videoHint = state.videoTitle || (state.videoPath ? state.videoPath.split(/[\\/]/).pop() : "") || (el.activeFileName ? el.activeFileName.textContent : "");
    if (!state.songName && !state.animeName && !videoHint) {
      showToast("Please load a video or enter Song / Anime Name first");
      return;
    }
    const dur = (state.videoMeta && state.videoMeta.duration) || el.hiddenVideo.duration || 90;

    el.aiLoading.classList.remove("hidden");
    el.aiResults.classList.add("hidden");
    el.btnAnalyzeAI.disabled = true;
    el.btnAnalyzeAI.innerHTML = '<span>⚡ Analyzing & Styling Subtitles...</span>';

    try {
      const res = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          song_name: state.songName || "",
          anime_name: state.animeName || "",
          video_title: videoHint,
          duration: dur,
          video_path: state.videoPath || ""
        })
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || `Server returned ${res.status}`);
      }

      const data = await res.json();

      // Automatically populate Song Name and Anime Name if recognized by Gemini
      if (data.song_name) {
        state.songName = data.song_name;
        if (el.inputSongName) el.inputSongName.value = data.song_name;
      }
      if (data.anime_name) {
        state.animeName = data.anime_name;
        if (el.inputAnimeName) el.inputAnimeName.value = data.anime_name;
      }

      state.aiAnalysis = data;
      renderAIResults(data, "rec");
      applyAIClip(data.recommended_start, data.recommended_end, "rec");

      // Auto-apply Gemini's recommended subtitle style that fits the song
      if (data.subtitle_style) {
        applySubtitleStyle(data.subtitle_style, data.subtitle_style_reason);
      }

      // Automatically store and display synchronized dual lyrics if generated
      if (data.lyrics && data.lyrics.length > 0) {
        state.lyrics = data.lyrics;
        state.fullLyrics = data.lyrics;
        if (!state.lyricsByMoment) state.lyricsByMoment = {};
        state.lyricsByMoment["rec"] = data.lyrics;
        renderLyricsList(state.lyrics);
      }

      showToast(`✨ Identified: ${data.song_name || state.songName} — Auto-generated clip & subtitles!`);

    } catch (e) {
      console.warn("AI analysis error, using dynamic heuristic fallback:", e);
      const fallbackData = getDefaultAIAnalysis(dur);
      state.aiAnalysis = fallbackData;
      renderAIResults(fallbackData, "rec");
      applyAIClip(fallbackData.recommended_start, fallbackData.recommended_end, "rec");
      if (fallbackData.subtitle_style) {
        applySubtitleStyle(fallbackData.subtitle_style);
      }
      showToast("Notice: Applied dynamic timing for this song (" + (e.message || "AI busy") + ")");
    } finally {
      el.aiLoading.classList.add("hidden");
      el.aiResults.classList.remove("hidden");
      el.btnAnalyzeAI.disabled = false;
      el.btnAnalyzeAI.innerHTML = '<span>✨ Analyze Song</span>';
    }
  });

  function handleApplyRecommended() {
    const analysis = state.aiAnalysis;
    if (analysis && analysis.recommended_start !== undefined) {
      applyAIClip(analysis.recommended_start, analysis.recommended_end, "rec");
      showToast("✓ Applied Recommended Clip & Subtitles to Playbar!");
    } else {
      showToast("No clip available yet. Load a video or click 'Analyze Song'.");
    }
  }

  if (el.btnApplyRec) {
    el.btnApplyRec.addEventListener("click", (e) => {
      e.stopPropagation();
      handleApplyRecommended();
    });
  }

  const recBox = document.querySelector(".rec-moment-box");
  if (recBox) {
    recBox.style.cursor = "pointer";
    recBox.addEventListener("click", () => {
      handleApplyRecommended();
    });
  }

  // Initialize AI results display with dynamic placeholder
  const initialAnalysis = state.aiAnalysis || getDefaultAIAnalysis((state.videoMeta && state.videoMeta.duration) || 90);
  initialAnalysis.isInitialPlaceholder = true;
  renderAIResults(initialAnalysis, state.activeMoment || "rec");

  // Generate vocal-synchronized subtitles for the ENTIRE video
  if (el.btnSyncFullLyrics) {
    el.btnSyncFullLyrics.addEventListener("click", async () => {
      if (state._uploadPromise || String(state.videoPath || "").startsWith("blob:")) {
        try {
          await ensureServerVideoPathForAnalysis();
        } catch (err) {
          showToast(err.message);
          return;
        }
      }

      const videoHint = state.videoTitle || (state.videoPath ? state.videoPath.split(/[\\/]/).pop() : "") || (el.activeFileName ? el.activeFileName.textContent : "");
      if (!state.videoPath && !videoHint) {
        showToast("Please load a video or enter a YouTube URL first");
        return;
      }

      const dur = (state.videoMeta && state.videoMeta.duration) || (el.hiddenVideo && el.hiddenVideo.duration) || 90;
      if (el.lyricsLoading) {
        el.lyricsLoading.classList.remove("hidden");
        const loadingText = el.lyricsLoading.querySelector("p");
        if (loadingText) loadingText.textContent = "Listening to vocal track & generating full-video subtitles...";
      }
      el.btnSyncFullLyrics.disabled = true;
      if (el.btnSyncFullText) el.btnSyncFullText.textContent = "✨ Syncing Whole Video...";

      try {
        const res = await fetch("/api/ai/full-subtitles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            video_path: state.videoPath || "",
            song_name: state.songName || "",
            anime_name: state.animeName || "",
            video_title: videoHint,
            duration: dur
          })
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || "Full video subtitle generation failed");
        }

        const data = await res.json();
        const lyrics = data.lyrics || [];
        if (data.song_name && (!state.songName || state.songName === "Anime Song")) {
          state.songName = data.song_name;
          if (el.inputSongName) el.inputSongName.value = data.song_name;
        }
        if (data.anime_name && (!state.animeName || state.animeName === "Anime Series")) {
          state.animeName = data.anime_name;
          if (el.inputAnimeName) el.inputAnimeName.value = data.anime_name;
        }

        if (data.subtitle_style) {
          applySubtitleStyle(data.subtitle_style, data.subtitle_style_reason);
        }

        if (lyrics.length > 0) {
          state.fullLyrics = lyrics;
          state.lyrics = lyrics;
          renderLyricsList(state.lyrics);
          renderReel();
          saveProjectState();
          showToast(`✨ Generated ${lyrics.length} timed subtitles for the entire video in ${state.subtitleStyle} style!`);
        } else {
          showToast("No vocals detected across the video. Ensure the video has audible lyrics.");
        }
      } catch (err) {
        console.error("Full video subtitle sync error:", err);
        showToast("Failed to generate full-video subtitles: " + err.message);
      } finally {
        if (el.lyricsLoading) {
          el.lyricsLoading.classList.add("hidden");
          const loadingText = el.lyricsLoading.querySelector("p");
          if (loadingText) loadingText.textContent = "Synchronizing Japanese & English lyrics...";
        }
        el.btnSyncFullLyrics.disabled = false;
        if (el.btnSyncFullText) el.btnSyncFullText.textContent = "✨ Whole Video Subtitles";
      }
    });
  }

  if (el.checkSubtitles) {
    el.checkSubtitles.addEventListener("change", (e) => {
      state.showLyrics = e.target.checked;
      saveProjectState();
      showToast(state.showLyrics ? "Dual Subtitles: Visible" : "Dual Subtitles: Hidden");
    });
  }

  const allStyleCards = document.querySelectorAll(".sub-style-card, .sub-style-btn");
  if (allStyleCards) {
    allStyleCards.forEach(btn => {
      btn.addEventListener("click", () => {
        applySubtitleStyle(btn.dataset.style || "minimal");
        const styleTitle = btn.querySelector('.style-card-name') ? btn.querySelector('.style-card-name').textContent : btn.textContent.trim();
        showToast(`Subtitle Style: ${styleTitle}`);
      });
    });
  }

  if (el.subLangBtns) {
    el.subLangBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        el.subLangBtns.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        state.subtitleLanguage = btn.dataset.lang || "both";
        renderReel();
        saveProjectState();
        const labels = { both: "Both (Japanese + English)", jp: "Japanese Only", en: "English Only" };
        showToast(`Subtitles: ${labels[state.subtitleLanguage] || state.subtitleLanguage}`);
      });
    });
  }
}

// -------------------------------------------------------------
// TEMPLATES & SLIDERS
// -------------------------------------------------------------
function updateRadiusUI(rad) {
  if (el.valRadius) {
    if (rad >= 280) {
      el.valRadius.textContent = `${rad}px (Circular Pill)`;
    } else if (rad >= 180) {
      el.valRadius.textContent = `${rad}px (Oval)`;
    } else if (rad >= 80) {
      el.valRadius.textContent = `${rad}px (Smooth)`;
    } else {
      el.valRadius.textContent = `${rad}px`;
    }
  }
  const radiusChips = document.querySelectorAll(".radius-chip");
  if (radiusChips) {
    radiusChips.forEach(chip => {
      const chipRad = parseInt(chip.dataset.radius);
      chip.classList.toggle("active", Math.abs(chipRad - rad) <= 6);
    });
  }
  if (el.borderModeBtns && state.adjustments && state.adjustments.curvedBorder !== false) {
    const isCircular = rad >= 260;
    el.borderModeBtns.forEach(btn => {
      const mode = btn.dataset.border || "curved";
      if (mode === "circular") {
        btn.classList.toggle("active", isCircular);
      } else if (mode === "curved") {
        btn.classList.toggle("active", !isCircular);
      } else if (mode === "straight") {
        btn.classList.remove("active");
      }
    });
  }
}

function setupTemplatesAndSliders() {
  el.tplQuickButtons.forEach(btn => {
    btn.addEventListener("click", async () => {
      el.tplQuickButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const tplId = btn.dataset.tpl;
      await loadTemplate(tplId);
      saveProjectState();
    });
  });

  el.sliderBlur.addEventListener("input", (e) => {
    state.adjustments.blur = parseFloat(e.target.value);
    el.valBlur.textContent = `${state.adjustments.blur}px`;
    renderReel();
    saveProjectState();
  });
  el.sliderDim.addEventListener("input", (e) => {
    state.adjustments.brightness = parseFloat(e.target.value);
    el.valDim.textContent = `${Math.round(state.adjustments.brightness * 100)}%`;
    renderReel();
    saveProjectState();
  });
  el.sliderScale.addEventListener("input", (e) => {
    state.adjustments.scale = parseFloat(e.target.value);
    el.valScale.textContent = `${Math.round(state.adjustments.scale * 100)}%`;
    renderReel();
    saveProjectState();
  });
  el.sliderRadius.addEventListener("input", (e) => {
    state.adjustments.radius = parseInt(e.target.value);
    state.adjustments.curvedBorder = true;
    updateRadiusUI(state.adjustments.radius);
    renderReel();
    saveProjectState();
  });
  if (el.checkWaveform) {
    el.checkWaveform.addEventListener("change", (e) => {
      state.adjustments.waveform = e.target.checked;
      saveProjectState();
    });
  }

  if (el.checkSmartLoop) {
    el.checkSmartLoop.addEventListener("change", (e) => {
      state.smartLoop = e.target.checked;
      if (el.rowLoopMode) {
        el.rowLoopMode.style.display = state.smartLoop ? "flex" : "none";
      }
      saveProjectState();
      showToast(state.smartLoop ? "🔁 Smart Seamless Loop: Enabled" : "Smart Loop: Disabled");
    });
  }

  if (el.bgModeBtns) {
    el.bgModeBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        el.bgModeBtns.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const chosenBg = btn.dataset.bg || "blur";
        state.adjustments.bgType = chosenBg;
        adaptTextColorsForBackground(chosenBg);
        if (el.rowBgBlur) el.rowBgBlur.style.display = (chosenBg === "blur") ? "flex" : "none";
        if (el.rowBgDim) el.rowBgDim.style.display = (chosenBg === "blur") ? "flex" : "none";
        renderReel();
        saveProjectState();
        const label = chosenBg === "blur" ? "Blurred Video" : (chosenBg === "black" ? "Black" : "White");
        showToast(`Background: ${label}`);
      });
    });
  }

  if (el.borderModeBtns) {
    el.borderModeBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        el.borderModeBtns.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const mode = btn.dataset.border || "curved";
        const radiusPresets = document.getElementById("radius-presets-row");
        if (mode === "straight") {
          state.adjustments.curvedBorder = false;
          if (el.rowCornerRadius) el.rowCornerRadius.style.display = "none";
          if (radiusPresets) radiusPresets.style.display = "none";
          showToast("Border: Straight (Sharp Corners)");
        } else if (mode === "circular") {
          state.adjustments.curvedBorder = true;
          state.adjustments.radius = 304;
          if (el.sliderRadius) el.sliderRadius.value = 304;
          updateRadiusUI(304);
          if (el.rowCornerRadius) el.rowCornerRadius.style.display = "flex";
          if (radiusPresets) radiusPresets.style.display = "flex";
          showToast("Border: Circular / Pill Shape (304px)");
        } else {
          state.adjustments.curvedBorder = true;
          if (!state.adjustments.radius || state.adjustments.radius < 16 || state.adjustments.radius >= 260) {
            state.adjustments.radius = 48;
          }
          if (el.sliderRadius) el.sliderRadius.value = state.adjustments.radius;
          updateRadiusUI(state.adjustments.radius);
          if (el.rowCornerRadius) el.rowCornerRadius.style.display = "flex";
          if (radiusPresets) radiusPresets.style.display = "flex";
          showToast("Border: Curved (Rounded Corners)");
        }
        renderReel();
        saveProjectState();
      });
    });
  }

  const radiusChips = document.querySelectorAll(".radius-chip");
  if (radiusChips) {
    radiusChips.forEach(chip => {
      chip.addEventListener("click", () => {
        const rad = parseInt(chip.dataset.radius);
        if (!isNaN(rad)) {
          state.adjustments.curvedBorder = true;
          state.adjustments.radius = rad;
          if (el.sliderRadius) el.sliderRadius.value = rad;
          updateRadiusUI(rad);
          if (el.rowCornerRadius) el.rowCornerRadius.style.display = "flex";
          const radiusPresets = document.getElementById("radius-presets-row");
          if (radiusPresets) radiusPresets.style.display = "flex";
          renderReel();
          saveProjectState();
          showToast(`Corner Radius: ${rad}px${rad >= 280 ? ' (Circular Pill)' : ''}`);
        }
      });
    });
  }

  if (el.loopModeBtns) {
    el.loopModeBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        el.loopModeBtns.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        state.loopMode = btn.dataset.mode || "circular";
        saveProjectState();
        showToast(`Loop Mode: ${btn.textContent.trim()}`);
      });
    });
  }

  // Black Screen Fade Transition Listeners
  const fadeModeBtns = document.querySelectorAll(".fade-mode-btn");
  const fadeDurBtns = document.querySelectorAll(".fade-dur-btn");
  const fadeDurContainer = document.getElementById("fade-duration-container");
  const fadeDurLabel = document.getElementById("fade-duration-label");

  if (fadeModeBtns) {
    fadeModeBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        fadeModeBtns.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const mode = btn.dataset.fade || "none";
        state.fadeTransition.mode = mode;
        if (fadeDurContainer) {
          fadeDurContainer.classList.toggle("hidden", mode === "none");
        }
        renderReel();
        saveProjectState();
        const modeLabels = {
          none: "None",
          in: "Fade In (from Black)",
          out: "Fade Out (to Black)",
          both: "Fade In & Fade Out"
        };
        showToast(`Black Transition: ${modeLabels[mode] || mode}`);
      });
    });
  }

  if (fadeDurBtns) {
    fadeDurBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        fadeDurBtns.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const dur = parseFloat(btn.dataset.dur) || 0.50;
        state.fadeTransition.duration = dur;
        if (fadeDurLabel) fadeDurLabel.textContent = `${dur.toFixed(2)}s`;
        renderReel();
        saveProjectState();
        showToast(`Fade Duration: ${dur.toFixed(2)}s`);
      });
    });
  }
}

function syncAdjustmentSliders() {
  const bgType = (state.adjustments && state.adjustments.bgType) || "blur";
  if (el.bgModeBtns) {
    el.bgModeBtns.forEach(btn => {
      btn.classList.toggle("active", btn.dataset.bg === bgType);
    });
  }
  if (el.rowBgBlur) el.rowBgBlur.style.display = (bgType === "blur") ? "flex" : "none";
  if (el.rowBgDim) el.rowBgDim.style.display = (bgType === "blur") ? "flex" : "none";

  const isCurved = (state.adjustments && state.adjustments.curvedBorder !== false);
  const curRadius = (state.adjustments && state.adjustments.radius !== undefined) ? state.adjustments.radius : 16;
  const isCircular = isCurved && curRadius >= 260;
  if (el.borderModeBtns) {
    el.borderModeBtns.forEach(btn => {
      const mode = btn.dataset.border || "curved";
      if (!isCurved) {
        btn.classList.toggle("active", mode === "straight");
      } else if (isCircular) {
        btn.classList.toggle("active", mode === "circular");
      } else {
        btn.classList.toggle("active", mode === "curved");
      }
    });
  }
  if (el.rowCornerRadius) {
    el.rowCornerRadius.style.display = isCurved ? "flex" : "none";
  }
  const radiusPresets = document.getElementById("radius-presets-row");
  if (radiusPresets) {
    radiusPresets.style.display = isCurved ? "flex" : "none";
  }

  // Sync Fade Transition Controls
  if (state.fadeTransition) {
    const fadeModeBtns = document.querySelectorAll(".fade-mode-btn");
    const fadeDurBtns = document.querySelectorAll(".fade-dur-btn");
    const fadeDurContainer = document.getElementById("fade-duration-container");
    const fadeDurLabel = document.getElementById("fade-duration-label");
    const activeMode = state.fadeTransition.mode || "none";
    const activeDur = state.fadeTransition.duration || 0.50;

    if (fadeModeBtns) {
      fadeModeBtns.forEach(b => {
        b.classList.toggle("active", (b.dataset.fade || "none") === activeMode);
      });
    }
    if (fadeDurContainer) {
      fadeDurContainer.classList.toggle("hidden", activeMode === "none");
    }
    if (fadeDurBtns) {
      fadeDurBtns.forEach(b => {
        b.classList.toggle("active", Math.abs(parseFloat(b.dataset.dur) - activeDur) < 0.01);
      });
    }
    if (fadeDurLabel) {
      fadeDurLabel.textContent = `${activeDur.toFixed(2)}s`;
    }
  }

  if (el.sliderBlur && state.adjustments) {
    el.sliderBlur.value = state.adjustments.blur;
    if (el.valBlur) el.valBlur.textContent = `${state.adjustments.blur}px`;
  }
  if (el.sliderDim && state.adjustments) {
    el.sliderDim.value = state.adjustments.brightness;
    if (el.valDim) el.valDim.textContent = `${Math.round(state.adjustments.brightness * 100)}%`;
  }
  if (el.sliderScale && state.adjustments) {
    el.sliderScale.value = state.adjustments.scale;
    if (el.valScale) el.valScale.textContent = `${Math.round(state.adjustments.scale * 100)}%`;
  }
  if (el.sliderRadius && state.adjustments) {
    el.sliderRadius.value = state.adjustments.radius;
    updateRadiusUI(state.adjustments.radius);
  }
  if (el.checkWaveform && state.adjustments) {
    el.checkWaveform.checked = !!state.adjustments.waveform;
  }
}

// -------------------------------------------------------------
// VIDEO FILTERS & ADJUSTMENTS DOCKS
// -------------------------------------------------------------
function setupVideoFilters() {
  const grid = el.filtersGrid;
  if (!grid) return;

  grid.innerHTML = "";
  Object.values(VIDEO_FILTERS).forEach(filter => {
    const card = document.createElement("div");
    card.className = `filter-card ${filter.id === (state.colorFilter || "original") ? "active" : ""}`;
    card.dataset.filter = filter.id;
    card.title = `${filter.name} Filter`;
    card.innerHTML = `
      <div class="filter-thumb" style="background: ${filter.thumbGrad};">
        <span class="filter-thumb-badge">${filter.name.substring(0, 3).toUpperCase()}</span>
      </div>
      <span class="filter-name">${filter.name}</span>
    `;

    card.addEventListener("click", () => {
      state.colorFilter = filter.id;
      document.querySelectorAll(".filter-card").forEach(c => c.classList.remove("active"));
      card.classList.add("active");
      if (el.filterActiveName) {
        el.filterActiveName.textContent = filter.name;
      }
      saveProjectState();
      renderReel();
      showToast(`Filter applied: ${filter.name}`);
    });

    grid.appendChild(card);
  });

  // Filter Intensity Slider
  if (el.sliderFilterIntensity) {
    el.sliderFilterIntensity.addEventListener("input", (e) => {
      const val = parseInt(e.target.value, 10);
      state.filterIntensity = val;
      if (el.valFilterIntensity) {
        el.valFilterIntensity.textContent = `${val}%`;
      }
      saveProjectState();
      renderReel();
    });
  }

  // Left Dock Toggle Button
  if (el.btnToggleFiltersDock && el.dockFilters) {
    el.btnToggleFiltersDock.addEventListener("click", () => {
      el.dockFilters.classList.toggle("collapsed");
      const isCollapsed = el.dockFilters.classList.contains("collapsed");
      el.btnToggleFiltersDock.textContent = isCollapsed ? "▶" : "◀";
      el.btnToggleFiltersDock.title = isCollapsed ? "Expand Filters Dock" : "Collapse Filters Dock";
    });
  }
}

function setupVideoAdjustments() {
  if (!el.dockAdjustments) {
    return;
  }

  // Brightness
  if (el.sliderAdjBrightness) {
    el.sliderAdjBrightness.addEventListener("input", (e) => {
      const val = parseFloat(e.target.value);
      state.colorAdjustments.brightness = val;
      if (el.valAdjBrightness) {
        el.valAdjBrightness.textContent = `${val > 0 ? "+" : ""}${val}%`;
      }
      saveProjectState();
      renderReel();
    });
  }

  // Contrast
  if (el.sliderAdjContrast) {
    el.sliderAdjContrast.addEventListener("input", (e) => {
      const val = parseFloat(e.target.value);
      state.colorAdjustments.contrast = val;
      if (el.valAdjContrast) {
        el.valAdjContrast.textContent = `${val}%`;
      }
      saveProjectState();
      renderReel();
    });
  }

  // Saturation
  if (el.sliderAdjSaturation) {
    el.sliderAdjSaturation.addEventListener("input", (e) => {
      const val = parseFloat(e.target.value);
      state.colorAdjustments.saturation = val;
      if (el.valAdjSaturation) {
        el.valAdjSaturation.textContent = `${val}%`;
      }
      saveProjectState();
      renderReel();
    });
  }

  // Warmth
  if (el.sliderAdjWarmth) {
    el.sliderAdjWarmth.addEventListener("input", (e) => {
      const val = parseFloat(e.target.value);
      state.colorAdjustments.warmth = val;
      if (el.valAdjWarmth) {
        el.valAdjWarmth.textContent = `${val > 0 ? "+" : ""}${val}`;
      }
      saveProjectState();
      renderReel();
    });
  }

  // Vignette
  if (el.sliderAdjVignette) {
    el.sliderAdjVignette.addEventListener("input", (e) => {
      const val = parseFloat(e.target.value);
      state.colorAdjustments.vignette = val;
      if (el.valAdjVignette) {
        el.valAdjVignette.textContent = `${val}%`;
      }
      saveProjectState();
      renderReel();
    });
  }

  // Reset Button
  if (el.btnResetAdjustments) {
    el.btnResetAdjustments.addEventListener("click", () => {
      state.colorAdjustments = {
        brightness: 0,
        contrast: 100,
        saturation: 100,
        warmth: 0,
        vignette: 0
      };
      syncAdjustmentDockSliders();
      saveProjectState();
      renderReel();
      showToast("Video adjustments reset to default");
    });
  }

  // Right Dock Toggle Button
  if (el.btnToggleAdjustmentsDock && el.dockAdjustments) {
    el.btnToggleAdjustmentsDock.addEventListener("click", () => {
      el.dockAdjustments.classList.toggle("collapsed");
      const isCollapsed = el.dockAdjustments.classList.contains("collapsed");
      el.btnToggleAdjustmentsDock.textContent = isCollapsed ? "◀" : "▶";
      el.btnToggleAdjustmentsDock.title = isCollapsed ? "Expand Adjustments Dock" : "Collapse Adjustments Dock";
    });
  }
}

function syncAdjustmentDockSliders() {
  const adj = state.colorAdjustments || { brightness: 0, contrast: 100, saturation: 100, warmth: 0, vignette: 0 };
  if (el.sliderAdjBrightness) {
    el.sliderAdjBrightness.value = adj.brightness !== undefined ? adj.brightness : 0;
    if (el.valAdjBrightness) {
      el.valAdjBrightness.textContent = `${adj.brightness > 0 ? "+" : ""}${adj.brightness || 0}%`;
    }
  }
  if (el.sliderAdjContrast) {
    el.sliderAdjContrast.value = adj.contrast !== undefined ? adj.contrast : 100;
    if (el.valAdjContrast) {
      el.valAdjContrast.textContent = `${adj.contrast !== undefined ? adj.contrast : 100}%`;
    }
  }
  if (el.sliderAdjSaturation) {
    el.sliderAdjSaturation.value = adj.saturation !== undefined ? adj.saturation : 100;
    if (el.valAdjSaturation) {
      el.valAdjSaturation.textContent = `${adj.saturation !== undefined ? adj.saturation : 100}%`;
    }
  }
  if (el.sliderAdjWarmth) {
    el.sliderAdjWarmth.value = adj.warmth !== undefined ? adj.warmth : 0;
    if (el.valAdjWarmth) {
      el.valAdjWarmth.textContent = `${adj.warmth > 0 ? "+" : ""}${adj.warmth || 0}`;
    }
  }
  if (el.sliderAdjVignette) {
    el.sliderAdjVignette.value = adj.vignette !== undefined ? adj.vignette : 0;
    if (el.valAdjVignette) {
      el.valAdjVignette.textContent = `${adj.vignette || 0}%`;
    }
  }

  // Also sync filter intensity
  if (el.sliderFilterIntensity) {
    const val = state.filterIntensity !== undefined ? state.filterIntensity : 100;
    el.sliderFilterIntensity.value = val;
    if (el.valFilterIntensity) {
      el.valFilterIntensity.textContent = `${val}%`;
    }
  }

  // Sync active filter card
  const activeId = state.colorFilter || "original";
  document.querySelectorAll(".filter-card").forEach(c => {
    c.classList.toggle("active", c.dataset.filter === activeId);
  });
  if (el.filterActiveName) {
    const f = VIDEO_FILTERS[activeId];
    el.filterActiveName.textContent = f ? f.name : "Original";
  }
}

async function loadTemplate(templateId) {
  try {
    const res = await fetch(`/api/templates/${templateId}`);
    if (res.ok) {
      const data = await res.json();
      state.activeTemplate = templateId;
      state.templateData = data;
      el.activeTplBadge.textContent = data.name || templateId;

      if (data.background) {
        state.adjustments.blur = data.background.blur || 35;
        state.adjustments.brightness = data.background.brightness || -0.25;
        el.sliderBlur.value = state.adjustments.blur;
        el.sliderDim.value = state.adjustments.brightness;
        el.valBlur.textContent = `${state.adjustments.blur}px`;
        el.valDim.textContent = `${Math.round(state.adjustments.brightness * 100)}%`;
      }
      if (data.video) {
        state.adjustments.scale = data.video.scale || 1.0;
        state.adjustments.radius = data.video.corner_radius !== undefined ? data.video.corner_radius : 16;
        if (data.video.curved_border !== undefined) {
          state.adjustments.curvedBorder = !!data.video.curved_border;
        }
        el.sliderScale.value = state.adjustments.scale;
        el.sliderRadius.value = state.adjustments.radius;
        el.valScale.textContent = `${Math.round(state.adjustments.scale * 100)}%`;
        updateRadiusUI(state.adjustments.radius);

        const isCurved = state.adjustments.curvedBorder !== false;
        const curRadius = state.adjustments.radius !== undefined ? state.adjustments.radius : 16;
        const isCircular = isCurved && curRadius >= 260;
        if (el.borderModeBtns) {
          el.borderModeBtns.forEach(btn => {
            const mode = btn.dataset.border || "curved";
            if (!isCurved) {
              btn.classList.toggle("active", mode === "straight");
            } else if (isCircular) {
              btn.classList.toggle("active", mode === "circular");
            } else {
              btn.classList.toggle("active", mode === "curved");
            }
          });
        }
        if (el.rowCornerRadius) {
          el.rowCornerRadius.style.display = isCurved ? "flex" : "none";
        }
        const radiusPresets = document.getElementById("radius-presets-row");
        if (radiusPresets) {
          radiusPresets.style.display = isCurved ? "flex" : "none";
        }
      }
      showToast(`Applied "${data.name}" Style`);
      renderReel();
    }
  } catch (e) {
    console.warn("Template load error:", e);
  }
}

// -------------------------------------------------------------
// EXPORT PIPELINE
// -------------------------------------------------------------
function setupExport() {
  const triggerExport = async () => {
    if (!state.videoPath) {
      showToast("Please select a video file first!");
      return;
    }

    el.exportModal.classList.remove("hidden");
    el.exportCompleteBox.classList.add("hidden");
    el.exportProgressBar.style.width = "10%";
    el.exportPercentage.textContent = "10%";
    el.exportStatusLabel.textContent = "Starting FFmpeg compositor...";

    if (state.videoPath.startsWith("blob:")) {
      el.exportStatusLabel.textContent = "Uploading video to studio server, please wait...";
      try {
        await ensureServerVideoPathForAnalysis();
      } catch (err) {
        el.exportStatusLabel.textContent = "Export failed: " + err.message;
        showToast(err.message);
        return;
      }
    }

    const payload = {
      source_video: state.videoPath,
      start_time: state.startTime,
      end_time: state.endTime,
      aspect_ratio: state.aspectRatio || "9:16",
      series_text: state.seriesFormat.replace("{day}", state.dayNumber),
      song_name: "",
      anime_name: "",
      day_number: state.dayNumber,
      caption: state.caption || "",
      template: {
        ...(state.templateData || { name: state.activeTemplate }),
        background: {
          ...((state.templateData && state.templateData.background) || {}),
          type: (state.adjustments && state.adjustments.bgType) || "blur",
          blur: state.adjustments.blur,
          brightness: state.adjustments.brightness
        },
        video: {
          ...((state.templateData && state.templateData.video) || {}),
          scale: state.adjustments.scale,
          curved_border: state.adjustments.curvedBorder !== false,
          corner_radius: (state.adjustments.curvedBorder !== false ? state.adjustments.radius : 0)
        },
        series_text: {
          ...((state.templateData && state.templateData.series_text) || {}),
          enabled: state.showSeriesText !== false,
          background_pill: false,
          x: state.textElements && state.textElements.series ? Math.round(state.textElements.series.x) : 540,
          y: state.textElements && state.textElements.series ? Math.round(state.textElements.series.y) : 320,
          size: state.textElements && state.textElements.series ? Math.round(state.textElements.series.size) : 38,
          color: state.textElements && state.textElements.series ? state.textElements.series.color : null
        },
        song_title: {
          enabled: false
        },
        anime_name: {
          enabled: false
        },
        track_pill: {
          enabled: false
        },
        watermark: {
          enabled: !!(state.watermark && state.watermark.enabled),
          text: (state.watermark && state.watermark.text) || "",
          x: state.textElements && state.textElements.watermark ? Math.round(state.textElements.watermark.x) : 140,
          y: state.textElements && state.textElements.watermark ? Math.round(state.textElements.watermark.y) : 90,
          size: state.textElements && state.textElements.watermark ? Math.round(state.textElements.watermark.size) : 28,
          color: state.textElements && state.textElements.watermark ? state.textElements.watermark.color : null
        },
        creator_badge: {
          enabled: !!(state.creatorBadge && state.creatorBadge.enabled),
          text: (state.creatorBadge && state.creatorBadge.text) || "@lap_lac7",
          x: state.textElements && state.textElements.creatorBadge ? Math.round(state.textElements.creatorBadge.x) : 540,
          y: state.textElements && state.textElements.creatorBadge ? Math.round(state.textElements.creatorBadge.y) : 160,
          size: state.textElements && state.textElements.creatorBadge ? Math.round(state.textElements.creatorBadge.size) : 28,
          color: state.textElements && state.textElements.creatorBadge ? state.textElements.creatorBadge.color : null
        },
        subtitles: {
          color: state.textElements && state.textElements.subtitles ? state.textElements.subtitles.color : null
        }
      },
      watermark: {
        enabled: !!(state.watermark && state.watermark.enabled),
        text: (state.watermark && state.watermark.text) || "",
        x: state.textElements && state.textElements.watermark ? Math.round(state.textElements.watermark.x) : 140,
        y: state.textElements && state.textElements.watermark ? Math.round(state.textElements.watermark.y) : 90,
        size: state.textElements && state.textElements.watermark ? Math.round(state.textElements.watermark.size) : 28,
        color: state.textElements && state.textElements.watermark ? state.textElements.watermark.color : null
      },
      creator_badge: {
        enabled: !!(state.creatorBadge && state.creatorBadge.enabled),
        text: (state.creatorBadge && state.creatorBadge.text) || "@lap_lac7",
        x: state.textElements && state.textElements.creatorBadge ? Math.round(state.textElements.creatorBadge.x) : 540,
        y: state.textElements && state.textElements.creatorBadge ? Math.round(state.textElements.creatorBadge.y) : 160,
        size: state.textElements && state.textElements.creatorBadge ? Math.round(state.textElements.creatorBadge.size) : 30,
        color: state.textElements && state.textElements.creatorBadge ? state.textElements.creatorBadge.color : null
      },
      lyrics: state.lyrics || [],
      show_lyrics: state.showLyrics !== false,
      subtitle_style: state.subtitleStyle || "minimal",
      subtitle_language: state.subtitleLanguage || "both",
      subtitle_color: state.textElements && state.textElements.subtitles ? state.textElements.subtitles.color : null,
      subtitle_y: state.textElements && state.textElements.subtitles ? Math.round(state.textElements.subtitles.y) : null,
      subtitle_x: state.textElements && state.textElements.subtitles ? Math.round(state.textElements.subtitles.x) : null,
      subtitle_font_size: state.textElements && state.textElements.subtitles ? Math.round(state.textElements.subtitles.size) : null,
      smart_loop: state.smartLoop !== false,
      loop_mode: state.loopMode || "standard",
      loop_fade_duration: state.loopFadeDuration || 0.35,
      fade_in: !!(state.fadeTransition && (state.fadeTransition.mode === "in" || state.fadeTransition.mode === "both")),
      fade_out: !!(state.fadeTransition && (state.fadeTransition.mode === "out" || state.fadeTransition.mode === "both")),
      fade_duration: (state.fadeTransition && state.fadeTransition.duration) || 0.50,
      color_filter: state.colorFilter || "original",
      filter_intensity: state.filterIntensity !== undefined ? state.filterIntensity : 100,
      color_adjustments: state.colorAdjustments || { brightness: 0, contrast: 100, saturation: 100, warmth: 0, vignette: 0 }
    };

    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data.task_id) {
        const errorDetail = data.detail ? (typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail)) : (data.message || "Export request rejected by server");
        el.exportStatusLabel.textContent = "Export Failed: " + errorDetail;
        showToast("Export failed: " + errorDetail);
        return;
      }
      const taskId = data.task_id;

      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/export/status/${taskId}`);
          const task = await statusRes.json();

          el.exportProgressBar.style.width = `${task.progress}%`;
          el.exportPercentage.textContent = `${Math.round(task.progress)}%`;
          el.exportStatusLabel.textContent = task.message;

          if (task.status === "completed") {
            clearInterval(pollInterval);
            el.exportCompleteBox.classList.remove("hidden");
            el.exportFilePath.textContent = task.output_file;
            if (el.btnDownloadExport) {
              el.btnDownloadExport.href = `/api/media/download?path=${encodeURIComponent(task.output_file)}`;
            }
            showToast("Reel Exported Successfully!");
            loadHistory();
          } else if (task.status === "error") {
            clearInterval(pollInterval);
            el.exportStatusLabel.textContent = "Export Error: " + task.message;
          }
        } catch (err) {
          clearInterval(pollInterval);
        }
      }, 800);

    } catch (e) {
      el.exportStatusLabel.textContent = "Request failed: " + e.message;
    }
  };

  if (el.btnOpenFolder) {
    el.btnOpenFolder.addEventListener("click", async () => {
      const filePath = el.exportFilePath ? el.exportFilePath.textContent : "";
      try {
        await fetch("/api/system/open-folder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: filePath })
        });
        showToast("Opening folder in Windows Explorer...");
      } catch (e) {
        showToast("Could not open folder");
      }
    });
  }

  if (el.btnExportQuick) el.btnExportQuick.addEventListener("click", triggerExport);
  if (el.btnExportMain) el.btnExportMain.addEventListener("click", triggerExport);
  if (el.btnCloseModal) {
    el.btnCloseModal.addEventListener("click", () => {
      if (el.exportModal) el.exportModal.classList.add("hidden");
    });
  }
  if (el.btnModalDismiss) {
    el.btnModalDismiss.addEventListener("click", () => {
      if (el.exportModal) el.exportModal.classList.add("hidden");
    });
  }
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && el.exportModal && !el.exportModal.classList.contains("hidden")) {
      el.exportModal.classList.add("hidden");
    }
  });
}

// -------------------------------------------------------------
// SETTINGS & HISTORY
// -------------------------------------------------------------
function setupSettingsAndNav() {
  el.navTabs.forEach(tab => {
    tab.addEventListener("click", () => {
      el.navTabs.forEach(t => t.classList.remove("active"));
      el.tabContents.forEach(c => c.classList.remove("active"));
      tab.classList.add("active");
      const targetView = tab.dataset.view;
      const targetEl = document.getElementById(`view-${targetView}`);
      if (targetEl) targetEl.classList.add("active");

      if (targetView === "history") loadHistory();
      if (targetView === "templates") loadTemplatesCatalog();
      if (targetView === "schedule") loadScheduleView();
    });
  });

  if (el.btnSaveKey) {
    el.btnSaveKey.addEventListener("click", async () => {
      const key = el.settingsKey ? el.settingsKey.value.trim() : "";
      if (!key) return;
      try {
        await fetch("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ gemini_api_key: key })
        });
        showToast("Gemini API key saved securely!");
      } catch (e) {
        showToast("Failed to save settings");
      }
    });
  }

  fetch("/api/settings").then(r => r.json()).then(s => {
    const msg = document.getElementById("key-status-msg");
    if (s.has_gemini_key && msg) {
      msg.innerHTML = `<span style="color:var(--neon-emerald);font-weight:700;">\u2713 Connected to Google AI:</span> Active Key (${s.masked_key}) \u00b7 Powered by Gemini 3.5 Flash`;
    }
  }).catch(() => {});

  if (el.btnResetSession) {
    el.btnResetSession.addEventListener("click", () => {
      if (confirm("Reset current project? This will clear the loaded video and settings to start fresh.")) {
        localStorage.removeItem("reel_forge_project");
        localStorage.removeItem("reel_yt_url");
        window.location.reload();
      }
    });
  }
}

// -------------------------------------------------------------
// PROJECT STATE PERSISTENCE ENGINE
// -------------------------------------------------------------
function saveProjectState() {
  const project = {
    ytUrl: el.inputYtUrl ? el.inputYtUrl.value : "",
    activeSourceTab: el.tabSrcYt && el.tabSrcYt.classList.contains("active") ? "yt" : "local",
    videoPath: state.videoPath || "",
    videoTitle: el.activeFileName ? el.activeFileName.textContent : "",
    videoMeta: state.videoMeta || null,
    dayNumber: state.dayNumber,
    seriesFormat: state.seriesFormat,
    showSeriesText: state.showSeriesText !== false,
    songName: state.songName,
    animeName: state.animeName,
    startTime: state.startTime,
    endTime: state.endTime,
    isLooping: state.isLooping,
    adjustments: state.adjustments,
    activeTemplate: state.activeTemplate,
    aiAnalysis: state.aiAnalysis || null,
    activeMoment: state.activeMoment || "rec",
    lyrics: state.lyrics || [],
    showLyrics: state.showLyrics !== false,
    subtitleStyle: state.subtitleStyle || "minimal",
    subtitleLanguage: state.subtitleLanguage || "both",
    smartLoop: state.smartLoop !== false,
    loopMode: state.loopMode || "circular",
    loopFadeDuration: state.loopFadeDuration || 0.35,
    fadeTransition: state.fadeTransition || { mode: "none", duration: 0.50 },
    watermark: state.watermark || { enabled: false, text: "lap_lac7" },
    creatorBadge: state.creatorBadge || { enabled: false, text: "@lap_lac7" },
    textElements: state.textElements || null,
    colorFilter: state.colorFilter || "original",
    filterIntensity: state.filterIntensity !== undefined ? state.filterIntensity : 100,
    colorAdjustments: state.colorAdjustments || { brightness: 0, contrast: 100, saturation: 100, warmth: 0, vignette: 0 }
  };
  try {
    localStorage.setItem("reel_forge_project", JSON.stringify(project));
  } catch (e) {
    console.warn("Could not save project to localStorage:", e);
  }
}

async function restoreProjectState() {
  try {
    const raw = localStorage.getItem("reel_forge_project");
    const savedYtUrl = localStorage.getItem("reel_yt_url");
    if (!raw && !savedYtUrl) return;

    let project = {};
    if (raw) {
      try {
        project = JSON.parse(raw);
      } catch (_) {}
    }

    // 1. YouTube URL and tab
    const ytUrl = project.ytUrl || savedYtUrl || "";
    if (ytUrl && el.inputYtUrl) {
      el.inputYtUrl.value = ytUrl;
    }
    if ((project.activeSourceTab === "yt" || ytUrl) && el.tabSrcYt) {
      el.tabSrcYt.click();
    }

    state.showSeriesText = project.showSeriesText !== false;

    // Restore text elements layout
    if (project.textElements) {
      state.textElements = {
        series: { ...state.textElements.series, ...(project.textElements.series || {}) },
        creatorBadge: { ...state.textElements.creatorBadge, ...(project.textElements.creatorBadge || {}) },
        watermark: { ...state.textElements.watermark, ...(project.textElements.watermark || {}) },
        subtitles: { ...state.textElements.subtitles, ...(project.textElements.subtitles || {}) }
      };
      delete state.textElements.song;
      delete state.textElements.anime;
      delete state.textElements.subtitles_en;
      if (typeof syncTextSliders === "function") {
        syncTextSliders(state.textElements[state.selectedTextElem || "series"]);
      }
    }

    // Username Watermark
    if (project.watermark) {
      state.watermark = { ...state.watermark, ...project.watermark };
      if (!state.watermark.text || !state.watermark.text.trim()) {
        state.watermark.text = "lap_lac7";
      }
      if (el.checkWatermark) el.checkWatermark.checked = !!state.watermark.enabled;
      if (el.inputWatermarkText) el.inputWatermarkText.value = state.watermark.text || "lap_lac7";
      if (el.watermarkInputGroup) {
        el.watermarkInputGroup.classList.toggle("hidden", !state.watermark.enabled);
      }
    }

    // Laplace Creator Avatar & Follow Tag
    if (project.creatorBadge) {
      state.creatorBadge = { ...state.creatorBadge, ...project.creatorBadge };
      if (el.checkCreatorBadge) el.checkCreatorBadge.checked = !!state.creatorBadge.enabled;
      if (el.inputCreatorTag) el.inputCreatorTag.value = state.creatorBadge.text || "@lap_lac7";
      if (el.creatorBadgeInputGroup) {
        el.creatorBadgeInputGroup.classList.toggle("hidden", !state.creatorBadge.enabled);
      }
    }

    if (typeof syncElemVisibleToggle === "function") {
      syncElemVisibleToggle();
    }

    // 2. Metadata
    if (project.dayNumber !== undefined) {
      state.dayNumber = project.dayNumber;
      if (el.inputDay) el.inputDay.value = state.dayNumber;
    }
    if (project.seriesFormat) {
      state.seriesFormat = project.seriesFormat;
      if (el.inputSeriesText) el.inputSeriesText.value = state.seriesFormat;
    }
    if (project.songName) {
      state.songName = project.songName;
      if (el.inputSongName) el.inputSongName.value = state.songName;
    }
    if (project.animeName) {
      state.animeName = project.animeName;
      if (el.inputAnimeName) el.inputAnimeName.value = state.animeName;
    }

    // 3. Clip times
    if (project.startTime !== undefined) state.startTime = project.startTime;
    if (project.endTime !== undefined) state.endTime = project.endTime;
    if (project.isLooping !== undefined) {
      state.isLooping = project.isLooping;
      if (el.btnLoopClip) {
        el.btnLoopClip.classList.toggle("active", state.isLooping);
      }
    }

    // 4. Adjustments & Template
    if (project.activeTemplate) {
      state.activeTemplate = project.activeTemplate;
      await loadTemplate(project.activeTemplate);
    }
    if (project.adjustments) {
      state.adjustments = { ...state.adjustments, ...project.adjustments };
      syncAdjustmentSliders();
    }
    if (project.colorFilter) {
      state.colorFilter = project.colorFilter;
    }
    if (project.filterIntensity !== undefined) {
      state.filterIntensity = project.filterIntensity;
    }
    if (project.colorAdjustments) {
      state.colorAdjustments = { ...state.colorAdjustments, ...project.colorAdjustments };
    }
    syncAdjustmentDockSliders();

    // 5. Video File
    if (project.videoPath && !project.videoPath.startsWith("blob:")) {
      await loadFile(project.videoPath, project.videoTitle);

      // loadFile initializes helpful defaults for a new file; restore the saved
      // project values afterwards so refresh never changes its title or clip.
      state.dayNumber = project.dayNumber ?? state.dayNumber;
      state.seriesFormat = project.seriesFormat ?? state.seriesFormat;
      state.songName = project.songName ?? state.songName;
      state.animeName = project.animeName ?? state.animeName;
      state.startTime = project.startTime ?? state.startTime;
      state.endTime = project.endTime ?? state.endTime;
      if (el.inputDay) el.inputDay.value = state.dayNumber;
      if (el.inputSeriesText) el.inputSeriesText.value = state.seriesFormat;
      if (el.inputSongName) el.inputSongName.value = state.songName;
      if (el.inputAnimeName) el.inputAnimeName.value = state.animeName;
      if (el.inputStartTime) el.inputStartTime.value = state.startTime;
      if (el.inputEndTime) el.inputEndTime.value = state.endTime;
      if (el.hiddenVideo) el.hiddenVideo.currentTime = state.startTime;
      updateTimelineUI();
    }

    // 6. AI Analysis
    if (project.aiAnalysis && project.aiAnalysis.model_used === "Gemini AI" &&
        String(project.aiAnalysis.reason || "").includes("Run Gemini analysis for synchronized vocal alignment")) {
      project.aiAnalysis = getDefaultAIAnalysis((state.videoMeta && state.videoMeta.duration) || 90);
    }
    if (project.aiAnalysis) {
      state.aiAnalysis = project.aiAnalysis;
      state.activeMoment = project.activeMoment || "rec";
      renderAIResults(project.aiAnalysis, state.activeMoment);
    }

    // 7. Live Dual Subtitles
    if (project.lyrics && Array.isArray(project.lyrics)) {
      state.lyrics = project.lyrics;
      renderLyricsList(state.lyrics);
    }
    if (project.showLyrics !== undefined) {
      state.showLyrics = project.showLyrics;
      if (el.checkSubtitles) el.checkSubtitles.checked = state.showLyrics;
    }
    if (project.subtitleStyle) {
      const allowed = ["minimal", "bold_lyrics", "neon_glow", "retro_90s", "karaoke", "cinematic", "impact", "lofi_pastel", "jp_en", "anime"];
      state.subtitleStyle = allowed.includes(project.subtitleStyle) ? project.subtitleStyle : "minimal";
      const allStyleCards = document.querySelectorAll(".sub-style-card, .sub-style-btn");
      if (allStyleCards) {
        allStyleCards.forEach(b => {
          b.classList.toggle("active", b.dataset.style === state.subtitleStyle);
        });
      }
    }
    state.subtitleLanguage = project.subtitleLanguage || "both";
    if (el.subLangBtns) {
      el.subLangBtns.forEach(b => {
        b.classList.toggle("active", (b.dataset.lang || "both") === state.subtitleLanguage);
      });
    }

    // 8. Smart Seamless Loop
    if (project.smartLoop !== undefined) {
      state.smartLoop = project.smartLoop;
      if (el.checkSmartLoop) el.checkSmartLoop.checked = state.smartLoop;
      if (el.rowLoopMode) el.rowLoopMode.style.display = state.smartLoop ? "flex" : "none";
    }
    if (project.loopMode) {
      state.loopMode = project.loopMode;
      if (el.loopModeBtns) {
        el.loopModeBtns.forEach(b => {
          b.classList.toggle("active", b.dataset.mode === state.loopMode);
        });
      }
    }

    // 9. Black Screen Fade Transition
    if (project.fadeTransition) {
      state.fadeTransition = {
        mode: project.fadeTransition.mode || "none",
        duration: project.fadeTransition.duration || 0.50
      };
      const fadeModeBtns = document.querySelectorAll(".fade-mode-btn");
      const fadeDurBtns = document.querySelectorAll(".fade-dur-btn");
      const fadeDurContainer = document.getElementById("fade-duration-container");
      const fadeDurLabel = document.getElementById("fade-duration-label");
      if (fadeModeBtns) {
        fadeModeBtns.forEach(b => {
          b.classList.toggle("active", (b.dataset.fade || "none") === state.fadeTransition.mode);
        });
      }
      if (fadeDurContainer) {
        fadeDurContainer.classList.toggle("hidden", state.fadeTransition.mode === "none");
      }
      if (fadeDurBtns) {
        fadeDurBtns.forEach(b => {
          b.classList.toggle("active", Math.abs(parseFloat(b.dataset.dur) - state.fadeTransition.duration) < 0.01);
        });
      }
      if (fadeDurLabel) {
        fadeDurLabel.textContent = `${state.fadeTransition.duration.toFixed(2)}s`;
      }
    }

    updateTimelineUI();
    if (project.videoPath) {
      showToast("Restored your previous project session");
    }
    // loadFile saves its new-file defaults. Save once more after every saved
    // field is restored so the next refresh retains this exact project.
    saveProjectState();
  } catch (e) {
    console.warn("Could not restore project state:", e);
  }
}

async function loadHistory() {
  try {
    const res = await fetch("/api/history");
    const list = await res.json();
    if (!list || list.length === 0) {
      el.historyList.innerHTML = '<p class="empty-state">No reels exported yet. Create your first reel!</p>';
      return;
    }

    el.historyList.innerHTML = list.map(item => `
      <div class="history-item">
        <div>
          <strong style="color:#fff;">Day ${item.day} · ${item.song} (${item.anime})</strong>
          <div style="font-size:11px;color:var(--text-muted)">${item.template} · ${item.duration} · ${item.created_date}</div>
        </div>
        <div style="font-size:11px;color:var(--neon-cyan);font-weight:700;">${item.export_location.split(/[\\/]/).pop()}</div>
      </div>
    `).join("");
  } catch (e) {}
}

async function loadTemplatesCatalog() {
  try {
    const res = await fetch("/api/templates");
    const tpls = await res.json();
    el.templatesCatalog.innerHTML = tpls.map(t => `
      <div class="card" style="padding:16px;margin-bottom:12px;border-left:4px solid var(--neon-purple);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <h3 style="font-size:16px;color:#fff;font-family:var(--font-heading);">${t.name}</h3>
          <span class="badge-template">${t.id}</span>
        </div>
        <p style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;">${t.description || ''}</p>
        <button class="btn btn-sm btn-purple" onclick="applyAndSwitchTemplate('${t.id}')">Use Template</button>
      </div>
    `).join("");
  } catch (e) {}
}

window.applyAndSwitchTemplate = (tplId) => {
  loadTemplate(tplId);
  document.querySelector('.nav-tab[data-view="studio"]').click();
};

function showToast(msg) {
  el.toastMsg.textContent = msg;
  el.toast.classList.remove("hidden");
  setTimeout(() => {
    el.toast.classList.add("hidden");
  }, 3000);
}


// -------------------------------------------------------------
// INSTAGRAM SCHEDULE STATION
// -------------------------------------------------------------
let _scheduleRefreshInterval = null;

async function loadScheduleView() {
  await Promise.all([
    loadScheduleStats(),
    loadScheduleQueue(),
    loadExportedReels(),
    loadIgSettings(),
  ]);

  // Start auto-refresh every 15 seconds when schedule view is active
  if (_scheduleRefreshInterval) clearInterval(_scheduleRefreshInterval);
  _scheduleRefreshInterval = setInterval(() => {
    const schedView = document.getElementById("view-schedule");
    if (schedView && schedView.classList.contains("active")) {
      loadScheduleStats();
      loadScheduleQueue();
    } else {
      clearInterval(_scheduleRefreshInterval);
      _scheduleRefreshInterval = null;
    }
  }, 15000);
}

async function loadScheduleStats() {
  try {
    const res = await fetch("/api/schedule/stats");
    const stats = await res.json();

    if (el.statPending) el.statPending.textContent = stats.pending || 0;
    if (el.statPosting) el.statPosting.textContent = stats.posting || 0;
    if (el.statPosted) el.statPosted.textContent = stats.posted || 0;
    if (el.statFailed) el.statFailed.textContent = stats.failed || 0;

    if (el.schedStatusDot && el.schedStatusText) {
      if (stats.scheduler_running) {
        el.schedStatusDot.className = "sched-status-dot sched-dot-active";
        el.schedStatusText.textContent = "Scheduler Active";
        el.schedStatusText.style.color = "var(--neon-emerald)";
      } else {
        el.schedStatusDot.className = "sched-status-dot sched-dot-inactive";
        el.schedStatusText.textContent = "Scheduler Paused";
        el.schedStatusText.style.color = "var(--text-muted)";
      }
    }
  } catch (e) {
    console.warn("Failed to load schedule stats:", e);
  }
}

async function loadExportedReels() {
  try {
    const res = await fetch("/api/schedule/exports");
    const reels = await res.json();

    if (!el.schedReelSelect) return;

    if (!reels || reels.length === 0) {
      el.schedReelSelect.innerHTML = '<option value="">— No exported reels found —</option>';
      return;
    }

    el.schedReelSelect.innerHTML = '<option value="">— Select a reel to schedule —</option>' +
      reels.map(r => `<option value="${r.file_path}">${r.file_name} (${r.file_size_mb} MB · ${r.modified})</option>`).join("");
  } catch (e) {
    console.warn("Failed to load exported reels:", e);
    if (el.schedReelSelect) {
      el.schedReelSelect.innerHTML = '<option value="">— Error loading reels —</option>';
    }
  }
}

async function loadScheduleQueue() {
  try {
    const res = await fetch("/api/schedule");
    const queue = await res.json();

    if (!el.schedQueueList) return;

    if (el.schedQueueCount) {
      el.schedQueueCount.textContent = `${queue.length} item${queue.length !== 1 ? "s" : ""}`;
    }

    if (!queue || queue.length === 0) {
      el.schedQueueList.innerHTML = '<p class="empty-state">No reels scheduled yet. Add your first reel above!</p>';
      return;
    }

    // Sort: pending/posting first, then by scheduled_time
    const statusOrder = { posting: 0, pending: 1, failed: 2, cancelled: 3, posted: 4 };
    queue.sort((a, b) => {
      const sa = statusOrder[a.status] ?? 5;
      const sb = statusOrder[b.status] ?? 5;
      if (sa !== sb) return sa - sb;
      return new Date(a.scheduled_time) - new Date(b.scheduled_time);
    });

    el.schedQueueList.innerHTML = queue.map(item => {
      const schedDate = new Date(item.scheduled_time);
      const dateStr = schedDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      const timeStr = schedDate.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
      const badgeClass = `sched-badge-${item.status}`;
      const statusLabel = item.status.charAt(0).toUpperCase() + item.status.slice(1);

      let errorHtml = "";
      if (item.error_message) {
        errorHtml = `<div class="sched-queue-item-error">⚠️ ${escapeHtml(item.error_message)}</div>`;
      }

      let captionHtml = "";
      if (item.caption) {
        captionHtml = `<div class="sched-queue-caption">"${escapeHtml(item.caption.substring(0, 100))}${item.caption.length > 100 ? "..." : ""}"</div>`;
      }

      let actionsHtml = "";
      if (item.status === "pending") {
        actionsHtml = `<div class="sched-queue-item-actions">
          <button class="btn btn-sm" onclick="schedCancelItem('${item.id}')">❌ Cancel</button>
          <button class="btn btn-sm" onclick="schedDeleteItem('${item.id}')" style="color:#ef4444;">🗑 Delete</button>
        </div>`;
      } else if (item.status === "failed" || item.status === "cancelled") {
        actionsHtml = `<div class="sched-queue-item-actions">
          <button class="btn btn-sm btn-cyan" onclick="schedRetryItem('${item.id}')">🔄 Retry</button>
          <button class="btn btn-sm" onclick="schedDeleteItem('${item.id}')" style="color:#ef4444;">🗑 Delete</button>
        </div>`;
      } else if (item.status === "posted") {
        actionsHtml = `<div class="sched-queue-item-actions">
          <button class="btn btn-sm" onclick="schedDeleteItem('${item.id}')" style="color:#ef4444;">🗑 Remove</button>
        </div>`;
      }

      return `<div class="sched-queue-item">
        <div class="sched-queue-item-header">
          <span class="sched-queue-item-name">🎬 ${escapeHtml(item.file_name)}</span>
          <span class="sched-queue-item-badge ${badgeClass}">${statusLabel}</span>
        </div>
        <div class="sched-queue-item-meta">
          <span>📅 ${dateStr}</span>
          <span>⏰ ${timeStr}</span>
          <span>📦 ${item.file_size_mb} MB</span>
        </div>
        ${captionHtml}
        ${errorHtml}
        ${actionsHtml}
      </div>`;
    }).join("");

  } catch (e) {
    console.warn("Failed to load schedule queue:", e);
  }
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

async function loadIgSettings() {
  try {
    const res = await fetch("/api/settings");
    const s = await res.json();
    if (el.igStatusMsg) {
      if (s.has_instagram_token) {
        el.igStatusMsg.innerHTML = '<span style="color:var(--neon-emerald);font-weight:700;">✓ Connected</span> — Instagram API token configured.';
      } else {
        el.igStatusMsg.textContent = "Required for auto-posting. Get from Facebook Developer Portal.";
      }
    }
    if (el.igUserId && s.instagram_user_id) {
      el.igUserId.value = s.instagram_user_id;
    }
    if (el.igVideoBaseUrl && s.instagram_video_base_url) {
      el.igVideoBaseUrl.value = s.instagram_video_base_url;
    }
  } catch (e) {}
}

function setupSchedule() {
  // Set default datetime to now + 1 hour
  if (el.schedDatetime) {
    const now = new Date();
    now.setHours(now.getHours() + 1);
    now.setMinutes(0, 0, 0);
    const pad = n => String(n).padStart(2, "0");
    const defaultDt = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    el.schedDatetime.value = defaultDt;
    el.schedDatetime.min = new Date().toISOString().slice(0, 16);
  }

  // Refresh exports button
  if (el.btnSchedRefresh) {
    el.btnSchedRefresh.addEventListener("click", () => {
      loadExportedReels();
      showToast("Refreshed exported reels list");
    });
  }

  // Add to schedule button
  if (el.btnSchedAdd) {
    el.btnSchedAdd.addEventListener("click", async () => {
      const filePath = el.schedReelSelect ? el.schedReelSelect.value : "";
      const scheduledTime = el.schedDatetime ? el.schedDatetime.value : "";
      const caption = el.schedCaption ? el.schedCaption.value : "";
      const hashtags = el.schedHashtags ? el.schedHashtags.value : "";

      if (!filePath) {
        showToast("Please select a reel to schedule");
        return;
      }
      if (!scheduledTime) {
        showToast("Please set a date and time");
        return;
      }

      // Convert local datetime-local to ISO 8601 with timezone
      const dt = new Date(scheduledTime);
      if (dt <= new Date()) {
        showToast("Scheduled time must be in the future");
        return;
      }

      try {
        const res = await fetch("/api/schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            file_path: filePath,
            scheduled_time: dt.toISOString(),
            caption: caption,
            hashtags: hashtags,
          })
        });
        const data = await res.json();
        if (res.ok) {
          showToast("🎉 Reel added to schedule queue!");
          // Reset form
          if (el.schedCaption) el.schedCaption.value = "";
          if (el.schedHashtags) el.schedHashtags.value = "";
          // Refresh queue
          await loadScheduleQueue();
          await loadScheduleStats();
        } else {
          showToast(`Error: ${data.detail || "Failed to schedule"}`);
        }
      } catch (e) {
        showToast("Failed to add to schedule: " + e.message);
      }
    });
  }

  // Save Instagram settings
  if (el.btnSaveIg) {
    el.btnSaveIg.addEventListener("click", async () => {
      const token = el.igAccessToken ? el.igAccessToken.value.trim() : "";
      const userId = el.igUserId ? el.igUserId.value.trim() : "";
      const baseUrl = el.igVideoBaseUrl ? el.igVideoBaseUrl.value.trim() : "";

      const payload = {};
      if (token) payload.instagram_access_token = token;
      if (userId) payload.instagram_user_id = userId;
      if (baseUrl) payload.instagram_video_base_url = baseUrl;

      try {
        await fetch("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        showToast("Instagram settings saved!");
        await loadIgSettings();
      } catch (e) {
        showToast("Failed to save Instagram settings");
      }
    });
  }
}

// Global actions for schedule queue buttons
window.schedCancelItem = async (itemId) => {
  try {
    await fetch(`/api/schedule/${itemId}/cancel`, { method: "POST" });
    showToast("Schedule item cancelled");
    await loadScheduleQueue();
    await loadScheduleStats();
  } catch (e) {
    showToast("Failed to cancel item");
  }
};

window.schedRetryItem = async (itemId) => {
  try {
    await fetch(`/api/schedule/${itemId}/retry`, { method: "POST" });
    showToast("Retrying scheduled item...");
    await loadScheduleQueue();
    await loadScheduleStats();
  } catch (e) {
    showToast("Failed to retry item");
  }
};

window.schedDeleteItem = async (itemId) => {
  if (!confirm("Delete this schedule item permanently?")) return;
  try {
    await fetch(`/api/schedule/${itemId}`, { method: "DELETE" });
    showToast("Schedule item deleted");
    await loadScheduleQueue();
    await loadScheduleStats();
  } catch (e) {
    showToast("Failed to delete item");
  }
};

// -------------------------------------------------------------
// INITIALIZATION
// -------------------------------------------------------------
window.addEventListener("DOMContentLoaded", async () => {
  setupFitView();
  setupTimeline();
  setupYouTubeDownloader();
  setupFileHandling();
  setupMetadataAndAI();
  setupTextCanvasInteraction();
  setupTemplatesAndSliders();
  setupVideoFilters();
  setupVideoAdjustments();
  setupExport();
  setupSettingsAndNav();

  setupSchedule();
  await loadTemplate("cinematic");
  startRenderLoop();
  await restoreProjectState();
});
