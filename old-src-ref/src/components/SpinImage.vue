<template>
  <div class="spin-image">
    <canvas ref="canvas"></canvas>
    <div class="rotation-control" ref="rotator"></div>
  </div>
</template>

<script lang="ts">
import { SpinImageData } from "@/types";
import { defineComponent, ref, Ref } from "vue";

// Set the image on the canvas. Provide the old image for reference
// and a transition time to have a cross fade
function setCanvasImage(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  newImage: HTMLImageElement,
  oldImage: HTMLImageElement | null = null,
  transition = 0
) {
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
  if (transition !== 0 && oldImage) {
    setCanvasImageRecursion(
      canvas,
      context,
      newImage,
      oldImage,
      transition,
      rect,
      Math.round(transition / 60)
    );
  } else {
    context.clearRect(0, 0, rect.width, rect.height);
    context.drawImage(newImage, 0, 0, rect.width, rect.height);
  }
}
// This function is used to achieve a crossfade by using recursion
function setCanvasImageRecursion(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  newImage: HTMLImageElement,
  oldImage: HTMLImageElement,
  transition: number,
  rect: DOMRect,
  frames: number,
  frame = 1
) {
  const ff = (frame / frames) * 2;
  context.clearRect(0, 0, rect.width, rect.height);
  context.globalAlpha = Math.min(1, 2 - ff);
  context.drawImage(oldImage, 0, 0, rect.width, rect.height);
  context.globalAlpha = Math.min(ff, 1);
  context.drawImage(newImage, 0, 0, rect.width, rect.height);
  if (frame < frames) {
    requestAnimationFrame(() => {
      setCanvasImageRecursion(
        canvas,
        context,
        newImage,
        oldImage,
        transition,
        rect,
        frames,
        frame + 1
      );
    });
  }
}
/**
 * @param count // The number of frames in the spin image
 * @param filescheme // All image files must be in the same folder and have identical names except for a unique number which is to be represented by '$num$' in the parameter
 * @param step // Used for debugging. Reduce the number of frames by setting larger steps.
 */
function loadImages(
  count: number,
  filescheme: string,
  step = 1
): Promise<Array<HTMLImageElement>> {
  return new Promise((res, rej) => {
    const tracker: Array<boolean> = [];
    const images: Array<HTMLImageElement> = [];
    for (let i = 0; i < count; i += step) {
      const index = i;
      const file = filescheme.replace("$num$", i + "");
      tracker.push(false);
      const image = new Image();
      image.onload = () => {
        tracker[index / step] = true;
        if (evalArray(tracker)) {
          res(images);
        }
      };
      image.src = file;
      images.push(image);
    }
  });
}
// Checks the truthy-ness of all the items in an array
function evalArray(array: Array<any>) {
  for (let i = 0; i < array.length; i++) {
    if (!array[i]) {
      return false;
    }
  }
  return true;
}
// Get the mouse or finger position of a Mouse or Touch event
function getEventPos(event: MouseEvent | TouchEvent): number {
  if (event instanceof MouseEvent) {
    return event.offsetX;
  } else {
    return (event as any).layerX || event.targetTouches[0].clientX;
  }
}

export default defineComponent({
  name: "SpinImage",
  props: {
    data: Object as () => SpinImageData,
  },
  computed: {
    spin(): number {
      if (this.data?.spin) {
        return this.data.spin;
      }
      return 540 / (this.data?.count || 36);
    },
    viewCount(): number {
      if (this.data) {
        return this.data.count;
      }
      return 1;
    },
  },
  methods: {
    mouseDown(e: MouseEvent | TouchEvent) {
      const startPos = getEventPos(e);
      // Set the rotator function within before it gets added to the mousemove event listening
      this.rotatorFunction = (ev: MouseEvent | TouchEvent) => {
        const movement = startPos - getEventPos(ev);
        const num =
          (Math.round(movement / this.spin) +
            this.frame +
            this.viewCount * 10) %
          this.viewCount;
        // Set the canvas image if it has actually changed
        if (
          this.images[num] &&
          this.lastImage !== this.images[num] &&
          this.ctx &&
          this.canvas
        ) {
          setCanvasImage(
            this.canvas,
            this.ctx,
            this.images[num],
            this.lastImage,
            800
          );
          this.lastImage = this.images[num];
        }
        this.xMove = num;
      };
      document.body.classList.add("no-scroll");
      // Set the event function for mouse/finger moving
      if (this.rotator && this.rotatorFunction) {
        this.rotator.addEventListener("mousemove", this.rotatorFunction as any);
        this.rotator.addEventListener("touchmove", this.rotatorFunction as any);
      }
    },
    mouseUp() {
      // Remove the listener for mouse moving when the mouse/finger is removed
      this.frame = this.xMove;
      document.body.classList.remove("no-scroll");
      if (this.rotator && this.rotatorFunction) {
        this.rotator.removeEventListener(
          "mousemove",
          this.rotatorFunction as any
        );
        this.rotator.removeEventListener(
          "touchmove",
          this.rotatorFunction as any
        );
      }
    },
    loadData() {
      if (this.data) {
        this.frame = 0;
        this.lastImage = null;
        this.$emit("ready", false);
        loadImages(this.viewCount, this.data.filescheme).then((images) => {
          // Let the parent component know that the images are ready
          this.$emit("ready", true);
          this.images = images;
          if (this.canvas) {
            this.ctx = this.canvas.getContext("2d");
          }
          // Set the events here because touch events can't be set in the component template
          if (this.rotator && this.canvas && this.ctx) {
            setCanvasImage(this.canvas, this.ctx, images[0]);
            this.rotator.addEventListener("mousedown", this.mouseDown);
            this.rotator.addEventListener("touchstart", this.mouseDown);
            window.addEventListener("mouseup", this.mouseUp);
            window.addEventListener("touchend", this.mouseUp);
            // this.rotator.addEventListener("mouseup", this.mouseUp);
            // this.rotator.addEventListener("mouseleave", this.mouseUp);
          }
        });
      }
    },
  },
  setup() {
    const canvas: Ref<HTMLCanvasElement | null> = ref(null);
    const rotator: Ref<HTMLElement | null> = ref(null);
    const ctx: Ref<CanvasRenderingContext2D | null> = ref(null);
    const rotatorFunction: Ref<Function | null> = ref(null);
    const frame: Ref<number> = ref(0);
    const xMove: Ref<number> = ref(0);
    const lastImage: Ref<HTMLImageElement | null> = ref(null);
    const images: Ref<Array<HTMLImageElement>> = ref([]);
    return {
      canvas,
      rotator,
      ctx,
      rotatorFunction,
      frame,
      xMove,
      lastImage,
      images,
    };
  },
  watch: {
    data(newVal, oldVal) {
      if (newVal !== oldVal) {
        this.loadData();
      }
    },
  },
  mounted() {
    this.loadData();
  },
});
</script>

<style lang="scss" scoped>
.spin-image {
  position: relative;
  canvas {
    width: 100%;
    height: 100%;
  }
  .rotation-control {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
  }
}
</style>