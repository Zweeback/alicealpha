const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm';

export class CameraPresence {
  constructor({ onPresence = () => {}, onError = () => {} } = {}) {
    this.onPresence = onPresence;
    this.onError = onError;
    this.video = document.createElement('video');
    this.video.autoplay = true;
    this.video.muted = true;
    this.video.playsInline = true;
    this.stream = null;
    this.landmarker = null;
    this.frameHandle = 0;
    this.lastVideoTime = -1;
    this.running = false;
  }

  async start() {
    if (this.running) return;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('camera-unavailable');
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
    this.video.srcObject = this.stream;
    await this.video.play();
    this.running = true;

    try {
      const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
      const vision = await FilesetResolver.forVisionTasks(WASM_URL);
      this.landmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
        minFaceDetectionConfidence: 0.55,
        minTrackingConfidence: 0.55,
      });
    } catch (error) {
      this.onError(error);
    }

    this.#loop();
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.frameHandle);
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.landmarker?.close?.();
    this.landmarker = null;
  }

  #loop = () => {
    if (!this.running) return;
    if (this.video.readyState >= 2 && this.video.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = this.video.currentTime;
      if (this.landmarker) this.#readLandmarks();
      else this.onPresence({ present: true, x: 0, y: 0, distance: 0.55, expression: 'neutral', confidence: 0.35 });
    }
    this.frameHandle = requestAnimationFrame(this.#loop);
  };

  #readLandmarks() {
    const result = this.landmarker.detectForVideo(this.video, performance.now());
    const face = result.faceLandmarks?.[0];
    if (!face?.length) {
      this.onPresence({ present: false, confidence: 0 });
      return;
    }

    const left = face[33];
    const right = face[263];
    const nose = face[1];
    const eyeSpan = Math.max(0.01, Math.abs(right.x - left.x));
    const blend = Object.fromEntries((result.faceBlendshapes?.[0]?.categories || []).map((item) => [item.categoryName, item.score]));
    const smile = ((blend.mouthSmileLeft || 0) + (blend.mouthSmileRight || 0)) / 2;
    const brow = ((blend.browInnerUp || 0) + (blend.browOuterUpLeft || 0) + (blend.browOuterUpRight || 0)) / 3;
    const expression = smile > 0.42 ? 'smile' : brow > 0.36 ? 'curious' : 'neutral';

    this.onPresence({
      present: true,
      x: (0.5 - nose.x) * 2,
      y: (0.5 - nose.y) * 2,
      distance: Math.min(1, Math.max(0, (eyeSpan - 0.12) / 0.22)),
      expression,
      blink: ((blend.eyeBlinkLeft || 0) + (blend.eyeBlinkRight || 0)) / 2,
      confidence: 0.92,
    });
  }
}
