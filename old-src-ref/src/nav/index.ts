type NavigationCallback = (hash: string) => void;

const callbacks: Array<NavigationCallback> = [];
let preventBack = false;

// Handle the hashchange but override the default functionality
// by using the history api
window.addEventListener("hashchange", () => {
  if (!preventBack) {
    const hash = location.hash;
    preventBack = true;
    history.back();
    let href: string;
    if (location.hash === "") {
      if (location.href.includes("#")) {
        href = location.href.replace("#", hash);
      } else {
        href = location.href + hash;
      }
    } else {
      href = location.href.replace(location.hash, hash);
    }
    setTimeout(() => {
      history.replaceState({}, "configurator-replace", href);
    }, 50);
    setTimeout(() => (preventBack = false), 500);
    for (let i = 0; i < callbacks.length; i++) {
      const callback = callbacks[i];
      callback(location.hash.replace("#", ""));
    }
  }
});

export default {
  onChange(callback: NavigationCallback) {
    callbacks.push(callback);
  },
};
