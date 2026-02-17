const PARAMS = fromQueryString(location.search);

export default {
  get(name: string, ...names: string[]) { 
    while (!(name in PARAMS) && names.length > 0) {
      name = names.shift()!;
    }
    return PARAMS[name];
  },
  getBool(name: string, ...names: string[]) {
    return !!this.get(name, ...names);
  },
  getNumber(name: string, ...names: string[]) {
    var val = Number(this.get(name, ...names));
    return isNaN(val) ? 0 : val;
  },
  getString(name: string, ...names: string[]) {
    return String(this.get(name, ...names) || "");
  },
  has(name: string, ...names: string[]) {
    return name in PARAMS;
  },
  isBool(name: string, ...names: string[]) {
    const val = this.get(name, ...names);
    return val === true || val === false;
  },
  isString(name: string, ...names: string[]) {
    return typeof this.get(name, ...names) === "string";
  },
  isNumber(name: string, ...names: string[]) {
    return typeof this.get(name, ...names) === "number";
  },
  all() {
    return { ...PARAMS };
  },
};

// Have your own version, because loadiong from utils breaks the build for some reason
function fromQueryString(queryString: string): {
  [key: string]: boolean | number | string;
} {
  if (queryString.startsWith("?")) {
    queryString = queryString.slice(1);
  }
  if (!queryString) {
    return {};
  }
  const obj: { [key: string]: boolean | number | string } = {};
  queryString.split("&").forEach((pairString) => {
    const pair = pairString.split("=");
    const key = decodeURIComponent(pair[0]);
    if (!pair[1]) {
      obj[key] = true;
    } else if (!isNaN(pair[1] as any)) {
      obj[key] = Number(pair[1]);
    } else {
      obj[key] = decodeURIComponent(pair[1]);
    }
  });
  return obj;
}
