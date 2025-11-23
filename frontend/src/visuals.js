const palettes = [
  ['#00f5d4', '#9b5de5', '#f15bb5'],
  ['#ff7b00', '#ff006e', '#8338ec'],
  ['#48bfe3', '#64dfdf', '#6930c3'],
];

function findNearest(items, time) {
  if (!items || items.length === 0) return null;
  let nearest = items[0];
  let minDiff = Math.abs(nearest.time - time);
  for (const item of items) {
    const diff = Math.abs(item.time - time);
    if (diff < minDiff) {
      nearest = item;
      minDiff = diff;
    }
  }
  return { nearest, diff: minDiff };
}

export function startVisuals(audioEl, analysis, canvas) {
  const ctx = canvas.getContext('2d');
  const { beat_times = [], sections = [], events = [] } = analysis;
  let paletteIndex = 0;
  let lastBeat = -1;

  function draw() {
    const t = audioEl.currentTime;
    const section = sections.find((s) => t >= s.start && t < s.end) || sections[sections.length - 1];
    if (section) {
      paletteIndex = ['intro', 'build', 'drop', 'break', 'outro'].indexOf(section.label);
      paletteIndex = (paletteIndex + palettes.length) % palettes.length;
    }
    const palette = palettes[paletteIndex] || palettes[0];

    ctx.fillStyle = '#0b0c10';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Beat pulse
    const { nearest: nearestBeat, diff } = findNearest(
      beat_times.map((time) => ({ time })),
      t
    ) || { nearest: null, diff: Infinity };
    let pulse = 0;
    if (nearestBeat && diff < 0.2) {
      pulse = 1 - diff / 0.2;
    }

    // Event bars
    const visibleEvents = events.filter((e) => Math.abs(e.time - t) < 1.5);
    const barWidth = canvas.width / Math.max(1, visibleEvents.length);
    visibleEvents.forEach((e, idx) => {
      const x = idx * barWidth;
      const height = Math.max(10, e.strength * canvas.height * 0.4);
      const color = palette[['kick', 'snare', 'hat', 'other'].indexOf(e.type) % palette.length];
      ctx.fillStyle = color || palette[0];
      ctx.fillRect(x, canvas.height - height, barWidth - 4, height);
    });

    // Central circle pulse
    const radius = 50 + pulse * 50;
    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2, radius, 0, Math.PI * 2);
    ctx.fillStyle = palette[0];
    ctx.globalAlpha = 0.6;
    ctx.fill();
    ctx.globalAlpha = 1.0;

    requestAnimationFrame(draw);
  }

  audioEl.addEventListener('ended', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  });

  requestAnimationFrame(draw);
}
