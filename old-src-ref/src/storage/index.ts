import structure, { OptionCasing } from "@/structure";
import { Option, PimcoContribution } from "@/types";
import utils from "@/utils";

export default {
  saveValue(key: string, value: any) {
    if (typeof value !== "string") {
      value = JSON.stringify(value);
    }
    sessionStorage.setItem(key, value);
  },
  getValue(key: string) {
    const value = sessionStorage.getItem(key) || "";
    try {
      const parsedValue = JSON.parse(value);
      return parsedValue;
    } catch (err) {
      return value;
    }
  },
  deleteValue(key: string) {
    sessionStorage.removeItem(key);
  },
  evaluateSelections(
    storedSelections: { [key: string]: any },
    selectionsObject: { [key: string]: any },
    optionsMap: { [key: string]: Option }
  ) {
    // Create any virtual steps if they are listed
    for (const productID in storedSelections) {
      const selections = storedSelections[productID];
      if (selections.virtuals?.length && selectionsObject[productID]) {
        const virtuals = selections.virtuals.toSorted((a: any, b: any) => a.virtualOrder - b.virtualOrder);
        for (let i = 0; i < virtuals.length; i++) {
          const virtual = virtuals[i];
          structure.createVirtualBranchGroup([...virtual.path.slice(2, -1), virtual.template], selectionsObject[productID].selections);
        }
      }
    }
    // Traverse through the stored slections object and reapply and options that have a valid selection
    structure.traverse(
      storedSelections,
      (casing, path, key) => {
        if (key !== "cloneMeta") {
          let option;
          let text: string | undefined = undefined;
          let metadata: any = undefined;
          // the saved data may have text and pimco data in the value, so look for that
          if (casing.value && casing.value.id) {
            option = optionsMap[casing.value.id];
            if (casing.value.text) {
              text = casing.value.text;
            }
          } else {
            option = optionsMap[casing.value];
          }
          if (typeof casing.meta == "object" && Object.keys(casing.meta).length > 0) {
            metadata = casing.meta;
          }
          // Set the user interaction value
          // If the casing requires a value, but is empty, keep the interaction at false
          if (
            (!casing.required || option) &&
            casing.userInteraction !== undefined
          ) {
            utils.setNested(selectionsObject, casing.userInteraction, [
              ...path,
              "userInteraction",
            ]);
          }
          if (option) {
            // Only apply the saved selections if it's option path is present in the new selectiosn structure
            // revert to the old method if something is stupid
            // Check to make sure the option is not null because it will for create text if we don't
            if (text !== undefined) {
              (option as any).text = text;
            }
            if (metadata !== undefined) {
              utils.setNested(selectionsObject, metadata, [
                ...path,
                "meta",
              ]);
            }
            // Now set the value
            utils.setNested(selectionsObject, option, [...path, "value"]);
          }
        } else {
          utils.setNested(selectionsObject, casing, path, true);
        }
      },
      (o, k) => (o instanceof Object && "value" in o) || k == "cloneMeta"
    );
  },
  formatSelections(selections: any) {
    // Format the selections to save only the minimal data neccesary
    const obj = {};
    structure.traverse(
      selections,
      (casing, path) => {
        let record: any = casing;
        if (casing instanceof OptionCasing) {
          record = {
            value: casing.value?.id || null,
            userInteraction: casing.userInteraction,
          };
          
          const metaKeys = Object.keys(casing.meta).filter(k => k.startsWith('+'));
          if (metaKeys.length > 0) {
            record.meta = metaKeys.reduce((acc, key) => {
              acc[key] = casing.getMetaData(key);
              return acc;
            }, {} as any);
          }
          if (casing.value && "text" in casing.value) {
            if (record.value instanceof Object) {
              record.value.text = (casing.value as any).text || "";
            } else {
              record.value = {
                id: record.value,
                text: (casing.value as any).text || "",
              };
            }
          }
        }
        utils.setNested(obj, record, path, true);
      },
      (o, k, p) => {
        // Create a list of virtual attributes on the root of the object for each product
        // This will be used to reconstruct the created virtual steps from saved data
        if (o?.['x-data']?.virtual && p.length) {
          const productKey = p[0];
          if (!obj[productKey]) obj[productKey] = {};
          if (!obj[productKey]['virtuals']) obj[productKey]['virtuals'] = [];
          obj[productKey]['virtuals'].push({
            template: o['x-data'].virtual,
            path: p,
            virtualOrder: o['x-data'].virtualOrder || 0,
          });
          return false;
        }
        return o instanceof OptionCasing ||
          k == "model" ||
          k == "series" ||
          k == "cloneMeta";
      }
        
    );
    return obj;
  },
  saveSelections(formattedSelections: any) {
    // Save the selections to the session storage
    this.saveValue("selections", formattedSelections);
  },
};
