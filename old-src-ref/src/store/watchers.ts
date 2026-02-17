import restrictions from "@/restrictions";
import structure from "@/structure";
import { OptionCasing } from "@/structure";
import { Option } from "@/types";
import { watchersContext } from "./initialize";

export default watchersContext({
  getIndexedEnablers(
    newVal: { [key: string]: string[][] },
    oldVal: { [key: string]: string[][] } | undefined
  ) {
    if (oldVal) {
      const changedValues = getRemovables(oldVal, newVal);
      for (const key in changedValues) {
        const slew = changedValues[key]!;
        if (!slew.length) {
          continue;
        }
        // Now that we have which enablers have been removed,
        // let's go through the selection index and remove any
        // selections that are no longer enabled
        const relatedCasings: OptionCasing<Option>[] =
          this.getters.getGlobalStateIndex.options[key];
        if (relatedCasings) {
          for (let i = 0; i < slew.length; i++) {
            const pathPartial = slew[i];
            for (let j = 0; j < relatedCasings.length; j++) {
              const casing = relatedCasings[j];
              if (
                restrictions.match(
                  [pathPartial],
                  ["belts", "selections", ...casing.getPath()]
                )
              ) {
                // We have a selection to remove, figure out the best replacement
                setProperSelection(casing, undefined, key);
              }
            }
          }
        }
      }
    }
  },
  getRestrictions(
    newVal: { [key: string]: string[][] },
    oldVal: { [key: string]: string[][] } | undefined
  ) {
    if (oldVal) {
      const changedValues = getRemovables(newVal, oldVal);
      for (const key in changedValues) {
        const slew = changedValues[key]!;
        if (!slew.length) {
          continue;
        }
        // Now that we have which restrictions have been added,
        // let's go through the selection index and remove any
        // selections that are now restricted
        const relatedCasings: OptionCasing<Option>[] =
          this.getters.getGlobalStateIndex.options[key];
        if (relatedCasings) {
          for (let i = 0; i < slew.length; i++) {
            const pathPartial = slew[i];
            for (let j = 0; j < relatedCasings.length; j++) {
              const casing = relatedCasings[j];
              if (
                restrictions.match(
                  [pathPartial],
                  ["belts", "selections", ...casing.getPath()]
                )
              ) {
                // We have a selection to remove, figure out the best replacement
                setProperSelection(casing, undefined, key);
              }
            }
          }
        }
      }
    }
  },
});

function getRemovables<V1 extends object, V2 extends object>(
  value1: V1,
  value2: V2
) {
  const obj: Partial<V1> = {};
  for (const key in value1) {
    const item = value1[key];
    // Key just didn't exist in the previous object
    if (!(key in value2)) {
      obj[key] = item;
      continue;
    }
    const prev: string[][] = (value2 as any)[key];
    const prevJSON = prev.map((x) => x.join());
    // If values are array and length changed
    if (
      item instanceof Array &&
      prev instanceof Array &&
      item.length != prev.length
    ) {
      obj[key] = duplicateFilter(
        item.filter((x) => !prevJSON.includes(x.join()))
      ) as any;
      continue;
    }
    // Check the json string difference
    if (JSON.stringify(item) != JSON.stringify(prev)) {
      obj[key] = item;
      continue;
    }
  }
  return obj;
}

function duplicateFilter(arr: string[][]) {
  const newArr: string[][] = [];
  const trc = new Set<string>();
  for (let i = 0; i < arr.length; i++) {
    const strArr = arr[i];
    const joinedStr = strArr.join();
    if (!trc.has(joinedStr)) {
      trc.add(joinedStr);
      newArr.push(strArr);
    }
  }
  return newArr;
}

function getAlternateOption(
  optionHolder:
    | { options: string[] }
    | { options: { options: string[] } }
    | { suboptions: { options: string[] } },
  exclude: string,
  order: number = 0
) {
  let options: string[] = [];
  if ("options" in optionHolder) {
    if (optionHolder.options instanceof Array) {
      options = optionHolder.options;
    } else {
      options = optionHolder.options.options;
    }
  } else {
    options = optionHolder.suboptions.options;
  }
  const filteredOptions = options.filter((x) => x != exclude);
  return (
    structure.getObject(
      filteredOptions[Math.min(Math.max(order, 0), filteredOptions.length - 1)]
    ) || null
  );
}

function setProperSelection(
  casing: OptionCasing,
  previousCasing?: OptionCasing | null | undefined,
  exclude?: string
) {
  previousCasing =
    previousCasing === undefined ? casing.previous<Option>() : previousCasing;
  let holder: any;
  if (previousCasing) {
    holder = previousCasing.value;
  } else {
    holder = structure.getObject(casing.parent!);
  }
  let alt = structure.getDefault(holder) || null;
  if (exclude && alt?.id === exclude) {
    alt = getAlternateOption(holder, exclude);
  }
  casing.value = alt;
  // Make sure the selections are valid for the next layer
  const nextCasing = casing.next();
  if (
    alt &&
    nextCasing &&
    (!nextCasing.value ||
      ("suboptions" in alt &&
        alt.suboptions &&
        !alt.suboptions.options.includes(nextCasing.value.id)) ||
      nextCasing.value.id == exclude)
  ) {
    setProperSelection(nextCasing, casing);
  }
}
