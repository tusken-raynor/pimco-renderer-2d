<template>
  <transition name="fade" appear>
    <div 
      id="controls-3d-tutorial" 
      :class="{'target-focused': currentSequenceTarget}" 
      :style="{'--attr-gap': attributeBarGap + 'px'}"
      @click="nextStep"
    >
      <div v-if="currentSequence" class="instructions" :class="{swapping: sequenceSwapping}">
        <h2 ref="instructionEl">
          <div class="before"></div>
          <div class="text" v-html="currentSequence.instruction"></div>
          <div class="after"></div>
        </h2>
        <div class="sequence-graphic" v-if="currentGraphicHTML" v-html="currentGraphicHTML"></div>
      </div>
      <div class="nav" @click.stop>
        <div 
          v-for="(_, index) in sequenceData" 
          :key="index" 
          :class="{ active: index === currentStep }" 
          class="step"
          @click="toStep(index)"
        ></div>
      </div>
      <div class="close" @click.stop="closeTutorial">Start Designing</div>
      <div @click.stop="closeTutorial" class="exit-button x-pattern">Exit</div>
      <div v-if="currentSequenceAnimationStyle" style="display: none;" v-html="currentSequenceAnimationStyle"></div>
    </div>
  </transition>
</template>

<script lang="ts">
import { defineComponent, ref } from 'vue';
// @ts-ignore
import rotateGraphic from '@/assets/tutorial-3d-graphic-rotate.svg';
// @ts-ignore
import spinGraphic from '@/assets/tutorial-3d-graphic-spin.svg';
// @ts-ignore
import tapGraphic from '@/assets/tutorial-3d-graphic-tap.svg?raw';
import threedee from '@/threedee';


const graphics: Record<string, string> = {
  rotate: rotateGraphic,
  spin: spinGraphic,
  tap: tapGraphic,
};

export default defineComponent({
  name: 'Controls3DTurtorial',
  computed: {
    currentSequence() {
      return this.sequenceData[this.currentStep];
    },
    currentGraphicHTML(): string | null {
      if (!this.currentSequence?.graphic) return null;
      const graphic = graphics[this.currentSequence.graphic.name];
      if (!graphic) return null;
      // Check and see if the graphic is just an svg string
      if (graphic && graphic.includes('<svg')) {
        return graphic.replace('<svg', `<svg width="${this.currentSequence.graphic.width}" height="${this.currentSequence.graphic.height}"`);
      }
      return `<img src="${graphic}" width="${this.currentSequence.graphic.width}" height="${this.currentSequence.graphic.height}" alt="${this.currentSequence.instruction}" />`;
    },
    currentSequenceTarget() {
      if (!this.currentSequence?.target) return null;
      if (typeof this.targetTrip !== 'number') return null;
      const target = document.querySelector(this.currentSequence.target);
      return target;
    }
  },
  methods: {
    toStep(index: number) {
      if (this.sequenceSwapping) return;
      if (index === this.currentStep) return;
      this.sequenceSwapping = true;
      setTimeout(() => {
        this.sequenceSwapping = false;
        this.currentStep = index;
      }, 50);
    },
    nextStep() {
      if (this.restrictCasualNavigation) return;
      if (this.currentStep === this.sequenceData.length - 1) {
        // Close this tutorial
        this.closeTutorial();
      } else {
        this.toStep(this.currentStep + 1);
      }
    },
    setTargetFocus(currentTarget: HTMLElement | null, oldTarget: HTMLElement | null) {
      if (oldTarget === currentTarget) return;

      // If there is a target, create a shadow
      if (!this.targetShadow && currentTarget) {
        this.targetShadow = document.createElement('div');
        this.targetShadow.style.position = 'fixed';
        this.targetShadow.style.zIndex = '201';
        this.targetShadow.style.inset = '0';
        this.targetShadow.style.backgroundColor = 'rgba(0, 0, 0, 0.85)';
        this.targetShadow.id = 'controls-3d-target-shadow';
      }

      if (oldTarget) {
        // Reset the temp styles on the old target
        oldTarget.setAttribute('style', oldTarget.getAttribute('data-og-style')!);
        oldTarget.setAttribute('data-og-style', '');
        // Remove the target shadow
        this.targetShadow?.remove();
      }

      if (currentTarget) {
        // Save the original styles
        currentTarget.setAttribute('data-og-style', currentTarget.getAttribute('style') || '');
        // Apply the shadow just before the target
        currentTarget.insertAdjacentElement('beforebegin', this.targetShadow!);
        // Apply the new styles
        let position = getComputedStyle(currentTarget).position;
        if (position === 'static') {
          currentTarget.style.position = 'relative';
        }
        currentTarget.style.zIndex = '202';
        currentTarget.style.animation = 'highlight-fade-in 1000ms forwards';
        setTimeout(() => {
          // Remove the animation style after its run to remove visual artifacts
          currentTarget.style.animation = '';
        }, 1000);
      }
    },
    removeTargetFocus() {
      const oldTarget = this.currentSequenceTarget;
      this.setTargetFocus(null, oldTarget as HTMLElement);
    },
    trackAttributeBarGap() {
      // Track the gap between the top of the attribute bar and the
      // bottom of the screen so that the nav is always correctly placed
      this.attributeGapTracker = setInterval(() => {
        const attributeBar = document.querySelector('#attribute-selector-tool > .attribute-controls');
        if (!attributeBar) return;
        this.attributeBarGap = window.innerHeight - attributeBar.getBoundingClientRect().top;
      }, 500);
    },
    endTrackingAttributeBarGap() {
      clearInterval(this.attributeGapTracker);
    },
    async run3dAnimation() {
      // Cancel any previous 3d animation
      clearTimeout(this.animation3dTracker);
      // Cancel any animation that is running with the animation API because we are brutal
      threedee.cancelAnimation();
      // If there is 3d animation data, then get to it
      if (this.currentSequence?.animation3d && threedee.initialized) {
        const delay = this.currentSequence.animation3d.delay || 0;
        if (this.currentSequence.animation3d.defaultAngle) {
          await threedee.animateModelRotation(
            this.currentSequence.animation3d.defaultAngle.map((angle) => angle / 180 * Math.PI) as [number, number, number],
            0,
          );
        }
        if (this.currentSequence.animation3d.angle) {
          this.animation3dTracker = setTimeout(() => {
            const angle = [
              this.currentSequence.animation3d!.angle![0] / 180 * Math.PI,
              this.currentSequence.animation3d!.angle![1] / 180 * Math.PI,
              this.currentSequence.animation3d!.angle![2] / 180 * Math.PI,
            ] as [number, number, number];
            const duration = this.currentSequence.animation3d!.duration || 1000;
            threedee.animateModelRotation(
              angle,
              duration,
            );
            this.animation3dTracker = setTimeout(() => {
              // Manually end the animation when it should be done because we are brutal
              threedee.cancelAnimation();
            }, this.currentSequence!.duration);
          }, delay);
        }
      }
    },
    anchorInstructionToTarget(target: HTMLElement, offset: [number, number], forcedProminence?: 'horizontal' | 'vertical') {
      // This function will anchor the instruction to the target
      // and offset it by the given amount
      if (!this.instructionEl) return;
      const posX = offset[0] > 0 ? 'right' : 'left';
      const posY = offset[1] > 0 ? 'bottom' : 'top';
      const posAltX = offset[0] > 0 ? 'left' : 'right';
      const posAltY = offset[1] > 0 ? 'top' : 'bottom';
      const horIsProminent = forcedProminence === undefined ? Math.abs(offset[0]) > Math.abs(offset[1]) : forcedProminence === 'horizontal';
      const absOffset = [Math.abs(offset[0]), Math.abs(offset[1])];
      const posMain = horIsProminent ? posX : posY;
      const posAlt = horIsProminent ? posAltX : posAltY;
      const targetRect = target.getBoundingClientRect();
      const textAlign = posMain === 'right' ? 'left' : (posMain === 'left' ? 'right' : 'center');
      this.instructionEl.style.position = 'fixed';
      this.instructionEl.style.zIndex = '205';
      const crossOffset = !horIsProminent ? (innerHeight * Number(posMain == 'top')) : (innerWidth * Number(posMain == 'left'));
      this.instructionEl.style[posAlt] = `${Math.abs(crossOffset - targetRect[posMain]) + absOffset[Number(!horIsProminent)]}px`;
      this.instructionEl.style[horIsProminent ? 'top' : 'left'] = `${horIsProminent ? targetRect.top + targetRect.height / 2 : targetRect.left + targetRect.width / 2}px`;
      this.instructionEl.style.transform = `translate${horIsProminent ? 'Y' : 'X'}(calc(-50% + ${offset[Number(horIsProminent)]}px))`;
      this.instructionEl.style.textAlign = textAlign;
      this.instructionEl.classList.add('anchored', posMain);
    },
    detachInstructionFromTarget() {
      if (!this.instructionEl) return;
      this.instructionEl.style.position = '';
      this.instructionEl.style.zIndex = '';
      this.instructionEl.style.top = '';
      this.instructionEl.style.left = '';
      this.instructionEl.style.bottom = '';
      this.instructionEl.style.right = '';
      this.instructionEl.style.transform = '';
      this.instructionEl.style.textAlign = '';
      this.instructionEl.classList.remove('anchored', 'left', 'right', 'top', 'bottom');
    },
    computeCurrentSequenceAnimationStyle() {
      if (!this.currentSequence?.animation) {
        this.currentSequenceAnimationStyle = '';
        return;
      }
      const animName = `anim-${Math.random().toString(36).slice(2)}`;
      const keyframes = `@keyframes ${animName} {
        ${Object.entries(this.currentSequence.animation.keyframes).map(([key, value]) => {
          return `${key} {
            transform: ${value};
          }`;
        }).join('\n')}
      }`;
      this.currentSequenceAnimationStyle = `
      <style>
        .sequence-graphic {
          animation: ${animName} ${this.currentSequence.animation?.duration || '1s'} cubic-bezier(0.37, 0, 0.63, 1) forwards;
        }
        ${keyframes}
      </style>`;
    },
    closeTutorial() {
      const triggerConstructionPopup = !sessionStorage.getItem('__constructionPopupShown');
      // Use a flag in session storage so that we don't clutter the state
      // with such a trivial feature
      if (triggerConstructionPopup) {
        sessionStorage.setItem('__constructionPopupShown', '1');
        // Open the construction popup using a programmatic click
        setTimeout(() => {
          document.querySelector('#bat-construction')?.dispatchEvent(new MouseEvent('click'));
        }, 100);
      }
      // Remove the target focus
      this.removeTargetFocus();
      // Close the tutorial
      this.$store.state.showControls3DTutorial = false;
    },
    async verifyLoadingWorkIsDone() {
      let workeringIndicator = document.querySelector('#working-indicator.working');
      while (workeringIndicator) {
        // Wait for 500 miliseconds and check again
        await new Promise((resolve) => setTimeout(resolve, 500));
        workeringIndicator = document.querySelector('#working-indicator.working');
      }
      return true;
    }
  },
  setup() {
    const sequenceData = ref([
      {
        instruction: "Rotate Your<br> Showbat in 360°",
        animation: {
          keyframes: {
            "0%": `translate(max(-${window.innerWidth > 800 ? 105 : 55}%, -45vw), -3%)`,
            "40%": `translate(max(-${window.innerWidth > 800 ? 105 : 55}%, -45vw), -3%)`,
            "100%": "translate(30%, 2%)",
          },
          duration: "2.5s",
        },
        animation3d: {
          defaultAngle: window.innerWidth > 800 ? [180, 0, 0] : [200, 346, 112],
          angle: window.innerWidth > 800 ? [0, 0, 181] : [354, 0, 290],
          duration: 8800,
          delay: 1050,
        },
        graphic: {
          name: "rotate",
          width: 136,
          height: 131,
        },
        target: "#main-canvas",
        duration: 1200
      },
      window.isTouch ?
      {  
        instruction: "Two Fingers Spin",
        animation: {
          keyframes: {
            "0%": "rotate(0deg)",
            "40%": "rotate(0deg)",
            "100%": "rotate(40deg)",
          },
          duration: "2s",
        },
        animation3d: {
          defaultAngle: window.innerWidth > 800 ? [0, 0, 181] : [354, 0, 290],
          angle: window.innerWidth > 800 ? [0, 0, 150] : [354, 0, 248],
          duration: 7100,
          delay: 900
        },
        graphic: {
          name: "spin",
          width: 84,
          height: 120,
        },
        target: "#main-canvas",
        duration: 1200
      } :
      null!,
      {
        instruction: "Double Tap to Auto Rotate Through Angles",
        animation: {
          keyframes: {
            "0%": "translateY(0) scale(1)",
            "60%": "translateY(0) scale(1)",
            "64%": "translateY(-3%) scale(0.95)",
            "68%, 80%": "translateY(0) scale(1)",
            "84%": "translateY(-3%) scale(0.95)",
            "88%, 100%": "translateY(0) scale(1)",
          },
          duration: "2s",
        },
        animation3d: {
          angle: window.innerWidth > 800 ? [180, 0, 0] : [200, 346, 112],
          duration: 3000,
          delay: 1700,
        },
        graphic: {
          name: "tap",
          width: 136,
          height: 131,
        },
        target: "#main-canvas",
        duration: 1200
      },
      {
        instruction: "Click to Change Turn, Size and Wood",
        target: window.innerWidth > 800 ? "#bat-construction" : "#bat-construction-m",
        anchor: window.innerWidth > 800 ? [24, 0] : [-24, 16],
        prominent: window.innerWidth > 800 ? undefined : 'vertical',
        animation3d: {
          defaultAngle: window.innerWidth > 800 ? [180, 0, 0] : [200, 346, 112],
        },
        duration: 1200
      },
      {
        instruction: "Arrow Through the Personalization Steps with Your Design Bar",
        target: "#attribute-selector-tool > .attribute-controls",
        anchor: [innerWidth * 0.23, -16],
        prominent: 'vertical',
        animation3d: {
          defaultAngle: window.innerWidth > 800 ? [180, 0, 0] : [200, 346, 112],
        },
        duration: 1200
      },
      {
        instruction: window.innerWidth > 800 ? 
          "Click on the tips tab to review the controls again" :
          "Click on the<br> tips tab to<br> review the<br> controls again",
        target: window.innerWidth > 800 ? "#controls-3d" : "#tips-icon-m",
        anchor: window.innerWidth > 800 ? [-24, 0] : [36, 16],
        prominent: window.innerWidth > 800 ? undefined : 'vertical',
        animation3d: {
          defaultAngle: window.innerWidth > 800 ? [180, 0, 0] : [200, 346, 112],
        },
        duration: 1200
      }
    ].filter(Boolean));
    const currentStep = ref(-1);
    const targetShadow = ref<HTMLElement | null>(null);
    // Increment this number to force the target to update
    const targetTrip = ref(0);
    const sequenceSwapping = ref(false);
    const attributeBarGap = ref(0);
    const attributeGapTracker = ref<any>(false);
    const restrictCasualNavigation = ref(false);
    const navRestrictionTracker = ref<any>(false);
    const animation3dTracker = ref<any>(false);
    const instructionEl = ref<HTMLElement | null>(null);
    const flashInstructions = ref(false);
    const instructionFlashTracker = ref<any>(false);
    const currentSequenceAnimationStyle = ref<string | null>(null);
    return {
      sequenceData,
      currentStep,
      targetShadow,
      targetTrip,
      sequenceSwapping,
      attributeBarGap,
      attributeGapTracker,
      restrictCasualNavigation,
      navRestrictionTracker,
      animation3dTracker,
      instructionEl,
      flashInstructions,
      instructionFlashTracker,
      currentSequenceAnimationStyle,
    };
  },
  watch: {
    async currentSequence() {
      // Don't let the user skip through the tutorial too quickly
      // just by clicking the screen
      clearTimeout(this.navRestrictionTracker);
      const duration = this.currentSequence?.duration || 1000;
      this.restrictCasualNavigation = true;
      this.navRestrictionTracker = setTimeout(() => {
        this.restrictCasualNavigation = false;
      }, duration);

      clearTimeout(this.instructionFlashTracker);
      if (!this.currentSequence?.graphic) {
        this.flashInstructions = false;
        this.instructionFlashTracker = setTimeout(() => {
          this.flashInstructions = true;
          this.instructionFlashTracker = setTimeout(() => {
            this.flashInstructions = false;
          }, 4000);
        }, 20);
      } else {
        this.flashInstructions = false;
      }

      await this.verifyLoadingWorkIsDone();
      
      this.computeCurrentSequenceAnimationStyle();
      this.run3dAnimation();

      this.detachInstructionFromTarget();
      if (this.currentSequence.anchor && this.currentSequenceTarget) {
        this.anchorInstructionToTarget(
          this.currentSequenceTarget as HTMLElement, 
          this.currentSequence.anchor as [number, number], 
          this.currentSequence.prominent as any
        );
      }
    },
    currentSequenceTarget(currentTarget: HTMLElement | null, oldTarget: HTMLElement | null) {
      this.setTargetFocus(currentTarget, oldTarget);
    },
    flashInstructions(val) {
      this.instructionEl?.classList.toggle('highlight', val);
    }
  },
  mounted() {
    // Run a loop for 15 seconds that checks if the #main-canvas is ready
    let elapsed = 0;
    const checkCanvas = setInterval(() => {
      if (document.querySelector('#main-canvas') || elapsed >= 15000) {
        clearInterval(checkCanvas);
        // Make sure we have at least a one second buffer
        setTimeout(() => {
          this.currentStep = 0;
        }, 1000 - elapsed);
      }
      elapsed += 100;
    }, 100);
    this.trackAttributeBarGap();
  }, 
  beforeUnmount() {
    this.endTrackingAttributeBarGap();
  }
});
</script>

<style lang="scss" scoped>
$z-depth: 2000;
#controls-3d-tutorial {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.85);
  z-index: #{$z-depth};
  // transition: background-color 0.2s linear;
  color: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  padding-top: 55px;
  --attr-gap: 20vh;
  &.target-focused {
    background-color: rgba(0, 0, 0, 0);
  }
}

.instructions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 28px;
  flex-grow: 1;
  font: 500 21px/1.2 $fnt-cm;
  @media (max-width: $small-width) {
    font-size: 16px;
    gap: 16px;
    font-weight: 600;
  }
  @media (max-width: $xsmall-width) {
    font-size: 14px;
    font-weight: 700;
  }

  &::before, &::after {
    content: '';
    display: block;
    width: 100%;
  }
  &::before {
    flex-grow: 1.4;
  }
  &::after {
    flex-grow: 1;
  }

  h2 {
    width: 236px;
    text-align: center;
    @media (max-width: $small-width) {
      width: 188px;
    }
    @media (max-width: $xsmall-width) {
      width: 138px;
    }
    .before, .after {
      display: none;
    }
    &.highlight {
      animation: highlight-instructions 3s linear forwards;
    }
  }
  .anchored {
    display: flex;
    &.top, &.bottom {
      flex-direction: column;
    }
    &.left, &.right {
      width: 312px;
      @media (width: $small-width) {
        width: 148px;
      }
    }
    &.left .after, &.top .after, &.right .before, &.bottom .before {
      display: block;
      position: relative;
      flex-basis: 76px;
      flex-shrink: 0;
      &::before, &::after {
        content: "";
        position: absolute;
      }
    }
    .before::before, .after::before {
      width: 12px;
      height: 12px;
      border: 4px solid #fff;
      border-top-color: transparent;
      border-right-color: transparent;
    }
    &.left .after::before {
      transform: translateY(-50%) rotate(-135deg);
      right: 3px;
      top: 50%;
    }
    &.right .before::before {
      transform: translateY(-50%) rotate(45deg);
      left: 3px;
      top: 50%;
    }
    &.top .after::before {
      transform: translateX(-50%) rotate(-45deg);
      bottom: 3px;
      left: 50%;
    }
    &.bottom .before::before {
      transform: translateX(-50%) rotate(135deg);
      top: 3px;
      left: 50%;
    }

    .before::after, .after::after {
      background-color: #fff;
    }
    &.right .before::after, &.left .after::after {
      width: 68.421%;
      height: 4px;
    }
    &.bottom .before::after, &.top .after::after {
      height: 68.421%;
      width: 4px;
    }
    &.left .after::after {
      right: 2px;
      top: calc(50% - 2px);
    }
    &.right .before::after {
      left: 2px;
      top: calc(50% - 2px);
    }
    &.top .after::after {
      bottom: 2px;
      left: calc(50% - 2px);
    }
    &.bottom .before::after {
      top: 2px;
      left: calc(50% - 2px);
    }
  }
}
.sequence-graphic {
  transition: opacity 0.2s linear;
  .instructions.swapping & {
    opacity: 0;
    transition: opacity 0s;
  }
  :deep(:is(img, svg)) {
    height: 178px;
    width: auto;
    @media (max-width: 500px) {
      height: 120px;
    }
  }

  :deep(.pulse-1) {
    opacity: 0;
    animation: tap-pulse 2s forwards 0s;
  }
  :deep(.pulse-2) {
    opacity: 0;
    animation: tap-pulse 2s forwards 0.06s;
  }
}

.nav {
  display: flex;
  margin-bottom: 12px;
  position: relative;
  z-index: 206;
  animation: delayed-fade-in 1.6s linear forwards;
  .step {
    padding: 12px;
    cursor: pointer;
    &::before {
      content: '';
      display: block;
      width: 16px;
      height: 16px;
      background-color: #fffa;
      transition: background-color 0.2s linear;
      border-radius: 100px;
      box-shadow: 0 0 8px 0 #0005;
      @media (max-width: $small-width) {
        width: 15px;
        height: 15px;
      }
      @media (max-width: $xsmall-width) {
        width: 14px;
        height: 14px;
      }
    }
    &:hover::before {
      background-color: #fff;
    }
    &.active::before {
      background-color: $orange;
    }
  }
}
.close {
  border-radius: 1000px;
  padding: 0.79em 1.43em 0.65em;
  background-color: $orange;
  border: 1px solid $orange;
  color: #fff;
  font: 500 17px/1.2 $fnt-cm;
  text-transform: uppercase;
  margin-top: calc(var(--attr-gap) - 66px);
  margin-bottom: 20px;
  cursor: pointer;
  transition: background-color 0.2s linear, color 0.2s linear;
  @media (min-width: $small-width-up) {
    margin-top: calc(var(--attr-gap) - 106px);
    margin-bottom: 60px;
    &:hover {
      background-color: #fff;
      color: $orange;
    }
  }
}
.exit-button {
  position: absolute;
  top: 14px;
  right: 18px;
  width: 24px;
  height: 24px;
  cursor: pointer;
  font-size: 0;
  &::before,
  &::after {
    background-color: $orange;
    transition: background-color 0.2s ease;
    width: 4px;
  }
  @media (min-width: $small-width-up) {
    width: 32px;
    height: 32px;
    top: 24px;
    right: 28px;
    &:hover {
      &::before,
      &::after {
        background-color: #fff;
      }
    }
  }
}

@keyframes tap-pulse {
  0%, 65%, 81%, 85%, 100% {
    opacity: 0;
  }
  72%, 92% {
    opacity: 1;
  }
}
@keyframes delayed-fade-in {
  0%, 50% {
    opacity: 0;
  }
  100% {
    opacity: 1;
  }
}
</style>
<style lang="scss">
body:has(#controls-3d-tutorial) #threedee-extras {
  z-index: 8;
  &:has(#controls-3d-target-shadow) {
    z-index: 12;
  }
}
body:has(#controls-3d-tutorial) .nav-interface {
  display: none;
}
@keyframes highlight-fade-in {
  0% {
    filter: brightness(42%) drop-shadow(0 0 5px #fff0);
  }
  60% {
    filter: brightness(100%) drop-shadow(0 0 24px #ffff);
  }
  100% {
    filter: brightness(100%) drop-shadow(0 0 0px #fffa);
  }
}
@keyframes highlight-instructions {
  0%, 20%, 40%, 60%, 80%, 100% {
    color: #fff;
  }
  10%, 30%, 50%, 70%, 90% {
    color: $orange;
  }
}
</style>