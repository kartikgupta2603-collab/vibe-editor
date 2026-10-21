/* Exportable RGB presets. Intel slider values are reference metadata, not gains. */
(function (global) {
  "use strict";
  const SVG_NS = "http://www.w3.org/2000/svg";
  const profiles = new Map();
  const filters = new Map();
  let loading;
  let loadError = null;
  let definitions;
  let nextFilterId = 0;

  function validate(profile) {
    if (!profile || profile.id !== "intel_custom" ||
        !Array.isArray(profile.rgb_slope) || profile.rgb_slope.length !== 3 ||
        !Array.isArray(profile.rgb_offset) || profile.rgb_offset.length !== 3 ||
        ![...profile.rgb_slope, ...profile.rgb_offset, profile.saturation].every(Number.isFinite) ||
        profile.rgb_slope.some(value => value < 0 || value > 4) ||
        profile.rgb_offset.some(value => Math.abs(value) > 1) ||
        profile.saturation < 0 || profile.saturation > 4) {
      throw new Error("Custom RGB filter settings are invalid. Refresh Vibe Editor after updating it.");
    }
    return profile;
  }

  function load() {
    if (!loading) {
      loading = (async () => {
        try {
          const response = await fetch("/color-profiles.json", { cache: "no-store" });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const data = await response.json();
          profiles.set("intel_custom", validate(data.intel_custom));
        } catch (error) {
          loadError = new Error(`Custom RGB could not load: ${error.message}. Refresh Vibe Editor to retry.`);
          throw loadError;
        }
      })();
    }
    return loading;
  }

  function svgElement(tag, attributes = {}) {
    const element = document.createElementNS(SVG_NS, tag);
    Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, String(value)));
    return element;
  }

  function getDefinitions() {
    if (!definitions) {
      const svg = svgElement("svg", { width: 0, height: 0, "aria-hidden": "true", focusable: "false" });
      svg.style.cssText = "position:absolute;pointer-events:none;overflow:hidden";
      definitions = svgElement("defs");
      svg.appendChild(definitions);
      document.body.appendChild(svg);
    }
    return definitions;
  }

  function filterCss(id, intensity = 100, adjustments = {}) {
    const profile = profiles.get(id);
    if (!profile) throw loadError || new Error("Custom RGB is unavailable. Refresh Vibe Editor to retry.");
    const percent = Math.max(0, Math.min(400, Number(intensity) || 0));
    const brightness = Math.max(0.1, 1 + Number(adjustments.brightness ?? 0) / 100);
    const contrast = Math.max(0.1, Number(adjustments.contrast ?? 100) / 100);
    const saturation = Math.max(0, Number(adjustments.saturation ?? 100) / 100);
    const warmth = Number(adjustments.warmth ?? 0);
    if (percent === 0 && brightness === 1 && contrast === 1 && saturation === 1 && warmth === 0) return "none";
    const key = JSON.stringify([id, percent, brightness, contrast, saturation, warmth]);
    if (filters.has(key)) {
      const cached = filters.get(key);
      filters.delete(key);
      filters.set(key, cached);
      return cached.css;
    }
    const strength = percent / 100;
    const filterId = `vibe-rgb-${nextFilterId++}`;
    const filter = svgElement("filter", { id: filterId, "color-interpolation-filters": "sRGB" });
    function addLut(slopes, offsets) {
      const transfer = svgElement("feComponentTransfer");
      ["R", "G", "B"].forEach((channel, index) => {
        const table = Array.from({ length: 256 }, (_, value) => {
          const mapped = Math.min(255, Math.max(0, Math.floor((slopes[index] * value / 255 + offsets[index]) * 255 + 0.5)));
          // Chromium can truncate an exact n/255 float to n-1 between SVG stages.
          // A hundredth of a byte keeps the intended byte without changing it.
          return mapped === 0 || mapped === 255 ? mapped / 255 : (mapped + 0.01) / 255;
        });
        transfer.appendChild(svgElement(`feFunc${channel}`, { type: "discrete", tableValues: table.join(" ") }));
      });
      filter.appendChild(transfer);
    }
    function addMatrix(rows) {
      const values = rows.flatMap(row => [...row, 0, 0]).concat([0, 0, 0, 1, 0]);
      filter.appendChild(svgElement("feColorMatrix", {
        type: "matrix", values: values.map(value => value.toFixed(9)).join(" ")
      }));
    }
    function addSaturation(amount) {
      addMatrix([0, 1, 2].map(row => [0.213, 0.715, 0.072].map((weight, column) =>
        weight * (1 - amount) + (row === column ? amount : 0))));
    }
    // Keep every stage in sRGB and in the same order as the FFmpeg RGB pipeline.
    if (brightness !== 1) addLut([brightness, brightness, brightness], [0, 0, 0]);
    if (contrast !== 1) addLut([contrast, contrast, contrast], Array(3).fill((1 - contrast) / 2));
    if (saturation !== 1) addSaturation(saturation);
    const sepia = Math.min(1, Math.max(0, warmth / 100 * 0.25));
    if (sepia > 0.01) addMatrix([[.393, .769, .189], [.349, .686, .168], [.272, .534, .131]].map((values, row) =>
      values.map((value, column) => (row === column ? 1 - sepia : 0) + value * sepia)));
    const hue = -warmth * (warmth > 0 ? .15 : .25);
    if (Math.abs(hue) > .1) {
      const cosine = Math.cos(hue * Math.PI / 180), sine = Math.sin(hue * Math.PI / 180);
      addMatrix([
        [.213 + cosine * .787 - sine * .213, .715 - cosine * .715 - sine * .715, .072 - cosine * .072 + sine * .928],
        [.213 - cosine * .213 + sine * .143, .715 + cosine * .285 + sine * .140, .072 - cosine * .072 - sine * .283],
        [.213 - cosine * .213 - sine * .787, .715 - cosine * .715 + sine * .715, .072 + cosine * .928 + sine * .072]
      ]);
    }
    if (strength > 0) {
      addLut(profile.rgb_slope.map(value => 1 + strength * (value - 1)), profile.rgb_offset.map(value => strength * value));
      addSaturation(1 + strength * (profile.saturation - 1));
    }
    getDefinitions().appendChild(filter);
    const css = `url(#${filterId})`;
    filters.set(key, {css, node: filter});
    if (filters.size > 64) {
      const oldest = filters.keys().next().value;
      filters.get(oldest).node.remove();
      filters.delete(oldest);
    }
    return css;
  }

  global.VibeColorProfiles = Object.freeze({ load, filterCss,
    isAvailable: id => profiles.has(id), get error() { return loadError; }
  });
})(window);
