import { ConfiguratorRestriction, Option } from "@/types";
import structure, { OptionCasing } from "@/structure";

export default {
  match(paths: Array<Array<string>>, truePath: Array<string>) {
    for (let i = 0; i < paths.length; i++) {
      let loopBreak = false;
      const path = paths[i];
      const firstMem = path[0];
      const startIndex = truePath.indexOf(firstMem);
      if (startIndex == -1) {
        continue;
      }
      let j = 1;
      while (j + startIndex < truePath.length && j < path.length) {
        if (path[j] !== truePath[j + startIndex]) {
          loopBreak = true;
          break;
        }
        j++;
      }
      if (loopBreak) {
        continue;
      }
      return true;
    }
    return false;
  },
  handleOptionRestrictions(
    restrictions: {
      [key: string]: ConfiguratorRestriction | Array<ConfiguratorRestriction>;
    },
    incoming: Option | null,
    outgoing: Option | null,
    selections: any
  ) {
    if (outgoing && outgoing.id in restrictions) {
      // Remove the newly unselected option's restriction out of the equation
      delete restrictions[outgoing.id];
    }
    if (incoming && incoming.restrict) {
      // add 'selections' path fragment to path if it's not included
      addMissingPathFragment(incoming.restrict);
      restrictions[incoming.id] = incoming.restrict;
      this.removeRestrictedSelections(incoming.restrict, selections);
    }
  },
  findRestrictions(
    selectionsObject: { [key: string]: any },
    restrictArray: Array<{
      id: string;
      restriction: ConfiguratorRestriction | Array<ConfiguratorRestriction>;
    }> = []
  ): Array<{
    id: string;
    restriction: ConfiguratorRestriction | Array<ConfiguratorRestriction>;
  }> {
    structure.traverse(selectionsObject, (casing) => {
      if (casing.value && casing.value.restrict) {
        // If the scope of the restriction excluded 'selections' automatically add it
        addMissingPathFragment(casing.value.restrict);
        restrictArray.push({
          id: casing.value.id,
          restriction: casing.value.restrict,
        });
      }
    });
    return restrictArray;
  },
  removeRestrictedSelections(
    restrictions: ConfiguratorRestriction | Array<ConfiguratorRestriction>,
    selections: any
  ) {
    if (!(restrictions instanceof Array)) {
      restrictions = [restrictions];
    }
    for (let i = 0; i < restrictions.length; i++) {
      const restriction = restrictions[i];
      if (typeof restriction == "string") {
        structure.traverse(selections, (object: OptionCasing) => {
          if (object.value && object.value.id == restriction) {
            object.value = null;
            const nextCasing = object.next();
            if (nextCasing) {
              nextCasing.value = null;
            }
          }
        });
      } else {
        const path = Array.from(restriction.path);
        let scope = selections;
        let i = 0;
        while (path.length) {
          const name = path.shift() || "";
          if (!scope[name]) {
            path.unshift(name);
            break;
          }
          scope = scope[name];
          i++;
        }
        if (scope instanceof OptionCasing) {
          scope.value = null;
        } else {
          if (path.length) {
            const orderedCasings = Object.keys(scope)
              .map((key) => scope[key])
              .sort((a, b) => a.order - b.order)
              .filter((o) => o.value);
            let remove = true;
            for (let i = 0; i < path.length; i++) {
              const name = path[i];
              const casing = orderedCasings[i];
              if (name !== casing.value.name) {
                remove = false;
              }
            }
            orderedCasings.splice(0, path.length - 1);
            if (remove) {
              for (let i = 0; i < orderedCasings.length; i++) {
                const casing = orderedCasings[i];
                if (casing.value.id === restriction.id) {
                  casing.value = null;
                  const nextCasing = casing.next();
                  if (nextCasing) {
                    nextCasing.value = null;
                  }
                }
              }
            }
          } else {
            structure.traverse(scope, (casing) => {
              if (casing.value && casing.value.id == restriction.id) {
                casing.value = null;
                const nextCasing = casing.next();
                if (nextCasing) {
                  nextCasing.value = null;
                }
              }
            });
          }
        }
      }
    }
  },
  certifyValueIsntRestricted(
    restrictions: { [key: string]: Array<Array<string>> },
    value: Option | null,
    path?: Array<string>
  ) {
    // Not any option can be selected. Pass an option into here to confirm
    // whther or not it is restricted
    if (value === null) {
      return true;
    }
    if (value.id in restrictions) {
      if (restrictions[value.id].length) {
        if (path) {
          addMissingPathFragment(path);
          return !this.match(restrictions[value.id], path);
        }
        return true;
      }
      return false;
    }
    return true;
  },
};

function addMissingPathFragment(
  restrictions: ConfiguratorRestriction | Array<ConfiguratorRestriction>
) {
  // If the scope of the restriction excluded 'selections' automatically add it out of love
  if (restrictions instanceof Object) {
    let rsrct = restrictions;
    if (!(rsrct instanceof Array)) {
      rsrct = [rsrct];
    }
    for (let i = 0; i < rsrct.length; i++) {
      const rst = rsrct[i];
      if (
        rst instanceof Object &&
        rst.path.length > 1 &&
        rst.path[1] !== "selections"
      ) {
        rst.path.splice(1, 0, "selections");
      }
    }
  }
}
