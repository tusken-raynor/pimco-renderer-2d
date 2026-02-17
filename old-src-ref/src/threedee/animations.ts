

let ANIMATION_IN_PROGRESS = false;
let ANIMATION_CANCEL_REQUESTED = false;
let ANIMATION_FINISH_PROMISE: Promise<AnimationState> | null = null;
const ANIMATION_FINISH_CALLBACKS: Array<(state: AnimationState) => void> = [];
const ANIMATION_PROGRESS_CALLBACKS: Array<(progress: number) => void> = [];

export type AnimationState = {
  x: number;
  y: number;
  z: number;
}

function requestAnimationPermission() {
  if (ANIMATION_IN_PROGRESS) {
    return false;
  }
  return true;
}
function requestAnimationPromise() {
  // Make sure the animation progress and promise are in sync
  if (!!ANIMATION_FINISH_PROMISE !== !!ANIMATION_IN_PROGRESS) {
    throw new Error("Animation promise and progress are out of sync");
  }
  if (ANIMATION_FINISH_PROMISE) {
    return ANIMATION_FINISH_PROMISE;
  }
  // Return an empty promise that resolves immediately
  return Promise.resolve();
}
function beginAnimation() {
  ANIMATION_IN_PROGRESS = true;
  let resolve: (s: AnimationState) => void;
  ANIMATION_FINISH_PROMISE = new Promise((res) => {
    resolve = res;
  });
  return (progress: number) => {
    for (const callback of ANIMATION_PROGRESS_CALLBACKS) {
      callback(progress);
    }
    if (progress >= 1.0) {
      finishAnimation();
      const rotation = exportableModule.getModelRotation();
      resolve({ x: rotation[0], y: rotation[1], z: rotation[2] });
    }
  }
}
function finishAnimation() {
  ANIMATION_IN_PROGRESS = false;
  ANIMATION_FINISH_PROMISE = null;
  ANIMATION_CANCEL_REQUESTED = false;
  const rotation = exportableModule.getModelRotation();
  for (const callback of ANIMATION_FINISH_CALLBACKS) {
    callback({ x: rotation[0], y: rotation[1], z: rotation[2] });
  }
  // Clear the animation progress callback list
  ANIMATION_PROGRESS_CALLBACKS.length = 0;
}
function cancelAnimation() {
  if (ANIMATION_IN_PROGRESS) {
    ANIMATION_CANCEL_REQUESTED = true;
  }
}
function continueAnimation() {
  return !ANIMATION_CANCEL_REQUESTED;
}
function onAnimationFinish(callback: (state: AnimationState) => void) {
  ANIMATION_FINISH_CALLBACKS.push(callback);
}
function onAnimationProgress(callback: (progress: number) => void) {
  if (!ANIMATION_IN_PROGRESS) {
    callback(1.0);
    return;
  }
  ANIMATION_PROGRESS_CALLBACKS.push(callback);
}