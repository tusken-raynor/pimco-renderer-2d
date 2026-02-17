
// THIS WORKER HAS BEEN MADE SUITE COMPLIANT BY PASSING ALONG THE MESSAGE ID AND USING PAYLOADS TO SEND DATA
type WorkerTask = 'styleObjectToString' | 'styleStringToObject';

addEventListener('message', (event) => {
  const { $id, payload } = event.data;

  const task: WorkerTask = payload.task;

  if (task === 'styleObjectToString' && payload.styles) {
    const styles = payload.styles;
    const styleString = stylesToStyleString(styles);
    postMessage({ payload: styleString, $id });
  }

  // Send an empty payload if the task is unrecognized or missing data
  postMessage({ payload: undefined, $id });
});

function stylesToStyleString(styles: object): string {
  let styleString: string = "";
  for (const [selector, rules] of Object.entries(styles)) {
    if (selector.startsWith('@')) {
      // Selector is a media query or similar
      styleString += `${selector}{${stylesToStyleString(rules as object)}}`;
    } else {
      // Regular selector
      styleString += `${selector}{${cssPropertiesToString(rules as object)}}`;
    }
  }
  return styleString; 
}

function cssPropertiesToString(styles: object): string {
  let styleString: string = "";
  for (const [key, value] of Object.entries(styles)) {
    // Convert camelCase to kebab-case for CSS property names
    const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
    if (!isValidCSSProperty(cssKey)) continue; // Skip invalid CSS properties
    // Append the CSS property and its value
    styleString += `${cssKey}:${value};`;
  }
  return styleString;
}

const CSS_PROPERTY_SET = new Set([
  "align-content", "align-items", "align-self", "all", "animation", "animation-delay", "animation-direction",
  "animation-duration", "animation-fill-mode", "animation-iteration-count", "animation-name", "animation-play-state",
  "animation-timing-function", "backface-visibility", "background", "background-attachment", "background-blend-mode",
  "background-clip", "background-color", "background-image", "background-origin", "background-position",
  "background-repeat", "background-size", "border", "border-bottom", "border-bottom-color", "border-bottom-left-radius",
  "border-bottom-right-radius", "border-bottom-style", "border-bottom-width", "border-collapse", "border-color",
  "border-image", "border-image-outset", "border-image-repeat", "border-image-slice", "border-image-source",
  "border-image-width", "border-left", "border-left-color", "border-left-style", "border-left-width", "border-radius",
  "border-right", "border-right-color", "border-right-style", "border-right-width", "border-spacing", "border-style",
  "border-top", "border-top-color", "border-top-left-radius", "border-top-right-radius", "border-top-style",
  "border-top-width", "border-width", "bottom", "box-decoration-break", "box-shadow", "box-sizing", "break-after",
  "break-before", "break-inside", "caption-side", "caret-color", "clear", "clip", "color", "column-count",
  "column-fill", "column-gap", "column-rule", "column-rule-color", "column-rule-style", "column-rule-width",
  "column-span", "column-width", "columns", "content", "counter-increment", "counter-reset", "cursor", "direction",
  "display", "empty-cells", "filter", "flex", "flex-basis", "flex-direction", "flex-flow", "flex-grow",
  "flex-shrink", "flex-wrap", "float", "font", "font-family", "font-feature-settings", "font-kerning",
  "font-language-override", "font-size", "font-size-adjust", "font-stretch", "font-style", "font-synthesis",
  "font-variant", "font-variant-alternates", "font-variant-caps", "font-variant-east-asian", "font-variant-ligatures",
  "font-variant-numeric", "font-variant-position", "font-weight", "gap", "grid", "grid-area", "grid-auto-columns",
  "grid-auto-flow", "grid-auto-rows", "grid-column", "grid-column-end", "grid-column-gap", "grid-column-start",
  "grid-gap", "grid-row", "grid-row-end", "grid-row-gap", "grid-row-start", "grid-template", "grid-template-areas",
  "grid-template-columns", "grid-template-rows", "height", "hyphens", "image-rendering", "isolation", "justify-content",
  "left", "letter-spacing", "line-break", "line-height", "list-style", "list-style-image", "list-style-position",
  "list-style-type", "margin", "margin-bottom", "margin-left", "margin-right", "margin-top", "max-height",
  "max-width", "min-height", "min-width", "object-fit", "object-position", "opacity", "order", "orphans",
  "outline", "outline-color", "outline-offset", "outline-style", "outline-width", "overflow", "overflow-wrap",
  "overflow-x", "overflow-y", "padding", "padding-bottom", "padding-left", "padding-right", "padding-top",
  "page-break-after", "page-break-before", "page-break-inside", "perspective", "perspective-origin",
  "pointer-events", "position", "quotes", "resize", "right", "scroll-behavior", "tab-size", "table-layout",
  "text-align", "text-align-last", "text-decoration", "text-decoration-color", "text-decoration-line",
  "text-decoration-style", "text-indent", "text-justify", "text-overflow", "text-shadow", "text-transform",
  "top", "transform", "transform-origin", "transform-style", "transition", "transition-delay", "transition-duration",
  "transition-property", "transition-timing-function", "unicode-bidi", "user-select", "vertical-align", "visibility",
  "white-space", "widows", "width", "word-break", "word-spacing", "word-wrap", "z-index"
]);

function isValidCSSProperty(property: string): boolean {
  return CSS_PROPERTY_SET.has(property) || property.startsWith('--');
}