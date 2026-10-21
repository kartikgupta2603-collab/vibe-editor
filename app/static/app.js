/**
 * Vibe Editor - Studio Engine
 */

// Application State
const state = {
  videoFile: null,
  music: null,
  reelName: "",
  videoAudio: null,
  sourceGeneration: 0,
  _uploadPromise: null,
  videoPath: "",
  imageSourcePath: "",
  imageDuration: null,
  videoTitle: "",
  videoMeta: null,
  isPlaying: false,
  currentTime: 0.0,
  startTime: 0.0,
  endTime: 35.0,
  aspectRatio: "9:16",
  dayNumber: 1,
  seriesFormat: "POV: That one anime opening you will NEVER skip ⚡",
  hookFont: "arial_black",
  hookStyle: "outlined",
  // start=0 keeps the hook visible for the full selected clip.
  hookFade: { start: 0 },
  aiInstruction: "",
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
    bgType: "black",
    blur: 35,
    brightness: -0.25,
    scale: 1.0,
    windowInset: 0,
    verticalOffset: 0,
    radius: 12,
    curvedBorder: true,
    borderShape: "curved",
    waveform: false
  },
  colorFilter: "original",
  hideRegions: [],
  hideAreaDrawing: false,
  hideAreaDraft: null,
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
  subtitleFont: "segoe",
  subtitleAnimation: "auto",
  subtitleLanguage: "both",
  smartLoop: true,
  loopMode: "circular",
  loopFadeDuration: 0.35,
  audioMaster: {
    enabled: false
  },
  playbackAudio: "original",
  fadeTransition: {
    mode: "none", // 'none', 'in', 'out', 'both'
    duration: 0.50
  },
  timelineZoom: 1.0,
  watermark: {
    enabled: false,
    text: "lap_lac7",
    style: "clean",
    font: "bahnschrift",
    rotation: 90
  },
  creatorBadge: {
    enabled: false,
    text: "@Lap_lac7"
  },
  textElements: {
    series: { x: 540, y: 360, size: 68, lineGap: 16, color: "#ffffff" },
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
  navTabs: document.querySelectorAll(".nav-tab[data-view]"),
  tabContents: document.querySelectorAll(".panel-tab-content"),
  studioWelcome: document.getElementById("studio-welcome"),
  btnExportQuick: document.getElementById("btn-export-quick"),
  btnExportQuickText: document.getElementById("btn-export-quick-text"),
  btnExportMain: document.getElementById("btn-export-main"),
  btnExportMainText: document.getElementById("btn-export-main-text"),
  btnResetSession: document.getElementById("btn-reset-session"),
  
  // File & Source Selector Tabs
  tabSrcLocal: document.getElementById("tab-src-local"),
  tabSrcYt: document.getElementById("tab-src-yt"),
  tabSrcIg: document.getElementById("tab-src-ig"),
  panelSrcLocal: document.getElementById("panel-src-local"),
  panelSrcYt: document.getElementById("panel-src-yt"),
  panelSrcIg: document.getElementById("panel-src-ig"),
  btnLocalImage: document.getElementById("btn-upload-local-image"),
  inputLocalImage: document.getElementById("input-local-image"),

  // YouTube Downloader
  inputYtUrl: document.getElementById("input-yt-url"),
  btnYtDownload: document.getElementById("btn-yt-download"),
  btnYtText: document.getElementById("btn-yt-text"),
  imageDurationRow: document.getElementById("image-duration-row"),
  trimNudgeStart: document.getElementById("trim-nudge-start"),
  trimNudgeEnd: document.getElementById("trim-nudge-end"),
  ytProgressBox: document.getElementById("yt-progress-box"),
  ytProgressBar: document.getElementById("yt-progress-bar"),
  ytProgressLabel: document.getElementById("yt-progress-label"),
  ytProgressPercent: document.getElementById("yt-progress-percent"),

  // Instagram Downloader
  inputIgUrl: document.getElementById("input-ig-url"),
  btnIgDownload: document.getElementById("btn-ig-download"),
  btnIgText: document.getElementById("btn-ig-text"),
  igProgressBox: document.getElementById("ig-progress-box"),
  igProgressBar: document.getElementById("ig-progress-bar"),
  igProgressLabel: document.getElementById("ig-progress-label"),
  igProgressPercent: document.getElementById("ig-progress-percent"),

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
  selectHookFont: document.getElementById("select-hook-font"),
  selectHookStyle: document.getElementById("select-hook-style"),
  sliderHookFadeStart: document.getElementById("slider-hook-fade-start"),
  valHookFadeStart: document.getElementById("val-hook-fade-start"),
  selectSubtitleFont: document.getElementById("select-subtitle-font"),
  hookEmojiButtons: document.querySelectorAll("[data-hook-emoji]"),
  btnGenerateAiHooks: document.getElementById("btn-generate-ai-hooks"),
  inputAiInstruction: document.getElementById("input-ai-instruction"),
  aiHooksContainer: document.getElementById("ai-hooks-container"),
  btnGenerateAiCaption: document.getElementById("btn-generate-ai-caption"),
  aiCaptionBox: document.getElementById("ai-caption-box"),
  aiCaptionOutput: document.getElementById("ai-caption-output"),
  aiCaptionStatus: document.getElementById("ai-caption-status"),
  btnCopyAiCaption: document.getElementById("btn-copy-ai-caption"),
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
  hookLineGapRow: document.getElementById("hook-line-gap-row"),
  sliderHookLineGap: document.getElementById("slider-hook-line-gap"),
  valHookLineGap: document.getElementById("val-hook-line-gap"),
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
  activeTplBadge: document.getElementById("active-template-badge"),
  sliderBlur: document.getElementById("slider-blur"),
  sliderDim: document.getElementById("slider-dim"),
  sliderScale: document.getElementById("slider-scale"),
  sliderWindowInset: document.getElementById("slider-window-inset"),
  sliderSongWindowY: document.getElementById("slider-song-window-y"),
  sliderRadius: document.getElementById("slider-radius"),
  checkWaveform: document.getElementById("check-waveform"),
  checkSmartLoop: document.getElementById("check-smart-loop"),
  rowLoopMode: document.getElementById("row-loop-mode"),
  loopModeBtns: document.querySelectorAll(".loop-mode-btn"),
  checkAudioMaster: document.getElementById("check-audio-master"),
  btnPlaybackOriginal: document.getElementById("btn-playback-original"),
  btnPlaybackEnhanced: document.getElementById("btn-playback-enhanced"),
  audioMasterPlayer: document.getElementById("audio-master-player"),
  audioMasterStatus: document.getElementById("audio-master-status"),
  bgModeBtns: document.querySelectorAll(".bg-mode-btn"),
  borderModeBtns: document.querySelectorAll(".border-mode-btn"),
  rowCornerRadius: document.getElementById("row-corner-radius"),
  rowBgBlur: document.getElementById("row-bg-blur"),
  rowBgDim: document.getElementById("row-bg-dim"),
  valBlur: document.getElementById("val-blur"),
  valDim: document.getElementById("val-dim"),
  valScale: document.getElementById("val-scale"),
  valWindowInset: document.getElementById("val-window-inset"),
  valSongWindowY: document.getElementById("val-song-window-y"),
  valRadius: document.getElementById("val-radius"),

  // Viewport, Studio Monitor & Timeline
  dockFilters: document.getElementById("dock-filters"),
  dockAdjustments: document.getElementById("dock-adjustments"),
  reelStyleCard: document.getElementById("reel-style-card"),
  studioEditWorkspace: document.querySelector(".studio-edit-workspace"),
  workspaceFilterSlot: document.getElementById("workspace-filter-slot"),
  workspaceReelStyleSlot: document.getElementById("workspace-reel-style-slot"),
  reelStyleStageDock: document.getElementById("reel-style-stage-dock"),
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
  btnCenterFitVideo: document.getElementById("btn-center-fit-video"),
  hiddenVideo: document.getElementById("hidden-video"),
  reelCanvas: document.getElementById("reel-canvas"),
  btnPlayPause: document.getElementById("btn-play-pause"),
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

  // Settings
  settingsKey: document.getElementById("settings-gemini-key"),
  btnSaveKey: document.getElementById("btn-save-key"),
  settingsExportDir: document.getElementById("settings-export-dir"),
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
  },
  intel_custom: {
    id: "intel_custom",
    name: "Custom RGB",
    thumbGrad: "linear-gradient(135deg, #45464d, #b6bcc7, #f0f0f0)",
    description: "Software approximation inspired by your Intel recording. Use Intel original colors when judging the preview."
  }
};

function computeVideoFilterCss() {
  const fId = state.colorFilter || "original";
  if (fId === "intel_custom" && window.VibeColorProfiles?.isAvailable(fId)) {
    return window.VibeColorProfiles.filterCss(fId,
      state.filterIntensity !== undefined ? state.filterIntensity : 100, state.colorAdjustments || {});
  }
  const f = VIDEO_FILTERS[fId] || VIDEO_FILTERS.original;
  const intensity = Math.max(0, Math.min(400, Number(state.filterIntensity ?? 100) || 0)) / 100;
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
// The blurred backdrop is intentionally soft, so rendering it at full export
// resolution on every playback frame only makes controls lag. Keep a small
// cached copy for the monitor; the final FFmpeg export is unchanged.
const blurPreviewCanvas = document.createElement("canvas");
const blurPreviewCtx = blurPreviewCanvas.getContext("2d", { alpha: false });
const PREVIEW_BLUR_SCALE = 0.20;
const PREVIEW_BLUR_FPS = 24;
let lastBlurPreviewFrameAt = -Infinity;

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

const SUBTITLE_STYLE_DEFAULT_COLORS = Object.freeze({
  minimal: "#ffffff",
  bold_lyrics: "#ffffff",
  pop_bounce: "#ffffff",
  neon_glow: "#00f0ff",
  retro_90s: "#ffde00",
  manga_flash: "#ffe600",
  karaoke: "#ffe600",
  cinematic: "#fbfbfb",
  impact: "#ffe600",
  lofi_pastel: "#f5f5dc",
  jp_en: "#ffffff",
  anime: "#f9a8d4",
  white_on_black: "#ffffff"
});

function applySubtitleStyle(styleKey, reason = "") {
  const allowed = ["minimal", "bold_lyrics", "pop_bounce", "neon_glow", "retro_90s", "manga_flash", "karaoke", "cinematic", "impact", "lofi_pastel", "white_on_black", "jp_en", "anime"];
  const targetStyle = allowed.includes(styleKey) ? styleKey : "minimal";
  state.subtitleStyle = targetStyle;
  if (state.textElements && state.textElements.subtitles) {
    // Choosing a preset must visibly restore that preset. The color picker can
    // still change this afterwards if the creator wants a custom color.
    state.textElements.subtitles.color = SUBTITLE_STYLE_DEFAULT_COLORS[targetStyle];
  }
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

function refreshBlurPreviewBackground(videoSource, rawW, rawH, vidAspect, blurPx, brightVal, force = false) {
  if (!videoSource || !rawW || !rawH) return false;
  const now = (typeof performance !== "undefined" && typeof performance.now === "function")
    ? performance.now()
    : Date.now();
  const interval = 1000 / PREVIEW_BLUR_FPS;
  if (!force && blurPreviewCanvas.width > 0 && now - lastBlurPreviewFrameAt < interval) return true;

  const lowW = Math.round(1080 * PREVIEW_BLUR_SCALE);
  const lowH = Math.round(1920 * PREVIEW_BLUR_SCALE);
  if (blurPreviewCanvas.width !== lowW || blurPreviewCanvas.height !== lowH) {
    blurPreviewCanvas.width = lowW;
    blurPreviewCanvas.height = lowH;
  }

  const lowCanvasAspect = lowW / lowH;
  let drawW, drawH, drawX, drawY;
  if (vidAspect > lowCanvasAspect) {
    drawH = lowH * 1.25;
    drawW = drawH * vidAspect;
    drawX = (lowW - drawW) / 2;
    drawY = (lowH - drawH) / 2;
  } else {
    drawW = lowW * 1.25;
    drawH = drawW / vidAspect;
    drawX = (lowW - drawW) / 2;
    drawY = (lowH - drawH) / 2;
  }

  try {
    blurPreviewCtx.setTransform(1, 0, 0, 1, 0, 0);
    blurPreviewCtx.fillStyle = "#080b15";
    blurPreviewCtx.fillRect(0, 0, lowW, lowH);
    const scaledBlurPx = Math.max(3, Math.round(blurPx * PREVIEW_BLUR_SCALE));
    blurPreviewCtx.filter = `blur(${scaledBlurPx}px) brightness(${brightVal}) contrast(1.1) saturate(1)`;
    blurPreviewCtx.drawImage(videoSource, 0, 0, rawW, rawH, drawX, drawY, drawW, drawH);
    blurPreviewCtx.filter = "none";
    lastBlurPreviewFrameAt = now;
    return true;
  } catch (_) {
    blurPreviewCtx.filter = "none";
    return false;
  }
}

// -------------------------------------------------------------
// VIEWPORT MONITOR CONTROLS
// -------------------------------------------------------------
function setupFitView() {
  let isFillMode = false;
  if (el.btnCenterFitVideo) {
    el.btnCenterFitVideo.addEventListener("click", () => {
      centerVideoFrame();
      showToast("Full video fitted and centered.");
    });
  }
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
  // Keep playback responsive while giving text fades enough samples to look smooth.
  const previewFrameInterval = 1000 / 30;
  function draw(now) {
    // All paused edits explicitly call renderReel(). Do not redraw a full
    // blurred 9:16 composition every frame while the creator uses the UI.
    if (state.isPlaying && now - lastDraw >= previewFrameInterval) {
      try {
        renderReel();
      } catch (err) {
        console.error("renderReel error:", err);
      }
      lastDraw = now;
    }
    if (window.musicStudio) window.musicStudio.syncPreview();
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
}

let subtitleCueCache = { source: null, cues: [] };
let lastActiveSubtitleListIndex = -1;

function findActiveSubtitleCue(cues, currentTime) {
  if (subtitleCueCache.source !== cues) {
    subtitleCueCache = {
      source: cues,
      cues: cues
        .map((cue, index) => ({ cue, index, start: Number(cue.start), end: Number(cue.end) }))
        .filter(item => Number.isFinite(item.start) && Number.isFinite(item.end) && item.end > item.start)
        .sort((a, b) => a.start - b.start)
    };
    let furthestEnd = -Infinity;
    subtitleCueCache.cues.forEach(item => {
      furthestEnd = Math.max(furthestEnd, item.end);
      item.furthestEnd = furthestEnd;
    });
    lastActiveSubtitleListIndex = -1;
  }

  const ordered = subtitleCueCache.cues;
  let low = 0;
  let high = ordered.length - 1;
  let candidate = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (ordered[middle].start <= currentTime) {
      candidate = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  if (candidate < 0) return null;
  // A short overlapping cue can end before the earlier sung phrase. The
  // prefix end bound avoids scanning unrelated earlier cues on every frame.
  for (let index = candidate; index >= 0 && ordered[index].furthestEnd + 0.05 >= currentTime; index -= 1) {
    if (currentTime <= ordered[index].end + 0.05) return ordered[index];
  }
  return null;
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
  // Keep a normal sung phrase together. Splitting it too early creates a tall,
  // awkward subtitle block with Japanese and English both stacked several rows.
  const maxChars = hasJpChars ? 34 : 68;
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
    state.textElements.series = { ...state.textElements.series, color: "#ffffff" };
    state.textElements.song = { ...state.textElements.song, color: "#ffffff" };
    state.textElements.anime = { ...state.textElements.anime, color: "#ffffff" };
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

const SUBTITLE_ANIMATION_OPTIONS = Object.freeze(["auto", "fade", "pop", "rise", "slide", "none"]);

function resolveSubtitleAnimation(stylePreset, requestedAnimation = "auto") {
  const requested = SUBTITLE_ANIMATION_OPTIONS.includes(requestedAnimation) ? requestedAnimation : "auto";
  if (requested !== "auto") return requested;
  return "fade";
}

function syncSubtitleAnimation() {
  // Studio uses the same quiet transition for every visual subtitle style.
  state.subtitleAnimation = "auto";
}

function subtitleFadeOpacity(elapsed, duration, playing = true) {
  if (!playing || duration <= 0) return 1;
  const fadeIn = Math.min(0.12, duration / 4);
  const fadeOut = Math.min(0.13, duration / 4);
  return Math.max(0, Math.min(1, elapsed / fadeIn, (duration - elapsed) / fadeOut));
}

function renderDualSubtitles(ctx, jpRaw, enRaw, elapsed, totalDur, stylePreset, canvasWidth, canvasHeight, activeLine = null, requestedAnimation = "auto") {
  const englishSubtitleScale = 1.12;
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

  if (stylePreset === "bold_lyrics" || stylePreset === "pop_bounce" || stylePreset === "manga_flash" || stylePreset === "impact") {
    enLines = enLines.map(l => l.toUpperCase());
  }
  if (stylePreset === "lofi_pastel") {
    enLines = enLines.map(l => l.toLowerCase());
  }

  const animationPreset = typeof resolveSubtitleAnimation === "function"
    ? resolveSubtitleAnimation(stylePreset, requestedAnimation)
    : (requestedAnimation === "auto" ? "fade" : requestedAnimation);
  const animationDuration = animationPreset === "pop" ? 0.18 : 0.20;
  const animationProgress = Math.max(0, Math.min(1, elapsed / animationDuration));
  const easedAnimationProgress = 1 - Math.pow(1 - animationProgress, 3);

  // Match ASS's linear fade; no minimum opacity that makes line changes jump.
  const alpha = animationPreset === "none" ? 1 : subtitleFadeOpacity(elapsed, totalDur, state.isPlaying);
  const subtitleEntryScale = animationPreset === "pop" ? 1.15 - (0.15 * easedAnimationProgress) : 1;
  const subtitleEntryOffsetY = animationPreset === "rise" ? (1 - easedAnimationProgress) * 26 : 0;
  const subtitleEntryOffsetX = animationPreset === "slide" ? (1 - easedAnimationProgress) * 42 : 0;

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
    } else if (stylePreset === "manga_flash" || stylePreset === "impact") {
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
  if (stylePreset === "jp_en") {
    enFill = isWhiteBg ? "#0369a1" : "#7dd3fc";
  } else if (stylePreset === "anime") {
    jpFill = isWhiteBg ? "#7e22ce" : "#f9a8d4";
    enFill = isWhiteBg ? "#0369a1" : "#a5f3fc";
  }
  if (stylePreset === "white_on_black") {
    jpFill = "#ffffff";
    enFill = "#ffffff";
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
  } else if (stylePreset === "pop_bounce") {
    jpFont = "900 44px 'Cabinet Grotesk', 'Noto Sans JP', sans-serif";
    jpStroke = isWhiteBg ? "rgba(15, 23, 42, 0.12)" : "#000000";
    jpLineWidth = isWhiteBg ? 1.0 : 8.0;
    jpH = 54;
    enFont = "900 29px 'Cabinet Grotesk', 'Plus Jakarta Sans', sans-serif";
    enStroke = isWhiteBg ? "rgba(15, 23, 42, 0.12)" : "#000000";
    enLineWidth = isWhiteBg ? 1.0 : 6.0;
    enH = 40;
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
  } else if (stylePreset === "manga_flash") {
    jpFont = "900 44px 'Cabinet Grotesk', 'Noto Sans JP', sans-serif";
    jpStroke = isWhiteBg ? "rgba(100, 80, 0, 0.2)" : "#000000";
    jpLineWidth = isWhiteBg ? 1.5 : 8.0;
    jpH = 54;
    enFont = "900 27px 'Cabinet Grotesk', 'Plus Jakarta Sans', sans-serif";
    enStroke = isWhiteBg ? "rgba(100, 80, 0, 0.2)" : "#000000";
    enLineWidth = isWhiteBg ? 1.0 : 6.0;
    enH = 38;
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
  } else if (stylePreset === "white_on_black") {
    jpFont = "800 40px 'Noto Sans JP', 'Plus Jakarta Sans', sans-serif";
    jpStroke = null;
    jpLineWidth = 0;
    jpH = 50;
    enFont = "800 24px 'Plus Jakarta Sans', sans-serif";
    enStroke = null;
    enLineWidth = 0;
    enH = 34;
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
  // Two rows (Japanese + English) are ideal. If a genuinely long phrase still
  // needs more rows, compact that one cue instead of letting it take over the reel.
  const layoutLineCount = jpLines.length + enLines.length;
  const compactScale = layoutLineCount > 2
    ? Math.max(0.72, 1 - (layoutLineCount - 2) * 0.12)
    : 1;
  // This preset intentionally matches the classic serif reference, regardless
  // of the normal subtitle font selected for the other presets.
  const selectedSubtitleFont = stylePreset === "white_on_black"
    ? getFontStack("georgia", "segoe")
    : getFontStack(state.subtitleFont, "segoe");
  const englishWeightAndSize = enFont.match(/^(\d+\s+[\d.]+px)/);
  enFont = `${englishWeightAndSize ? englishWeightAndSize[1] : "700 26px"} ${selectedSubtitleFont}`;
  const appliedSubtitleScale = subtitleScale * compactScale;
  const subtitleCenterX = subtitleLayout.x ?? canvasWidth / 2;
  jpFont = jpFont.replace(/([\d.]+)px/, (_, size) => `${Number(size) * appliedSubtitleScale}px`);
  enFont = enFont.replace(/([\d.]+)px/, (_, size) => `${Number(size) * appliedSubtitleScale * englishSubtitleScale}px`);
  jpH *= appliedSubtitleScale;
  enH *= appliedSubtitleScale * englishSubtitleScale;
  jpLineWidth *= appliedSubtitleScale;
  enLineWidth *= appliedSubtitleScale * englishSubtitleScale;

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
  const subGap = 20 * appliedSubtitleScale;
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
  // Sweep across each confirmed sung phrase. Exact audio-aligned word timings
  // naturally follow the same progress; phrase-only cues still get a clean,
  // readable karaoke effect rather than becoming a static yellow subtitle.
  const karaokeProgress = stylePreset === "karaoke"
    ? Math.max(0, Math.min(1, elapsed / Math.max(0.1, totalDur)))
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
        scale = Math.max(0.68, (canvasWidth - 100) / lineW);
      }
      ctx.save();
      ctx.translate(subtitleCenterX + subtitleEntryOffsetX, lineY + subtitleEntryOffsetY);
      if (scale < 1 || subtitleEntryScale !== 1) ctx.scale(scale * subtitleEntryScale, scale * subtitleEntryScale);
      if (stylePreset === "white_on_black") {
        const barPadX = 16;
        const barPadY = 8;
        ctx.save();
        ctx.shadowColor = "transparent";
        ctx.fillStyle = "#000000";
        ctx.fillRect(-lineW / 2 - barPadX, -jpH / 2 - barPadY, lineW + barPadX * 2, jpH + barPadY * 2);
        ctx.restore();
      }
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
        scale = Math.max(0.68, (canvasWidth - 100) / lineW);
      }
      ctx.save();
      ctx.translate(subtitleCenterX + subtitleEntryOffsetX, lineY + subtitleEntryOffsetY);
      if (scale < 1 || subtitleEntryScale !== 1) ctx.scale(scale * subtitleEntryScale, scale * subtitleEntryScale);
      if (stylePreset === "white_on_black") {
        const barPadX = 16;
        const barPadY = 8;
        ctx.save();
        ctx.shadowColor = "transparent";
        ctx.fillStyle = "#000000";
        ctx.fillRect(-lineW / 2 - barPadX, -enH / 2 - barPadY, lineW + barPadX * 2, enH + barPadY * 2);
        ctx.restore();
      }
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

const FONT_STACKS = Object.freeze({
  impact: "Impact, 'Arial Black', sans-serif",
  arial_black: "'Arial Black', Arial, sans-serif",
  bahnschrift: "Bahnschrift, 'Arial Narrow', Arial, sans-serif",
  segoe: "'Segoe UI', Arial, sans-serif",
  franklin_heavy: "'Franklin Gothic Heavy', 'Arial Black', sans-serif",
  oswald: "'Vibe Oswald', Oswald, 'Arial Narrow', Arial, sans-serif",
  cooper_black: "'Cooper Black', 'Arial Black', serif",
  georgia: "Georgia, 'Times New Roman', serif",
  segoe_print: "'Segoe Print', 'Bradley Hand ITC', cursive",
  twcen_condensed: "'Vibe Tw Cen', 'Tw Cen MT Condensed Extra Bold', 'Arial Narrow', sans-serif",
  verdana: "Verdana, Arial, sans-serif"
});
const HOOK_FONT_STACK = "'Segoe UI', 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif";
const DEFAULT_HOOK_FONT = "arial_black";
const AVAILABLE_HOOK_FONTS = Object.freeze([
  "arial_black", "segoe", "bahnschrift", "oswald", "cooper_black", "georgia", "segoe_print"
]);

const HOOK_FONT_WEIGHTS = Object.freeze({
  arial_black: 900,
  segoe: 400,
  bahnschrift: 800,
  oswald: 600,
  cooper_black: 400,
  georgia: 400,
  segoe_print: 400,
  twcen_condensed: 400
});

function getFontStack(fontKey, fallback = "segoe") {
  return FONT_STACKS[fontKey] || FONT_STACKS[fallback];
}

function getHookFontWeight(fontKey) {
  return HOOK_FONT_WEIGHTS[fontKey] || 900;
}

async function ensureWatermarkFontLoaded() {
  if (!state.watermark?.enabled || !document.fonts?.load) return;
  const key = state.watermark.font || "bahnschrift";
  await document.fonts.load(`${getHookFontWeight(key)} 28px ${getFontStack(key, "bahnschrift")}`);
}

async function refreshWatermarkFont() {
  try {
    await ensureWatermarkFontLoaded();
    renderReel();
  } catch (error) {
    showToast(`Username font could not load. Refresh and try again. ${error.message}`);
  }
}

function applyFontControl(control, fontKey) {
  if (!control) return;
  control.style.fontFamily = getFontStack(fontKey, "segoe");
  control.style.fontWeight = String(getHookFontWeight(fontKey));
}

function applyHookFontOptionPreviews(control) {
  if (!control) return;
  Array.from(control.options).forEach((option) => {
    option.style.fontFamily = getFontStack(option.value, DEFAULT_HOOK_FONT);
    option.style.fontWeight = String(getHookFontWeight(option.value));
  });
}

function getViralHookLayout(ctx, rawText, requestedSize, maxWidth = 860, allowCustomSize = false, lineGap = 16, fontStack = HOOK_FONT_STACK, fontWeight = 900, maxHeight = 1840) {
  // Hooks use the clean white, black-outline look popular in anime edits.
  // Keep the creator's casing, spacing and line breaks while wrapping each entered line.
  // A newline is an intentional composition choice, not ordinary whitespace.
  const hardLines = String(rawText || "").replace(/\r\n?/g, "\n").split("\n")
    .map(line => line.replace(/\t/g, "    "));
  // Textareas often retain a final Enter. Do not render that as an invisible
  // third row with its own black background, but preserve intentional blank
  // rows between actual hook lines.
  while (hardLines.length > 1 && !hardLines[0].trim()) hardLines.shift();
  while (hardLines.length > 1 && !hardLines[hardLines.length - 1].trim()) hardLines.pop();
  const requiredLineCount = Math.max(1, hardLines.length);
  // A strong default is readable over anime footage. Manual resizing still
  // has the full editor range.
  const largestSize = Math.min(allowCustomSize ? 120 : 72, Math.max(14, Math.round(requestedSize || 68)));

  let layout;
  for (let size = largestSize; size >= 14; size -= 1) {
    ctx.font = `600 ${size}px ${HOOK_FONT_STACK}`;
    if (fontStack !== HOOK_FONT_STACK || fontWeight !== 600) ctx.font = `${fontWeight} ${size}px ${fontStack}`;
    const lines = [];
    for (const hardLine of hardLines) {
      const words = hardLine ? hardLine.split(" ") : [];
      if (!words.length) {
        lines.push("");
        continue;
      }
      let line = "";
      let hasWord = false;
      for (const word of words) {
        // Empty tokens are intentional spaces, including before the first word.
        const candidate = hasWord ? `${line} ${word}` : word;
        hasWord = true;
        if (measureHookLine(ctx, candidate, size) <= maxWidth) {
          line = candidate;
        } else {
          if (line) lines.push(line);
          if (measureHookLine(ctx, word, size) <= maxWidth) {
            line = word;
            continue;
          }
          line = "";
          // Long words, URLs and emoji sequences must obey the same wrap width.
          const characters = typeof Intl.Segmenter === "function"
            ? Array.from(new Intl.Segmenter(undefined, {granularity: "grapheme"}).segment(word), part => part.segment)
            : getHookEmojiRuns(word).flatMap(run => run.emoji ? [run.text] : Array.from(run.text));
          for (const character of characters) {
            if (line && measureHookLine(ctx, line + character, size) > maxWidth) {
              lines.push(line); line = "";
            }
            line += character;
          }
        }
      }
      if (line) lines.push(line);
    }
    layout = { lines, size, lineHeight: Math.round(size * 1.22) + Math.max(0, Math.round(lineGap || 0)) };
    // Manual sizing grows the text and adds rows instead of undoing the resize.
    const height = Math.max(0, lines.length - 1) * layout.lineHeight + size * 1.22;
    if ((allowCustomSize || lines.length <= Math.max(3, requiredLineCount)) && height <= maxHeight) return layout;
  }

  // Even the smallest fallback keeps its wrapped lines and matching font size.
  const height = Math.max(0, layout.lines.length - 1) * layout.lineHeight + layout.size * 1.22;
  if (height > maxHeight) {
    const scale = maxHeight / height;
    layout.size *= scale;
    layout.lineHeight *= scale;
  }
  return layout;
}

const FIXED_HOOK_EMOJI = Object.freeze({
  "⚡": "26a1", "🔥": "1f525", "👀": "1f440", "😭": "1f62d", "✨": "2728",
  "❤": "2764", "🖤": "1f5a4", "💔": "1f494", "❌": "274c", "✅": "2705",
  "❤️‍🔥": "2764-fe0f-200d-1f525", "❤‍🔥": "2764-fe0f-200d-1f525",
  "😈": "1f608", "😬": "1f62c", "☠": "2620", "🥀": "1f940"
});
const hookEmojiPattern = new RegExp(`(${Object.keys(FIXED_HOOK_EMOJI).sort((a, b) => b.length - a.length).join("|")})\\uFE0F?`, "gu");
// Visible artwork bounds in the bundled 160px images, excluding transparent padding.
const HOOK_EMOJI_CROPS = Object.freeze({
  "1f440": [3, 15, 156, 145], "1f494": [2, 8, 158, 154], "1f525": [19, 4, 140, 157],
  "1f5a4": [4, 11, 156, 150], "1f608": [4, 2, 157, 155], "1f62c": [4, 4, 156, 157],
  "1f62d": [4, 4, 156, 160], "2620": [3, 4, 156, 155], "26a1": [26, 4, 133, 156],
  "2705": [4, 4, 156, 156], "2728": [4, 4, 155, 157], "274c": [17, 17, 142, 142],
  "2764": [4, 11, 156, 150], "1f940": [3, 1, 158, 160],
  "2764-fe0f-200d-1f525": [5, 13, 156, 151]
});
const hookEmojiImages = new Map();

function getHookEmojiRuns(text) {
  const value = String(text || ""), runs = []; let start = 0;
  for (const match of value.matchAll(hookEmojiPattern)) {
    if (match.index > start) runs.push({text: value.slice(start, match.index), emoji: null});
    runs.push({text: match[0], emoji: FIXED_HOOK_EMOJI[match[1]]}); start = match.index + match[0].length;
  }
  if (start < value.length) runs.push({text: value.slice(start), emoji: null});
  return runs;
}

function hasFixedHookEmoji(text) {
  return getHookEmojiRuns(text).some(run => run.emoji);
}

function getHookEmojiGeometry(size, key) {
  // Native heart pixels at 68px occupy 59px vertically, beginning 1px below
  // the top baseline. TextMetrics includes padding outside that painted area.
  const height = size * 59 / 68;
  const top = size / 68;
  const [sx, sy, right, bottom] = HOOK_EMOJI_CROPS[key];
  const sw = right - sx, sh = bottom - sy, width = height * sw / sh;
  return {sx, sy, sw, sh, width, height, top, advance: Math.max(size, width)};
}

function measureHookLine(ctx, text, size) {
  return getHookEmojiRuns(text).reduce((width, run) => width + (run.emoji ? getHookEmojiGeometry(size, run.emoji).advance : ctx.measureText(run.text).width), 0);
}

async function ensureHookEmojiLoaded(text = state.seriesFormat || "") {
  const keys = new Set(getHookEmojiRuns(text).map(run => run.emoji).filter(Boolean));
  await Promise.all(Array.from(keys, key => {
    if (!hookEmojiImages.has(key)) {
      if (typeof Image !== "function") throw new Error("Emoji artwork is unavailable. Refresh Studio before exporting.");
      const entry = {image: new Image(), ready: false, promise: null};
      hookEmojiImages.set(key, entry);
      entry.promise = new Promise((resolve, reject) => {
        entry.image.onload = () => {entry.ready = true; resolve();};
        entry.image.onerror = () => reject(new Error("Could not load the hook emoji artwork. Refresh Studio and try exporting again."));
        entry.image.src = key === "1f940" ? "/emoji/apple/1f940.png" : `/emoji/whatsapp/${key}.png`;
      });
    }
    return hookEmojiImages.get(key).promise;
  }));
}

async function refreshHookEmoji(text = state.seriesFormat || "") {
  try { await ensureHookEmojiLoaded(text); renderReel(); }
  catch (error) { console.warn("Hook emoji artwork failed:", error); showToast(error.message); }
}

function drawHookLine(ctx, line, x, y, size, {stroke = false, fill = true, emoji = true, opacity = 1} = {}) {
  if (!hasFixedHookEmoji(line)) {
    if (stroke) ctx.strokeText(line, x, y);
    if (fill) ctx.fillText(line, x, y);
    return;
  }
  const width = measureHookLine(ctx, line, size);
  let left = ctx.textAlign === "center" ? x - width / 2 : x;
  ctx.save(); ctx.textAlign = "left";
  for (const run of getHookEmojiRuns(line)) {
    if (run.emoji) {
      const entry = hookEmojiImages.get(run.emoji);
      const geometry = getHookEmojiGeometry(size, run.emoji);
      if (emoji && entry?.ready) {
        ctx.save(); ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = opacity;
        ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.filter = "none";
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
        ctx.drawImage(entry.image, geometry.sx, geometry.sy, geometry.sw, geometry.sh,
          left + (geometry.advance - geometry.width) / 2, y + geometry.top, geometry.width, geometry.height); ctx.restore();
      }
      left += geometry.advance;
    } else {
      if (stroke) ctx.strokeText(run.text, left, y);
      if (fill) ctx.fillText(run.text, left, y);
      left += ctx.measureText(run.text).width;
    }
  }
  ctx.restore();
}

const EDIT_RENDER_INTERVAL = 1000 / 30;
let lastEditRenderAt = -Infinity;
let pendingEditRender = null;

const USERNAME_BLEND_STRENGTH = 0.70;

// One typography renderer for the monitor and the exported transparent text layer.
function drawSceneBlendUsername(ctx, defaultWmX = 140, defaultWmY = 90, asMask = false) {
  if (!state.watermark?.enabled || state.watermark.style !== "scene_blend") return;
  const text = (state.watermark.text || "lap_lac7").trim().toUpperCase();
  if (!text) return;
  const config = state.textElements?.watermark || {x: defaultWmX, y: defaultWmY, size: 28};
  const size = config.size || 28;
  const vertical = Number(state.watermark.rotation ?? 90) === 90;
  ctx.save();
  ctx.font = `${getHookFontWeight(state.watermark.font || "bahnschrift")} ${size}px ${getFontStack(state.watermark.font, "bahnschrift")}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.globalCompositeOperation = asMask ? "source-over" : "overlay";
  ctx.globalAlpha = asMask ? 1 : USERNAME_BLEND_STRENGTH;
  ctx.fillStyle = "#ffffff";
  ctx.shadowBlur = 0;
  ctx.translate(config.x, config.y);
  if (vertical) ctx.rotate(Math.PI / 2);
  const width = ctx.measureText(text).width;
  ctx.fillText(text, 0, 0);
  ctx.restore();
  state._textBoxes = state._textBoxes || {};
  state._textBoxes.watermark = vertical
    ? {x: config.x - size / 2 - 6, y: config.y - 6, width: size + 12, height: width + 12}
    : {x: config.x - 6, y: config.y - size / 2 - 6, width: width + 12, height: size + 12};
}

function getHookFadeOpacity(playbackTime = state.currentTime) {
  const fade = state.hookFade || {};
  const start = Number(fade.start) || 0;
  const duration = 0.60;
  // `timeupdate` can arrive only a few times per second. Read the decoder's
  // live clock during playback so opacity changes every preview frame.
  const liveVideoTime = state.isPlaying && el.hiddenVideo && Number.isFinite(Number(el.hiddenVideo.currentTime))
    ? Number(el.hiddenVideo.currentTime)
    : playbackTime;
  const clipTime = liveVideoTime - Math.max(0, Number(state.startTime) || 0);
  if (start <= 0 || !Number.isFinite(clipTime) || clipTime <= start) return 1;
  return Math.max(0, Math.min(1, 1 - ((clipTime - start) / duration)));
}

function syncHookFadeControls() {
  const fade = state.hookFade || { start: 0 };
  const start = Math.max(0, Number(fade.start) || 0);
  state.hookFade = { start };
  if (el.sliderHookFadeStart) el.sliderHookFadeStart.value = String(start);
  if (el.valHookFadeStart) el.valHookFadeStart.textContent = start > 0 ? `${start.toFixed(1)}s` : "Whole clip";
}

function drawStudioText(ctx, bgType, defaultWmX = 140, defaultWmY = 90, shadowScale = 1, includeSceneBlend = true, includeHook = true, includeWatermark = true, hookOpacity = null, visualReelTop = 0, hookSceneBlendMask = false, hookEmojiOnly = false) {
  state._textBoxes = state._textBoxes || {};
  // Blend onto footage before drawing the other text, matching export order.
  if (includeSceneBlend) drawSceneBlendUsername(ctx, defaultWmX, defaultWmY);
  // 4. SERIES HEADER TEXT / VIRAL HOOK (Movable & Resizable)
  const visibleHookOpacity = hookOpacity === null ? getHookFadeOpacity() : hookOpacity;
  if (state.showSeriesText !== false) {
    if (includeHook && visibleHookOpacity > 0) {
    const seriesCfg = state.textElements.series;
    const seriesText = state.seriesFormat.replace("{day}", state.dayNumber);
    if (typeof Image === "function" && getHookEmojiRuns(seriesText).some(run => run.emoji && !hookEmojiImages.has(run.emoji))) void refreshHookEmoji(seriesText);
    const hookFont = typeof getFontStack === "function" ? getFontStack(state.hookFont, DEFAULT_HOOK_FONT) : HOOK_FONT_STACK;
    const hookWeight = typeof getHookFontWeight === "function" ? getHookFontWeight(state.hookFont) : 900;
    const isWhiteHookBanner = state.hookStyle === "black_on_white";
    const isSceneBlendHook = state.hookStyle === "scene_blend";
    // Leave mobile-safe side margins so larger hooks wrap before the reel edge.
    // This same layout is used for the Studio preview and exported text layer.
    const hookSafeWidth = 980;
    const hookMaxHeight = isWhiteHookBanner && visualReelTop > 100 ? visualReelTop - 64 : 1840;
    const hookLayout = getViralHookLayout(ctx, seriesText, seriesCfg.size || 68, hookSafeWidth, !!seriesCfg._custom, seriesCfg.lineGap, hookFont, hookWeight, hookMaxHeight);
    const seriesLines = hookLayout.lines;
    const sSize = hookLayout.size;
    const sLineHeight = hookLayout.lineHeight;
    const sFont = `600 ${sSize}px ${HOOK_FONT_STACK}`;
    const selectedHookFont = `${hookWeight} ${sSize}px ${hookFont}`;
    const whiteBannerPadding = Math.max(18, Math.round(sSize * 0.26));
    const whiteBannerHeight = isWhiteHookBanner
      ? whiteBannerPadding + (seriesLines.length - 1) * sLineHeight + Math.round(sSize * 1.05) + whiteBannerPadding
      : 0;
    // Grow the banner upward into the empty canvas area so it ends exactly
    // where the visual footage starts, never over the footage itself.
    const whiteBannerTop = isWhiteHookBanner ? Math.max(0, visualReelTop - whiteBannerHeight) : 0;

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, visibleHookOpacity));
    const isManualMultiline = seriesLines.length > 1 && /\r?\n/.test(seriesText);
    const hookTextAlign = isWhiteHookBanner ? "center" : (isManualMultiline ? "left" : "center");
    let hookTextX = isWhiteHookBanner ? 540 : seriesCfg.x;
    let hookTextY = isWhiteHookBanner
      ? whiteBannerTop + whiteBannerPadding
      : seriesCfg.y;
    ctx.textAlign = hookTextAlign;
    ctx.textBaseline = "top";
    ctx.font = selectedHookFont || sFont;

    let maxSeriesW = 0;
    seriesLines.forEach((line) => {
      const lw = measureHookLine(ctx, line, sSize);
      if (lw > maxSeriesW) maxSeriesW = lw;
    });
    const hookBlockHeight = Math.max(0, seriesLines.length - 1) * sLineHeight + Math.ceil(sSize * 1.22);
    const hookEmojiTop = hasFixedHookEmoji(seriesText) ? Math.min(0, getHookEmojiGeometry(sSize, "2764").top) : 0;
    if (!isWhiteHookBanner) {
      // Growing a hook near an edge must not push its text outside the reel.
      // Keep saved placement intact; use the same visible bounds during export.
      hookTextX = Math.max(50 + maxSeriesW / 2, Math.min(1030 - maxSeriesW / 2, hookTextX));
      hookTextY = Math.max(40 - hookEmojiTop, Math.min(1880 - hookBlockHeight, hookTextY));
    }

    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    const hookUsesBar = state.hookStyle === "white_on_black" || state.hookStyle === "black_on_white";
    const hookBarColor = state.hookStyle === "black_on_white" ? "#ffffff" : "#000000";
    ctx.lineWidth = Math.max(2, Math.round(sSize * 0.11));
    ctx.strokeStyle = "#080808";
    ctx.shadowColor = "rgba(0,0,0,.82)";
    // Canvas shadows stay in device pixels when the drawing transform changes.
    // Match their visible size when the 540-wide monitor becomes a 4K overlay.
    ctx.shadowBlur = 4 * shadowScale;
    // Black lettering is already fully legible on a white bar. A shadow here
    // only softens the edges, so keep this appearance deliberately crisp.
    if (state.hookStyle === "black_on_white") {
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
    }
    if (isSceneBlendHook) {
      // Keep 80% scene colour, with a light fallback for hooks placed over a
      // black part of the reel. Without the fallback, an overlay blend over
      // black renders black text and looks as if the hook disappeared.
      ctx.globalCompositeOperation = hookSceneBlendMask ? "source-over" : "overlay";
      ctx.globalAlpha = hookSceneBlendMask ? 1 : Math.max(0, Math.min(1, visibleHookOpacity * 0.80));
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.lineWidth = 0;
    }

    const barPadX = Math.max(16, Math.round(sSize * 0.22));
    const barPadY = Math.max(7, Math.round(sSize * 0.12));
    const barHeight = Math.round(sSize * 0.96) + barPadY * 2;
    if (!hookEmojiOnly && isWhiteHookBanner && seriesLines.length > 0) {
      ctx.save();
      ctx.shadowColor = "transparent";
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, whiteBannerTop, 1080, whiteBannerHeight);
      ctx.restore();
    } else if (!hookEmojiOnly && hookUsesBar && seriesLines.length > 0) {
      // Each row hugs its own text width. Narrow rows are joined to the row
      // above through their overlap, creating one stepped background shape
      // instead of a large empty rectangle beside shorter lines.
      const hookBars = seriesLines.map((line, index) => {
        const lineW = measureHookLine(ctx, line, sSize);
        const textLeft = isManualMultiline ? hookTextX - maxSeriesW / 2 : hookTextX - lineW / 2;
        return {
          left: textLeft - barPadX,
          right: textLeft + lineW + barPadX,
          top: hookTextY + index * sLineHeight - barPadY,
          width: lineW + barPadX * 2
        };
      });
      ctx.save();
      ctx.shadowColor = "transparent";
      ctx.fillStyle = hookBarColor;
      ctx.beginPath();
      hookBars.forEach((bar) => ctx.rect(bar.left, bar.top, bar.width, barHeight));
      for (let index = 0; index < hookBars.length - 1; index += 1) {
        const current = hookBars[index];
        const next = hookBars[index + 1];
        const connectorLeft = Math.max(current.left, next.left);
        const connectorRight = Math.min(current.right, next.right);
        const connectorTop = current.top + barHeight;
        const connectorHeight = next.top - connectorTop;
        if (connectorRight > connectorLeft && connectorHeight > 0) {
          ctx.rect(connectorLeft, connectorTop, connectorRight - connectorLeft, connectorHeight);
        }
      }
      ctx.fill();
      ctx.restore();
    }

    seriesLines.forEach((line, i) => {
      let lineCol = seriesCfg._custom ? seriesCfg.color : "#ffffff";
      if (bgType === "white" && (!lineCol || !isDarkColor(lineCol))) lineCol = "#0f172a";
      if (bgType !== "white" && (!lineCol || isDarkColor(lineCol))) lineCol = "#ffffff";
      if (state.hookStyle === "white_on_black") lineCol = "#ffffff";
      if (state.hookStyle === "black_on_white") lineCol = "#000000";
      if (isSceneBlendHook) lineCol = "#ffffff";
      ctx.fillStyle = lineCol;
      const lineX = hookTextAlign === "left" ? hookTextX - maxSeriesW / 2 : hookTextX;
      const lineY = hookTextY + i * sLineHeight;
      if (hookEmojiOnly) {
        drawHookLine(ctx, line, lineX, lineY, sSize, {fill: false, opacity: visibleHookOpacity});
      } else if (isSceneBlendHook && !hookSceneBlendMask) {
        ctx.save();
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = Math.max(0, Math.min(1, visibleHookOpacity * 0.20));
        drawHookLine(ctx, line, lineX, lineY, sSize, {emoji: false});
        ctx.restore();
        drawHookLine(ctx, line, lineX, lineY, sSize, {emoji: false});
        drawHookLine(ctx, line, lineX, lineY, sSize, {emoji: false});
        drawHookLine(ctx, line, lineX, lineY, sSize, {fill: false, opacity: visibleHookOpacity});
      } else {
        drawHookLine(ctx, line, lineX, lineY, sSize, {stroke: !hookUsesBar && !isSceneBlendHook, emoji: !hookSceneBlendMask, opacity: visibleHookOpacity});
      }
    });
    ctx.restore();

    // Save bounding box for series text
    state._textBoxes.series = {
      x: isWhiteHookBanner ? 0 : hookTextX - maxSeriesW / 2 - 16,
      y: isWhiteHookBanner ? whiteBannerTop : hookTextY + Math.min(-4, hookEmojiTop),
      width: isWhiteHookBanner ? 1080 : maxSeriesW + 32,
      height: isWhiteHookBanner
        ? whiteBannerHeight
        : hookBlockHeight + 10 + Math.max(0, -hookEmojiTop - 4)
    };

    } else {
      delete state._textBoxes.series;
    }
  } else {
    delete state._textBoxes.series;
  }

  // Omit Song Name, Anime Name, and Track Pill overlays from video canvas
  delete state._textBoxes.song;
  delete state._textBoxes.anime;

  // 6b. USERNAME WATERMARK (optional, clean and readable)
  const isWmEnabled = !!(state.watermark && state.watermark.enabled);
  const wmText = (state.watermark && state.watermark.text && state.watermark.text.trim())
    ? state.watermark.text.trim()
    : ((el.inputWatermarkText && el.inputWatermarkText.value && el.inputWatermarkText.value.trim())
       ? el.inputWatermarkText.value.trim()
       : "lap_lac7");
  const wmCfg = (state.textElements && state.textElements.watermark) ? state.textElements.watermark : { x: defaultWmX, y: defaultWmY, size: 28, color: "#ffffff" };

  if (includeWatermark && isWmEnabled && wmText) {
    const wmSize = wmCfg.size || 28;
    if (state.watermark.style === "scene_blend") {
      return;
    }
    const wmFont = `${getHookFontWeight(state.watermark.font || "bahnschrift")} ${wmSize}px ${getFontStack(state.watermark.font, "bahnschrift")}`;
    ctx.save();
    ctx.font = wmFont;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const nameW = ctx.measureText(wmText).width;
    let wmColor = wmCfg.color;
    if (bgType === "white") {
      if (!wmColor || !isDarkColor(wmColor)) wmColor = "#0f172a";
      ctx.fillStyle = wmColor;
      ctx.shadowColor = "rgba(255, 255, 255, 0.55)";
      ctx.shadowBlur = 3 * shadowScale;
      ctx.shadowOffsetY = shadowScale;
    } else {
      if (!wmColor || isDarkColor(wmColor)) wmColor = "#ffffff";
      ctx.fillStyle = wmColor;
      ctx.shadowColor = "rgba(0, 0, 0, 0.82)";
      ctx.shadowBlur = 5 * shadowScale;
      ctx.shadowOffsetY = 2 * shadowScale;
    }
    ctx.fillText(wmText, wmCfg.x, wmCfg.y);
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

}

function createStudioTextOverlay() {
  const options = arguments[0] || {};
  if ((state.aspectRatio || "9:16") !== "9:16") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 2160;
  canvas.height = 3840;
  const textContext = canvas.getContext("2d");
  if (!textContext) throw new Error("Could not prepare Studio text for export. Reload and try again.");
  textContext.setTransform(2, 0, 0, 2, 0, 0);
  // Canvas shadows use device pixels, unlike text/strokes, so preserve their
  // visible size relative to the monitor's actual drawing resolution.
  const shadowScale = canvas.width / (el.reelCanvas.width || 540);
  // Scene blend depends on each video frame; export renders that mask separately.
  if (options.usernameSceneMask) {
    drawSceneBlendUsername(textContext, 140, 90, true);
  } else {
    drawStudioText(textContext, (state.adjustments && state.adjustments.bgType) || "black", 140, 90, shadowScale, false, options.includeHook !== false, options.includeWatermark !== false, 1, state._visualReelTop || 0, options.hookSceneBlendMask === true, options.hookEmojiOnly === true);
  }
  return canvas.toDataURL("image/png");
}

function renderReel() {
  // Sliders can fire far faster than a screen can show. Coalesce paused-edit
  // redraws to 30fps, while active playback keeps its separate 24fps loop.
  const renderNow = (typeof performance !== "undefined" && typeof performance.now === "function")
    ? performance.now()
    : Date.now();
  if (!state.isPlaying && renderNow - lastEditRenderAt < EDIT_RENDER_INTERVAL) {
    if (pendingEditRender === null && typeof setTimeout === "function") {
      pendingEditRender = setTimeout(() => {
        pendingEditRender = null;
        renderReel();
      }, Math.ceil(EDIT_RENDER_INTERVAL - (renderNow - lastEditRenderAt)));
    }
    return;
  }
  if (pendingEditRender !== null && typeof clearTimeout === "function") {
    clearTimeout(pendingEditRender);
    pendingEditRender = null;
  }
  lastEditRenderAt = renderNow;
  const vid = el.hiddenVideo;
  const liveVideoReady = vid && vid.readyState >= 1 && vid.videoWidth > 0;
  // The live video is already the source during playback. Copying it into a
  // second canvas every frame was extra GPU/CPU work and caused monitor lag.
  if (liveVideoReady && vid.readyState >= 2 && (vid.paused || vid.seeking)) cachePreviewFrame(vid);
  const videoSource = (vid && vid.readyState >= 2 && vid.videoWidth > 0)
    ? vid
    : (lastPreviewFrame.width > 0 ? lastPreviewFrame : (liveVideoReady ? vid : null));
  const hasVideo = !!videoSource;
  // The welcome artwork belongs to Studio's interface, never the export canvas.
  if (el.studioWelcome) el.studioWelcome.hidden = !!state.videoPath || hasVideo;
  const w = 1080;
  const h = 1920;
  const previewScale = el.reelCanvas.width / w;

  // Draw in final-export coordinates at the final-export resolution so the
  // monitor uses the same text geometry and sharpness as the reel.
  ctx.setTransform(previewScale, 0, 0, previewScale, 0, 0);

  // Clear
  ctx.fillStyle = "#080b15";
  ctx.fillRect(0, 0, w, h);

  const bgType = (state.adjustments && state.adjustments.bgType) || "black";

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
      const blurPx = Math.round(state.adjustments.blur);
      const brightVal = 1.0 + state.adjustments.brightness;
      const didRefresh = refreshBlurPreviewBackground(
        videoSource, rawW, rawH, vidAspect, blurPx, brightVal, !state.isPlaying
      );
      if (didRefresh && blurPreviewCanvas.width > 0) {
        ctx.drawImage(blurPreviewCanvas, 0, 0, w, h);
      }

    } else {
      // Keep an unloaded monitor neutral rather than pretending it has a
      // blue/purple blur background.
      ctx.fillStyle = "#080b15";
      ctx.fillRect(0, 0, w, h);
    }
  }

  // 2. FOREGROUND VIDEO FRAME (Dynamically fits active aspect ratio)
  const fgScale = getSongWindowScale(state.adjustments.scale);
  const {width: fgWidth, height: fgHeight, x: fgX, y: fgY} = getVideoFrameGeometry(rawW, rawH, w, h, fgScale, state.adjustments.verticalOffset);
  // Large reel windows can extend beyond the canvas. Round the visible window
  // edge, not the off-screen outer rectangle, so the creator can see the
  // selected corner shape at every scale.
  const visibleInset = Math.min(getSongWindowInset(state.adjustments.windowInset), Math.floor(Math.min(w, h) / 2) - 1);
  const visibleFrameX = Math.max(visibleInset, fgX);
  const visibleFrameY = Math.max(visibleInset, fgY);
  const visibleFrameRight = Math.min(w - visibleInset, fgX + fgWidth);
  const visibleFrameBottom = Math.min(h - visibleInset, fgY + fgHeight);
  const visibleFrameWidth = Math.max(0, visibleFrameRight - visibleFrameX);
  const visibleFrameHeight = Math.max(0, visibleFrameBottom - visibleFrameY);
  state._visualReelTop = visibleFrameY;
  const borderShape = getBorderShape();
  const isCurved = borderShape !== "straight";
  const maxPossibleRadius = Math.floor(Math.min(visibleFrameWidth, visibleFrameHeight) / 2);
  const rawRadius = borderShape === "circular"
    ? maxPossibleRadius
    : (isCurved ? (state.adjustments.radius !== undefined ? state.adjustments.radius : 16) : 0);
  const radius = Math.min(Math.max(0, rawRadius), maxPossibleRadius);

  if (hasVideo) {
    ctx.save();
    applyHideAreaClips(ctx, w, h);
    ctx.beginPath();
    if (borderShape === "circular") {
      ctx.ellipse(
        visibleFrameX + visibleFrameWidth / 2, visibleFrameY + visibleFrameHeight / 2,
        visibleFrameWidth / 2, visibleFrameHeight / 2, 0, 0, Math.PI * 2
      );
    } else {
      ctx.roundRect(visibleFrameX, visibleFrameY, visibleFrameWidth, visibleFrameHeight, radius);
    }
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
  }

  // Ensure textElements state initialized
  const defaultSongY = fgY + fgHeight + 120;
  const defaultAnimeY = defaultSongY + 54;
  const defaultWmX = fgX + 35;
  const defaultWmY = fgY + 45;

  if (!state.textElements) {
    state.textElements = {
      series: { x: 540, y: 360, size: 68, lineGap: 16, color: "#ffffff" },
      song: { x: 540, y: defaultSongY, size: 54, color: "#ffffff" },
      anime: { x: 540, y: defaultAnimeY, size: 32, color: "#ffffff" },
      watermark: { x: defaultWmX, y: defaultWmY, size: 28, color: "#ffffff" },
      subtitles: { x: 540, y: 1690, size: 38, color: "#ffffff" }
    };
  }
  if (!state.textElements.series) state.textElements.series = { x: 540, y: 360, size: 38, lineGap: 12, color: "#ffffff" };
  // Upgrade the old untouched hook layout, without moving anything the creator
  // has deliberately dragged, resized, or recolored.
  if (!state.textElements.series._custom) {
    if (state.textElements.series.y === undefined || state.textElements.series.y === 320) state.textElements.series.y = 360;
    if (state.textElements.series.size === undefined || state.textElements.series.size === 28 || state.textElements.series.size === 34) state.textElements.series.size = 38;
    if (!state.textElements.series.color || state.textElements.series.color.toLowerCase() === "#38bdf8") state.textElements.series.color = "#ffffff";
  }
  if (!state.textElements.series.color) state.textElements.series.color = "#ffffff";
  if (!Number.isFinite(Number(state.textElements.series.lineGap))) state.textElements.series.lineGap = 12;
  if (!state.textElements.song) state.textElements.song = { x: 540, y: defaultSongY, size: 54, color: "#ffffff" };
  if (!state.textElements.song.color) state.textElements.song.color = "#ffffff";
  if (!state.textElements.anime) state.textElements.anime = { x: 540, y: defaultAnimeY, size: 32, color: "#ffffff" };
  if (!state.textElements.anime.color) state.textElements.anime.color = "#ffffff";
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

  drawStudioText(ctx, bgType, defaultWmX, defaultWmY, 1, true, true, true, null, fgY);

  // 6c. CREATOR PROFILE HEADER (reference-style avatar left, name and handle right)
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
    const handleLine = badgeTag;

    ctx.save();
    ctx.font = `800 ${displaySize}px 'Cabinet Grotesk', 'Space Grotesk', sans-serif`;
    const displayW = ctx.measureText(displayName).width;
    ctx.font = `700 ${handleSize}px 'Cabinet Grotesk', 'Space Grotesk', sans-serif`;
    const handleW = ctx.measureText(handleLine).width;
    const textGap = Math.max(3, Math.round(bSize * 0.12));
    const textW = Math.max(displayW, handleW);
    const totalW = avatarD + spacing + textW;
    const totalH = Math.max(avatarD, displaySize + textGap + handleSize);
    const topY = badgeCfg.y - totalH / 2;
    const leftX = badgeCfg.x - totalW / 2;
    const avX = leftX;
    const avY = topY;
    const radius = avatarD / 2;
    const textX = avX + avatarD + spacing;
    const textTop = topY + (avatarD - displaySize - textGap - handleSize) / 2;

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

    // 2. Keep the real avatar unchanged and place the text beside it, as in the reference.
    const nameY = textTop + displaySize;
    const handleY = nameY + handleSize + textGap;
    let bColor = badgeCfg.color;
    ctx.textAlign = "left";
    ctx.font = `800 ${displaySize}px 'Cabinet Grotesk', 'Space Grotesk', sans-serif`;
    if (bgType === "white") {
      if (!bColor || !isDarkColor(bColor)) bColor = "#0f172a";
      ctx.fillStyle = bColor;
      ctx.shadowColor = "rgba(0, 0, 0, 0.12)";
      ctx.shadowBlur = 4;
      ctx.fillText(displayName, textX, nameY);
    } else {
      if (!bColor || isDarkColor(bColor)) bColor = "#ffffff";
      ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
      ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
      ctx.shadowBlur = 6;
      ctx.fillText(displayName, textX + 1, nameY + 2);
      ctx.fillStyle = bColor;
      ctx.shadowColor = "transparent";
      ctx.fillText(displayName, textX, nameY);
    }

    ctx.font = `700 ${handleSize}px 'Cabinet Grotesk', 'Space Grotesk', sans-serif`;
    ctx.fillStyle = bgType === "white" ? "#475569" : "rgba(255, 255, 255, 0.82)";
    ctx.fillText(handleLine, textX, handleY);

    ctx.restore();

    state._textBoxes.creatorBadge = {
      x: leftX - 8,
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
    const activeCue = findActiveSubtitleCue(state.lyrics, curTime);
    const activeLine = activeCue ? activeCue.cue : null;
    if (typeof updateLyricsActiveState === "function") updateLyricsActiveState(activeCue ? activeCue.index : -1);
    if (activeLine) {
      const lineStart = parseFloat(activeLine.start) || 0;
      const lineEnd = parseFloat(activeLine.end) || (lineStart + 2.5);
      const totalDur = Math.max(0.001, lineEnd - lineStart);
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

      renderDualSubtitles(ctx, jpText, enText, elapsed, totalDur, stylePreset, w, h, activeLine, state.subtitleAnimation || "auto");
    } else {
      renderDualSubtitles(ctx, "", "", 0, 1, state.subtitleStyle || "minimal", w, h, null, state.subtitleAnimation || "auto");
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

  drawHideAreaGuides(ctx, w, h);

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

function updateLyricsActiveState(activeIndex) {
  if (!el.lyricsTimelineList || el.lyricsTimelineList.classList.contains("hidden")) return;
  if (activeIndex === lastActiveSubtitleListIndex) return;
  const previous = el.lyricsTimelineList.querySelector(".lyric-line-item.active");
  if (previous) previous.classList.remove("active");
  if (activeIndex >= 0) {
    const active = el.lyricsTimelineList.querySelector(`.lyric-line-item[data-idx="${activeIndex}"]`);
    if (active) active.classList.add("active");
  }
  lastActiveSubtitleListIndex = activeIndex;
}

function ensureAbsoluteLyricTimes(lyrics) {
  // Preserve true audio timestamps across the full video
  return lyrics || [];
}

function mergeOrphanSubtitleFragments(lyrics) {
  if (!Array.isArray(lyrics)) return lyrics;
  const connectives = /^(if|and|but|or|so|yet|then|that|the|a|an|to)$/i;
  const join = (prefix, phrase) => {
    const first = String(prefix || "").trim();
    const second = String(phrase || "").trim();
    if (!first) return second;
    if (!second || second.toLowerCase().startsWith(`${first.toLowerCase()} `)) return second || first;
    return `${first} ${second}`;
  };
  for (let index = 0; index < lyrics.length - 1; index += 1) {
    const cue = lyrics[index];
    const following = lyrics[index + 1];
    const spoken = String(cue && (cue.text_jp || cue.text_en || cue.text) || "").trim();
    const gap = Number(following && following.start) - Number(cue && cue.end);
    if (!connectives.test(spoken) || !Number.isFinite(gap) || gap > 0.35) continue;
    following.start = cue.start;
    ["text", "text_jp", "text_en", "text_romaji"].forEach(field => {
      following[field] = join(cue[field], following[field]);
    });
    // The old word arrays no longer describe the merged phrase or its bounds.
    ["words_jp", "words_en", "_cachedWordsJp", "_cachedWordsEn", "timing_source"].forEach(field => delete following[field]);
    lyrics.splice(index, 1);
    subtitleCueCache.source = null;
    index -= 1;
  }
  return lyrics;
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

  // Repair the old saved one-word flash cues too, not only newly generated cues.
  mergeOrphanSubtitleFragments(lyrics);

  // Sort by start timestamp cleanly
  lyrics.sort((a, b) => (parseFloat(a.start) || 0) - (parseFloat(b.start) || 0));
  subtitleCueCache.source = null;
  // The DOM list is rebuilt below, so its active-row cache must be rebuilt too.
  lastActiveSubtitleListIndex = -1;

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
  const dur = Math.max(0.1, state._imagePreviewDuration || ((el.hiddenVideo && isFinite(el.hiddenVideo.duration) && el.hiddenVideo.duration > 0)
    ? el.hiddenVideo.duration
    : ((state.videoMeta && isFinite(state.videoMeta.duration) && state.videoMeta.duration > 0) ? state.videoMeta.duration : 35.0)));
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

function getTimelineThumbnailPlan() {
  const { contentW, dur } = getTimelineMetrics();
  if (!Number.isFinite(dur) || dur <= 0) return { contentW, dur: 0, times: [] };
  // The same timestamps must drive both extraction and drawing.  Otherwise
  // most tiles have no exact cached image and appear as empty dark blocks.
  const count = Math.min(18, Math.max(6, Math.ceil(contentW / 96)));
  const interval = dur / count;
  return {
    contentW,
    dur,
    times: Array.from({ length: count }, (_, index) => Math.min(dur - 0.05, index * interval))
  };
}

async function generateThumbnailStrip() {
  const vid = el.hiddenVideo;
  if (!vid || !vid.src || isGeneratingThumbnails) return;
  const plan = getTimelineThumbnailPlan();
  if (!plan.times.length) return;

  const needsExtraction = plan.times.some((time) => !thumbnailCache.has(Math.round(time * 10) / 10));
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

  const loaded = await new Promise((resolve) => {
    offVideo.addEventListener("loadeddata", () => resolve(true), { once: true });
    offVideo.addEventListener("error", () => resolve(false), { once: true });
    setTimeout(() => resolve(false), 2500);
  });

  for (const t of loaded ? plan.times : []) {
    const key = Math.round(t * 10) / 10;
    if (thumbnailCache.has(key)) continue;

    try {
      offVideo.currentTime = t;
      const seeked = await new Promise((resolve) => {
        offVideo.addEventListener("seeked", () => resolve(true), { once: true });
        setTimeout(() => resolve(offVideo.readyState >= 2), 1000);
      });
      if (!seeked || offVideo.readyState < 2) continue;
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
      // Data URL decoding is asynchronous.  Redraw when each image actually
      // becomes usable instead of leaving its tile black forever.
      img.addEventListener("load", drawThumbnailStrip, { once: true });
      img.src = imgData;
      thumbnailCache.set(key, img);
      drawThumbnailStrip();
    } catch (_) { /* Skip this timestamp; later timeline frames can still load. */ }
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
  const plan = getTimelineThumbnailPlan();
  const { contentW, dur } = plan;
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

  const thumbCount = plan.times.length;

  for (let i = 0; i < thumbCount; i++) {
    const x = Math.round(i * (contentW / thumbCount));
    const nextX = Math.round((i + 1) * (contentW / thumbCount));
    const w = nextX - x;
    const t = plan.times[i];
    const key = Math.round(t * 10) / 10;
    let img = thumbnailCache.get(key);
    if (!img || !img.complete || !img.naturalWidth) {
      let closestDiff = Infinity;
      for (const [k, v] of thumbnailCache.entries()) {
        if (v && v.complete && v.naturalWidth) {
          const diff = Math.abs(k - key);
          if (diff < closestDiff && diff <= 3.0) {
            closestDiff = diff;
            img = v;
          }
        }
      }
    }

    if (img && img.complete && img.naturalWidth) {
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
  if (audioAudition.selection && audioAudition.selection !== audioSelectionKey()) resetAudioAudition();
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
  updateTrimNudgeControls(startPx, endPx, contentW);

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
  if (typeof window !== "undefined" && window.musicStudio) window.musicStudio.syncTimeline();

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
const MAX_SONG_WINDOW_SCALE = 1.40;
const MAX_SONG_WINDOW_INSET = 180;

function getSongWindowScale(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(MAX_SONG_WINDOW_SCALE, Math.max(0.10, parsed)) : 1.0;
}

function getSongWindowInset(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(MAX_SONG_WINDOW_INSET, Math.max(0, parsed)) : 0;
}

function getVideoFrameGeometry(sourceWidth, sourceHeight, canvasWidth = 1080, canvasHeight = 1920, scale = 1, verticalOffset = 0) {
  const aspect = sourceWidth > 0 && sourceHeight > 0 ? sourceWidth / sourceHeight : 16 / 9;
  const fitWidth = Math.min(canvasWidth, canvasHeight * aspect);
  const width = Math.max(2, Math.round(fitWidth * getSongWindowScale(scale) / 2) * 2);
  const height = Math.max(2, Math.round(fitWidth / aspect * getSongWindowScale(scale) / 2) * 2);
  const offset = Number.isFinite(Number(verticalOffset)) ? Number(verticalOffset) : 0;
  return {width, height, x: (canvasWidth - width) / 2, y: (canvasHeight - height) / 2 + offset};
}

function centerVideoFrame() {
  state.adjustments = {...state.adjustments, scale: 1, verticalOffset: 0, windowInset: 0};
  if (typeof syncAdjustmentSliders === "function") syncAdjustmentSliders();
  renderReel();
  saveProjectState();
}

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
  if (state._compatibilityAttemptPath === targetPath) return;

  isRecoveringVideo = true;
  state._compatibilityAttemptPath = targetPath;
  showToast("⚡ Auto-optimizing video for instant scrubbing & playback...");
  try {
    const cRes = await fetch("/api/video/ensure-compatible", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_path: targetPath, force: false })
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
  const useEnhancedAudio = enhancedPlaybackReady();
  if (!useEnhancedAudio && el.audioMasterPlayer) el.audioMasterPlayer.pause();

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
      if (!prevMuted && !useEnhancedAudio) {
        vid.muted = false;
      }
      if (currentReq === playRequestId && state.isPlaying) {
        attemptPlay();
      }
    };
    const safetyTimer = setTimeout(() => {
      vid.volume = 0.0;
      if (!prevMuted && !useEnhancedAudio) vid.muted = false;
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

    const targetVol = useEnhancedAudio ? 0 : ((state.smartLoop && state.isLooping && state.currentTime - clipStart < 0.22) ? 0.2 : 1.0);
    vid.muted = useEnhancedAudio;
    vid.volume = 0.0;
    // Start the separate mastered track during the Play click itself.  Starting
    // it later in a timer loses the browser's user-gesture permission and can
    // leave the muted video with no audible track.
    if (useEnhancedAudio) void playEnhancedAudioWithVideo();
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
            if (useEnhancedAudio) {
              vid.muted = true;
              vid.volume = 0;
            } else {
              vid.muted = false;
              vid.volume = typeof window !== "undefined" && window.musicStudio ? window.musicStudio.originalGain(targetVol) : targetVol;
            }
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

function handlePreviewEnded() {
  // At the actual file end the browser has already paused, so seeking alone
  // cannot keep the default clip loop running. Resume through the usual player
  // path, which also synchronizes the selected music and enhanced audio.
  if (state.isLooping !== false && el.hiddenVideo?.src) {
    state.currentTime = Math.max(0, Number(state.startTime) || 0);
    state.playbackStartPos = state.currentTime;
    playVideo();
    return;
  }
  pauseVideo();
}

function resumePreviewAfterLoopSeek(requestId) {
  // Some browsers pause at EOF before dispatching timeupdate, then cancel
  // ended when we seek back. Resume that native pause, but never undo a user
  // pause or a source change (both invalidate the playback request).
  if (requestId !== playRequestId || !el.hiddenVideo?.paused) return;
  state.currentTime = Math.max(0, Number(state.startTime) || 0);
  playVideo();
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
  if (el.audioMasterPlayer) {
    try { el.audioMasterPlayer.pause(); } catch (_) {}
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

function updateTrimNudgeControls(startPx, endPx, contentW) {
  if (!el.trimNudgeStart || !el.trimNudgeEnd) return;
  const width = 36;
  // Each 6px handle extends into the selection; center arrows on the bar itself.
  const left = startPx + 3 - width / 2;
  const right = endPx - 3 - width / 2;
  el.trimNudgeEnd.style.top = right - left < width + 2 ? "43px" : "23px";
  const {dur} = getTimelineMetrics();
  for (const [group, position] of [[el.trimNudgeStart, left], [el.trimNudgeEnd, right]]) {
    group.style.left = `${position}px`;
    for (const button of group.querySelectorAll("button")) {
      const start = button.dataset.edge === "start";
      const earlier = Number(button.dataset.direction) < 0;
      button.disabled = !state.videoPath || !(dur > 0) || (start
        ? earlier ? state.startTime <= 0 : state.startTime >= state.endTime - 0.05
        : earlier ? state.endTime <= state.startTime + 0.05 : state.endTime >= dur);
    }
  }
}

function nudgeTimelineTrim(edge, direction, seek) {
  const {dur} = getTimelineMetrics();
  if (!state.videoPath || !(dur > 0) || !["start", "end"].includes(edge) || ![-1, 1].includes(direction)) return;
  const key = edge === "start" ? "startTime" : "endTime";
  const lower = edge === "start" ? 0 : state.startTime + 0.05;
  const upper = edge === "start" ? state.endTime - 0.05 : dur;
  const target = Math.round(Math.max(lower, Math.min(upper, state[key] + direction * 0.5)) * 1000) / 1000;
  if (target === state[key]) return;
  pauseVideo();
  state[key] = target;
  state.currentTime = target;
  state.playbackStartPos = target;
  seek(target, true);
  updateTimelineUI();
  updatePlayheadUI(target);
  renderReel();
  saveProjectState();
}

function setupTrimNudgeControls(seek) {
  for (const group of [el.trimNudgeStart, el.trimNudgeEnd]) {
    if (!group) continue;
    group.addEventListener("pointerdown", event => event.stopPropagation());
    group.addEventListener("click", event => event.stopPropagation());
    for (const button of group.querySelectorAll("button")) {
      button.addEventListener("click", () => nudgeTimelineTrim(button.dataset.edge, Number(button.dataset.direction), seek));
    }
  }
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
      syncEnhancedAudioToVideo(true);
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

  setupTrimNudgeControls(queueSeek);

  vid.addEventListener("loadedmetadata", () => {
    const dur = state._imagePreviewDuration || ((vid && isFinite(vid.duration) && vid.duration > 0) ? vid.duration : ((state.videoMeta && state.videoMeta.duration) || 0));
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
    if (state._preserveImageEditsGeneration !== state.sourceGeneration && (!state.aiAnalysis || state.aiAnalysis.isInitialPlaceholder)) {
      initDynamicClipForVideo(dur);
    }
  });

  vid.addEventListener("timeupdate", () => {
    if (activeDrag) return;
    if (vid.seeking) return;
    state.currentTime = vid.currentTime;
    updatePlayheadUI(state.currentTime);
    const useEnhancedAudio = enhancedPlaybackReady();
    if (useEnhancedAudio) {
      vid.muted = true;
      vid.volume = 0;
      syncEnhancedAudioToVideo();
    }

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
            const loopRequestId = playRequestId;
            vid.muted = true;
            vid.volume = 0.0;
            vid.currentTime = state.startTime;
            state.playbackStartPos = state.startTime;
            const onLoopSeeked = () => {
              vid.removeEventListener("seeked", onLoopSeeked);
              if (loopRequestId !== playRequestId) return;
              if (enhancedPlaybackReady()) {
                vid.muted = true;
                vid.volume = 0;
                syncEnhancedAudioToVideo(true);
                playEnhancedAudioWithVideo();
              } else {
                vid.muted = false;
                vid.volume = typeof window !== "undefined" && window.musicStudio ? window.musicStudio.originalGain(state.smartLoop ? 0.15 : 1.0) : (state.smartLoop ? 0.15 : 1.0);
              }
              resumePreviewAfterLoopSeek(loopRequestId);
            };
            vid.addEventListener("seeked", onLoopSeeked, { once: true });
            setTimeout(() => {
              if (loopRequestId === playRequestId && vid.muted && !enhancedPlaybackReady()) {
                vid.muted = false;
                vid.volume = typeof window !== "undefined" && window.musicStudio ? window.musicStudio.originalGain(state.smartLoop ? 0.15 : 1.0) : (state.smartLoop ? 0.15 : 1.0);
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
    if (el.audioMasterPlayer) el.audioMasterPlayer.pause();
  });

  vid.addEventListener("seeked", () => {
    if (pendingSeekTime !== null) {
      commitPendingSeek();
    }
    syncEnhancedAudioToVideo(true);
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

  vid.addEventListener("ended", handlePreviewEnded);

  if (el.btnPlayPause) el.btnPlayPause.addEventListener("click", togglePlay);
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
    if (document.getElementById("view-history")?.classList.contains("active")) return;
    if (["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) return;
    if (e.code === "Space") {
      e.preventDefault();
      togglePlay();
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
function setupUrlShortcuts(input, clearButton, kind = "video", plainText = false) {
  if (!input) return;
  let revision = 0;
  let readingClipboard = false;
  let clipboardBlocked = false;
  input.addEventListener("input", () => { revision++; });
  const replaceUrl = value => {
    input.value = value;
    input.dispatchEvent(new Event("input", {bubbles: true}));
    input.focus();
  };
  clearButton?.addEventListener("click", () => replaceUrl(""));
  input.addEventListener("contextmenu", async event => {
    if (event.shiftKey || clipboardBlocked || !navigator.clipboard?.readText) return;
    event.preventDefault();
    if (readingClipboard) return;
    readingClipboard = true;
    const requestedRevision = revision;
    const previousValue = input.value;
    try {
      const copied = await navigator.clipboard.readText();
      const text = plainText ? copied : copied.trim();
      if (requestedRevision !== revision || input.value !== previousValue) return;
      if (!text.trim()) { showToast(`Clipboard is empty. Copy ${plainText ? "hook text" : `a ${kind} link`} first.`); return; }
      if (plainText) { replaceUrl(text); return; }
      let link;
      try { link = new URL(text); } catch (_) { /* Show the same useful message below. */ }
      if (!link || !["http:", "https:"].includes(link.protocol)) {
        showToast(`Copy a ${kind} URL first, then right-click to paste it.`);
        return;
      }
      replaceUrl(text);
    } catch (error) {
      clipboardBlocked = true;
      showToast("Clipboard access is blocked. Right-click again for the Paste menu, or press Ctrl+V.");
    } finally {
      readingClipboard = false;
    }
  });
}

function setupVideoUrlShortcuts() {
  setupUrlShortcuts(el.inputYtUrl, document.getElementById("btn-clear-video-url"));
  setupUrlShortcuts(document.getElementById("music-url"), document.getElementById("btn-clear-music-url"), "music");
  setupUrlShortcuts(el.inputSeriesText, document.getElementById("btn-clear-hook-text"), "hook", true);
}

function showDownloadedImages(files) {
  const results = document.getElementById("image-download-results");
  if (!results) return;
  results.replaceChildren();
  const heading = document.createElement("p");
  heading.textContent = `${files.length} image${files.length === 1 ? "" : "s"} saved. The first loads in Studio. Choose another below.`;
  results.append(heading);
  for (const file of files) {
    const item = document.createElement("div");
    item.className = "image-download-item";
    const link = document.createElement("a");
    const url = `/api/images/file?path=${encodeURIComponent(file.file_path)}`;
    link.className = "image-download-choice";
    link.href = url;
    link.download = file.filename;
    const image = document.createElement("img");
    image.src = `${url}&download=false`;
    image.alt = "";
    image.loading = "lazy";
    const label = document.createElement("span");
    label.textContent = `↓ ${file.filename} · ${file.width} × ${file.height}`;
    link.append(image, label);
    const use = document.createElement("button");
    use.type = "button";
    use.className = "btn btn-sm";
    use.textContent = "Use in Studio";
    use.addEventListener("click", async () => {
      if (el.btnYtDownload.disabled) return;
      use.disabled = true;
      el.btnYtDownload.disabled = true;
      try { await loadDownloadedImage(file); }
      catch (error) {
        el.ytProgressLabel.textContent = `Error: ${error.message}`;
        showToast(`Image import failed: ${error.message}`);
      } finally {
        use.disabled = false;
        el.btnYtDownload.disabled = false;
        el.btnYtText.textContent = "⚡ Download & Load";
      }
    });
    item.append(link, use);
    results.append(item);
  }
  results.classList.remove("hidden");
}

async function waitForImageTask(taskId, timeoutMs = 5 * 60 * 1000) {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    if (Date.now() > deadline) throw new Error("Image task timed out. Try again.");
    await new Promise(resolve => setTimeout(resolve, 800));
    const response = await fetch(`/api/images/status/${encodeURIComponent(taskId)}`);
    const task = await response.json();
    if (!response.ok) throw new Error(task.detail || "Could not check image progress");
    const progress = Math.max(0, Math.min(100, Number(task.progress) || 0));
    el.ytProgressBar.style.width = `${progress}%`;
    el.ytProgressPercent.textContent = `${Math.round(progress)}%`;
    el.ytProgressLabel.textContent = task.message || "Preparing image…";
    if (task.status === "error") throw new Error(task.message || "Image task failed");
    if (task.status === "completed") return task;
  }
}

function syncImageDurationInputs(duration) {
  for (const id of ["input-image-duration", "input-local-image-duration"]) {
    const input = document.getElementById(id);
    if (input) input.value = String(duration);
  }
  document.getElementById("image-duration-row")?.classList.toggle("hidden", !isLoadedStudioImage());
}

function imageDurationStatus(message) {
  if (el.ytProgressLabel) el.ytProgressLabel.textContent = message;
  const local = document.getElementById("local-image-status");
  if (local) local.textContent = message;
}

async function recoverLoadedImageSource() {
  if (state.imageSourcePath || !state.videoPath || state.videoPath.startsWith("blob:")) return;
  const generation = state.sourceGeneration;
  const response = await fetch(`/api/images/source?path=${encodeURIComponent(state.videoPath)}`);
  if (response.status === 404) return; // Ordinary videos have no image source.
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || "Could not find the loaded image. Restart Vibe Editor and refresh Studio.");
  if (generation !== state.sourceGeneration) return;
  state.imageSourcePath = data.source_image_path || "";
  state.imageDuration = Number(data.duration) || null;
}

let imageDurationTimer = null;
let imageDurationRequest = null;
let imageDurationRunning = false;
let imageDurationRevision = 0;

function isLoadedStudioImage() {
  return !!state.imageSourcePath || /(?:^|[\\/])images[\\/]studio[\\/][^\\/]+\.mp4$/i.test(state.videoPath || "");
}

function previewImageDuration(duration) {
  if (!isLoadedStudioImage()) return;
  if (!state._imageDurationOriginalRange) {
    state._imageDurationOriginalRange = {startTime: state.startTime, endTime: state.endTime};
  }
  pauseVideo();
  state._imagePreviewDuration = duration;
  state.startTime = 0;
  state.endTime = duration;
  state.currentTime = Math.max(0, Math.min(Number(state.currentTime) || 0, duration));
  if (el.timeDuration) el.timeDuration.textContent = formatTime(duration, 0);
  updateTimelineUI();
  updatePlayheadUI(state.currentTime);
  renderReel();
}

function finishImageDurationPreview(rollback = false) {
  const range = state._imageDurationOriginalRange;
  if (rollback && range) {
    state.startTime = range.startTime;
    state.endTime = range.endTime;
    state.currentTime = Math.min(Number(state.currentTime) || 0, Number(range.endTime) || 0);
  }
  state._imagePreviewDuration = null;
  state._imageDurationOriginalRange = null;
  if (state.imageDuration && el.timeDuration) el.timeDuration.textContent = formatTime(state.imageDuration, 0);
  updateTimelineUI();
  updatePlayheadUI(Number(state.currentTime) || 0);
  renderReel();
}

function setupImageDurationControls() {
  for (const id of ["input-image-duration", "input-local-image-duration"]) {
    const input = document.getElementById(id);
    if (!input) continue;
    const update = () => {
      if (imageDurationTimer !== null) clearTimeout(imageDurationTimer);
      imageDurationTimer = null;
      const duration = Number(input.value);
      imageDurationRevision++;
      imageDurationRequest = null;
      if (!input.value.trim() || !Number.isFinite(duration) || duration < 1 || duration > 300) {
        state._imageDurationError = isLoadedStudioImage();
        imageDurationStatus("Choose an image duration from 1 to 300 seconds.");
        return;
      }
      state._imageDurationError = false;
      syncImageDurationInputs(duration);
      previewImageDuration(duration);
      imageDurationRequest = {duration, generation: state.sourceGeneration, revision: imageDurationRevision};
      imageDurationTimer = setTimeout(() => {
        imageDurationTimer = null;
        void updateLoadedImageDuration();
      }, 350);
    };
    input.addEventListener("input", update);
    input.addEventListener("change", update);
  }
}

async function updateLoadedImageDuration() {
  if (imageDurationRunning) return;
  imageDurationRunning = true;
  try {
    while (imageDurationRequest) {
      const request = imageDurationRequest;
      imageDurationRequest = null;
      if (request.generation !== state.sourceGeneration) continue;
      let loadingPath = null;
      let loadingGeneration = null;
      try {
        await recoverLoadedImageSource();
        if (request.generation !== state.sourceGeneration || request.revision !== imageDurationRevision) continue;
        if (!state.imageSourcePath) {
          imageDurationStatus("Duration will apply to the next image you load.");
          continue;
        }
        if (request.duration === state.imageDuration) { finishImageDurationPreview(); continue; }
        imageDurationStatus("Updating image duration…");
        const response = await fetch("/api/images/import", {
          method: "POST", headers: {"Content-Type": "application/json"},
          body: JSON.stringify({file_path: state.imageSourcePath, duration: request.duration})
        });
        const started = await response.json();
        if (!response.ok) throw new Error(started.detail || "Could not update image duration. Restart Vibe Editor and refresh Studio.");
        const task = await waitForImageTask(started.task_id, 11 * 60 * 1000);
        if (request.generation !== state.sourceGeneration || request.revision !== imageDurationRevision) continue;
        if (!task.file_path) throw new Error("Image duration update returned no Studio source. Try again.");
        const source = state.imageSourcePath;
        pauseVideo();
        loadingPath = task.file_path;
        loadingGeneration = state.sourceGeneration + 1;
        await loadFile(task.file_path, state.videoTitle || task.title, null, {preserveEdits: true});
        if (state.videoPath !== task.file_path) continue;
        state.imageSourcePath = task.source_image_path || source;
        state.imageDuration = request.duration;
        if (request.revision !== imageDurationRevision) {
          state._imageDurationOriginalRange = {startTime: 0, endTime: request.duration};
          if (state._imagePreviewDuration) previewImageDuration(state._imagePreviewDuration);
          continue;
        }
        finishImageDurationPreview();
        syncImageDurationInputs(request.duration);
        saveProjectState();
        renderReel();
        imageDurationStatus(`Image updated in Studio · ${request.duration}s`);
      } catch (error) {
        const ownReload = loadingPath && state.videoPath === loadingPath && state.sourceGeneration === loadingGeneration;
        if ((!ownReload && request.generation !== state.sourceGeneration) || request.revision !== imageDurationRevision) continue;
        state._imageDurationError = true;
        finishImageDurationPreview(true);
        if (state.imageDuration) syncImageDurationInputs(state.imageDuration);
        imageDurationStatus(`Error: ${error.message}`);
        showToast(`Image duration failed: ${error.message}`);
      }
    }
  } finally {
    imageDurationRunning = false;
  }
}

async function loadDownloadedImage(file, durationOverride = null) {
  const input = document.getElementById("input-image-duration");
  const duration = Number(durationOverride ?? (input?.value || 10));
  if (!Number.isFinite(duration) || duration < 1 || duration > 300) throw new Error("Choose an image duration from 1 to 300 seconds.");
  const generation = state.sourceGeneration;
  el.ytProgressBox.classList.remove("hidden");
  el.ytProgressLabel.textContent = "Loading image into Studio…";
  el.ytProgressBar.style.width = "0%";
  el.ytProgressPercent.textContent = "0%";
  const response = await fetch("/api/images/import", {
    method: "POST", headers: {"Content-Type": "application/json"},
    body: JSON.stringify({file_path: file.file_path, duration})
  });
  const started = await response.json();
  if (response.status === 405 || response.status === 404) {
    throw new Error("Vibe Editor is still running an older version. Close the Vibe Editor server, start it again, then refresh Studio to load images.");
  }
  if (!response.ok) throw new Error(started.detail || "Could not prepare image for Studio");
  const task = await waitForImageTask(started.task_id, 11 * 60 * 1000);
  if (!task.file_path) throw new Error("The image import did not return a Studio source. Try again.");
  if (generation !== state.sourceGeneration) {
    el.ytProgressLabel.textContent = "Image prepared. Choose Use in Studio to replace your current source.";
    return;
  }
  pauseVideo();
  await loadFile(task.file_path, task.title || file.filename);
  if (state.videoPath !== task.file_path) return;
  state.imageSourcePath = task.source_image_path || file.file_path;
  state.imageDuration = duration;
  syncImageDurationInputs(duration);
  saveProjectState();
  renderReel();
  el.ytProgressLabel.textContent = `Image loaded in Studio · ${duration}s`;
  showToast("Image loaded in Studio. You can add music, edit and export it.");
}

async function downloadPostImages(expectedGeneration = state.sourceGeneration) {
  const url = el.inputYtUrl?.value.trim();
  if (!url) { showToast("Please paste an image or post URL"); return; }
  const results = document.getElementById("image-download-results");
  results?.replaceChildren();
  results?.classList.add("hidden");
  document.getElementById("x-video-picker")?.classList.add("hidden");
  el.btnYtDownload.disabled = true;
  el.btnYtText.textContent = "Downloading images…";
  el.ytProgressBox.classList.remove("hidden");
  el.ytProgressBar.style.width = "0%";
  el.ytProgressPercent.textContent = "0%";
  el.ytProgressLabel.textContent = "Finding images…";
  let stage = "download";
  try {
    const response = await fetch("/api/images/download", {
      method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({url})
    });
    const started = await response.json();
    if (!response.ok) throw new Error(started.detail || "Could not start image download");
    const task = await waitForImageTask(started.task_id);
    if (!Array.isArray(task.files) || !task.files.length) throw new Error("No images were found in this post.");
    if (url !== el.inputYtUrl.value.trim() || expectedGeneration !== state.sourceGeneration) {
      el.ytProgressLabel.textContent = "Source changed. Paste your link and load it again.";
      return;
    }
    showDownloadedImages(task.files);
    stage = "import";
    await loadDownloadedImage(task.files[0], 10);
    if (state.imageSourcePath === task.files[0].file_path) localStorage.setItem("reel_yt_url_loaded", url);
  } catch (error) {
    el.ytProgressLabel.textContent = `Error: ${error.message}`;
    showToast(`Image ${stage} failed: ${error.message}`);
  } finally {
    el.btnYtDownload.disabled = false;
    el.btnYtText.textContent = "⚡ Download & Load";
  }
}

function setupYouTubeDownloader() {
  setupVideoUrlShortcuts();
  setupImageDurationControls();
  if (el.btnYtText) el.btnYtText.textContent = "⚡ Download & Load";
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
      const picker = document.getElementById("x-video-picker");
      if (picker) {
        picker.replaceChildren();
        picker.classList.add("hidden");
      }
      saveProjectState();
    });
  }

  // YouTube download execution
  if (el.btnYtDownload) {
    el.btnYtDownload.addEventListener("click", async () => {
      if (el.btnYtDownload.disabled) return;
      let url = el.inputYtUrl.value.trim();
      if (!url) {
        showToast("Please paste a video, image or post URL");
        return;
      }
      localStorage.setItem("reel_yt_url", url);
      saveProjectState();

      el.btnYtDownload.disabled = true;
      el.btnYtText.textContent = "Detecting media…";
      el.ytProgressBox.classList.remove("hidden");
      el.ytProgressBar.style.width = "10%";
      el.ytProgressPercent.textContent = "10%";
      el.ytProgressLabel.textContent = "Checking whether this link contains a video or image…";

      try {
        const sourceGeneration = state.sourceGeneration;
        const detectedResponse = await fetch("/api/media/detect", {
          method: "POST", headers: {"Content-Type": "application/json"},
          body: JSON.stringify({url})
        });
        const detected = await detectedResponse.json();
        if (!detectedResponse.ok) throw new Error(
          [404, 405].includes(detectedResponse.status)
            ? "Restart Vibe Editor and refresh Studio to enable automatic media detection."
            : detected.detail || "Could not detect media from this link"
        );
        if (url !== el.inputYtUrl.value.trim() || sourceGeneration !== state.sourceGeneration) {
          el.btnYtDownload.disabled = false;
          el.btnYtText.textContent = "⚡ Download & Load";
          el.ytProgressLabel.textContent = "Source changed. Paste your link and load it again.";
          return;
        }
        if (detected.media_type === "images") {
          await downloadPostImages(sourceGeneration);
          return;
        }
        if (detected.media_type !== "video") throw new Error("No supported video or image was found at this link.");
        document.getElementById("image-download-results")?.classList.add("hidden");
        const parsedSource = new URL(url);
        const isXPost = ["x.com", "www.x.com", "mobile.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com"].includes(parsedSource.hostname.toLowerCase());
        if (isXPost && !/\/video\/\d+\/?$/.test(parsedSource.pathname)) {
          el.btnYtText.textContent = "Finding videos in this post...";
          const videosRes = Array.isArray(detected.videos) ? null : await fetch("/api/twitter/videos", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url })
          });
          const videosData = videosRes ? await videosRes.json() : detected;
          if (videosRes && !videosRes.ok) throw new Error(videosData.detail || "Could not load videos from this post");
          if (el.inputYtUrl.value.trim() !== url) {
            el.btnYtDownload.disabled = false;
            el.btnYtText.textContent = "⚡ Download & Load";
            el.ytProgressBox.classList.add("hidden");
            return;
          }
          const videos = videosData.videos || [];
          if (!videos.length) throw new Error("No videos were found in this post");
          if (videos.length > 1) {
            const picker = document.getElementById("x-video-picker");
            if (!picker) throw new Error("Refresh Studio to load the video picker");
            picker.replaceChildren();
            const heading = document.createElement("p");
            heading.textContent = "Choose one video to download";
            picker.append(heading);
            for (const video of videos) {
              const choice = document.createElement("button");
              choice.type = "button";
              choice.className = "x-video-choice";
              if (video.thumbnail) {
                const thumbnail = document.createElement("img");
                thumbnail.src = video.thumbnail;
                thumbnail.alt = `Video ${video.index} thumbnail`;
                thumbnail.loading = "lazy";
                choice.append(thumbnail);
              }
              const label = document.createElement("span");
              const duration = Number(video.duration);
              const time = Number.isFinite(duration) && duration > 0
                ? ` · ${Math.floor(duration / 60)}:${String(Math.floor(duration % 60)).padStart(2, "0")}` : "";
              label.textContent = `Download video ${video.index}${time}`;
              choice.append(label);
              choice.title = video.title || label.textContent;
              choice.addEventListener("click", () => {
                el.inputYtUrl.value = video.url;
                el.inputYtUrl.dispatchEvent(new Event("input", { bubbles: true }));
                el.btnYtDownload.click();
              });
              picker.append(choice);
            }
            picker.classList.remove("hidden");
            el.btnYtDownload.disabled = false;
            el.btnYtText.textContent = "⚡ Download & Load";
            el.ytProgressBox.classList.add("hidden");
            return;
          }
          url = videos[0].url;
          el.inputYtUrl.value = url;
          localStorage.setItem("reel_yt_url", url);
          saveProjectState();
        }
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

        // Poll download progress. Async interval callbacks can overlap, so only
        // one response is allowed to finish/import this task.
        let pollFinished = false;
        const pollInterval = setInterval(async () => {
          try {
            const statusRes = await fetch(`/api/youtube/status/${task_id}`);
            const task = await statusRes.json();
            if (pollFinished) return;
            if (!statusRes.ok) throw new Error(task.detail || "Could not check download progress");
            if (sourceGeneration !== state.sourceGeneration || url !== el.inputYtUrl.value.trim()) {
              pollFinished = true;
              clearInterval(pollInterval);
              el.btnYtDownload.disabled = false;
              el.btnYtText.textContent = "⚡ Download & Load";
              el.ytProgressLabel.textContent = "Source changed. Paste your link and load it again.";
              return;
            }

            el.ytProgressBar.style.width = `${task.progress}%`;
            el.ytProgressPercent.textContent = `${Math.round(task.progress)}%`;
            el.ytProgressLabel.textContent = task.message || "Downloading...";

            if (task.status === "completed") {
              pollFinished = true;
              clearInterval(pollInterval);
              localStorage.setItem("reel_yt_url_loaded", url);
              el.btnYtDownload.disabled = false;
              el.btnYtText.textContent = "⚡ Download & Load";
              el.ytProgressLabel.textContent = "Video downloaded and ready in Studio.";

              // Load the downloaded video file into studio
              await loadFile(task.file_path, task.title);

              showToast("Video downloaded. Use the Studio buttons when you want AI moments or subtitles.");

              saveProjectState();

              setTimeout(() => {
                el.ytProgressBox.classList.add("hidden");
              }, 4000);

            } else if (task.status === "error") {
              pollFinished = true;
              clearInterval(pollInterval);
              el.btnYtDownload.disabled = false;
              el.btnYtText.textContent = "⚡ Download & Load";
              el.ytProgressLabel.textContent = "Error: " + task.message;
              showToast("Download failed: " + task.message);
            }
          } catch (pollErr) {
            pollFinished = true;
            clearInterval(pollInterval);
            el.btnYtDownload.disabled = false;
            el.btnYtText.textContent = "⚡ Download & Load";
            showToast("Error tracking download status");
          }
        }, 800);

      } catch (err) {
        el.btnYtDownload.disabled = false;
        el.btnYtText.textContent = "⚡ Download & Load";
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
async function uploadLocalImage(file) {
  if (!file) return;
  const button = document.getElementById("btn-upload-local-image");
  const picker = document.getElementById("input-local-image");
  const status = document.getElementById("local-image-status");
  if (button?.disabled || el.btnYtDownload?.disabled) return;
  const duration = Number(document.getElementById("input-local-image-duration")?.value || 10);
  if (!Number.isFinite(duration) || duration < 1 || duration > 300) {
    if (status) status.textContent = "Choose an image duration from 1 to 300 seconds.";
    showToast("Choose an image duration from 1 to 300 seconds.");
    if (picker) picker.value = "";
    return;
  }
  if (file.size > 30 * 1024 * 1024) {
    if (status) status.textContent = "Choose an image smaller than 30 MB.";
    showToast("Choose an image smaller than 30 MB.");
    if (picker) picker.value = "";
    return;
  }
  const generation = state.sourceGeneration;
  if (button) button.disabled = true;
  if (el.btnYtDownload) el.btnYtDownload.disabled = true;
  try {
    if (status) status.textContent = "Uploading image…";
    const body = new FormData();
    body.append("file", file);
    const response = await fetch("/api/images/upload", {method: "POST", body});
    const image = await response.json();
    if (response.status === 404 || response.status === 405) throw new Error("Restart Vibe Editor, then refresh Studio to enable local image uploads.");
    if (!response.ok) throw new Error(image.detail || "Could not upload the image");
    if (!image.file_path) throw new Error("The upload did not return an image file. Try again.");
    if (generation !== state.sourceGeneration) {
      if (status) status.textContent = "The source changed while uploading. Select the image again to load it.";
      return;
    }
    if (status) status.textContent = "Preparing image for Studio…";
    await loadDownloadedImage(image, duration);
    if (status) status.textContent = el.ytProgressLabel.textContent;
  } catch (error) {
    if (status) status.textContent = `Error: ${error.message}`;
    showToast(`Image upload failed: ${error.message}`);
  } finally {
    if (button) button.disabled = false;
    if (el.btnYtDownload) el.btnYtDownload.disabled = false;
    if (picker) picker.value = "";
  }
}

function setupFileHandling() {
  const imageButton = el.btnLocalImage;
  const imagePicker = el.inputLocalImage;
  if (imageButton && imagePicker) {
    imageButton.addEventListener("click", () => imagePicker.click());
    imagePicker.addEventListener("change", event => uploadLocalImage(event.target.files?.[0]));
  }
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
    if (file.type?.startsWith("image/") || /\.(?:jpe?g|png|webp|gif|avif|bmp|tiff?)$/i.test(file.name || "")) {
      await uploadLocalImage(file);
      return;
    }
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

const audioAudition = { controller: null, url: null, selection: null, request: 0, promise: null, desired: "original" };

function audioSelectionKey() {
  return `${state.sourceGeneration}:${state.startTime}:${state.endTime}`;
}

function resetAudioAudition() {
  audioAudition.request++;
  if (audioAudition.controller) audioAudition.controller.abort();
  audioAudition.controller = null;
  audioAudition.promise = null;
  audioAudition.desired = "original";
  audioAudition.selection = null;
  state.playbackAudio = "original";
  if (el.audioMasterPlayer) {
    el.audioMasterPlayer.pause();
    el.audioMasterPlayer.removeAttribute("src");
    el.audioMasterPlayer.load();
    el.audioMasterPlayer.classList.add("hidden");
  }
  if (audioAudition.url) URL.revokeObjectURL(audioAudition.url);
  audioAudition.url = null;
  if (el.audioMasterStatus) el.audioMasterStatus.textContent = "";
  syncPlaybackAudioButtons();
}

function syncPlaybackAudioButtons() {
  if (el.btnPlaybackOriginal) el.btnPlaybackOriginal.classList.toggle("active", state.playbackAudio === "original");
  if (el.btnPlaybackEnhanced) el.btnPlaybackEnhanced.classList.toggle("active", state.playbackAudio === "enhanced");
  el.btnPlaybackOriginal?.setAttribute?.("aria-pressed", String(state.playbackAudio === "original"));
  el.btnPlaybackEnhanced?.setAttribute?.("aria-pressed", String(state.playbackAudio === "enhanced"));
  el.btnPlaybackEnhanced?.setAttribute?.("aria-busy", String(!!audioAudition.controller));
}

function enhancedPlaybackReady() {
  return state.playbackAudio === "enhanced" &&
    audioAudition.selection === audioSelectionKey() &&
    !!audioAudition.url && !!el.audioMasterPlayer;
}

function restoreOriginalPreviewAudio() {
  const video = el.hiddenVideo;
  if (!video) return;
  const clipStart = Number(state.startTime) || 0;
  const current = Number(video.currentTime);
  const isLoopFadeIn = state.smartLoop && state.isLooping &&
    Number.isFinite(current) && current - clipStart >= 0 && current - clipStart < 0.22;
  video.muted = false;
  video.volume = typeof window !== "undefined" && window.musicStudio ? window.musicStudio.originalGain(isLoopFadeIn ? 0.2 : 1) : (isLoopFadeIn ? 0.2 : 1);
}

function syncEnhancedAudioToVideo(force = false) {
  if (!enhancedPlaybackReady() || !el.hiddenVideo || !el.audioMasterPlayer) return;
  const expected = Math.max(0, el.hiddenVideo.currentTime - state.startTime);
  if (force || Math.abs(el.audioMasterPlayer.currentTime - expected) > 0.12) {
    try { el.audioMasterPlayer.currentTime = expected; } catch (_) {}
  }
}

async function playEnhancedAudioWithVideo() {
  if (!enhancedPlaybackReady() || !el.hiddenVideo || !el.audioMasterPlayer) return;
  const request = audioAudition.request;
  syncEnhancedAudioToVideo(true);
  try {
    el.audioMasterPlayer.muted = false;
    el.audioMasterPlayer.volume = typeof window !== "undefined" && window.musicStudio ? window.musicStudio.originalGain(1) : 1;
    await el.audioMasterPlayer.play();
  } catch (error) {
    if (request !== audioAudition.request || state.playbackAudio !== "enhanced" || audioAudition.selection !== audioSelectionKey()) return;
    state.playbackAudio = "original";
    restoreOriginalPreviewAudio();
    syncPlaybackAudioButtons();
    if (el.audioMasterStatus) el.audioMasterStatus.textContent = "Enhanced audio could not start, so Studio restored the original audio.";
  }
}

async function selectPlaybackAudio(mode) {
  if (mode === "original") {
    audioAudition.desired = "original";
    state.playbackAudio = "original";
    if (el.audioMasterPlayer) el.audioMasterPlayer.pause();
    restoreOriginalPreviewAudio();
    syncPlaybackAudioButtons();
    if (el.audioMasterStatus) el.audioMasterStatus.textContent = audioAudition.url
      ? "Original playing · Enhanced is cached for instant comparison."
      : audioAudition.controller ? "Original playing · Enhanced is preparing in the background…" : "Original audio selected.";
    return;
  }

  // The audition must always represent what will be exported.  Previously the
  // Enhanced audio button could prepare a mastered preview while the export
  // toggle remained off, making a creator hear one mix and export another.
  if (state.audioMaster?.enabled !== true) {
    state.audioMaster = { ...(state.audioMaster || {}), enabled: true };
    if (el.checkAudioMaster) el.checkAudioMaster.checked = true;
    saveProjectState();
  }

  const selection = audioSelectionKey();
  const start = Number(state.startTime);
  const end = Number(state.endTime);
  const status = message => { if (el.audioMasterStatus) el.audioMasterStatus.textContent = message; };
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) {
    status("Select a valid audio range to compare.");
    return;
  }
  if (audioAudition.selection && audioAudition.selection !== selection) resetAudioAudition();
  audioAudition.desired = "enhanced";
  const activate = async () => {
    state.playbackAudio = "enhanced";
    syncPlaybackAudioButtons();
    syncEnhancedAudioToVideo(true);
    if (state.isPlaying && el.hiddenVideo && !el.hiddenVideo.paused) {
      el.hiddenVideo.muted = true;
      el.hiddenVideo.volume = 0;
      await playEnhancedAudioWithVideo();
    }
    if (state.playbackAudio === "enhanced") status("Enhanced ready · Cached for instant A/B comparison.");
  };
  if (audioAudition.selection === selection && audioAudition.url) {
    await activate();
    return;
  }
  if (audioAudition.selection === selection && audioAudition.promise) return audioAudition.promise;
  const request = ++audioAudition.request;
  audioAudition.selection = selection;
  const controller = new AbortController();
  audioAudition.controller = controller;
  const current = () => request === audioAudition.request && selection === audioSelectionKey();
  syncPlaybackAudioButtons();
  status("Preparing enhanced audio once for this clip… Original keeps playing.");
  const preparation = (async () => {
  try {
    const sourceVideo = await ensureServerVideoPathForAnalysis();
    if (!current()) return;
    const response = await fetch("/api/audio/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ source_video: sourceVideo, start_time: start, end_time: end, audio_master: { enabled: true } })
    });
    if (!response.ok) {
      const failure = await response.json().catch(() => ({}));
      const detail = typeof failure.detail === "string"
        ? failure.detail
        : Array.isArray(failure.detail)
          ? failure.detail.map(item => item.msg || "Invalid audio preview request.").join(" ")
          : "";
      throw new Error(detail || `Audio preview failed (${response.status}). Reload the source and try again.`);
    }
    const blob = await response.blob();
    if (!current()) return;
    if (!el.audioMasterPlayer) throw new Error("Audio player unavailable. Reload the page and try again.");
    audioAudition.url = URL.createObjectURL(blob);
    el.audioMasterPlayer.src = audioAudition.url;
    el.audioMasterPlayer.load?.();
    const player = el.audioMasterPlayer;
    if (Number.isFinite(player.readyState) && player.readyState < 2) {
      await new Promise((resolve, reject) => {
        const cleanup = () => {
          clearTimeout(timer);
          player.removeEventListener("canplay", ready);
          player.removeEventListener("error", failed);
          controller.signal.removeEventListener("abort", cancelled);
        };
        const ready = () => { cleanup(); resolve(); };
        const failed = () => { cleanup(); reject(new Error("Enhanced audio could not be loaded. Try Enhanced again.")); };
        const cancelled = () => { cleanup(); const error = new Error("Audio preparation cancelled."); error.name = "AbortError"; reject(error); };
        const timer = setTimeout(failed, 15000);
        player.addEventListener("canplay", ready, {once: true});
        player.addEventListener("error", failed, {once: true});
        controller.signal.addEventListener("abort", cancelled, {once: true});
        if (controller.signal.aborted) cancelled();
      });
    }
    if (!current()) return;
    if (audioAudition.desired === "enhanced") await activate();
    else status("Original playing · Enhanced is cached for instant comparison.");
  } catch (error) {
    if (current() && error.name !== "AbortError") {
      resetAudioAudition();
      restoreOriginalPreviewAudio();
      status(error.message || "Could not prepare enhanced audio. Try again.");
    }
  } finally {
    if (request === audioAudition.request) {
      audioAudition.controller = null;
      audioAudition.promise = null;
      syncPlaybackAudioButtons();
    }
  }
  })();
  audioAudition.promise = preparation;
  return preparation;
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
  // Keep the whole source selected until the creator explicitly chooses an
  // AI-recommended moment. This makes every uploaded video immediately
  // reviewable from start to finish.
  state.startTime = 0;
  state.endTime = dur;
  state.currentTime = 0;
  state.playbackStartPos = 0;
  renderAIResults(analysis, "full");
  updateTimelineUI();
  updatePlayheadUI(0);
  renderReel();
}

async function loadFile(pathOrUrl, optionalName, localFile = null, options = {}) {
  resetAudioAudition();
  if (!options.preserveEdits && !options.preserveReelName) {
    state.reelName = "";
    state.hideRegions = [];
    state.hideAreaDrawing = false;
    state.hideAreaDraft = null;
    if (typeof syncHideAreaControls === "function") syncHideAreaControls();
    if (typeof syncExportName === "function") syncExportName();
    state.adjustments = {...state.adjustments, scale: 1, verticalOffset: 0, windowInset: 0};
    if (typeof syncAdjustmentSliders === "function") syncAdjustmentSliders();
  }
  const generation = ++state.sourceGeneration;
  state._preserveImageEditsGeneration = options.preserveEdits ? generation : null;
  if (!options.preserveEdits) {
    state.imageSourcePath = "";
    state.imageDuration = null;
    state._imagePreviewDuration = null;
    state._imageDurationOriginalRange = null;
    state._imageDurationError = false;
  }
  state._uploadPromise = null;
  state.videoFile = localFile;
  state.videoMeta = null;
  state._compatibilityAttemptPath = null;
  state.videoPath = pathOrUrl;
  el.imageDurationRow?.classList.toggle("hidden", !isLoadedStudioImage());
  const filename = optionalName || pathOrUrl.split(/[\\/]/).pop();
  state.videoTitle = optionalName || filename;

  if (!options.preserveEdits) {
  // Reset previous song's AI moments & lyrics
  state.aiAnalysis = null;
  state.activeMoment = "rec";
  state.lyrics = [];
  state.fullLyrics = [];
  state.lyricsByMoment = {};
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
      if (state._compatibilityAttemptPath === pathOrUrl) return;
      state._compatibilityAttemptPath = pathOrUrl;
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
    if (options.preserveEdits && !probeRes.ok) throw new Error("Could not load the updated image preview. Retry its duration.");
    if (probeRes.ok) {
      const meta = await probeRes.json();
      if (generation !== state.sourceGeneration) return;
      state.videoMeta = meta;
      if (!options.preserveEdits) state.clientCrop = null;
      el.metaRes.textContent = meta.resolution;
      el.metaAspect.textContent = meta.aspect_ratio;
      el.metaFps.textContent = `${meta.fps} FPS`;
      el.metaAudio.textContent = meta.has_audio ? `${meta.audio_codec}` : "No Audio";
      el.activeFileMeta.textContent = meta.resolution;
      el.videoInfoCard.classList.remove("hidden");
      renderReel();
      showToast(`Loaded: ${filename}`);

      if (meta.duration && meta.duration > 0) {
        if (options.preserveEdits) {
          state.startTime = 0;
          state.endTime = meta.duration;
          state.currentTime = 0;
          state.playbackStartPos = 0;
          if (el.inputStartTime) el.inputStartTime.value = 0;
          if (el.inputEndTime) el.inputEndTime.value = meta.duration;
          updateTimelineUI();
          updatePlayheadUI(0);
        } else initDynamicClipForVideo(meta.duration);
      }

    }
  } catch (e) {
    console.warn("Probe skipped or local blob:", e);
    if (options.preserveEdits) throw e;
  }
  if (generation === state.sourceGeneration) saveProjectState();
}

// -------------------------------------------------------------
// METADATA & AI HOOK ANALYSIS
// -------------------------------------------------------------
function applyAIClip(start, end, momentId = "rec") {
  if (!Number.isFinite(Number(start)) || !Number.isFinite(Number(end)) || Number(end) <= Number(start)) {
    showToast("No audio-analyzed moment is available yet.");
    return;
  }
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

  // Only whole-video subtitles have a guaranteed full-video timestamp basis.
  // Moment analysis can return clip-relative lyric estimates, so never carry
  // those estimates into another selected moment or the live player.
  if (state.fullLyrics && state.fullLyrics.length > 0) {
    state.fullLyrics = state.fullLyrics.map(cue => ({ ...cue, timeline_basis: cue.timeline_basis || "absolute" }));
    state.lyrics = state.fullLyrics;
  } else {
    state.lyrics = [];
  }
  renderLyricsList(state.lyrics);

  renderReel();
  if (state.aiAnalysis) {
    renderAIResults(state.aiAnalysis, momentId);
  }
  saveProjectState();
}

function getDefaultAIAnalysis(dur = 90) {
  const songLabel = state.songName || (state.videoTitle ? state.videoTitle.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ").trim() : "Anime Song");

  return {
    song_name: songLabel,
    anime_name: state.animeName || "",
    model_used: "Awaiting audio analysis",
    status: "unavailable",
    score: null,
    recommended_start: null,
    recommended_end: null,
    clip_type: "No analyzed moment",
    reason: "Analyze the loaded audio to choose a natural start, payoff, and ending.",
    alternatives: []
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
  const hasRecommendation = Number.isFinite(Number(data.recommended_start)) &&
    Number.isFinite(Number(data.recommended_end)) && Number(data.recommended_end) > Number(data.recommended_start);
  const recDur = hasRecommendation ? Math.round((data.recommended_end - data.recommended_start) * 10) / 10 : null;
  const typeTag = data.clip_type ? ` · ${data.clip_type}` : "";
  if (el.aiRecTimes) el.aiRecTimes.textContent = hasRecommendation
    ? `${formatTime(data.recommended_start, 1)} → ${formatTime(data.recommended_end, 1)} (${recDur}s)${typeTag}`
    : `No moment selected${typeTag}`;
  if (el.aiReason) el.aiReason.textContent = `"${data.reason || 'No analysis explanation available.'}"`;

  // Highlight recommended button if active
  if (el.btnApplyRec) {
    el.btnApplyRec.disabled = !hasRecommendation;
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
      series: { x: 540, y: 360, size: 68, lineGap: 16, color: "#ffffff" },
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
  const isSeries = state.selectedTextElem === "series";
  if (el.hookLineGapRow) el.hookLineGapRow.classList.toggle("hidden", !isSeries);
  if (isSeries) {
    const gap = Number.isFinite(Number(elem.lineGap)) ? Number(elem.lineGap) : 12;
    if (el.sliderHookLineGap) el.sliderHookLineGap.value = gap;
    if (el.valHookLineGap) el.valHookLineGap.textContent = `${gap}px`;
  }
  if (el.sliderTextY) el.sliderTextY.value = elem.y || 320;
  if (el.valTextY) el.valTextY.textContent = `${elem.y || 320}px`;
  if (el.sliderTextX) el.sliderTextX.value = elem.x || 540;
  if (el.valTextX) el.valTextX.textContent = (elem.x === 540) ? "Center" : `${elem.x}px`;

  let color = elem.color;
  if (!color) {
    color = "#ffffff";
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

  const fgScale = getSongWindowScale(state.adjustments && state.adjustments.scale);
  const {x: fgX, y: fgY} = getVideoFrameGeometry(rawW, rawH, 1080, 1920, fgScale, state.adjustments.verticalOffset);
  const defaultWmX = fgX + 35;
  const defaultWmY = fgY + 45;

  state.textElements = {
    series: { x: 540, y: 360, size: 68, lineGap: 16, color: "#ffffff" },
    creatorBadge: { x: 540, y: 160, size: 30, color: "#ffffff" },
    watermark: { x: defaultWmX, y: defaultWmY, size: 28, color: "#ffffff" },
    subtitles: { x: 540, y: 1690, size: 38, color: "#ffffff" }
  };
  selectTextElement(state.selectedTextElem || "series");
  renderReel();
  saveProjectState();
}

const MAX_HIDE_AREAS = 12;

function normalizeHideRegions(regions = state.hideRegions) {
  if (!Array.isArray(regions)) return [];
  return regions.slice(0, MAX_HIDE_AREAS).filter(region => region &&
    [region.x, region.y, region.width, region.height].every(value => typeof value === "number" && Number.isFinite(value)) &&
    region.x >= 0 && region.x < 1 && region.y >= 0 && region.y < 1 && region.width > 0 && region.height > 0)
    .map(region => ({x: region.x, y: region.y, width: Math.min(region.width, 1 - region.x), height: Math.min(region.height, 1 - region.y)}));
}

function applyHideAreaClips(context, width, height) {
  const regions = normalizeHideRegions();
  if (state.hideAreaDrawing && state.hideAreaDraft?.width > 0 && state.hideAreaDraft?.height > 0) regions.push(state.hideAreaDraft);
  // Intersect the outside of each rectangle. Separate clips preserve overlap
  // as hidden too; one combined even-odd path would reveal overlapping holes.
  for (const region of regions) {
    context.beginPath();
    context.rect(0, 0, width, height);
    context.rect(region.x * width, region.y * height, region.width * width, region.height * height);
    context.clip("evenodd");
  }
}

function drawHideAreaGuides(context, width, height) {
  if (!state.hideAreaDrawing) return;
  const regions = normalizeHideRegions();
  if (state.hideAreaDraft) regions.push(state.hideAreaDraft);
  context.save();
  context.globalAlpha = 1;
  context.strokeStyle = "#fff";
  context.shadowColor = "#000";
  context.shadowBlur = 3;
  context.lineWidth = 3;
  context.setLineDash([10, 6]);
  for (const region of regions) context.strokeRect(region.x * width, region.y * height, region.width * width, region.height * height);
  context.restore();
}

function syncHideAreaControls() {
  const regions = normalizeHideRegions();
  const draw = document.getElementById("btn-draw-hide-area");
  const clear = document.getElementById("btn-clear-hide-areas");
  const status = document.getElementById("hide-area-status");
  if (draw) {
    draw.textContent = state.hideAreaDrawing ? "Cancel" : "Draw area";
    draw.setAttribute("aria-pressed", String(!!state.hideAreaDrawing));
    draw.disabled = !state.hideAreaDrawing && regions.length >= MAX_HIDE_AREAS;
  }
  if (clear) clear.disabled = !regions.length;
  if (status) status.textContent = state.hideAreaDrawing
    ? "Drag a rectangle on the preview. Escape cancels."
    : regions.length ? `${regions.length} hidden area${regions.length === 1 ? "" : "s"} · Applies throughout this clip.` : "Cover unwanted parts with the current background.";
  el.reelCanvas?.classList.toggle("hide-area-drawing", !!state.hideAreaDrawing);
  const list = document.getElementById("hide-area-list");
  if (!list) return;
  list.innerHTML = "";
  regions.forEach((region, index) => {
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "hide-area-chip";
    remove.textContent = `Area ${index + 1} ×`;
    remove.setAttribute("aria-label", `Remove hidden area ${index + 1}`);
    remove.addEventListener("click", () => {
      state.hideRegions = normalizeHideRegions().filter((item, position) => position !== index);
      syncHideAreaControls(); renderReel(); saveProjectState();
    });
    list.appendChild(remove);
  });
}

function setupHideAreas() {
  const canvas = el.reelCanvas;
  if (!canvas) return;
  let start = null, pointerId = null;
  const finishMode = () => {
    start = null; pointerId = null;
    state.hideAreaDrawing = false;
    state.hideAreaDraft = null;
    syncHideAreaControls(); renderReel();
  };
  const point = event => {
    const rect = canvas.getBoundingClientRect();
    return {x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
            y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))};
  };
  const update = event => {
    const end = point(event);
    state.hideAreaDraft = {x: Math.min(start.x, end.x), y: Math.min(start.y, end.y),
      width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y)};
    renderReel();
  };
  document.getElementById("btn-draw-hide-area")?.addEventListener("click", () => {
    if (state.hideAreaDrawing) { finishMode(); return; }
    if (!state.videoPath) { showToast("Load a video or image before drawing an area."); return; }
    if (normalizeHideRegions().length >= MAX_HIDE_AREAS) return;
    pauseVideo();
    _textDragState = null;
    state.isTextElementSelected = false;
    state.hoveredTextElem = null;
    state.hideAreaDrawing = true;
    syncHideAreaControls(); renderReel();
  });
  document.getElementById("btn-clear-hide-areas")?.addEventListener("click", () => {
    state.hideRegions = [];
    finishMode(); saveProjectState();
  });
  canvas.addEventListener("pointerdown", event => {
    if (!state.hideAreaDrawing || (event.button !== undefined && event.button !== 0)) return;
    event.preventDefault();
    start = point(event); pointerId = event.pointerId;
    canvas.setPointerCapture?.(pointerId);
    update(event);
  });
  canvas.addEventListener("pointermove", event => {
    if (!state.hideAreaDrawing || !start || event.pointerId !== pointerId) return;
    event.preventDefault(); update(event);
  });
  canvas.addEventListener("pointerup", event => {
    if (!state.hideAreaDrawing || !start || event.pointerId !== pointerId) return;
    event.preventDefault(); update(event);
    const region = state.hideAreaDraft;
    if (region.width * 1080 >= 8 && region.height * 1920 >= 8) {
      state.hideRegions = [...normalizeHideRegions(), region].slice(0, MAX_HIDE_AREAS);
      finishMode(); saveProjectState();
    } else {
      start = null; pointerId = null; state.hideAreaDraft = null; renderReel();
    }
  });
  canvas.addEventListener("pointercancel", finishMode);
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && state.hideAreaDrawing) { event.preventDefault(); finishMode(); }
  });
  syncHideAreaControls();
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
    // Small usernames still need a draggable middle. Oversized handle hit
    // areas used to cover the entire width/height of a 28px watermark.
    const threshold = Math.min(28, Math.max(7, Math.min(box.width, box.height) / 4));
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
    if (state.hideAreaDrawing) return;
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
    if (state.hideAreaDrawing) return;
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

// One active request per action; failures stay visible without discarding edits.
function setStudioAIStatus(id, message) {
  const status = document.getElementById(id);
  if (status) status.textContent = message;
}

function beginStudioAI(button, statusId, message, timeoutMs = 4 * 60 * 1000) {
  if (!button || button.disabled) return null;
  button.disabled = true;
  setStudioAIStatus(statusId, message);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    status(message) { setStudioAIStatus(statusId, message); },
    error(error) {
      return controller.signal.aborted
        ? "Gemini took too long to respond. Your existing work is safe. Please try again."
        : String(error?.message || "Could not reach Gemini. Check your API key and connection, then try again.");
    },
    finish() { clearTimeout(timer); button.disabled = false; }
  };
}

function aiResponseError(data, fallback) {
  if (typeof data?.detail === "string") return data.detail;
  if (Array.isArray(data?.detail)) return data.detail.map(item => item.msg || "Invalid request").join("; ");
  return typeof data?.error === "string" ? data.error : fallback;
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

  if (el.sliderHookLineGap) {
    el.sliderHookLineGap.addEventListener("input", (e) => {
      const gap = Math.max(0, Math.min(80, parseInt(e.target.value) || 0));
      state.textElements = state.textElements || {};
      state.textElements.series = state.textElements.series || { x: 540, y: 360, size: 38, color: "#ffffff" };
      state.textElements.series.lineGap = gap;
      state.textElements.series._custom = true;
      if (el.valHookLineGap) el.valHookLineGap.textContent = `${gap}px`;
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

  if (el.btnDayDec && el.btnDayInc && el.inputDay) {
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
  }

  if (el.inputSeriesText) {
    el.inputSeriesText.addEventListener("input", (e) => {
      state.seriesFormat = e.target.value;
      void refreshHookEmoji();
      renderReel();
      saveProjectState();
    });
  }
  if (el.selectHookFont) {
    applyHookFontOptionPreviews(el.selectHookFont);
    applyFontControl(el.selectHookFont, state.hookFont);
    el.selectHookFont.addEventListener("change", (e) => {
      state.hookFont = AVAILABLE_HOOK_FONTS.includes(e.target.value) ? e.target.value : DEFAULT_HOOK_FONT;
      const series = state.textElements?.series;
      if (series && !series._custom && Number(series.size) < 56) {
        series.size = 68;
        series.lineGap = Math.max(16, Number(series.lineGap) || 0);
      }
      applyFontControl(el.selectHookFont, state.hookFont);
      renderReel();
      saveProjectState();
    });
  }
  if (el.sliderHookFadeStart) {
    el.sliderHookFadeStart.addEventListener("input", (e) => {
      state.hookFade = { ...(state.hookFade || {}), start: Math.max(0, Number(e.target.value) || 0) };
      syncHookFadeControls();
      renderReel();
      saveProjectState();
    });
  }
  syncHookFadeControls();

  if (el.selectSubtitleFont) {
    applyFontControl(el.selectSubtitleFont, state.subtitleFont);
    el.selectSubtitleFont.addEventListener("change", (e) => {
      state.subtitleFont = FONT_STACKS[e.target.value] ? e.target.value : "segoe";
      applyFontControl(el.selectSubtitleFont, state.subtitleFont);
      renderReel();
      saveProjectState();
    });
  }
  if (el.hookEmojiButtons) {
    el.hookEmojiButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const input = el.inputSeriesText;
        const emoji = button.dataset.hookEmoji || "";
        if (!input || !emoji) return;
        const start = Number.isInteger(input.selectionStart) ? input.selectionStart : input.value.length;
        const end = Number.isInteger(input.selectionEnd) ? input.selectionEnd : start;
        input.value = input.value.slice(0, start) + emoji + input.value.slice(end);
        const caret = start + emoji.length;
        input.focus();
        input.setSelectionRange(caret, caret);
        state.seriesFormat = input.value;
        void refreshHookEmoji();
        renderReel();
        saveProjectState();
      });
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
      const request = beginStudioAI(el.btnGenerateAiHooks, "ai-hooks-status", "Reading your selected reel…");
      if (!request) return;
      const origText = el.btnGenerateAiHooks.textContent;
      const generation = state.sourceGeneration;
      const startTime = Number(state.startTime);
      const endTime = Number(state.endTime);
      const selectionIsCurrent = () => generation === state.sourceGeneration &&
        startTime === Number(state.startTime) && endTime === Number(state.endTime);
      el.btnGenerateAiHooks.textContent = "⏳ Reading selected reel...";
      el.btnGenerateAiHooks.disabled = true;
      if (el.aiHooksContainer) {
        el.aiHooksContainer.innerHTML = "";
        el.aiHooksContainer.classList.add("hidden");
      }
      try {
        if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || startTime < 0 || endTime <= startTime) {
          throw new Error("Select a valid reel start and end time first.");
        }
        if (endTime - startTime > 360) {
          throw new Error("Select a reel segment of 6 minutes or less for hook generation.");
        }
        const videoPath = await ensureServerVideoPathForAnalysis();
        if (!selectionIsCurrent()) throw new Error("The selected reel changed. Generate hooks again for the current selection.");
        const res = await fetch("/api/ai/viral-hooks", {
          signal: request.signal,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            video_path: videoPath,
            start_time: startTime,
            end_time: endTime,
            song_name: state.songName || "",
            anime_name: state.animeName || "",
            video_title: state.videoTitle || "",
            ...(state.aiInstruction?.trim() ? { creator_instruction: state.aiInstruction.trim() } : {})
          })
        });
        if (!res.ok) {
          const error = await res.json().catch(() => ({}));
          throw new Error(aiResponseError(error, "Hook generation failed. Check your Gemini API key and try again."));
        }
        const data = await res.json();
        if (!selectionIsCurrent()) throw new Error("The selected reel changed. Generate hooks again for the current selection.");
        const hooks = Array.isArray(data.hooks) ? data.hooks.filter(item => item && typeof item.hook === "string" && item.hook.trim()) : [];
        if (!hooks.length) throw new Error("No usable hooks were returned. Try another selected reel segment or generate again.");
        if (el.aiHooksContainer) {
          el.aiHooksContainer.innerHTML = "";
          el.aiHooksContainer.classList.remove("hidden");
          hooks.forEach((h) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "btn btn-sm";
            btn.style.cssText = "font-size:11px; line-height:1.35; padding:6px 10px; background:rgba(255,255,255,0.06); border:1px solid #38bdf844; color:#38bdf8; border-radius:10px; cursor:pointer; text-align:left; flex:1 1 100%; min-width:0; max-width:100%; white-space:normal; overflow-wrap:anywhere;";
            btn.textContent = h.hook;
            btn.title = h.evidence ? `Based on the selected reel: ${h.evidence}` : "Click to apply this viral hook";
            btn.addEventListener("click", () => {
              if (!selectionIsCurrent()) {
                el.aiHooksContainer.innerHTML = "";
                el.aiHooksContainer.classList.add("hidden");
                showToast("The selected reel changed. Generate hooks again for the current selection.");
                return;
              }
              state.seriesFormat = h.hook;
              if (el.inputSeriesText) el.inputSeriesText.value = h.hook;
              renderReel();
              saveProjectState();
              showToast("Applied viral hook: " + h.hook.slice(0, 30) + "...");
            });
            el.aiHooksContainer.appendChild(btn);
          });
        }
        request.status(`${hooks.length} hook suggestions ready. Click one to use it.`);
        showToast("✨ Generated viral hooks!");
      } catch (err) {
        request.status(request.error(err));
        showToast("Error generating hooks: " + request.error(err));
      } finally {
        el.btnGenerateAiHooks.textContent = origText;
        request.finish();
      }
    });
  }

  // AI Instagram Caption Generator — keeps a ready-to-copy caption in the project.
  if (el.btnGenerateAiCaption) {
    el.btnGenerateAiCaption.addEventListener("click", async () => {
      const request = beginStudioAI(el.btnGenerateAiCaption, "ai-caption-status", "Writing a caption from your details…");
      if (!request) return;
      const generation = state.sourceGeneration;
      const captionContext = () => JSON.stringify([state.startTime, state.endTime, state.songName, state.animeName, state.videoTitle, state.seriesFormat, state.aiInstruction, state.caption]);
      const originalContext = captionContext();
      const originalText = el.btnGenerateAiCaption.textContent;
      el.btnGenerateAiCaption.textContent = "⏳ Writing...";
      el.btnGenerateAiCaption.disabled = true;
      if (el.aiCaptionStatus) el.aiCaptionStatus.textContent = "Using your anime, song, and selected moment...";
      try {
        const res = await fetch("/api/ai/instagram-caption", {
          signal: request.signal,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            song_name: state.songName || "",
            anime_name: state.animeName || "",
            video_title: state.videoTitle || "",
            hook: state.seriesFormat || "",
            moment_type: (state.aiAnalysis && state.aiAnalysis.clip_type) || "",
            ...(state.aiInstruction?.trim() ? { creator_instruction: state.aiInstruction.trim() } : {})
          })
        });
        if (!res.ok) {
          const error = await res.json().catch(() => ({}));
          throw new Error(aiResponseError(error, "Caption generation failed. Check your Gemini API key and try again."));
        }
        const data = await res.json();
        if (generation !== state.sourceGeneration || captionContext() !== originalContext) {
          throw new Error("The reel details or caption changed while Gemini was working. Your edits were kept. Generate again when ready.");
        }
        const caption = String(data.caption || "").trim();
        if (!caption) throw new Error("No usable caption was returned");
        state.caption = caption;
        if (el.aiCaptionOutput) el.aiCaptionOutput.value = caption;
        if (el.schedCaption) el.schedCaption.value = caption;
        if (el.aiCaptionBox) el.aiCaptionBox.classList.remove("hidden");
        if (el.aiCaptionStatus) {
          el.aiCaptionStatus.textContent = data.source === "starter"
            ? "Starter caption used — add a Gemini key for verified anime details."
            : "Ready to copy. It is also saved for your scheduling screen.";
        }
        saveProjectState();
        showToast("✍️ Instagram caption ready to copy!");
      } catch (err) {
        if (el.aiCaptionStatus) el.aiCaptionStatus.textContent = "Could not generate caption: " + request.error(err);
        if (el.aiCaptionBox) el.aiCaptionBox.classList.remove("hidden");
        showToast("Error generating caption: " + request.error(err));
      } finally {
        el.btnGenerateAiCaption.textContent = originalText;
        request.finish();
      }
    });
  }

  if (el.aiCaptionOutput) {
    el.aiCaptionOutput.addEventListener("input", (e) => {
      state.caption = e.target.value;
      if (el.schedCaption) el.schedCaption.value = state.caption;
      saveProjectState();
    });
  }

  if (el.btnCopyAiCaption) {
    el.btnCopyAiCaption.addEventListener("click", async () => {
      const caption = (el.aiCaptionOutput && el.aiCaptionOutput.value) || state.caption || "";
      if (!caption.trim()) return;
      try {
        await navigator.clipboard.writeText(caption);
        showToast("Caption copied — paste it into Instagram.");
      } catch (_) {
        if (el.aiCaptionOutput) {
          el.aiCaptionOutput.focus();
          el.aiCaptionOutput.select();
        }
        showToast("Caption selected — press Ctrl+C to copy.");
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

  const watermarkStyle = document.getElementById("select-watermark-style");
  const watermarkFont = document.getElementById("select-watermark-font");
  const watermarkRotation = document.getElementById("select-watermark-rotation");
  const syncWatermarkAppearance = () => {
    const blended = state.watermark?.style === "scene_blend";
    if (watermarkRotation) watermarkRotation.disabled = !blended;
    const hint = document.getElementById("watermark-blend-hint");
    if (hint) hint.classList.toggle("hidden", !blended);
  };
  if (watermarkStyle) watermarkStyle.addEventListener("change", () => {
    state.watermark.style = ["clean", "scene_blend"].includes(watermarkStyle.value) ? watermarkStyle.value : "clean";
    syncWatermarkAppearance();
    renderReel();
    saveProjectState();
  });
  if (watermarkFont) {
    applyFontControl(watermarkFont, state.watermark.font);
    watermarkFont.addEventListener("change", () => {
      state.watermark.font = FONT_STACKS[watermarkFont.value] ? watermarkFont.value : "bahnschrift";
      applyFontControl(watermarkFont, state.watermark.font);
      renderReel();
      saveProjectState();
      void refreshWatermarkFont();
    });
  }
  if (watermarkFont) void refreshWatermarkFont();
  document.fonts?.addEventListener?.("loadingdone", () => renderReel());
  if (watermarkRotation) watermarkRotation.addEventListener("change", () => {
    state.watermark.rotation = Number(watermarkRotation.value) === 90 ? 90 : 0;
    renderReel();
    saveProjectState();
  });
  syncWatermarkAppearance();

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

  // AI Hook Analysis — only loaded audio; never apply an obsolete response.
  if (el.btnAnalyzeAI) el.btnAnalyzeAI.addEventListener("click", async () => {
    const request = beginStudioAI(el.btnAnalyzeAI, "ai-analysis-status", "Listening for a complete musical moment…");
    if (!request) return;
    const generation = state.sourceGeneration;
    const start = state.startTime, end = state.endTime;
    const songName = state.songName, animeName = state.animeName;
    const current = () => generation === state.sourceGeneration && start === state.startTime && end === state.endTime;
    el.aiLoading?.classList.remove("hidden");
    el.btnAnalyzeAI.textContent = "Listening…";
    try {
      const videoPath = await ensureServerVideoPathForAnalysis();
      if (!current()) throw new Error("The video or trim changed. Analyze the current selection again.");
      const dur = Number(state.videoMeta?.duration || el.hiddenVideo?.duration);
      if (!Number.isFinite(dur) || dur <= 0) throw new Error("Wait for the loaded video duration, then try again.");
      const res = await fetch("/api/ai/analyze", {
        signal: request.signal,
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({song_name: songName || "", anime_name: animeName || "", video_title: state.videoTitle || "", duration: dur, video_path: videoPath})
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(aiResponseError(data, `Audio analysis failed (${res.status}). Please try again.`));
      }
      const data = await res.json();
      if (!current() || videoPath !== state.videoPath) throw new Error("The video or trim changed. Your current selection was kept. Analyze again.");
      const validRange = (start, end) => Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start && end <= dur + 0.1;
      if (data.status !== "success" || !validRange(data.recommended_start, data.recommended_end)) {
        throw new Error(data.reason || "Gemini did not return a valid audio-based moment. Your current trim was kept.");
      }
      data.alternatives = Array.isArray(data.alternatives) ? data.alternatives.filter(item => validRange(item.start, item.end)) : [];
      if (data.song_name && state.songName === songName) {
        state.songName = data.song_name;
        if (el.inputSongName) el.inputSongName.value = data.song_name;
      }
      if (data.anime_name && state.animeName === animeName) {
        state.animeName = data.anime_name;
        if (el.inputAnimeName) el.inputAnimeName.value = data.anime_name;
      }
      renderAIResults(data, "rec");
      applyAIClip(data.recommended_start, data.recommended_end, "rec");
      request.status("Audio-based moment selected. Your existing subtitles and style were kept.");
      saveProjectState();
      showToast("Audio-based moment ready.");
    } catch (error) {
      request.status(request.error(error));
      showToast("Audio analysis: " + request.error(error));
    } finally {
      el.aiLoading?.classList.add("hidden");
      el.btnAnalyzeAI.innerHTML = '<span>✨ Analyze Song</span>';
      request.finish();
    }
  });

  function handleApplyRecommended() {
    const analysis = state.aiAnalysis;
    if (analysis && Number.isFinite(Number(analysis.recommended_start)) &&
        Number.isFinite(Number(analysis.recommended_end)) && analysis.recommended_end > analysis.recommended_start) {
      applyAIClip(analysis.recommended_start, analysis.recommended_end, "rec");
      showToast("✓ Applied Recommended Clip to Playbar!");
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

  // Generate vocal-synchronized subtitles for the ENTIRE video without discarding edits.
  if (el.btnSyncFullLyrics) {
    el.btnSyncFullLyrics.addEventListener("click", async () => {
      const request = beginStudioAI(el.btnSyncFullLyrics, "subtitle-generation-status", "Preparing the audio. Existing subtitles stay safe while Gemini listens…", 15 * 60 * 1000);
      if (!request) return;
      const generation = state.sourceGeneration;
      const originalLyrics = JSON.stringify(state.lyrics || []);
      if (el.lyricsLoading) {
        el.lyricsLoading.classList.remove("hidden");
        const loadingText = el.lyricsLoading.querySelector("p");
        if (loadingText) loadingText.textContent = "Listening to the full video in sections. Longer videos can take a few minutes…";
      }
      if (el.btnSyncFullText) el.btnSyncFullText.textContent = "Generating subtitles…";
      try {
        if (state._uploadPromise || String(state.videoPath || "").startsWith("blob:")) await ensureServerVideoPathForAnalysis();
        if (generation !== state.sourceGeneration) throw new Error("The video changed. Generate subtitles for the current video again.");
        if (!state.videoPath || String(state.videoPath).startsWith("blob:")) {
          throw new Error("Please wait for the video to finish loading, then try Whole Video Subtitles again.");
        }
        const sourcePath = state.videoPath;
        const dur = Number(state.videoMeta?.duration || el.hiddenVideo?.duration);
        if (!Number.isFinite(dur) || dur <= 0) throw new Error("Wait for the loaded video duration, then try again.");
        request.status("Gemini is transcribing the audio and timing each subtitle…");
        const res = await fetch("/api/ai/full-subtitles", {
          signal: request.signal,
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({video_path: sourcePath, song_name: state.songName || "", anime_name: state.animeName || "", video_title: state.videoTitle || "", duration: dur})
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(aiResponseError(data, `Subtitle generation failed (${res.status}). Please try again.`));
        }
        const data = await res.json();
        if (generation !== state.sourceGeneration || sourcePath !== state.videoPath) {
          throw new Error("The video changed. Generate subtitles again for the current video.");
        }
        if (JSON.stringify(state.lyrics || []) !== originalLyrics) {
          throw new Error("You edited the subtitles while Gemini was working. Your edits were kept. Generate again when ready.");
        }
        if (!Array.isArray(data.lyrics)) throw new Error("Gemini returned an unreadable subtitle result. Your existing subtitles were kept. Please try again.");
        const lyrics = data.lyrics;
        if (!lyrics.length) {
          request.status("No audible speech or lyrics detected. Your existing subtitles were kept.");
          showToast("No audible speech or lyrics detected.");
          return;
        }
        if (lyrics.some(cue => !cue || !Number.isFinite(cue.start) || !Number.isFinite(cue.end) || cue.start < 0 || cue.end <= cue.start || cue.end > dur + 0.2 || !String(cue.text_jp || cue.text_en || cue.text || "").trim())) {
          throw new Error("Gemini returned invalid subtitle timings. Your existing subtitles were kept. Please try again.");
        }
        const absoluteLyrics = lyrics.map(cue => ({ ...cue, timeline_basis: "absolute" }));
        state.fullLyrics = absoluteLyrics;
        state.lyrics = absoluteLyrics;
        state.lyricsByMoment = { ...(state.lyricsByMoment || {}), full: absoluteLyrics };
        state.showLyrics = true;
        if (el.checkSubtitles) el.checkSubtitles.checked = true;
        renderLyricsList(state.lyrics);
        renderReel();
        saveProjectState();
        request.status(`${lyrics.length} timed subtitles ready. Your selected style was kept.`);
        showToast(`Generated ${lyrics.length} timed subtitles.`);
      } catch (error) {
        console.error("Full video subtitle sync error:", error);
        request.status(request.error(error));
        showToast("Could not generate subtitles: " + request.error(error));
      } finally {
        el.lyricsLoading?.classList.add("hidden");
        if (el.btnSyncFullText) el.btnSyncFullText.textContent = "✨ Whole Video Subtitles";
        request.finish();
      }
    });
  }

  if (el.checkSubtitles) {
    el.checkSubtitles.addEventListener("change", (e) => {
      state.showLyrics = e.target.checked;
      renderReel();
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
      el.valRadius.textContent = `${rad}px (Maximum curve)`;
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
  if (el.borderModeBtns) {
    const borderShape = getBorderShape();
    el.borderModeBtns.forEach(btn => {
      const mode = btn.dataset.border || "curved";
      btn.classList.toggle("active", mode === borderShape);
    });
  }
}

function getBorderShape() {
  const configured = state.adjustments && state.adjustments.borderShape;
  if (["curved", "straight"].includes(configured)) return configured;
  return state.adjustments && state.adjustments.curvedBorder === false ? "straight" : "curved";
}

function syncBorderShapeControls() {
  const borderShape = getBorderShape();
  const showRadiusControls = borderShape === "curved";
  if (el.borderModeBtns) {
    el.borderModeBtns.forEach(btn => {
      btn.classList.toggle("active", (btn.dataset.border || "curved") === borderShape);
    });
  }
  if (el.rowCornerRadius) el.rowCornerRadius.style.display = showRadiusControls ? "flex" : "none";
  const radiusPresets = document.getElementById("radius-presets-row");
  if (radiusPresets) radiusPresets.style.display = showRadiusControls ? "flex" : "none";
}

function setupTemplatesAndSliders() {
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
    state.adjustments.scale = getSongWindowScale(e.target.value);
    e.target.value = state.adjustments.scale;
    el.valScale.textContent = `${Math.round(state.adjustments.scale * 100)}%`;
    renderReel();
    saveProjectState();
  });
  if (el.sliderWindowInset) {
    el.sliderWindowInset.addEventListener("input", (e) => {
      state.adjustments.windowInset = getSongWindowInset(e.target.value);
      e.target.value = state.adjustments.windowInset;
      if (el.valWindowInset) el.valWindowInset.textContent = `${state.adjustments.windowInset}px`;
      renderReel();
      saveProjectState();
    });
  }
  if (el.sliderSongWindowY) {
    el.sliderSongWindowY.addEventListener("input", (e) => {
      const verticalOffset = parseInt(e.target.value, 10);
      state.adjustments.verticalOffset = Number.isFinite(verticalOffset) ? verticalOffset : 0;
      if (el.valSongWindowY) el.valSongWindowY.textContent = `${state.adjustments.verticalOffset}px`;
      renderReel();
      saveProjectState();
    });
  }
  el.sliderRadius.addEventListener("input", (e) => {
    state.adjustments.radius = parseInt(e.target.value);
    state.adjustments.curvedBorder = true;
    state.adjustments.borderShape = "curved";
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

  if (el.checkAudioMaster) {
    el.checkAudioMaster.addEventListener("change", async (e) => {
      state.audioMaster = { ...(state.audioMaster || {}), enabled: e.target.checked };
      if (!state.audioMaster.enabled) {
        // Keep the prepared clip cached even when export enhancement is off.
        await selectPlaybackAudio("original");
      } else if (el.audioMasterStatus) {
        el.audioMasterStatus.textContent = "Balanced enhancement will be used in export. Compare Original and Enhanced below.";
      }
      saveProjectState();
      showToast(state.audioMaster.enabled ? "Audio enhancement enabled for export" : "Export and playback use original audio");
      if (state.audioMaster.enabled) {
        // Prepare the exact selected trim immediately so the enabled control
        // has an audible preview before the user starts an export.
        await selectPlaybackAudio("enhanced");
      }
    });
  }
  if (el.btnPlaybackOriginal) el.btnPlaybackOriginal.addEventListener("click", () => selectPlaybackAudio("original"));
  if (el.btnPlaybackEnhanced) el.btnPlaybackEnhanced.addEventListener("click", () => selectPlaybackAudio("enhanced"));

  if (el.bgModeBtns) {
    el.bgModeBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        el.bgModeBtns.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const chosenBg = btn.dataset.bg || "black";
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
        if (mode === "straight") {
          state.adjustments.curvedBorder = false;
          state.adjustments.borderShape = "straight";
          showToast("Border: Straight (Sharp Corners)");
        } else if (mode === "circular") {
          state.adjustments.curvedBorder = true;
          state.adjustments.borderShape = "circular";
          showToast("Border: Circular (Aspect-Ratio Oval)");
        } else {
          state.adjustments.curvedBorder = true;
          state.adjustments.borderShape = "curved";
          if (!state.adjustments.radius || state.adjustments.radius < 16 || state.adjustments.radius >= 260) {
            state.adjustments.radius = 48;
          }
          if (el.sliderRadius) el.sliderRadius.value = state.adjustments.radius;
          updateRadiusUI(state.adjustments.radius);
          showToast("Border: Curved (Rounded Corners)");
        }
        syncBorderShapeControls();
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
          state.adjustments.borderShape = "curved";
          state.adjustments.radius = rad;
          if (el.sliderRadius) el.sliderRadius.value = rad;
          updateRadiusUI(rad);
          syncBorderShapeControls();
          renderReel();
          saveProjectState();
          showToast(`Corner Radius: ${rad}px`);
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
  const bgType = (state.adjustments && state.adjustments.bgType) || "black";
  if (el.bgModeBtns) {
    el.bgModeBtns.forEach(btn => {
      btn.classList.toggle("active", btn.dataset.bg === bgType);
    });
  }
  if (el.rowBgBlur) el.rowBgBlur.style.display = (bgType === "blur") ? "flex" : "none";
  if (el.rowBgDim) el.rowBgDim.style.display = (bgType === "blur") ? "flex" : "none";

  syncBorderShapeControls();

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
    state.adjustments.scale = getSongWindowScale(state.adjustments.scale);
    el.sliderScale.value = state.adjustments.scale;
    if (el.valScale) el.valScale.textContent = `${Math.round(state.adjustments.scale * 100)}%`;
  }
  if (el.sliderSongWindowY && state.adjustments) {
    const verticalOffset = Number.isFinite(Number(state.adjustments.verticalOffset)) ? Number(state.adjustments.verticalOffset) : 0;
    el.sliderSongWindowY.value = verticalOffset;
    if (el.valSongWindowY) el.valSongWindowY.textContent = `${verticalOffset}px`;
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
function syncFilterStrengthUI() {
  const value = Math.max(0, Math.min(400, Number(state.filterIntensity ?? 100) || 0));
  if (el.sliderFilterIntensity) el.sliderFilterIntensity.value = value;
  if (el.valFilterIntensity) el.valFilterIntensity.textContent = `${value}%`;
  document.querySelectorAll("[data-filter-strength]").forEach(button => {
    button.setAttribute("aria-pressed", String(Number(button.dataset.filterStrength) === value));
  });
}

function setFilterStrength(value) {
  state.filterIntensity = Math.max(0, Math.min(400, Number(value) || 0));
  syncFilterStrengthUI();
  saveProjectState();
  renderReel();
}

function setupVideoFilters() {
  const grid = el.filtersGrid;
  if (!grid) return;

  if (!VIDEO_FILTERS[state.colorFilter]) state.colorFilter = "original";
  grid.innerHTML = "";
  Object.values(VIDEO_FILTERS).forEach(filter => {
    const card = document.createElement("div");
    card.className = `filter-card ${filter.id === (state.colorFilter || "original") ? "active" : ""}`;
    card.dataset.filter = filter.id;
    const unavailable = filter.id === "intel_custom" && !window.VibeColorProfiles?.isAvailable(filter.id);
    card.title = unavailable ? "Custom RGB unavailable. Refresh Vibe Editor to retry." : (filter.description || `${filter.name} Filter`);
    card.classList.toggle("unavailable", unavailable);
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", unavailable ? "-1" : "0");
    card.setAttribute("aria-disabled", String(unavailable));
    card.innerHTML = `
      <div class="filter-thumb" style="background: ${filter.thumbGrad};">
        <span class="filter-thumb-badge">${filter.name.substring(0, 3).toUpperCase()}</span>
      </div>
      <span class="filter-name">${filter.name}</span>
    `;

    card.addEventListener("click", () => {
      if (unavailable) {
        showToast("Custom RGB could not load. Refresh Vibe Editor to retry.");
        return;
      }
      state.colorFilter = filter.id;
      document.querySelectorAll(".filter-card").forEach(c => c.classList.remove("active"));
      card.classList.add("active");
      if (el.filterActiveName) {
        el.filterActiveName.textContent = filter.name;
      }
      saveProjectState();
      renderReel();
      showToast(filter.id === "intel_custom"
        ? "Custom RGB applied. Use Intel original colors to judge the preview without doubling the color effect."
        : `Filter applied: ${filter.name}`);
    });
    card.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        card.click();
      }
    });

    grid.appendChild(card);
  });

  // Filter Intensity Slider
  if (el.sliderFilterIntensity) {
    el.sliderFilterIntensity.addEventListener("input", (e) => {
      setFilterStrength(e.target.value);
    });
  }

  document.querySelectorAll("[data-filter-strength]").forEach(button => {
    button.addEventListener("click", () => setFilterStrength(button.dataset.filterStrength));
  });
  syncFilterStrengthUI();

  // Left Dock Toggle Button
  if (el.btnToggleFiltersDock && el.dockFilters) {
    el.btnToggleFiltersDock.addEventListener("click", () => {
      el.dockFilters.classList.toggle("collapsed");
      const isCollapsed = el.dockFilters.classList.contains("collapsed");
      if (el.studioEditWorkspace) {
        el.studioEditWorkspace.classList.toggle("filter-dock-collapsed", isCollapsed);
      }
      el.btnToggleFiltersDock.textContent = isCollapsed ? "▶" : "◀";
      el.btnToggleFiltersDock.title = isCollapsed ? "Expand Filters Dock" : "Collapse Filters Dock";
      el.btnToggleFiltersDock.setAttribute("aria-label", isCollapsed ? "Expand Filters" : "Collapse Filters");
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
  syncFilterStrengthUI();

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
        state.adjustments.scale = getSongWindowScale(data.video.scale);
        state.adjustments.windowInset = getSongWindowInset(data.video.window_inset);
        state.adjustments.verticalOffset = Number.isFinite(Number(data.video.vertical_offset)) ? Number(data.video.vertical_offset) : 0;
        state.adjustments.radius = data.video.corner_radius !== undefined ? data.video.corner_radius : 16;
        if (data.video.curved_border !== undefined) {
          state.adjustments.curvedBorder = !!data.video.curved_border;
        }
        state.adjustments.borderShape = ["curved", "circular", "straight"].includes(data.video.border_shape)
          ? data.video.border_shape
          : (state.adjustments.curvedBorder === false ? "straight" : "curved");
        el.sliderScale.value = state.adjustments.scale;
        if (el.sliderWindowInset) el.sliderWindowInset.value = state.adjustments.windowInset;
        if (el.sliderSongWindowY) el.sliderSongWindowY.value = state.adjustments.verticalOffset;
        el.sliderRadius.value = state.adjustments.radius;
        el.valScale.textContent = `${Math.round(state.adjustments.scale * 100)}%`;
        if (el.valWindowInset) el.valWindowInset.textContent = `${state.adjustments.windowInset}px`;
        if (el.valSongWindowY) el.valSongWindowY.textContent = `${state.adjustments.verticalOffset}px`;
        updateRadiusUI(state.adjustments.radius);

        syncBorderShapeControls();
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
    if (state.colorFilter === "intel_custom" && !window.VibeColorProfiles?.isAvailable("intel_custom")) {
      showToast("Custom RGB could not load. Refresh Vibe Editor or choose another filter before exporting.");
      return;
    }
    if (imageDurationTimer !== null || imageDurationRequest || imageDurationRunning || state._imageDurationError) {
      showToast(state._imageDurationError
        ? "Fix the image duration or retry it before exporting."
        : "Image duration is updating. Wait for the Studio preview to finish, then export.");
      return;
    }
    if (!state.videoPath) {
      showToast("Please select a video file first!");
      return;
    }

    const reelNameInput = document.getElementById("input-reel-name");
    if (!commitExportName(reelNameInput ? reelNameInput.value : state.reelName) || !state.reelName) {
      if (!state.reelName) showToast("Please enter a reel name before exporting.");
      reelNameInput?.focus();
      reelNameInput?.select();
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

    let studioTextOverlay;
    let studioHookOverlay;
    let studioHookSceneMask;
    let studioUsernameSceneMask;
    const hookFadeStart = Math.max(0, Number(state.hookFade?.start) || 0);
    const sceneBlendHook = state.hookStyle === "scene_blend" && state.showSeriesText !== false;
    const splitHookFadeOverlay = !sceneBlendHook && hookFadeStart > 0 && state.showSeriesText !== false;
    try {
      await ensureWatermarkFontLoaded();
      if (document.fonts) await document.fonts.ready;
      if (state.showSeriesText !== false) await ensureHookEmojiLoaded();
      // A separate hook layer lets FFmpeg fade only the hook while the username remains stable.
      studioTextOverlay = createStudioTextOverlay({ includeHook: !splitHookFadeOverlay && !sceneBlendHook });
      studioHookOverlay = splitHookFadeOverlay
        ? createStudioTextOverlay({ includeHook: true, includeWatermark: false })
        : sceneBlendHook && hasFixedHookEmoji(state.seriesFormat)
          ? createStudioTextOverlay({ includeHook: true, includeWatermark: false, hookEmojiOnly: true })
          : null;
      studioHookSceneMask = sceneBlendHook
        ? createStudioTextOverlay({ includeHook: true, includeWatermark: false, hookSceneBlendMask: true })
        : null;
      studioUsernameSceneMask = state.watermark?.enabled && state.watermark.style === "scene_blend"
        ? createStudioTextOverlay({usernameSceneMask: true})
        : null;
    } catch (err) {
      el.exportStatusLabel.textContent = "Export failed: " + err.message;
      showToast(err.message);
      return;
    }

    let musicPayload = null;
    try { musicPayload = window.musicStudio ? window.musicStudio.exportPayload() : null; }
    catch (error) { el.exportStatusLabel.textContent = "Export failed: " + error.message; showToast(error.message); return; }
    const payload = {
      source_video: state.videoPath,
      output_name: state.reelName ? `${state.reelName}.mp4` : undefined,
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
        hide_regions: state.hideRegions || [],
        // `typeof` also keeps the small payload-only regression harness safe:
        // production always creates this immediately before the payload.
        studio_text_overlay: typeof studioTextOverlay === "string" ? studioTextOverlay : null,
        studio_hook_overlay: typeof studioHookOverlay === "string" ? studioHookOverlay : null,
        studio_hook_scene_mask: typeof studioHookSceneMask === "string" ? studioHookSceneMask : null,
        studio_username_scene_mask: typeof studioUsernameSceneMask === "string" ? studioUsernameSceneMask : null,
        background: {
          ...((state.templateData && state.templateData.background) || {}),
          type: (state.adjustments && state.adjustments.bgType) || "black",
          blur: state.adjustments.blur,
          brightness: state.adjustments.brightness
        },
        video: {
          ...((state.templateData && state.templateData.video) || {}),
          scale: Math.min(1.40, Math.max(0.10, Number(state.adjustments.scale) || 1.0)),
          window_inset: Math.min(180, Math.max(0, Number(state.adjustments.windowInset) || 0)),
          vertical_offset: Number.isFinite(Number(state.adjustments.verticalOffset)) ? Number(state.adjustments.verticalOffset) : 0,
          curved_border: state.adjustments.curvedBorder !== false,
          border_shape: getBorderShape(),
          corner_radius: (state.adjustments.curvedBorder !== false ? state.adjustments.radius : 0)
        },
        series_text: {
          ...((state.templateData && state.templateData.series_text) || {}),
          enabled: state.showSeriesText !== false,
          background_pill: false,
          font: "Segoe UI Semibold",
          _custom: !!(state.textElements && state.textElements.series && state.textElements.series._custom),
          x: state.textElements && state.textElements.series ? Math.round(state.textElements.series.x) : 540,
          y: state.textElements && state.textElements.series ? Math.round(state.textElements.series.y) : 360,
          size: state.textElements && state.textElements.series ? Math.round(state.textElements.series.size) : 38,
          line_gap: state.textElements && state.textElements.series ? Math.round(state.textElements.series.lineGap || 0) : 12,
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
          style: state.watermark?.style || "clean",
          rotation: state.watermark?.rotation ?? 90,
          text: (state.watermark && state.watermark.text) || "",
          x: state.textElements && state.textElements.watermark ? Math.round(state.textElements.watermark.x) : 140,
          y: state.textElements && state.textElements.watermark ? Math.round(state.textElements.watermark.y) : 90,
          size: state.textElements && state.textElements.watermark ? Math.round(state.textElements.watermark.size) : 28,
          color: state.textElements && state.textElements.watermark ? state.textElements.watermark.color : null,
          font: state.watermark?.font || "bahnschrift"
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
        style: state.watermark?.style || "clean",
        rotation: state.watermark?.rotation ?? 90,
        text: (state.watermark && state.watermark.text) || "",
        x: state.textElements && state.textElements.watermark ? Math.round(state.textElements.watermark.x) : 140,
        y: state.textElements && state.textElements.watermark ? Math.round(state.textElements.watermark.y) : 90,
        size: state.textElements && state.textElements.watermark ? Math.round(state.textElements.watermark.size) : 28,
        color: state.textElements && state.textElements.watermark ? state.textElements.watermark.color : null,
        font: state.watermark?.font || "bahnschrift"
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
      subtitle_animation: state.subtitleAnimation || "auto",
      subtitle_language: state.subtitleLanguage || "both",
      subtitle_color: state.textElements && state.textElements.subtitles ? state.textElements.subtitles.color : null,
      subtitle_color_en: ((style, primary) => {
        if (style === "jp_en") return "#7dd3fc";
        if (style === "anime") return "#a5f3fc";
        if (style === "lofi_pastel") return "#e0b0ff";
        return primary || "#ffffff";
      })(
        state.subtitleStyle || "minimal",
        state.textElements && state.textElements.subtitles ? state.textElements.subtitles.color : null
      ),
      subtitle_y: state.textElements && state.textElements.subtitles ? Math.round(state.textElements.subtitles.y) : null,
      subtitle_x: state.textElements && state.textElements.subtitles ? Math.round(state.textElements.subtitles.x) : null,
      subtitle_font_size: state.textElements && state.textElements.subtitles ? Math.round(state.textElements.subtitles.size) : null,
      subtitle_font: state.subtitleFont || "segoe",
      smart_loop: state.smartLoop !== false,
      loop_mode: state.loopMode || "standard",
      loop_fade_duration: state.loopFadeDuration || 0.35,
      audio_master: { enabled: state.audioMaster?.enabled === true },
      video_audio_volume: typeof window !== "undefined" && window.musicStudio ? window.musicStudio.videoGain() : 1,
      music: musicPayload,
      hook_fade_start: Math.max(0, Number(state.hookFade?.start) || 0),
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
            if (document.getElementById("view-history")?.classList.contains("active")) void loadExportHistory();
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
function syncExportName() {
  const input = document.getElementById("input-reel-name");
  if (input) {
    input.value = state.reelName || "";
    input.title = state.reelName ? `Export as ${state.reelName}.mp4` : "Name your exported reel";
  }
}

function commitExportName(value) {
    const name = String(value || "").trim().replace(/\.mp4$/i, "").trim();
    if (name && (name.length > 120 || /[<>:"/\\|?*\u0000-\u001f]/.test(name) || /\.$/.test(name) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))) {
      showToast('Use up to 120 characters and avoid file symbols such as /, \\, : or ?.');
      syncExportName();
      return false;
    }
    state.reelName = name;
    syncExportName(); saveProjectState();
    return true;
}

function setupExportName() {
  syncExportName();
  const input = document.getElementById("input-reel-name");
  input?.addEventListener("change", () => commitExportName(input.value));
  input?.addEventListener("keydown", event => {
    if (event.key === "Enter") { event.preventDefault(); input.blur(); }
    else if (event.key === "Escape") { event.preventDefault(); syncExportName(); input.blur(); }
  });
  document.getElementById("btn-refresh-history")?.addEventListener("click", loadExportHistory);
  document.getElementById("export-history-search")?.addEventListener("input", renderExportHistory);
  document.getElementById("export-history-filter")?.addEventListener("change", renderExportHistory);
  document.getElementById("history-preview-close")?.addEventListener("click", closeHistoryPreview);
  document.getElementById("history-preview-video")?.addEventListener("error", () => {
    const status = document.getElementById("history-preview-status");
    if (status) status.textContent = "This video could not be played. Try downloading it or refresh History if the file was moved.";
  });
}

let exportHistoryEntries = [];
let exportHistoryRequest = 0;
const historyDeletesInProgress = new Set();

async function deleteHistoryVideo(entry, button) {
  if (!entry.id || entry.available !== true || historyDeletesInProgress.has(entry.id)) return;
  const name = entry.display_name || entry.file_name || "this reel";
  if (!window.confirm(`Permanently delete the video file for "${name}" from your PC?\n\nIts History entry and saved hook text will stay. This frees disk space and cannot be undone.`)) return;
  historyDeletesInProgress.add(entry.id);
  button.disabled = true; button.textContent = "Deleting…";
  // Release Windows' preview file handle before deleting the export.
  closeHistoryPreview();
  try {
    const response = await fetch(`/api/history/${encodeURIComponent(entry.id)}/file`, {method: "DELETE"});
    const result = await response.json();
    if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : `Could not delete video (${response.status}). Try again.`);
    const freed = Number(result.freed_bytes || 0);
    showToast(result.deleted ? `Video deleted${freed > 0 ? ` · ${(freed / 1048576).toFixed(1)} MB freed` : ''}. History kept.` : "Video is already missing. History kept.");
    await loadExportHistory();
  } catch (error) {
    const status = document.getElementById("export-history-status");
    if (status) status.textContent = `Delete failed: ${error.message}`;
    showToast(`Delete failed: ${error.message}`);
  } finally {
    historyDeletesInProgress.delete(entry.id);
    button.disabled = false; button.textContent = "Delete video";
  }
}

function closeHistoryPreview() {
  const video = document.getElementById("history-preview-video");
  if (video) { video.pause(); video.removeAttribute("src"); video.load(); video.hidden = true; }
  document.getElementById("history-preview-close")?.classList.add("hidden");
  const name = document.getElementById("history-preview-name");
  if (name) name.textContent = "Preview";
  const status = document.getElementById("history-preview-status");
  if (status) status.textContent = "Choose Preview on an exported reel.";
}

function previewHistoryEntry(entry) {
  const video = document.getElementById("history-preview-video");
  if (!video || entry.available !== true || !entry.export_location) return;
  pauseVideo();
  closeHistoryPreview();
  const name = document.getElementById("history-preview-name");
  if (name) name.textContent = entry.display_name || entry.file_name || "Exported reel";
  const status = document.getElementById("history-preview-status");
  if (status) status.textContent = "";
  document.getElementById("history-preview-close")?.classList.remove("hidden");
  video.src = `/api/media/stream?path=${encodeURIComponent(entry.export_location)}`;
  video.hidden = false;
  // Only the selected export is loaded; previews never create extra media files.
  video.load();
}

function renderExportHistory() {
  const list = document.getElementById("export-history-list");
  const status = document.getElementById("export-history-status");
  if (!list || !status) return;
  const query = (document.getElementById("export-history-search")?.value || "").trim().toLowerCase();
  const filter = document.getElementById("export-history-filter")?.value || "all";
  const entries = exportHistoryEntries.filter(entry => {
    const text = `${entry.display_name || entry.name || ''} ${entry.file_name || entry.export_location || ''}`.toLowerCase();
    return text.includes(query) && (filter === "all" || (filter === "available" ? entry.available === true : entry.available !== true));
  });
  list.replaceChildren();
  const textNode = (tag, className, text) => {
    const node = document.createElement(tag); node.className = className; node.textContent = text; return node;
  };
  for (const entry of entries) {
    const filename = entry.file_name || String(entry.export_location || '').split(/[\\/]/).pop() || '';
    const name = entry.display_name || entry.name || filename.replace(/\.mp4$/i, '') || "Unnamed export";
    const row = textNode("div", "export-history-row", ""); row.setAttribute("role", "listitem");
    const identity = textNode("div", "export-history-identity", "");
    const title = textNode("strong", "export-history-name", name); title.title = name;
    identity.append(title, textNode("span", "export-history-filename", filename));
    const date = entry.created_at || entry.created_date;
    const parsedDate = date ? new Date(date) : null;
    identity.append(textNode("time", "export-history-date", parsedDate && !Number.isNaN(parsedDate.getTime())
      ? parsedDate.toLocaleString(undefined, {dateStyle: "medium", timeStyle: "short"}) : date || "Export date unavailable"));
    if (typeof entry.hook_text === "string" && entry.hook_text.trim()) {
      const hook = textNode("div", "export-history-hook", "");
      hook.append(textNode("span", "export-history-hook-label", "Hook"), textNode("p", "", entry.hook_text));
      identity.append(hook);
    }
    const details = textNode("div", "export-history-details", "");
    const legacyAspect = /(?:_|\b)(9x16|16x9|1x1)(?:_|\b)/.exec(filename)?.[1]?.replace('x', ':');
    details.append(textNode("span", "export-history-format", [String(entry.format || "MP4").toUpperCase(), entry.aspect_ratio || legacyAspect].filter(Boolean).join(" · ")));
    const seconds = Number(entry.duration_seconds ?? parseFloat(entry.duration));
    const duration = Number.isFinite(seconds) && seconds >= 0 ? `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}` : null;
    details.append(textNode("span", "export-history-secondary", [duration, entry.resolution, entry.fps ? `${entry.fps} fps` : null].filter(Boolean).join(" · ")));
    const available = entry.available === true;
    const size = available && entry.size_bytes > 0 ? `${(entry.size_bytes / 1048576).toFixed(1)} MB` : null;
    const actions = textNode("div", "export-history-file", "");
    actions.append(textNode("span", `export-history-availability${available ? '' : ' missing'}`, available ? ["Available", size].filter(Boolean).join(" · ") : "File missing"));
    if (available && entry.export_location) {
      const buttons = textNode("div", "export-history-actions", "");
      const preview = textNode("button", "btn btn-sm", "▶ Preview"); preview.type = "button";
      preview.addEventListener("click", () => previewHistoryEntry(entry));
      const download = textNode("a", "btn btn-sm", "Download");
      download.href = `/api/media/download?path=${encodeURIComponent(entry.export_location)}`;
      download.download = filename;
      buttons.append(preview, download);
      if (entry.id) {
        const remove = textNode("button", "btn btn-sm export-history-delete", "Delete video"); remove.type = "button";
        remove.title = "Delete the video file from your PC; keep its History entry";
        remove.disabled = historyDeletesInProgress.has(entry.id);
        remove.addEventListener("click", () => deleteHistoryVideo(entry, remove));
        buttons.append(remove);
      }
      actions.append(buttons);
    } else {
      actions.append(textNode("span", "export-history-secondary", "Moved or deleted from disk"));
    }
    row.append(identity, details, actions); list.append(row);
  }
  const availableCount = exportHistoryEntries.filter(entry => entry.available === true).length;
  status.textContent = !exportHistoryEntries.length ? "No exported reels yet. Your completed exports will appear here."
    : !entries.length ? "No matching exports. Try another name or filter."
    : `${entries.length} of ${exportHistoryEntries.length} exports · ${availableCount} available · ${exportHistoryEntries.length - availableCount} missing`;
}

async function loadExportHistory() {
  const list = document.getElementById("export-history-list");
  const status = document.getElementById("export-history-status");
  if (!list || !status) return;
  const request = ++exportHistoryRequest;
  status.textContent = "Loading…";
  try {
    const response = await fetch("/api/history");
    if (!response.ok) throw new Error(`History could not load (${response.status}). Try Refresh.`);
    const entries = await response.json();
    if (!Array.isArray(entries)) throw new Error("History could not be read. Try Refresh.");
    if (request !== exportHistoryRequest) return;
    exportHistoryEntries = entries.slice(0, 100);
    renderExportHistory();
  } catch (error) {
    if (request !== exportHistoryRequest) return;
    exportHistoryEntries = []; list.replaceChildren(); closeHistoryPreview();
    status.textContent = error.message;
  }
}

async function reloadStudio() {
  const button = document.getElementById("btn-reload-studio");
  if (button?.disabled) return;
  if (button) button.disabled = true;
  try {
    // A local blob URL cannot survive a reload; let its existing upload finish.
    if (state._uploadPromise || String(state.videoPath || "").startsWith("blob:")) {
      await ensureServerVideoPathForAnalysis();
    }
    if (projectSaveTimer !== null) {
      window.clearTimeout(projectSaveTimer);
      projectSaveTimer = null;
    }
    if (!persistProjectState()) throw new Error("Your edits could not be saved. Free some browser storage and try again.");
    window.location.reload();
  } catch (error) {
    console.error("Studio reload failed:", error);
    showToast(`Could not reload Studio: ${error.message}`);
    if (button) button.disabled = false;
  }
}

function setupSettingsAndNav() {
  setupExportName();
  document.getElementById("btn-reload-studio")?.addEventListener("click", reloadStudio);
  el.navTabs.forEach(tab => {
    tab.addEventListener("click", () => {
      el.navTabs.forEach(t => t.classList.remove("active"));
      el.tabContents.forEach(c => c.classList.remove("active"));
      tab.classList.add("active");
      const targetView = tab.dataset.view;
      document.querySelector(".studio-layout")?.classList.toggle("history-open", targetView === "history");
      closeHistoryPreview();
      if (targetView === "history") {
        pauseVideo();
        document.getElementById("music-audition")?.pause();
      }
      const targetEl = document.getElementById(`view-${targetView}`);
      if (targetEl) targetEl.classList.add("active");
      if (el.studioEditWorkspace) {
        el.studioEditWorkspace.classList.toggle("hidden", targetView !== "studio");
      }

      if (targetView === "schedule") loadScheduleView();
      if (targetView === "history") void loadExportHistory();
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
      localStorage.removeItem("reel_forge_project");
      localStorage.removeItem("reel_yt_url");
      localStorage.removeItem("reel_ig_url");
      window.location.reload();
    });
  }
  if (el.sliderWindowInset && state.adjustments) {
    state.adjustments.windowInset = getSongWindowInset(state.adjustments.windowInset);
    el.sliderWindowInset.value = state.adjustments.windowInset;
    if (el.valWindowInset) el.valWindowInset.textContent = `${state.adjustments.windowInset}px`;
  }

  if (el.inputAiInstruction) {
    el.inputAiInstruction.addEventListener("input", (e) => {
      state.aiInstruction = e.target.value.slice(0, 24000);
      saveProjectState();
    });
  }
  if (el.selectHookStyle) {
    el.selectHookStyle.value = state.hookStyle;
    el.selectHookStyle.addEventListener("change", (e) => {
      state.hookStyle = ["white_on_black", "black_on_white", "scene_blend"].includes(e.target.value)
        ? e.target.value
        : "outlined";
      if (["white_on_black", "black_on_white"].includes(state.hookStyle)) {
        state.hookFont = state.hookStyle === "black_on_white" ? "arial_black" : "georgia";
        if (el.selectHookFont) {
          el.selectHookFont.value = state.hookFont;
          applyFontControl(el.selectHookFont, state.hookFont);
        }
      }
      renderReel();
      saveProjectState();
    });
  }
}

// -------------------------------------------------------------
// INSTAGRAM DOWNLOAD & IMPORT ENGINE
// -------------------------------------------------------------
function setupInstagramDownloader() {
  if (!el.inputIgUrl || !el.btnIgDownload) return;

  const resetButton = () => {
    el.btnIgDownload.disabled = false;
    if (el.btnIgText) el.btnIgText.textContent = "⚡ Download & Load";
  };

  el.inputIgUrl.addEventListener("input", (event) => {
    localStorage.setItem("reel_ig_url", event.target.value.trim());
    localStorage.removeItem("reel_ig_url_loaded");
    saveProjectState();
  });

  const loadInstagramResult = async (task) => {
    await loadFile(task.file_path, task.title);
    showToast("Instagram video downloaded. Use the Studio buttons when you want AI moments or subtitles.");
    saveProjectState();
  };

  el.btnIgDownload.addEventListener("click", async () => {
    const url = el.inputIgUrl.value.trim();
    if (!url) {
      showToast("Please enter an Instagram Reel or video-post URL");
      return;
    }
    localStorage.setItem("reel_ig_url", url);
    saveProjectState();
    el.btnIgDownload.disabled = true;
    if (el.btnIgText) el.btnIgText.textContent = "Connecting to Instagram...";
    if (el.igProgressBox) el.igProgressBox.classList.remove("hidden");
    if (el.igProgressBar) el.igProgressBar.style.width = "10%";
    if (el.igProgressPercent) el.igProgressPercent.textContent = "10%";
    if (el.igProgressLabel) el.igProgressLabel.textContent = "Fetching public video details...";

    try {
      const startRes = await fetch("/api/instagram/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });
      const startData = await startRes.json();
      if (!startRes.ok) throw new Error(startData.detail || "Instagram download failed");

      let pollFinished = false;
      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/instagram/status/${startData.task_id}`);
          const task = await statusRes.json();
          if (pollFinished) return;
          if (el.igProgressBar) el.igProgressBar.style.width = `${task.progress}%`;
          if (el.igProgressPercent) el.igProgressPercent.textContent = `${Math.round(task.progress)}%`;
          if (el.igProgressLabel) el.igProgressLabel.textContent = task.message || "Downloading...";
          if (task.status === "completed") {
            pollFinished = true;
            clearInterval(pollInterval);
            localStorage.setItem("reel_ig_url_loaded", url);
            resetButton();
            await loadInstagramResult(task);
            setTimeout(() => el.igProgressBox && el.igProgressBox.classList.add("hidden"), 4000);
          } else if (task.status === "error") {
            pollFinished = true;
            clearInterval(pollInterval);
            resetButton();
            showToast("Instagram download failed: " + task.message);
          }
        } catch (pollError) {
          pollFinished = true;
          clearInterval(pollInterval);
          resetButton();
          showToast("Error tracking Instagram download");
        }
      }, 800);
    } catch (error) {
      resetButton();
      if (el.igProgressLabel) el.igProgressLabel.textContent = "Error: " + error.message;
      showToast("Instagram download failed: " + error.message);
    }
  });

  el.inputIgUrl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") el.btnIgDownload.click();
  });
}

// -------------------------------------------------------------
// PROJECT STATE PERSISTENCE ENGINE
// -------------------------------------------------------------
function saveProjectState() {
  // Persisting the full project also serializes every lyric cue. Delay repeated
  // slider/key input writes until the creator pauses, but keep test/non-browser
  // callers synchronous and flush before the page closes.
  if (typeof window !== "undefined" && typeof window.setTimeout === "function") {
    if (projectSaveTimer !== null) window.clearTimeout(projectSaveTimer);
    projectSaveTimer = window.setTimeout(() => {
      projectSaveTimer = null;
      persistProjectState();
    }, 220);
    return;
  }
  persistProjectState();
}

let projectSaveTimer = null;

function persistProjectState() {
  const project = {
    ytUrl: el.inputYtUrl ? el.inputYtUrl.value : "",
    igUrl: el.inputIgUrl ? el.inputIgUrl.value : "",
    activeSourceTab: el.tabSrcIg && el.tabSrcIg.classList.contains("active") ? "ig" : (el.tabSrcYt && el.tabSrcYt.classList.contains("active") ? "yt" : "local"),
    videoPath: state.videoPath || "",
    imageSourcePath: state.imageSourcePath || "",
    imageDuration: state.imageDuration || null,
    music: state.music || null,
    reelName: state.reelName || "",
    videoAudio: state.videoAudio || null,
    videoTitle: el.activeFileName ? el.activeFileName.textContent : "",
    videoMeta: state.videoMeta || null,
    dayNumber: state.dayNumber,
    seriesFormat: state.seriesFormat,
    hookFont: ["arial_black", "segoe", "bahnschrift", "oswald", "cooper_black", "georgia", "segoe_print"].includes(state.hookFont)
      ? state.hookFont
      : "arial_black",
    hookStyle: state.hookStyle || "outlined",
    hookFade: { start: Math.max(0, Number(state.hookFade?.start) || 0) },
    aiInstruction: state.aiInstruction || "",
    showSeriesText: state.showSeriesText !== false,
    songName: state.songName,
    animeName: state.animeName,
    caption: state.caption || "",
    startTime: state._imageDurationOriginalRange?.startTime ?? state.startTime,
    endTime: state._imageDurationOriginalRange?.endTime ?? state.endTime,
    isLooping: state.isLooping,
    adjustments: state.adjustments,
    activeTemplate: state.activeTemplate,
    aiAnalysis: state.aiAnalysis || null,
    activeMoment: state.activeMoment || "rec",
    lyrics: state.lyrics || [],
    showLyrics: state.showLyrics !== false,
    subtitleStyle: state.subtitleStyle || "minimal",
    subtitleFont: state.subtitleFont || "segoe",
    subtitleAnimation: state.subtitleAnimation || "auto",
    subtitleLanguage: state.subtitleLanguage || "both",
    smartLoop: state.smartLoop !== false,
    loopMode: state.loopMode || "circular",
    loopFadeDuration: state.loopFadeDuration || 0.35,
    audioMaster: { enabled: state.audioMaster?.enabled === true },
    fadeTransition: state.fadeTransition || { mode: "none", duration: 0.50 },
    watermark: state.watermark || { enabled: false, text: "lap_lac7" },
    creatorBadge: state.creatorBadge || { enabled: false, text: "@lap_lac7" },
    textElements: state.textElements || null,
    colorFilter: state.colorFilter || "original",
    hideRegions: state.hideRegions || [],
    filterIntensity: state.filterIntensity !== undefined ? state.filterIntensity : 100,
    colorAdjustments: state.colorAdjustments || { brightness: 0, contrast: 100, saturation: 100, warmth: 0, vignette: 0 }
  };
  try {
    localStorage.setItem("reel_forge_project", JSON.stringify(project));
    return true;
  } catch (e) {
    console.warn("Could not save project to localStorage:", e);
    return false;
  }
}

if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("pagehide", () => {
    if (projectSaveTimer !== null) {
      window.clearTimeout(projectSaveTimer);
      projectSaveTimer = null;
    }
    persistProjectState();
  });
}

async function restoreProjectState() {
  try {
    const raw = localStorage.getItem("reel_forge_project");
    const savedYtUrl = localStorage.getItem("reel_yt_url");
    const savedIgUrl = localStorage.getItem("reel_ig_url");
    if (!raw && !savedYtUrl && !savedIgUrl) return;

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
    const igUrl = project.igUrl || savedIgUrl || "";
    if (igUrl && el.inputIgUrl) {
      el.inputIgUrl.value = igUrl;
    }
    if ((project.activeSourceTab === "ig" || (!ytUrl && igUrl)) && el.tabSrcIg) {
      el.tabSrcIg.click();
    } else if ((project.activeSourceTab === "yt" || ytUrl) && el.tabSrcYt) {
      el.tabSrcYt.click();
    }

    state.showSeriesText = project.showSeriesText !== false;
    state.music = project.music || null;
    state.reelName = typeof project.reelName === "string" ? project.reelName : "";
    syncExportName();
    state.videoAudio = project.videoAudio || null;

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
      const styleControl = document.getElementById("select-watermark-style");
      const rotationControl = document.getElementById("select-watermark-rotation");
      const blendHint = document.getElementById("watermark-blend-hint");
      if (styleControl) styleControl.value = state.watermark.style || "clean";
      const watermarkFontControl = document.getElementById("select-watermark-font");
      if (watermarkFontControl) { watermarkFontControl.value = FONT_STACKS[state.watermark.font] ? state.watermark.font : "bahnschrift"; applyFontControl(watermarkFontControl, watermarkFontControl.value); }
      void refreshWatermarkFont();
      if (rotationControl) {
        rotationControl.value = String(state.watermark.rotation ?? 90);
        rotationControl.disabled = state.watermark.style !== "scene_blend";
      }
      if (blendHint) blendHint.classList.toggle("hidden", state.watermark.style !== "scene_blend");
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
    if (typeof project.seriesFormat === "string") {
      state.seriesFormat = project.seriesFormat;
      if (el.inputSeriesText) el.inputSeriesText.value = state.seriesFormat;
    }
    const savedHookFont = ["haettenschweiler", "arial_narrow"].includes(project.hookFont) ? "oswald" : project.hookFont;
    state.hookFont = AVAILABLE_HOOK_FONTS.includes(savedHookFont) ? savedHookFont : DEFAULT_HOOK_FONT;
    if (el.selectHookFont) { el.selectHookFont.value = state.hookFont; applyFontControl(el.selectHookFont, state.hookFont); }
    state.hookStyle = ["white_on_black", "black_on_white", "scene_blend"].includes(project.hookStyle)
      ? project.hookStyle
      : "outlined";
    if (state.hookStyle === "black_on_white") {
      state.hookFont = "arial_black";
      if (el.selectHookFont) {
        el.selectHookFont.value = state.hookFont;
        applyFontControl(el.selectHookFont, state.hookFont);
      }
    }
    state.aiInstruction = typeof project.aiInstruction === "string"
      ? project.aiInstruction.slice(0, 24000)
      : [project.hookInstruction, project.captionInstruction].find((instruction) => typeof instruction === "string" && instruction.trim())?.slice(0, 24000) || "";
    if (el.inputAiInstruction) el.inputAiInstruction.value = state.aiInstruction;
    if (el.selectHookStyle) el.selectHookStyle.value = state.hookStyle;
    if (project.hookFade && typeof project.hookFade === "object") {
      // Older projects may contain a duration; use the current natural fade speed.
      state.hookFade = { start: Math.max(0, Number(project.hookFade.start) || 0) };
    }
    if (typeof syncHookFadeControls === "function") syncHookFadeControls();
    // Projects saved before the readable hook update used a 38px automatic
    // headline. Preserve deliberately resized hooks, but migrate that old
    // default so existing projects are immediately legible after refresh.
    const restoredSeries = state.textElements?.series;
    if (restoredSeries && !restoredSeries._custom && Number(restoredSeries.size) === 38) {
      restoredSeries.size = 68;
      restoredSeries.lineGap = Math.max(16, Number(restoredSeries.lineGap) || 0);
    }
    if (project.songName) {
      state.songName = project.songName;
      if (el.inputSongName) el.inputSongName.value = state.songName;
    }
    if (project.animeName) {
      state.animeName = project.animeName;
      if (el.inputAnimeName) el.inputAnimeName.value = state.animeName;
    }
    if (typeof project.caption === "string" && project.caption.trim()) {
      state.caption = project.caption;
      if (el.aiCaptionOutput) el.aiCaptionOutput.value = state.caption;
      if (el.schedCaption) el.schedCaption.value = state.caption;
      if (el.aiCaptionBox) el.aiCaptionBox.classList.remove("hidden");
    }

    // 3. Clip times
    if (project.startTime !== undefined) state.startTime = project.startTime;
    if (project.endTime !== undefined) state.endTime = project.endTime;
    state.isLooping = true;

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
      await loadFile(project.videoPath, project.videoTitle, null, {preserveReelName: true});
      state.imageSourcePath = project.imageSourcePath || "";
      state.imageDuration = Number(project.imageDuration) || null;
      if (state.imageDuration) syncImageDurationInputs(state.imageDuration);

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
      state.lyrics = project.lyrics.map(cue => ({ ...cue, timeline_basis: cue.timeline_basis || "absolute" }));
      // Project lyrics always use the source-video clock. Keep the same set as
      // fullLyrics so changing the selected song moment never clears them.
      state.fullLyrics = state.lyrics;
      state.lyricsByMoment = { ...(state.lyricsByMoment || {}), full: state.lyrics };
      renderLyricsList(state.lyrics);
    }
    if (project.showLyrics !== undefined) {
      state.showLyrics = project.showLyrics;
      if (el.checkSubtitles) el.checkSubtitles.checked = state.showLyrics;
    }
    if (project.subtitleStyle) {
  const allowed = ["minimal", "bold_lyrics", "pop_bounce", "neon_glow", "retro_90s", "manga_flash", "karaoke", "cinematic", "impact", "lofi_pastel", "white_on_black", "jp_en", "anime"];
      state.subtitleStyle = allowed.includes(project.subtitleStyle) ? project.subtitleStyle : "minimal";
      const allStyleCards = document.querySelectorAll(".sub-style-card, .sub-style-btn");
      if (allStyleCards) {
        allStyleCards.forEach(b => {
          b.classList.toggle("active", b.dataset.style === state.subtitleStyle);
        });
      }
    }
    state.subtitleAnimation = SUBTITLE_ANIMATION_OPTIONS.includes(project.subtitleAnimation)
      ? project.subtitleAnimation
      : "auto";
    syncSubtitleAnimation();
    state.subtitleLanguage = project.subtitleLanguage || "both";
    if (el.subLangBtns) {
      el.subLangBtns.forEach(b => {
        b.classList.toggle("active", (b.dataset.lang || "both") === state.subtitleLanguage);
      });
    }

    state.hideRegions = normalizeHideRegions(project.hideRegions);
    syncHideAreaControls();

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

    if (project.audioMaster) {
      state.audioMaster = {
        enabled: project.audioMaster.enabled === true
      };
      if (el.checkAudioMaster) el.checkAudioMaster.checked = state.audioMaster.enabled;
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
function placeStudioPanels() {
  if (el.dockFilters && el.workspaceFilterSlot && el.dockFilters.parentElement !== el.workspaceFilterSlot) {
    el.workspaceFilterSlot.appendChild(el.dockFilters);
  }
  if (el.reelStyleCard && el.workspaceReelStyleSlot && el.reelStyleCard.parentElement !== el.workspaceReelStyleSlot) {
    el.workspaceReelStyleSlot.appendChild(el.reelStyleCard);
  }
}

window.addEventListener("DOMContentLoaded", async () => {
  try {
    if (!window.VibeColorProfiles) throw new Error("Custom RGB script is unavailable.");
    await window.VibeColorProfiles.load();
  } catch (error) {
    console.error("Custom RGB initialization failed:", error);
    const status = document.getElementById("color-profile-status");
    if (status) {
      status.textContent = "Custom RGB could not load. Refresh Vibe Editor to retry.";
      status.classList.remove("hidden");
    }
  }
  placeStudioPanels();
  setupFitView();
  setupTimeline();
  setupYouTubeDownloader();
  setupInstagramDownloader();
  setupFileHandling();
  setupMetadataAndAI();
  setupTextCanvasInteraction();
  setupHideAreas();
  setupTemplatesAndSliders();
  setupVideoFilters();
  setupVideoAdjustments();
  setupExport();
  setupSettingsAndNav();

  setupSchedule();
  await loadTemplate("cinematic");
  startRenderLoop();
  await restoreProjectState();
  if (state.colorFilter === "intel_custom" && !window.VibeColorProfiles?.isAvailable("intel_custom")) {
    showToast("Your saved Custom RGB filter is unavailable. Refresh Vibe Editor to restore its preview.");
  }
  void refreshHookEmoji();
  if (window.musicStudio) await window.musicStudio.init();
});
