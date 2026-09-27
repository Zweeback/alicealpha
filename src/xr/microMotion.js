function fract(value) {
  return value - Math.floor(value);
}

function signedNoise(index, salt = 0) {
  return fract(Math.sin((index + salt) * 12.9898) * 43758.5453123) * 2 - 1;
}

function blinkPulse(phase, duration = 0.15) {
  if (phase < 0 || phase > duration) return 1;
  const normalized = phase / duration;
  const closed = Math.sin(normalized * Math.PI);
  return 1 - closed;
}

export function sampleMicroMotion(seconds, { speaking = false } = {}) {
  const blinkCycle = 3.6;
  const blinkIndex = Math.floor(seconds / blinkCycle);
  const local = seconds - blinkIndex * blinkCycle;
  const offset = 0.35 + (signedNoise(blinkIndex, 11) + 1) * 0.58;
  const blinkAt = Math.min(blinkCycle - 0.22, 1.65 + offset);
  const blinkOpen = blinkPulse(local - blinkAt, 0.145);

  const saccadeWindow = speaking ? 1.35 : 1.85;
  const saccadeIndex = Math.floor(seconds / saccadeWindow);
  const eyeYaw = signedNoise(saccadeIndex, 31) * (speaking ? 0.022 : 0.034);
  const eyePitch = signedNoise(saccadeIndex, 47) * (speaking ? 0.012 : 0.02);

  const breath = Math.sin(seconds * 1.16) * 0.5 + Math.sin(seconds * 0.57 + 0.9) * 0.22;
  const sway = Math.sin(seconds * 0.41 + 0.3) * 0.006 + Math.sin(seconds * 0.17) * 0.003;
  const headNoiseYaw = Math.sin(seconds * 0.33 + 1.1) * 0.009 + Math.sin(seconds * 0.73) * 0.004;
  const headNoisePitch = Math.sin(seconds * 0.27 + 0.4) * 0.006;

  return {
    blinkOpen,
    eyeYaw,
    eyePitch,
    breath,
    sway,
    headNoiseYaw,
    headNoisePitch,
  };
}
