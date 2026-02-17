declare global {
  var fontMap: { [key: string]: Array<{ url: string; dataUrl: string | null; details: Record<string, string> }> };
  var OS: string;
  var browser: string;
  var isTouch: boolean;
  var configuratorVersion: string;
  var configuratorSessionData: Record<string, {
    selections: {
      selections: any;
      meta?: any;
      model: string;
      series?: string;
      cloneMeta?: { [key: string]: any };
      virtuals?: Array<{ template: string; path: Array<string | number>; virtualOrder: number }>;
    };
    mode: "series" | "blank" | "color" | "";
    product: string;
  }>;
  interface Window {
    fontMap: { [key: string]: Array<{ url: string; dataUrl: string | null; details: Record<string, string> }> };
    OS: string;
    browser: string;
    isTouch: boolean;
    configuratorVersion: string;
    configuratorSessionData: Record<string, {
      selections: {
        selections: any;
        meta?: any;
        model: string;
        series?: string;
        cloneMeta?: { [key: string]: any };
        virtuals?: Array<{ template: string; path: Array<string | number>; virtualOrder: number }>;
      };
      mode: "series" | "blank" | "color" | "";
      product: string;
    }>;
  }
  interface CanvasRenderingContext2D {
    /**
     * Skew the context by X and Y angles (degrees).
     * Positive xAngle tilts horizontally, positive yAngle tilts vertically.
     */
    skew(xAngle: number, yAngle: number): void;
  }
  interface OffscreenCanvasRenderingContext2D {
    /**
     * Skew the context by X and Y angles (degrees).
     * Positive xAngle tilts horizontally, positive yAngle tilts vertically.
     */
    skew(xAngle: number, yAngle: number): void;
  }
}

export {};