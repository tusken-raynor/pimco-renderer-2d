const storedCallbackKeys = {
  MAILCHIMP_CALLBACK_KEY: "MAILCHIMP_CALLBACK_KEY" as const,
};

type MailchimpResult = { result: "success" | "error"; msg: string };
type Result<K> = K extends typeof storedCallbackKeys.MAILCHIMP_CALLBACK_KEY
  ? void | MailchimpResult
  : any;

type JSONP = {
  /**
   * Make data requests using JSONP instead of HTTP requests
   *
   * @param {String} url The url to the desired script file. Query params should be defined in the config.params object
   * @param {Object} config Configuration object for making the JSONP request
   * @param {String} [config.callbackKey] The query parameter key for the callback function
   * @param {Object} [config.params] The query parameters object
   */
  request<K extends string>(
    url: string,
    config: { callbackKey: K; params: { [key: string]: any } }
  ): Promise<Result<K>>;
} & typeof storedCallbackKeys;

export default {
  request,
  MAILCHIMP_CALLBACK_KEY: "c" as const,
} as any as JSONP;

(window as any).jsonpRetriever = {};

function request(
  url: string,
  config: { callbackKey: string; params: { [key: string]: any } }
) {
  const cbName = "call" + Date.now();
  config = Object.assign({ callbackKey: "callback", params: {} }, config);
  let retriever = document.createElement("script");
  document.body.append(retriever);
  return new Promise<any>((resolve, reject) => {
    try {
      (window as any).jsonpRetriever[cbName] = (data) => {
        resolve(data);
        retriever.remove();
        delete (window as any).jsonpRetriever[cbName];
      };
      const callbackParam = {};
      callbackParam[config.callbackKey] = `window.jsonpRetriever.${cbName}`;
      Object.assign(config.params, callbackParam);
      retriever.src =
        url +
        (url.includes("?") ? "&" : "?") +
        createQueryString(config.params);
    } catch (error) {
      reject(error);
    }
  });
}
/**
 * Takes an object and uses it's keys and values to create a url query string
 */
function createQueryString(params: { [key: string]: any }) {
  let qString = "";
  for (const key in params) {
    if (params.hasOwnProperty(key)) {
      const value = params[key];
      qString +=
        encodeURIComponent(key) + "=" + encodeURIComponent(value) + "&";
    }
  }
  return qString.slice(0, -1);
}
