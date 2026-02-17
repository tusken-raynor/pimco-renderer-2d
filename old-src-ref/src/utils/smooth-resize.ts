type SmoothResizeData = {
  lastWidth: number;
  lastHeight: number;
  busy: Boolean;
  duration: number;
};

type SmoothResizeObserverEntry = Omit<ResizeObserverEntry, "target"> & {
  target: HTMLElement;
};

/* Track data related to each observed element */
const SRM = new Map<HTMLElement, SmoothResizeData>();

const SRO = new ResizeObserver((entries) => {
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i] as SmoothResizeObserverEntry;
    const data = SRM.get(entry.target)!;
    /* if a smooth resize is currently underway, ignore */
    if (data.busy) continue;
    const rect = getLiteralDimensions(entry.target);
    if (rect.width !== data.lastWidth) {
      data.busy = true;
      /* keep track of the most recent width, use that as a starting point for transition */
      entry.target.style.width = data.lastWidth + "px";
      // Update the tracker to store the new width
      data.lastWidth = rect.width;
      requestAnimationFrame(() => {
        /* now transition to the new width */
        entry.target.style.width = data.lastWidth + "px";
        setTimeout(() => {
          entry.target.style.width = "";
          data.busy = false;
        }, data.duration);
      });
    }
    if (rect.height !== data.lastHeight) {
      data.busy = true;
      /* keep track of the most recent height, use that as a starting point for transition */
      entry.target.style.height = data.lastHeight + "px";
      data.lastHeight = rect.height;
      requestAnimationFrame(() => {
        /* now transition to the new height */
        entry.target.style.height = data.lastHeight + "px";
        setTimeout(() => {
          entry.target.style.height = "";
          data.busy = false;
        }, data.duration);
      });
    }
  }
});

function set(el: HTMLElement, duration = 200) {
  if (!SRM.has(el)) {
    const rect = getLiteralDimensions(el);

    SRM.set(el, {
      lastWidth: rect.width,
      lastHeight: rect.height,
      busy: false,
      duration,
    });
    SRO.observe(el);
  }
}

const smoothResize = (context: Document | Element = document) => {
  context
    .querySelectorAll<HTMLElement>(".smooth-resize")
    .forEach((x) => set(x));
};

smoothResize.set = set;

export default smoothResize;

function getLiteralDimensions(element: HTMLElement) {
  // Get the proper height and width properties which takes border and padding
  // into consideration when it needs to
  var cs = getComputedStyle(element);

  var paddingX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  var paddingY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);

  var borderX =
    parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
  var borderY =
    parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);

  var dacta = { width: element.offsetWidth, height: element.offsetHeight };

  if (cs.boxSizing != "border-box") {
    dacta.width -= paddingX + borderX;
    dacta.height -= paddingY + borderY;
  }
  return dacta;
}
