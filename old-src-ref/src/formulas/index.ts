import { State } from "@/store/state";
import threedee from "@/threedee";
import utils from "@/utils";
;
import { ComplexTextOption, NumericalFormula } from "@/types";
import getters from "@/store/getters";
type AddPrefix<T extends string | number | symbol> = `formula::${T extends symbol ? 'symbol' : T}`;
type FormulaNamespace<T extends Record<string, (...args: any) => any>> = {  
  [P in keyof T as AddPrefix<P>]: (state: State) => ReturnType<T[P]>;
};

function createFormulas<T extends Record<string, <R>(state: State, getters: any) => any>>(formulas: T): FormulaNamespace<T> {
  const newlyNamespacedFormulas = {} as any;
  for (const key in formulas) {
    if (Object.prototype.hasOwnProperty.call(formulas, key)) {
      newlyNamespacedFormulas[`formula::${key}`] = formulas[key];
    }
  }
  return newlyNamespacedFormulas;
}

/**
 * This file holds the formulas that properties within the data model can 
 * call upon to calculate their values. Data is passed from the vue store
 * and can be used to calculate the value of a property.
 */

export default createFormulas({
  beltBackCharLength(state) {
    // We are going to need the belt size, big boy status, and the font type
    const beltSize: string = state.selectedOptions[state.currentProduct].selections['Options']?.['Size']?.['Size']?.value?.name || 'XS';
    const isBigBoy = state.selectedOptions[state.currentProduct].selections['Belt Height']?.['Belt Height Type']?.['Height']?.value?.name == "Big Boy";
    const fontType: "Lunisol Regular" | "Jawbreak Sans" = state.selectedOptions[state.currentProduct].selections['Personalize Back']?.['Personalize Back Type']?.['Font']?.value?.name || 'Jawbreak Sans';
    // Conditions based on the provided table
    if (fontType === 'Lunisol Regular') {
      if (isBigBoy) {
          switch (beltSize) {
              case '28': return 11;
              case '30': return 12;
              case '32': return 13;
              case '34': return 14;
              case '36': return 15;
              case '38': return 16;
              case '40': return 17;
              case '42': return 18;
              case '44': return 20;
              case '46': return 21;
              default: return 11; // Default to smallest count if size is not found
          }
      } else { // Not a Big Boy
          switch (beltSize) {
              case '28': return 13;
              case '30': return 14;
              case '32': return 15;
              case '34': return 17;
              case '36': return 18;
              case '38': return 19;
              case '40': return 20;
              case '42': return 21;
              case '44': return 23;
              case '46': return 24;
              default: return 13; // Default to smallest count if size is not found
          }
      }
    } else if (fontType === 'Jawbreak Sans') {
        if (isBigBoy) {
            switch (beltSize) {
                case '28': return 17;
                case '30': return 19;
                case '32': return 21;
                case '34': return 22;
                case '36': return 24;
                case '38': return 26;
                case '40': return 27;
                case '42': return 29;
                case '44': return 30;
                case '46': return 32;
                default: return 17; // Default to smallest count if size is not found
            }
        } else { // Not a Big Boy
            switch (beltSize) {
                case '28': return 20;
                case '30': return 22;
                case '32': return 24;
                case '34': return 26;
                case '36': return 28;
                case '38': return 29;
                case '40': return 31;
                case '42': return 33;
                case '44': return 35;
                case '46': return 37;
                default: return 20; // Default to smallest count if size is not found
            }
        }
    }
    return 11; // Default to smallest count if size is not found
  },
  beltBackPersonalizationFont(state) {
    const selectedFont = utils.getNested(
      state.selectedOptions[state.currentProduct].selections, 
      [
        'Personalize Back',
        'Personalize Back Type',
        'Font',
        'value',
        'pimco',
        'USECASCADING',
        'frames',
        '0',
        'mask',
        'type'
      ]
    ) || {};
    
    return Object.assign({}, {
      letterspacing: "-0.05em",
      lineheight: 0.09,
      maxwidth: 100,
      fontfamily: "sans-serif"
    }, selectedFont)
  },
  batBarrelEndInfo(state) {
    // We are not using svg rendering in safari because it has trouble applying the correct font
    const forSVG = true;
    let materialType = state.selectedOptions[state.currentProduct].selections['Options']?.['Material']?.['Material']?.value?.name || 'Maple';
    materialType = materialType.toUpperCase();
    const svgMaterialType = `<tspan style="font-weight: 400;">${materialType}</tspan>`
    const turnType = state.selectedOptions[state.currentProduct].selections['Options']?.['Turn']?.['Turn']?.value?.name || 'N-243';
    const svgTurnType = (turnType.includes('N-') ? turnType.replace('N-', 'N-<tspan style="font-weight: 400;">') : '<tspan style="font-weight: 400;">' + turnType) + '</tspan>';
    let batLength = state.selectedOptions[state.currentProduct].selections['Options']?.['Length']?.['Length']?.value?.name || '33"';
    const svgBatLength = batLength + ' <tspan style="font-weight: 400;">-3</tspan>';
    batLength = batLength + ' -3';
    const sog = 'SOG: 1';
    const svgSog = 'SOG: <tspan style="font-weight: 400;">1</tspan>';
    let todaysDate: Date | string = new Date();
    // Reformat the date to be in the format of MM.DD.YY
    todaysDate = `${(todaysDate.getMonth() + 1).toString().padStart(2, '0')}.${todaysDate.getDate().toString().padStart(2, '0')}.${todaysDate.getFullYear().toString().slice(2)}`;
    // // return `<tspan style='font-weight: 900;'>${materialType}</tspan> <tspan style='font-weight: 200;'>${turnType} ${todaysDate} 1</tspan>`;
    // return `${materialType} ${turnType} ${todaysDate} 1`.toUpperCase();
    let characterFitLength = turnType.length > 5 ? 62 : 66;
    let charOffset = turnType.length > 5 ? 2 : 3;
    const isSafari = window.browser.toLowerCase().includes('safari');
    if (isSafari) {
      // characterFitLength = turnType.length > 5 ? 62 : 66;
      charOffset = turnType.length > 5 ? 2 : 4;
    } else if (window.browser == "Firefox") {
      characterFitLength = turnType.length > 5 ? 74 : 86;
      charOffset = turnType.length > 5 ? -3 : -7;
    }
    let components: string[] = [batLength, sog, materialType, turnType];
    if (turnType.toLowerCase() == "grenade") {
      components = [materialType, turnType, batLength, sog];
    }
    
    let string = "";

    const chunkLength = Math.floor(characterFitLength / components.length);
    for (let i = 0; i < components.length; i++) {
      const component = components[i];
      const padLength = (chunkLength - component.length) / 2;
      const padded = component.padStart(component.length + padLength, ' ').padEnd(chunkLength, ' ');
      string += padded;
    }
    
    // Use the char offset to remove X characters from the end and put them at the beginning
    if (charOffset) {
      const chunk = string.slice(-charOffset);
      string = chunk + string.slice(0, -charOffset);
    }

    // console.log(string.toUpperCase(), string.length);

    if (forSVG) {
      string = string.replace(/\s+/g, x => x.length > 1 ? `<tspan opacity="0">${"".padEnd(x.length, ".")}</tspan>` : ' ');
      string = string.replace(batLength, svgBatLength);
      string = string.replace(sog, svgSog);
      string = string.replace(materialType, svgMaterialType);
      string = string.replace(turnType, svgTurnType);
      if (isSafari) {
        string = `<tspan dy="18%">${string}</tspan>`;
      }
    }

    return string;
  },
  batBarrelPersonalizationLength(state) {
    let batLength = state.selectedOptions[state.currentProduct].selections['Options']?.['Length']?.['Length']?.value?.name || '28"';
    batLength = batLength.replace('"', '');

    const inch2EmMultiplier = 3.58 / 11;

    // const textSpaceTable = {
    //   "27": 12,
    //   "28": 12,
    //   "29": 12,
    //   "30": 12,
    //   "31": 12,
    //   "31.5": 12,
    //   "32": 13,
    //   "32.5": 13,
    //   "33": 14,
    //   "33.5": 14,
    //   "34": 15,
    //   "35": 15,
    //   "36": 15,
    //   "37": 15,
    // };
    const spaceInInches = 14;
    const value = spaceInInches * inch2EmMultiplier + "em";
    return value;
  },
  batBarrelPersonalizationFont(state) {
    const textOption: ComplexTextOption | null = state.selectedOptions[state.currentProduct].selections['Personalize Barrel']?.['Personalize Barrel']?.['Text']?.value || null;
    if (textOption?.font) {
      const workableSpace = getters['formula::batBarrelPersonalizationLength'](state);
      // See if the text will fit in the space using regular font
      const modFontRegular = 
        typeof textOption.font == "object" ? 
          { ...textOption.font, fontfamily: textOption.font.fontfamily?.replace("Nokona-Super-Condensed", "Nokona-Regular") || "Nokona-Regular" } :  
          textOption.font.replace("Nokona-Super-Condensed", "Nokona-Regular");
      const isInRegularBounds = utils.isTextWithinBounds(
        textOption.text || "",
        workableSpace,
        modFontRegular,
      );
      if (isInRegularBounds) {
        return  "Nokona-Regular";
      }
      // See if the text will fit in the space using condensed font
      const modFontCondensed =
        typeof textOption.font == "object" ? 
          { ...textOption.font, fontfamily: textOption.font.fontfamily?.replace("Nokona-Super-Condensed", "Nokona-Condensed") || "Nokona-Condensed" } :  
          textOption.font.replace("Nokona-Super-Condensed", "Nokona-Condensed");
      const isInCondensedBounds = utils.isTextWithinBounds(
        textOption.text || "",
        workableSpace,
        modFontCondensed,
      );
      if (isInCondensedBounds) {
        return "Nokona-Condensed";
      }
    }
    // If all else fails, use the super condensed font
    return "Nokona-Super-Condensed";
  }
});

// Create the interface for numerical formulas. This interface must have
// methods that cover basic arithmetic operations, has all the methods
// of the Math interface.
const numericFormulaMethods = {
  add: (a: string | number, b: string | number) => `(${a}+${b})`,
  subtract: (a: string | number, b: string | number) => `(${a}-${b})`,
  multiply: (a: string | number, b: string | number) => `(${a}*${b})`,
  divide: (a: string | number, b: string | number) => `(${a}/${b})`,
  pow: (a: string | number, b: string | number) => `Math.pow(${a},${b})`,
  sqrt: (a: number | string) => `Math.sqrt(${a})`,
  abs: (a: number | string) => `Math.abs(${a})`,
  round: (a: number | string) => `Math.round(${a})`,
  ceil: (a: number | string) => `Math.ceil(${a})`,
  floor: (a: number | string) => `Math.floor(${a})`,
  max: (a: number | string, b: number | string) => `Math.max(${a},${b})`,
  min: (a: number | string, b: number | string) => `Math.min(${a},${b})`,
  sin: (a: number | string) => `Math.sin(${a})`,
  cos: (a: number | string) => `Math.cos(${a})`,
  tan: (a: number | string) => `Math.tan(${a})`,
  asin: (a: number | string) => `Math.asin(${a})`,
  acos: (a: number | string) => `Math.acos(${a})`,
  atan: (a: number | string) => `Math.atan(${a})`,
  atan2: (a: number | string, b: number | string) => `Math.atan2(${a},${b})`,
  log: (a: number | string) => `Math.log(${a})`,
  log10: (a: number | string) => `Math.log10(${a})`,
  log2: (a: number | string) => `Math.log2(${a})`,
  exp: (a: number | string) => `Math.exp(${a})`,
  lerp: (a: number | string, b: number | string, t: number | string) => `(${a}*(1-${t})+${b}*${t})`,
} as const;
const numericFormulaConstants = {
  PI: Math.PI,
  E: Math.E,
  LN2: Math.LN2,
  LN10: Math.LN10,
  LOG2E: Math.LOG2E,
  LOG10E: Math.LOG10E,
  SQRT1_2: Math.SQRT1_2,
  SQRT2: Math.SQRT2,
};
const numericFormulaParams = {
  ModelDotProduct() {
    return threedee.getVectorCameraAlignment(this['InterestVector']);
  }
};

export function createNumericalFormula(formula: NumericalFormula) {
  const paramNames = new Set([...Object.keys(numericFormulaParams), ...Object.keys(formula.params || {})]);
  let codeString = "";
  for (let i = 0; i < formula.methods.length; i++) {
    const method = formula.methods[i];
    if (method.name in numericFormulaMethods) {
      
      const args: string[] = (method.args || ['$']).map(x => {
        if (typeof x === 'string') {
          if (x === '$') {
            return codeString ? codeString : `this['${x}']`;
          } else if (paramNames.has(x)) {
            return `this['${x}']`;
          } else if (x in numericFormulaConstants) {
            return numericFormulaConstants[x];
          } else {
            return '1';
          }
        } else {
          return x.toString();
        }
      });
      codeString = (numericFormulaMethods[method.name] as any)(...args);
    }
  }
  const formulaFunction = new Function(`return ${codeString}`) as () => number;
  return (val: number) => {
    const computed = utils.mapObject(numericFormulaParams, (value) => {
      if (typeof value === 'function') {
        return value.call(formula.params);
      } else {
        return value;
      }
    });
    return formulaFunction.call({ ...formula.params, ...computed, $: val });
  };
}
export type NumericalFormulaMethodNames = keyof typeof numericFormulaMethods;


