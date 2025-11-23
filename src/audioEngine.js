// AudioEngine: offline-first music analysis toolkit for later visuals.
// The engine decodes an audio file, computes frame-wise energy, onset events,
// estimates tempo/beat grid, and rough section segmentation.

export class AudioEngine {
  constructor() {
    this.context = null;
    this.buffer = null;
    this.sampleRate = 44100;
    this.frameSize = 2048; // ~46 ms at 44.1kHz: balances frequency & time detail
    this.hopSize = 1024; // 50% overlap for smoother envelopes
    this.frames = [];
    this.bandEnergy = { low: [], mid: [], high: [], overall: [] };
    this.spectralFlux = [];
    this.onsets = [];
    this.bpm = 0;
    this.beatTimes = [];
    this.sections = [];
    this.mediaSource = null;
    this.audioElement = null;
    this.objectUrl = null;
  }

  /**
   * Load and analyze a user-provided audio file.
   */
  async loadFile(file) {
    if (!file) throw new Error("No file provided");
    if (this.context) {
      // If a context already exists, keep it so attached nodes stay valid.
    } else {
      this.context = new (window.AudioContext || window.webkitAudioContext)();
    }

    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await this.context.decodeAudioData(arrayBuffer.slice(0));
    this.buffer = audioBuffer;
    this.sampleRate = audioBuffer.sampleRate;
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = URL.createObjectURL(file);

    this._analyzeFrames();
    this._computeSpectralFlux();
    this._detectOnsets();
    this._estimateTempoAndBeats();
    this._segmentSections();
  }

  /** Attach an existing <audio> element to the context for playback. */
  attachToAudioElement(audioElement) {
    if (!this.context || !this.buffer) throw new Error("Load a file before attaching");
    this.audioElement = audioElement;
    if (this.objectUrl) this.audioElement.src = this.objectUrl;
    if (!this.mediaSource) {
      this.mediaSource = this.context.createMediaElementSource(audioElement);
      this.mediaSource.connect(this.context.destination);
    }
  }

  /** Return per-time features for visuals or debug displays. */
  getFeaturesAtTime(timeSeconds) {
    if (!this.buffer || !this.frames.length) {
      return {
        time: timeSeconds,
        lowEnergy: 0,
        midEnergy: 0,
        highEnergy: 0,
        overallEnergy: 0,
        isOnBeat: false,
        beatIndex: null,
        sectionIndex: null,
        kickLike: false,
        snareLike: false,
        hatLike: false,
      };
    }

    const frameDuration = this.hopSize / this.sampleRate;
    const idx = Math.min(
      Math.max(Math.floor(timeSeconds / frameDuration), 0),
      this.bandEnergy.overall.length - 1
    );

    const lowEnergy = this.bandEnergy.low[idx];
    const midEnergy = this.bandEnergy.mid[idx];
    const highEnergy = this.bandEnergy.high[idx];
    const overallEnergy = this.bandEnergy.overall[idx];

    // Beat proximity check
    let isOnBeat = false;
    let beatIndex = null;
    const beatTolerance = 0.08; // seconds
    for (let i = 0; i < this.beatTimes.length; i++) {
      const diff = Math.abs(this.beatTimes[i] - timeSeconds);
      if (diff <= beatTolerance) {
        isOnBeat = true;
        beatIndex = i;
        break;
      }
    }

    // Onset classification near time
    let kickLike = false;
    let snareLike = false;
    let hatLike = false;
    const onsetTolerance = 0.1;
    for (const onset of this.onsets) {
      if (Math.abs(onset.time - timeSeconds) <= onsetTolerance) {
        if (onset.type === "kick") kickLike = true;
        if (onset.type === "snare") snareLike = true;
        if (onset.type === "hat") hatLike = true;
        break;
      }
    }

    // Section lookup
    let sectionIndex = null;
    for (let i = 0; i < this.sections.length; i++) {
      const s = this.sections[i];
      if (timeSeconds >= s.start && timeSeconds < s.end) {
        sectionIndex = i;
        break;
      }
    }

    return {
      time: timeSeconds,
      lowEnergy,
      midEnergy,
      highEnergy,
      overallEnergy,
      isOnBeat,
      beatIndex,
      sectionIndex,
      kickLike,
      snareLike,
      hatLike,
    };
  }

  getBeatGrid() {
    return { bpm: this.bpm, beats: this.beatTimes.slice() };
  }

  getSections() {
    return this.sections.slice();
  }

  /** Frame analysis: RMS + FFT per overlapping window */
  _analyzeFrames() {
    const { buffer, frameSize, hopSize, sampleRate } = this;
    const channelData = buffer.numberOfChannels === 1
      ? buffer.getChannelData(0)
      : this._mixToMono(buffer);

    const rawFrames = Math.floor((channelData.length - frameSize) / hopSize);
    const totalFrames = Math.max(1, rawFrames);
    const hann = this._hannWindow(frameSize);

    const lowBand = [];
    const midBand = [];
    const highBand = [];
    const overall = [];
    const spectra = [];

    let maxLow = 0;
    let maxMid = 0;
    let maxHigh = 0;
    let maxOverall = 0;

    for (let f = 0; f < totalFrames; f++) {
      const start = f * hopSize;
      const frame = channelData.slice(start, start + frameSize);
      const windowed = frame.map((v, i) => v * hann[i]);

      const rms = Math.sqrt(windowed.reduce((acc, v) => acc + v * v, 0) / frameSize);
      overall.push(rms);
      maxOverall = Math.max(maxOverall, rms);

      const magnitudes = this._fftMagnitudes(windowed);
      spectra.push(magnitudes);

      const bandEnergy = this._bandSplit(magnitudes, sampleRate);
      lowBand.push(bandEnergy.low);
      midBand.push(bandEnergy.mid);
      highBand.push(bandEnergy.high);
      maxLow = Math.max(maxLow, bandEnergy.low);
      maxMid = Math.max(maxMid, bandEnergy.mid);
      maxHigh = Math.max(maxHigh, bandEnergy.high);
    }

    // Normalize to 0..1 range for easier use at runtime
    this.bandEnergy.low = lowBand.map((v) => (maxLow ? v / maxLow : 0));
    this.bandEnergy.mid = midBand.map((v) => (maxMid ? v / maxMid : 0));
    this.bandEnergy.high = highBand.map((v) => (maxHigh ? v / maxHigh : 0));
    this.bandEnergy.overall = overall.map((v) => (maxOverall ? v / maxOverall : 0));

    this.frames = spectra;
  }

  /** Spectral flux: positive change between successive spectra. */
  _computeSpectralFlux() {
    const flux = [0];
    for (let i = 1; i < this.frames.length; i++) {
      const prev = this.frames[i - 1];
      const cur = this.frames[i];
      let sum = 0;
      const len = Math.min(prev.length, cur.length);
      for (let k = 0; k < len; k++) {
        const diff = cur[k] - prev[k];
        if (diff > 0) sum += diff;
      }
      flux.push(sum);
    }

    // Normalize and smooth with simple exponential moving average
    const maxFlux = Math.max(...flux) || 1;
    const normalized = flux.map((v) => v / maxFlux);
    const smoothed = [];
    const alpha = 0.3;
    let last = normalized[0];
    for (const v of normalized) {
      const s = alpha * v + (1 - alpha) * last;
      smoothed.push(s);
      last = s;
    }

    this.spectralFlux = smoothed;
  }

  /** Identify onset peaks using flux envelope and classify by band dominance. */
  _detectOnsets() {
    const flux = this.spectralFlux;
    const mean = flux.reduce((a, b) => a + b, 0) / flux.length;
    const variance = flux.reduce((a, b) => a + (b - mean) ** 2, 0) / flux.length;
    const std = Math.sqrt(variance);
    const threshold = mean + std * 1.1; // adaptive threshold

    const hopTime = this.hopSize / this.sampleRate;
    const onsets = [];
    for (let i = 1; i < flux.length - 1; i++) {
      const isPeak = flux[i] > flux[i - 1] && flux[i] > flux[i + 1];
      if (isPeak && flux[i] > threshold) {
        const time = i * hopTime;
        const low = this.bandEnergy.low[i];
        const mid = this.bandEnergy.mid[i];
        const high = this.bandEnergy.high[i];
        const maxBand = Math.max(low, mid, high);
        let type = "other";
        if (maxBand === low) type = "kick";
        else if (maxBand === mid) type = "snare";
        else if (maxBand === high) type = "hat";

        onsets.push({ time, type, strength: flux[i] });
      }
    }

    this.onsets = onsets;
  }

  /** Estimate tempo via autocorrelation over the onset envelope and build a beat grid. */
  _estimateTempoAndBeats() {
    const envelope = this.spectralFlux;
    const hopTime = this.hopSize / this.sampleRate;
    const minBpm = 70;
    const maxBpm = 180;
    const minLag = Math.floor((60 / maxBpm) / hopTime);
    const maxLag = Math.floor((60 / minBpm) / hopTime);

    let bestLag = minLag;
    let bestScore = -Infinity;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let sum = 0;
      for (let i = 0; i < envelope.length - lag; i++) {
        sum += envelope[i] * envelope[i + lag];
      }
      const score = sum / (envelope.length - lag);
      if (score > bestScore) {
        bestScore = score;
        bestLag = lag;
      }
    }

    const bpm = 60 / (bestLag * hopTime);
    this.bpm = bpm;

    // Build beat grid anchored to first strong onset
    const firstOnsetTime = this.onsets.length ? this.onsets[0].time : 0;
    const beatInterval = 60 / bpm;
    const duration = this.buffer.duration;
    const beats = [];
    for (let t = firstOnsetTime; t <= duration + beatInterval; t += beatInterval) {
      beats.push(t);
    }

    // Snap beats to nearby onsets for tighter alignment
    const tolerance = 0.09;
    const snapped = beats.map((b) => {
      let closest = b;
      let bestDiff = tolerance;
      for (const onset of this.onsets) {
        const diff = Math.abs(onset.time - b);
        if (diff < bestDiff) {
          bestDiff = diff;
          closest = onset.time;
        }
      }
      return closest;
    });

    this.beatTimes = snapped;
  }

  /** Roughly segment the track into labeled sections based on energy + onset rate. */
  _segmentSections() {
    const windowSize = 6; // seconds per coarse window
    const hopTime = this.hopSize / this.sampleRate;
    const windowFrames = Math.max(1, Math.floor(windowSize / hopTime));
    const energies = this.bandEnergy.overall;
    const duration = this.buffer.duration;

    const globalMean = energies.reduce((a, b) => a + b, 0) / energies.length;
    const variance = energies.reduce((a, b) => a + (b - globalMean) ** 2, 0) / energies.length;
    const globalStd = Math.sqrt(variance);

    const sections = [];
    for (let startFrame = 0; startFrame < energies.length; startFrame += windowFrames) {
      const endFrame = Math.min(startFrame + windowFrames, energies.length);
      const slice = energies.slice(startFrame, endFrame);
      const meanE = slice.reduce((a, b) => a + b, 0) / slice.length;
      const sectionStart = startFrame * hopTime;
      const sectionEnd = Math.min(endFrame * hopTime, duration);

      const onsetCount = this.onsets.filter(
        (o) => o.time >= sectionStart && o.time < sectionEnd
      ).length;
      const onsetRate = onsetCount / (sectionEnd - sectionStart || 1);

      let kind = "groove";
      if (meanE < globalMean - 0.3 * globalStd) kind = "intro";
      else if (meanE > globalMean + 0.6 * globalStd && onsetRate > 3 / windowSize) kind = "drop/high";
      else if (meanE > globalMean + 0.2 * globalStd) kind = "build";
      else if (meanE < globalMean - 0.1 * globalStd && onsetRate < 1 / windowSize) kind = "break";

      sections.push({ start: sectionStart, end: sectionEnd, kind });
    }

    // Merge adjacent sections with the same kind for cleaner ranges
    const merged = [];
    for (const sec of sections) {
      const last = merged[merged.length - 1];
      if (last && last.kind === sec.kind) {
        last.end = sec.end;
      } else {
        merged.push({ ...sec });
      }
    }

    this.sections = merged;
  }

  // Utility: compute Hann window coefficients
  _hannWindow(size) {
    const coeffs = new Array(size);
    for (let i = 0; i < size; i++) {
      coeffs[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
    }
    return coeffs;
  }

  // Utility: mix multi-channel buffer to mono
  _mixToMono(buffer) {
    const length = buffer.length;
    const mono = new Float32Array(length);
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        mono[i] += data[i];
      }
    }
    for (let i = 0; i < length; i++) mono[i] /= buffer.numberOfChannels;
    return mono;
  }

  // Utility: band energies from FFT magnitudes
  _bandSplit(magnitudes, sampleRate) {
    const binHz = sampleRate / (magnitudes.length * 2);
    let low = 0, mid = 0, high = 0;
    for (let i = 0; i < magnitudes.length; i++) {
      const freq = i * binHz;
      const mag = magnitudes[i];
      if (freq < 200) low += mag;
      else if (freq < 2000) mid += mag;
      else if (freq < 12000) high += mag;
    }
    return { low, mid, high };
  }

  // Utility: magnitude spectrum via iterative Cooley–Tukey FFT
  _fftMagnitudes(signal) {
    const n = signal.length;
    const real = signal.slice();
    const imag = new Float32Array(n);

    // Bit-reversal permutation
    let j = 0;
    for (let i = 0; i < n; i++) {
      if (i < j) {
        [real[i], real[j]] = [real[j], real[i]];
        [imag[i], imag[j]] = [imag[j], imag[i]];
      }
      let m = n >> 1;
      while (j >= m && m >= 2) {
        j -= m;
        m >>= 1;
      }
      j += m;
    }

    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1;
      const tableStep = (2 * Math.PI) / size;
      for (let i = 0; i < n; i += size) {
        for (let k = 0; k < half; k++) {
          const angle = tableStep * k;
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);
          const treal = cos * real[i + k + half] - sin * imag[i + k + half];
          const timag = sin * real[i + k + half] + cos * imag[i + k + half];

          real[i + k + half] = real[i + k] - treal;
          imag[i + k + half] = imag[i + k] - timag;
          real[i + k] += treal;
          imag[i + k] += timag;
        }
      }
    }

    const magnitudes = new Float32Array(n / 2);
    for (let i = 0; i < n / 2; i++) {
      magnitudes[i] = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
    }
    return magnitudes;
  }
}

