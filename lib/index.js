// src/core/bodySerializer.gen.ts
var jsonBodySerializer = {
  bodySerializer: (body) => JSON.stringify(body, (_key, value) => typeof value === "bigint" ? value.toString() : value)
};

// src/core/params.gen.ts
var extraPrefixesMap = {
  $body_: "body",
  $headers_: "headers",
  $path_: "path",
  $query_: "query"
};
var extraPrefixes = Object.entries(extraPrefixesMap);

// src/core/serverSentEvents.gen.ts
var createSseClient = ({
  onRequest,
  onSseError,
  onSseEvent,
  responseTransformer,
  responseValidator,
  sseDefaultRetryDelay,
  sseMaxRetryAttempts,
  sseMaxRetryDelay,
  sseSleepFn,
  url,
  ...options
}) => {
  let lastEventId;
  const sleep = sseSleepFn ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const createStream = async function* () {
    let retryDelay = sseDefaultRetryDelay ?? 3e3;
    let attempt = 0;
    const signal = options.signal ?? new AbortController().signal;
    while (true) {
      if (signal.aborted) break;
      attempt++;
      const headers = options.headers instanceof Headers ? options.headers : new Headers(options.headers);
      if (lastEventId !== void 0) {
        headers.set("Last-Event-ID", lastEventId);
      }
      try {
        const requestInit = {
          redirect: "follow",
          ...options,
          body: options.serializedBody,
          headers,
          signal
        };
        let request = new Request(url, requestInit);
        if (onRequest) {
          request = await onRequest(url, requestInit);
        }
        const _fetch = options.fetch ?? globalThis.fetch;
        const response = await _fetch(request);
        if (!response.ok) throw new Error(`SSE failed: ${response.status} ${response.statusText}`);
        if (!response.body) throw new Error("No body in SSE response");
        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = "";
        const abortHandler = () => {
          try {
            reader.cancel();
          } catch {
          }
        };
        signal.addEventListener("abort", abortHandler);
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += value;
            buffer = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
            const chunks = buffer.split("\n\n");
            buffer = chunks.pop() ?? "";
            for (const chunk of chunks) {
              const lines = chunk.split("\n");
              const dataLines = [];
              let eventName;
              for (const line of lines) {
                if (line.startsWith("data:")) {
                  dataLines.push(line.replace(/^data:\s*/, ""));
                } else if (line.startsWith("event:")) {
                  eventName = line.replace(/^event:\s*/, "");
                } else if (line.startsWith("id:")) {
                  lastEventId = line.replace(/^id:\s*/, "");
                } else if (line.startsWith("retry:")) {
                  const parsed = Number.parseInt(line.replace(/^retry:\s*/, ""), 10);
                  if (!Number.isNaN(parsed)) {
                    retryDelay = parsed;
                  }
                }
              }
              let data;
              let parsedJson = false;
              if (dataLines.length) {
                const rawData = dataLines.join("\n");
                try {
                  data = JSON.parse(rawData);
                  parsedJson = true;
                } catch {
                  data = rawData;
                }
              }
              if (parsedJson) {
                if (responseValidator) {
                  await responseValidator(data);
                }
                if (responseTransformer) {
                  data = await responseTransformer(data);
                }
              }
              onSseEvent?.({
                data,
                event: eventName,
                id: lastEventId,
                retry: retryDelay
              });
              if (dataLines.length) {
                yield data;
              }
            }
          }
        } finally {
          signal.removeEventListener("abort", abortHandler);
          reader.releaseLock();
        }
        break;
      } catch (error) {
        onSseError?.(error);
        if (sseMaxRetryAttempts !== void 0 && attempt >= sseMaxRetryAttempts) {
          break;
        }
        const backoff = Math.min(retryDelay * 2 ** (attempt - 1), sseMaxRetryDelay ?? 3e4);
        await sleep(backoff);
      }
    }
  };
  const stream = createStream();
  return { stream };
};

// src/core/pathSerializer.gen.ts
var separatorArrayExplode = (style) => {
  switch (style) {
    case "label":
      return ".";
    case "matrix":
      return ";";
    case "simple":
      return ",";
    default:
      return "&";
  }
};
var separatorArrayNoExplode = (style) => {
  switch (style) {
    case "form":
      return ",";
    case "pipeDelimited":
      return "|";
    case "spaceDelimited":
      return "%20";
    default:
      return ",";
  }
};
var separatorObjectExplode = (style) => {
  switch (style) {
    case "label":
      return ".";
    case "matrix":
      return ";";
    case "simple":
      return ",";
    default:
      return "&";
  }
};
var serializeArrayParam = ({
  allowReserved,
  explode,
  name,
  style,
  value
}) => {
  if (!explode) {
    const joinedValues2 = (allowReserved ? value : value.map((v) => encodeURIComponent(v))).join(separatorArrayNoExplode(style));
    switch (style) {
      case "label":
        return `.${joinedValues2}`;
      case "matrix":
        return `;${name}=${joinedValues2}`;
      case "simple":
        return joinedValues2;
      default:
        return `${name}=${joinedValues2}`;
    }
  }
  const separator = separatorArrayExplode(style);
  const joinedValues = value.map((v) => {
    if (style === "label" || style === "simple") {
      return allowReserved ? v : encodeURIComponent(v);
    }
    return serializePrimitiveParam({
      allowReserved,
      name,
      value: v
    });
  }).join(separator);
  return style === "label" || style === "matrix" ? separator + joinedValues : joinedValues;
};
var serializePrimitiveParam = ({
  allowReserved,
  name,
  value
}) => {
  if (value === void 0 || value === null) {
    return "";
  }
  if (typeof value === "object") {
    throw new Error(
      "Deeply-nested arrays/objects aren\u2019t supported. Provide your own `querySerializer()` to handle these."
    );
  }
  return `${name}=${allowReserved ? value : encodeURIComponent(value)}`;
};
var serializeObjectParam = ({
  allowReserved,
  explode,
  name,
  style,
  value,
  valueOnly
}) => {
  if (value instanceof Date) {
    return valueOnly ? value.toISOString() : `${name}=${value.toISOString()}`;
  }
  if (style !== "deepObject" && !explode) {
    let values = [];
    Object.entries(value).forEach(([key, v]) => {
      values = [...values, key, allowReserved ? v : encodeURIComponent(v)];
    });
    const joinedValues2 = values.join(",");
    switch (style) {
      case "form":
        return `${name}=${joinedValues2}`;
      case "label":
        return `.${joinedValues2}`;
      case "matrix":
        return `;${name}=${joinedValues2}`;
      default:
        return joinedValues2;
    }
  }
  const separator = separatorObjectExplode(style);
  const joinedValues = Object.entries(value).map(
    ([key, v]) => serializePrimitiveParam({
      allowReserved,
      name: style === "deepObject" ? `${name}[${key}]` : key,
      value: v
    })
  ).join(separator);
  return style === "label" || style === "matrix" ? separator + joinedValues : joinedValues;
};

// src/core/utils.gen.ts
var PATH_PARAM_RE = /\{[^{}]+\}/g;
var defaultPathSerializer = ({ path, url: _url }) => {
  let url = _url;
  const matches = _url.match(PATH_PARAM_RE);
  if (matches) {
    for (const match of matches) {
      let explode = false;
      let name = match.substring(1, match.length - 1);
      let style = "simple";
      if (name.endsWith("*")) {
        explode = true;
        name = name.substring(0, name.length - 1);
      }
      if (name.startsWith(".")) {
        name = name.substring(1);
        style = "label";
      } else if (name.startsWith(";")) {
        name = name.substring(1);
        style = "matrix";
      }
      const value = path[name];
      if (value === void 0 || value === null) {
        continue;
      }
      if (Array.isArray(value)) {
        url = url.replace(match, serializeArrayParam({ explode, name, style, value }));
        continue;
      }
      if (typeof value === "object") {
        url = url.replace(
          match,
          serializeObjectParam({
            explode,
            name,
            style,
            value,
            valueOnly: true
          })
        );
        continue;
      }
      if (style === "matrix") {
        url = url.replace(
          match,
          `;${serializePrimitiveParam({
            name,
            value
          })}`
        );
        continue;
      }
      const replaceValue = encodeURIComponent(
        style === "label" ? `.${value}` : value
      );
      url = url.replace(match, replaceValue);
    }
  }
  return url;
};
var getUrl = ({
  baseUrl,
  path,
  query,
  querySerializer,
  url: _url
}) => {
  const pathUrl = _url.startsWith("/") ? _url : `/${_url}`;
  let url = (baseUrl ?? "") + pathUrl;
  if (path) {
    url = defaultPathSerializer({ path, url });
  }
  let search = query ? querySerializer(query) : "";
  if (search.startsWith("?")) {
    search = search.substring(1);
  }
  if (search) {
    url += `?${search}`;
  }
  return url;
};
function getValidRequestBody(options) {
  const hasBody = options.body !== void 0;
  const isSerializedBody = hasBody && options.bodySerializer;
  if (isSerializedBody) {
    if ("serializedBody" in options) {
      const hasSerializedBody = options.serializedBody !== void 0 && options.serializedBody !== "";
      return hasSerializedBody ? options.serializedBody : null;
    }
    return options.body !== "" ? options.body : null;
  }
  if (hasBody) {
    return options.body;
  }
  return void 0;
}

// src/core/auth.gen.ts
var getAuthToken = async (auth, callback) => {
  const token = typeof callback === "function" ? await callback(auth) : callback;
  if (!token) {
    return;
  }
  if (auth.scheme === "bearer") {
    return `Bearer ${token}`;
  }
  if (auth.scheme === "basic") {
    return `Basic ${btoa(token)}`;
  }
  return token;
};

// src/client/utils.gen.ts
var createQuerySerializer = ({
  parameters = {},
  ...args
} = {}) => {
  const querySerializer = (queryParams) => {
    const search = [];
    if (queryParams && typeof queryParams === "object") {
      for (const name in queryParams) {
        const value = queryParams[name];
        if (value === void 0 || value === null) {
          continue;
        }
        const options = parameters[name] || args;
        if (Array.isArray(value)) {
          const serializedArray = serializeArrayParam({
            allowReserved: options.allowReserved,
            explode: true,
            name,
            style: "form",
            value,
            ...options.array
          });
          if (serializedArray) search.push(serializedArray);
        } else if (typeof value === "object") {
          const serializedObject = serializeObjectParam({
            allowReserved: options.allowReserved,
            explode: true,
            name,
            style: "deepObject",
            value,
            ...options.object
          });
          if (serializedObject) search.push(serializedObject);
        } else {
          const serializedPrimitive = serializePrimitiveParam({
            allowReserved: options.allowReserved,
            name,
            value
          });
          if (serializedPrimitive) search.push(serializedPrimitive);
        }
      }
    }
    return search.join("&");
  };
  return querySerializer;
};
var getParseAs = (contentType) => {
  if (!contentType) {
    return "stream";
  }
  const cleanContent = contentType.split(";")[0]?.trim();
  if (!cleanContent) {
    return;
  }
  if (cleanContent.startsWith("application/json") || cleanContent.endsWith("+json")) {
    return "json";
  }
  if (cleanContent === "multipart/form-data") {
    return "formData";
  }
  if (["application/", "audio/", "image/", "video/"].some((type) => cleanContent.startsWith(type))) {
    return "blob";
  }
  if (cleanContent.startsWith("text/")) {
    return "text";
  }
  return;
};
var checkForExistence = (options, name) => {
  if (!name) {
    return false;
  }
  if (options.headers.has(name) || options.query?.[name] || options.headers.get("Cookie")?.includes(`${name}=`)) {
    return true;
  }
  return false;
};
var setAuthParams = async ({
  security,
  ...options
}) => {
  for (const auth of security) {
    if (checkForExistence(options, auth.name)) {
      continue;
    }
    const token = await getAuthToken(auth, options.auth);
    if (!token) {
      continue;
    }
    const name = auth.name ?? "Authorization";
    switch (auth.in) {
      case "query":
        if (!options.query) {
          options.query = {};
        }
        options.query[name] = token;
        break;
      case "cookie":
        options.headers.append("Cookie", `${name}=${token}`);
        break;
      case "header":
      default:
        options.headers.set(name, token);
        break;
    }
  }
};
var buildUrl = (options) => getUrl({
  baseUrl: options.baseUrl,
  path: options.path,
  query: options.query,
  querySerializer: typeof options.querySerializer === "function" ? options.querySerializer : createQuerySerializer(options.querySerializer),
  url: options.url
});
var mergeConfigs = (a, b) => {
  const config = { ...a, ...b };
  if (config.baseUrl?.endsWith("/")) {
    config.baseUrl = config.baseUrl.substring(0, config.baseUrl.length - 1);
  }
  config.headers = mergeHeaders(a.headers, b.headers);
  return config;
};
var headersEntries = (headers) => {
  const entries = [];
  headers.forEach((value, key) => {
    entries.push([key, value]);
  });
  return entries;
};
var mergeHeaders = (...headers) => {
  const mergedHeaders = new Headers();
  for (const header of headers) {
    if (!header) {
      continue;
    }
    const iterator = header instanceof Headers ? headersEntries(header) : Object.entries(header);
    for (const [key, value] of iterator) {
      if (value === null) {
        mergedHeaders.delete(key);
      } else if (Array.isArray(value)) {
        for (const v of value) {
          mergedHeaders.append(key, v);
        }
      } else if (value !== void 0) {
        mergedHeaders.set(
          key,
          typeof value === "object" ? JSON.stringify(value) : value
        );
      }
    }
  }
  return mergedHeaders;
};
var Interceptors = class {
  fns = [];
  clear() {
    this.fns = [];
  }
  eject(id) {
    const index = this.getInterceptorIndex(id);
    if (this.fns[index]) {
      this.fns[index] = null;
    }
  }
  exists(id) {
    const index = this.getInterceptorIndex(id);
    return Boolean(this.fns[index]);
  }
  getInterceptorIndex(id) {
    if (typeof id === "number") {
      return this.fns[id] ? id : -1;
    }
    return this.fns.indexOf(id);
  }
  update(id, fn) {
    const index = this.getInterceptorIndex(id);
    if (this.fns[index]) {
      this.fns[index] = fn;
      return id;
    }
    return false;
  }
  use(fn) {
    this.fns.push(fn);
    return this.fns.length - 1;
  }
};
var createInterceptors = () => ({
  error: new Interceptors(),
  request: new Interceptors(),
  response: new Interceptors()
});
var defaultQuerySerializer = createQuerySerializer({
  allowReserved: false,
  array: {
    explode: true,
    style: "form"
  },
  object: {
    explode: true,
    style: "deepObject"
  }
});
var defaultHeaders = {
  "Content-Type": "application/json"
};
var createConfig = (override = {}) => ({
  ...jsonBodySerializer,
  headers: defaultHeaders,
  parseAs: "auto",
  querySerializer: defaultQuerySerializer,
  ...override
});

// src/client/client.gen.ts
var createClient = (config = {}) => {
  let _config = mergeConfigs(createConfig(), config);
  const getConfig = () => ({ ..._config });
  const setConfig = (config2) => {
    _config = mergeConfigs(_config, config2);
    return getConfig();
  };
  const interceptors = createInterceptors();
  const beforeRequest = async (options) => {
    const opts = {
      ..._config,
      ...options,
      fetch: options.fetch ?? _config.fetch ?? globalThis.fetch,
      headers: mergeHeaders(_config.headers, options.headers),
      serializedBody: void 0
    };
    if (opts.security) {
      await setAuthParams({
        ...opts,
        security: opts.security
      });
    }
    if (opts.requestValidator) {
      await opts.requestValidator(opts);
    }
    if (opts.body !== void 0 && opts.bodySerializer) {
      opts.serializedBody = opts.bodySerializer(opts.body);
    }
    if (opts.body === void 0 || opts.serializedBody === "") {
      opts.headers.delete("Content-Type");
    }
    const url = buildUrl(opts);
    return { opts, url };
  };
  const request = async (options) => {
    const { opts, url } = await beforeRequest(options);
    const requestInit = {
      redirect: "follow",
      ...opts,
      body: getValidRequestBody(opts)
    };
    let request2 = new Request(url, requestInit);
    for (const fn of interceptors.request.fns) {
      if (fn) {
        request2 = await fn(request2, opts);
      }
    }
    const _fetch = opts.fetch;
    let response;
    try {
      response = await _fetch(request2);
    } catch (error2) {
      let finalError2 = error2;
      for (const fn of interceptors.error.fns) {
        if (fn) {
          finalError2 = await fn(error2, void 0, request2, opts);
        }
      }
      finalError2 = finalError2 || {};
      if (opts.throwOnError) {
        throw finalError2;
      }
      return opts.responseStyle === "data" ? void 0 : {
        error: finalError2,
        request: request2,
        response: void 0
      };
    }
    for (const fn of interceptors.response.fns) {
      if (fn) {
        response = await fn(response, request2, opts);
      }
    }
    const result = {
      request: request2,
      response
    };
    if (response.ok) {
      const parseAs = (opts.parseAs === "auto" ? getParseAs(response.headers.get("Content-Type")) : opts.parseAs) ?? "json";
      if (response.status === 204 || response.headers.get("Content-Length") === "0") {
        let emptyData;
        switch (parseAs) {
          case "arrayBuffer":
          case "blob":
          case "text":
            emptyData = await response[parseAs]();
            break;
          case "formData":
            emptyData = new FormData();
            break;
          case "stream":
            emptyData = response.body;
            break;
          case "json":
          default:
            emptyData = {};
            break;
        }
        return opts.responseStyle === "data" ? emptyData : {
          data: emptyData,
          ...result
        };
      }
      let data;
      switch (parseAs) {
        case "arrayBuffer":
        case "blob":
        case "formData":
        case "text":
          data = await response[parseAs]();
          break;
        case "json": {
          const text = await response.text();
          data = text ? JSON.parse(text) : {};
          break;
        }
        case "stream":
          return opts.responseStyle === "data" ? response.body : {
            data: response.body,
            ...result
          };
      }
      if (parseAs === "json") {
        if (opts.responseValidator) {
          await opts.responseValidator(data);
        }
        if (opts.responseTransformer) {
          data = await opts.responseTransformer(data);
        }
      }
      return opts.responseStyle === "data" ? data : {
        data,
        ...result
      };
    }
    const textError = await response.text();
    let jsonError;
    try {
      jsonError = JSON.parse(textError);
    } catch {
    }
    const error = jsonError ?? textError;
    let finalError = error;
    for (const fn of interceptors.error.fns) {
      if (fn) {
        finalError = await fn(error, response, request2, opts);
      }
    }
    finalError = finalError || {};
    if (opts.throwOnError) {
      throw finalError;
    }
    return opts.responseStyle === "data" ? void 0 : {
      error: finalError,
      ...result
    };
  };
  const makeMethodFn = (method) => (options) => request({ ...options, method });
  const makeSseFn = (method) => async (options) => {
    const { opts, url } = await beforeRequest(options);
    return createSseClient({
      ...opts,
      body: opts.body,
      headers: opts.headers,
      method,
      onRequest: async (url2, init) => {
        let request2 = new Request(url2, init);
        for (const fn of interceptors.request.fns) {
          if (fn) {
            request2 = await fn(request2, opts);
          }
        }
        return request2;
      },
      serializedBody: getValidRequestBody(opts),
      url
    });
  };
  return {
    buildUrl,
    connect: makeMethodFn("CONNECT"),
    delete: makeMethodFn("DELETE"),
    get: makeMethodFn("GET"),
    getConfig,
    head: makeMethodFn("HEAD"),
    interceptors,
    options: makeMethodFn("OPTIONS"),
    patch: makeMethodFn("PATCH"),
    post: makeMethodFn("POST"),
    put: makeMethodFn("PUT"),
    request,
    setConfig,
    sse: {
      connect: makeSseFn("CONNECT"),
      delete: makeSseFn("DELETE"),
      get: makeSseFn("GET"),
      head: makeSseFn("HEAD"),
      options: makeSseFn("OPTIONS"),
      patch: makeSseFn("PATCH"),
      post: makeSseFn("POST"),
      put: makeSseFn("PUT"),
      trace: makeSseFn("TRACE")
    },
    trace: makeMethodFn("TRACE")
  };
};

// src/client.gen.ts
var client = createClient(createConfig({ baseUrl: "https://api.bitbucket.org/2.0" }));

// src/sdk.gen.ts
var HeyApiClient = class {
  client;
  constructor(args) {
    this.client = args?.client ?? client;
  }
};
var HeyApiRegistry = class {
  defaultKey = "default";
  instances = /* @__PURE__ */ new Map();
  get(key) {
    const instance = this.instances.get(key ?? this.defaultKey);
    if (!instance) {
      throw new Error(`No SDK client found. Create one with "new BitbucketClient()" to fix this error.`);
    }
    return instance;
  }
  set(value, key) {
    this.instances.set(key ?? this.defaultKey, value);
  }
};
var BitbucketClient = class _BitbucketClient extends HeyApiClient {
  static __registry = new HeyApiRegistry();
  constructor(args) {
    super(args);
    _BitbucketClient.__registry.set(this, args?.key);
  }
  /**
   * Delete an app
   *
   * Deletes the application for the user.
   *
   * This endpoint is intended to be used by Bitbucket Connect apps
   * and only supports JWT authentication -- that is how Bitbucket
   * identifies the particular installation of the app. Developers
   * with applications registered in the "Develop Apps" section
   * of Bitbucket Marketplace need not use this endpoint as
   * updates for those applications can be sent out via the
   * UI of that section.
   *
   * ```
   * $ curl -X DELETE https://api.bitbucket.org/2.0/addon \
   * -H "Authorization: JWT <JWT Token>"
   * ```
   */
  deleteAddon(options) {
    return (options?.client ?? this.client).delete({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/addon",
      ...options
    });
  }
  /**
   * Update an installed app
   *
   * Updates the application installation for the user.
   *
   * This endpoint is intended to be used by Bitbucket Connect apps
   * and only supports JWT authentication -- that is how Bitbucket
   * identifies the particular installation of the app. Developers
   * with applications registered in the "Develop Apps" section
   * of Bitbucket need not use this endpoint as updates for those
   * applications can be sent out via the UI of that section.
   *
   * Passing an empty body will update the installation using the
   * existing descriptor URL.
   *
   * ```
   * $ curl -X PUT https://api.bitbucket.org/2.0/addon \
   * -H "Authorization: JWT <JWT Token>" \
   * --header "Content-Type: application/json" \
   * --data '{}'
   * ```
   *
   * The new `descriptor` for the installation can be also provided
   * in the body directly.
   *
   * ```
   * $ curl -X PUT https://api.bitbucket.org/2.0/addon \
   * -H "Authorization: JWT <JWT Token>" \
   * --header "Content-Type: application/json" \
   * --data '{"descriptor": $NEW_DESCRIPTOR}'
   * ```
   *
   * In both these modes the URL of the descriptor cannot be changed. To
   * change the descriptor location and upgrade an installation
   * the request must be made exclusively with a `descriptor_url`.
   *
   * ```
   * $ curl -X PUT https://api.bitbucket.org/2.0/addon \
   * -H "Authorization: JWT <JWT Token>" \
   * --header "Content-Type: application/json" \
   * --data '{"descriptor_url": $NEW_URL}'
   * ```
   *
   * The `descriptor_url` must exactly match the marketplace registration
   * that Atlassian has for the application. Contact your Atlassian
   * developer advocate to update this registration. Once the registration
   * has been updated you may call this resource for each installation.
   *
   * Note that the scopes of the application cannot be increased
   * in the new descriptor nor reduced to none.
   */
  updateAddon(options) {
    return (options?.client ?? this.client).put({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/addon",
      ...options
    });
  }
  /**
   * List linkers for an app
   *
   * Gets a list of all [linkers](/cloud/bitbucket/modules/linker/)
   * for the authenticated application.
   *
   * This endpoint is deprecated and will be removed by May 2026.
   *
   * @deprecated
   */
  getAddonLinkers(options) {
    return (options?.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/addon/linkers",
      ...options
    });
  }
  /**
   * Get a linker for an app
   *
   * Gets a [linker](/cloud/bitbucket/modules/linker/) specified by `linker_key`
   * for the authenticated application.
   *
   * This endpoint is deprecated and will be removed by May 2026.
   *
   * @deprecated
   */
  getAddonLinker(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/addon/linkers/{linker_key}",
      ...options
    });
  }
  /**
   * Delete all linker values
   *
   * Delete all [linker](/cloud/bitbucket/modules/linker/) values for the
   * specified linker of the authenticated application.
   *
   * This endpoint is deprecated and will be removed by May 2026.
   *
   * @deprecated
   */
  deleteAddonLinkerValues(options) {
    return (options.client ?? this.client).delete({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/addon/linkers/{linker_key}/values",
      ...options
    });
  }
  /**
   * List linker values for a linker
   *
   * Gets a list of all [linker](/cloud/bitbucket/modules/linker/) values for the
   * specified linker of the authenticated application.
   *
   * A linker value lets applications supply values to modify its regular expression.
   *
   * The base regular expression must use a Bitbucket-specific match group `(?K)`
   * which will be translated to `([\w\-]+)`. A value must match this pattern.
   *
   * [Read more about linker values](/cloud/bitbucket/modules/linker/#usingthebitbucketapitosupplyvalues)
   *
   * This endpoint is deprecated and will be removed by May 2026.
   *
   * @deprecated
   */
  getAddonLinkerValues(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/addon/linkers/{linker_key}/values",
      ...options
    });
  }
  /**
   * Create a linker value
   *
   * Creates a [linker](/cloud/bitbucket/modules/linker/) value for the specified
   * linker of authenticated application.
   *
   * A linker value lets applications supply values to modify its regular expression.
   *
   * The base regular expression must use a Bitbucket-specific match group `(?K)`
   * which will be translated to `([\w\-]+)`. A value must match this pattern.
   *
   * [Read more about linker values](/cloud/bitbucket/modules/linker/#usingthebitbucketapitosupplyvalues)
   *
   * This endpoint is deprecated and will be removed by May 2026.
   *
   * @deprecated
   */
  createAddonLinkerValues(options) {
    return (options.client ?? this.client).post({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/addon/linkers/{linker_key}/values",
      ...options
    });
  }
  /**
   * Update a linker value
   *
   * Bulk update [linker](/cloud/bitbucket/modules/linker/) values for the specified
   * linker of the authenticated application.
   *
   * A linker value lets applications supply values to modify its regular expression.
   *
   * The base regular expression must use a Bitbucket-specific match group `(?K)`
   * which will be translated to `([\w\-]+)`. A value must match this pattern.
   *
   * [Read more about linker values](/cloud/bitbucket/modules/linker/#usingthebitbucketapitosupplyvalues)
   *
   * This endpoint is deprecated and will be removed by May 2026.
   *
   * @deprecated
   */
  updateAddonLinkerValues(options) {
    return (options.client ?? this.client).put({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/addon/linkers/{linker_key}/values",
      ...options
    });
  }
  /**
   * Delete a linker value
   *
   * Delete a single [linker](/cloud/bitbucket/modules/linker/) value
   * of the authenticated application.
   *
   * This endpoint is deprecated and will be removed by May 2026.
   *
   * @deprecated
   */
  deleteAddonLinkerValue(options) {
    return (options.client ?? this.client).delete({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/addon/linkers/{linker_key}/values/{value_id}",
      ...options
    });
  }
  /**
   * Get a linker value
   *
   * Get a single [linker](/cloud/bitbucket/modules/linker/) value
   * of the authenticated application.
   *
   * This endpoint is deprecated and will be removed by May 2026.
   *
   * @deprecated
   */
  getAddonLinkerValue(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/addon/linkers/{linker_key}/values/{value_id}",
      ...options
    });
  }
  /**
   * Get a webhook resource
   *
   * Returns the webhook resource or subject types on which webhooks can
   * be registered.
   *
   * Each resource/subject type contains an `events` link that returns the
   * paginated list of specific events each individual subject type can
   * emit.
   *
   * This endpoint is publicly accessible and does not require
   * authentication or scopes.
   */
  getHookEvents(options) {
    return (options?.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/hook_events",
      ...options
    });
  }
  /**
   * List subscribable webhook types
   *
   * Returns a paginated list of all valid webhook events for the
   * specified entity.
   * **The team and user webhooks are deprecated, and you should use workspace instead.
   * For more information, see [the announcement](https://developer.atlassian.com/cloud/bitbucket/bitbucket-api-teams-deprecation/).**
   *
   * This is public data that does not require any scopes or authentication.
   *
   * NOTE: The example response is a truncated response object for the `workspace` `subject_type`.
   * We return the same structure for the other `subject_type` objects.
   */
  getHookEventsBySubjectType(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/hook_events/{subject_type}",
      ...options
    });
  }
  /**
   * List public repositories
   *
   * **This endpoint is deprecated. Please use the
   * [workspace scoped alternative](/cloud/bitbucket/rest/api-group-repositories/#api-repositories-workspace-get).**
   *
   * Returns a paginated list of all public repositories.
   *
   * This endpoint also supports filtering and sorting of the results. See
   * [filtering and sorting](/cloud/bitbucket/rest/intro/#filtering) for more details.
   *
   * @deprecated
   */
  listRepositories(options) {
    return (options?.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories",
      ...options
    });
  }
  /**
   * List repositories in a workspace
   *
   * Returns a paginated list of all repositories owned by the specified
   * workspace.
   *
   * The result can be narrowed down based on the authenticated user's role.
   *
   * E.g. with `?role=contributor`, only those repositories that the
   * authenticated user has write access to are returned (this includes any
   * repo the user is an admin on, as that implies write access).
   *
   * This endpoint also supports filtering and sorting of the results. See
   * [filtering and sorting](/cloud/bitbucket/rest/intro/#filtering) for more details.
   */
  listWorkspaceRepositories(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}",
      ...options
    });
  }
  /**
   * Delete a repository
   *
   * Deletes the repository. This is an irreversible operation.
   *
   * This does not affect its forks.
   */
  deleteRepository(options) {
    return (options.client ?? this.client).delete({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}",
      ...options
    });
  }
  /**
   * Get a repository
   *
   * Returns the object describing this repository.
   */
  getRepository(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}",
      ...options
    });
  }
  /**
   * Create a repository
   *
   * Creates a new repository.
   *
   * Note: In order to set the project for the newly created repository,
   * pass in either the project key or the project UUID as part of the
   * request body as shown in the examples below:
   *
   * ```
   * $ curl -X POST -H "Content-Type: application/json" -d '{
   * "scm": "git",
   * "project": {
   * "key": "MARS"
   * }
   * }' https://api.bitbucket.org/2.0/repositories/teamsinspace/hablanding
   * ```
   *
   * or
   *
   * ```
   * $ curl -X POST -H "Content-Type: application/json" -d '{
   * "scm": "git",
   * "project": {
   * "key": "{ba516952-992a-4c2d-acbd-17d502922f96}"
   * }
   * }' https://api.bitbucket.org/2.0/repositories/teamsinspace/hablanding
   * ```
   *
   * The project must be assigned for all repositories. If the project is not provided,
   * the repository is automatically assigned to the oldest project in the workspace.
   *
   * Note: In the examples above, the workspace ID `teamsinspace`,
   * and/or the repository name `hablanding` can be replaced by UUIDs.
   */
  createRepository(options) {
    return (options.client ?? this.client).post({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * Update a repository
   *
   * Since this endpoint can be used to both update and to create a
   * repository, the request body depends on the intent.
   *
   * #### Creation
   *
   * See the POST documentation for the repository endpoint for an example
   * of the request body.
   *
   * #### Update
   *
   * Note: Changing the `name` of the repository will cause the location to
   * be changed. This is because the URL of the repo is derived from the
   * name (a process called slugification). In such a scenario, it is
   * possible for the request to fail if the newly created slug conflicts
   * with an existing repository's slug. But if there is no conflict,
   * the new location will be returned in the `Location` header of the
   * response.
   */
  updateRepository(options) {
    return (options.client ?? this.client).put({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * List branch restrictions
   *
   * Returns a paginated list of all branch restrictions on the
   * repository.
   */
  listBranchRestrictions(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/branch-restrictions",
      ...options
    });
  }
  /**
   * Create a branch restriction rule
   *
   * Creates a new branch restriction rule for a repository.
   *
   * `kind` describes what will be restricted. Allowed values include:
   * `push`, `force`, `delete`, `restrict_merges`, `require_tasks_to_be_completed`,
   * `require_approvals_to_merge`, `require_default_reviewer_approvals_to_merge`,
   * `require_no_changes_requested`, `require_passing_builds_to_merge`, `require_commits_behind`,
   * `reset_pullrequest_approvals_on_change`, `smart_reset_pullrequest_approvals`,
   * `reset_pullrequest_changes_requested_on_change`, `require_all_dependencies_merged`,
   * `enforce_merge_checks`, and `allow_auto_merge_when_builds_pass`.
   *
   * Different kinds of branch restrictions have different requirements:
   *
   * * `push` and `restrict_merges` require `users` and `groups` to be
   * specified. Empty lists are allowed, in which case permission is
   * denied for everybody.
   *
   * The restriction applies to all branches that match. There are
   * two ways to match a branch. It is configured in `branch_match_kind`:
   *
   * 1. `glob`: Matches a branch against the `pattern`. A `'*'` in
   * `pattern` will expand to match zero or more characters, and every
   * other character matches itself. For example, `'foo*'` will match
   * `'foo'` and `'foobar'`, but not `'barfoo'`. `'*'` will match all
   * branches.
   * 2. `branching_model`: Matches a branch against the repository's
   * branching model. The `branch_type` controls the type of branch
   * to match. Allowed values include: `production`, `development`,
   * `bugfix`, `release`, `feature` and `hotfix`.
   *
   * The combination of `kind` and match must be unique. This means that
   * two `glob` restrictions in a repository cannot have the same `kind` and
   * `pattern`. Additionally, two `branching_model` restrictions in a
   * repository cannot have the same `kind` and `branch_type`.
   *
   * `users` and `groups` are lists of users and groups that are except from
   * the restriction. They can only be configured in `push` and
   * `restrict_merges` restrictions. The `push` restriction stops a user
   * pushing to matching branches unless that user is in `users` or is a
   * member of a group in `groups`. The `restrict_merges` stops a user
   * merging pull requests to matching branches unless that user is in
   * `users` or is a member of a group in `groups`. Adding new users or
   * groups to an existing restriction should be done via `PUT`.
   *
   * Note that branch restrictions with overlapping matchers is allowed,
   * but the resulting behavior may be surprising.
   */
  createBranchRestriction(options) {
    return (options.client ?? this.client).post({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/branch-restrictions",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * Delete a branch restriction rule
   *
   * Deletes an existing branch restriction rule.
   */
  deleteBranchRestriction(options) {
    return (options.client ?? this.client).delete({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/branch-restrictions/{id}",
      ...options
    });
  }
  /**
   * Get a branch restriction rule
   *
   * Returns a specific branch restriction rule.
   */
  getBranchRestriction(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/branch-restrictions/{id}",
      ...options
    });
  }
  /**
   * Update a branch restriction rule
   *
   * Updates an existing branch restriction rule.
   *
   * Fields not present in the request body are ignored.
   *
   * See [`POST`](/cloud/bitbucket/rest/api-group-branch-restrictions/#api-repositories-workspace-repo-slug-branch-restrictions-post) for details.
   */
  updateBranchRestriction(options) {
    return (options.client ?? this.client).put({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/branch-restrictions/{id}",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * Get the branching model for a repository
   *
   * Return the branching model as applied to the repository. This view is
   * read-only. The branching model settings can be changed using the
   * [settings](#api-repositories-workspace-repo-slug-branching-model-settings-get) API.
   *
   * The returned object:
   *
   * 1. Always has a `development` property. `development.branch` contains
   * the actual repository branch object that is considered to be the
   * `development` branch. `development.branch` will not be present
   * if it does not exist.
   * 2. Might have a `production` property. `production` will not
   * be present when `production` is disabled.
   * `production.branch` contains the actual branch object that is
   * considered to be the `production` branch. `production.branch` will
   * not be present if it does not exist.
   * 3. Always has a `branch_types` array which contains all enabled branch
   * types.
   */
  getBranchingModel(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/branching-model",
      ...options
    });
  }
  /**
   * Get the branching model config for a repository
   *
   * Return the branching model configuration for a repository. The returned
   * object:
   *
   * 1. Always has a `development` property for the development branch.
   * 2. Always a `production` property for the production branch. The
   * production branch can be disabled.
   * 3. The `branch_types` contains all the branch types.
   * 4. `default_branch_deletion` indicates whether branches will be
   * deleted by default on merge.
   *
   * This is the raw configuration for the branching model. A client
   * wishing to see the branching model with its actual current branches may
   * find the [active model API](/cloud/bitbucket/rest/api-group-branching-model/#api-repositories-workspace-repo-slug-branching-model-get) more useful.
   */
  getBranchingModelSettings(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/branching-model/settings",
      ...options
    });
  }
  /**
   * Update the branching model config for a repository
   *
   * Update the branching model configuration for a repository.
   *
   * The `development` branch can be configured to a specific branch or to
   * track the main branch. When set to a specific branch it must
   * currently exist. Only the passed properties will be updated. The
   * properties not passed will be left unchanged. A request without a
   * `development` property will leave the development branch unchanged.
   *
   * It is possible for the `development` branch to be invalid. This
   * happens when it points at a specific branch that has been
   * deleted. This is indicated in the `is_valid` field for the branch. It is
   * not possible to update the settings for `development` if that
   * would leave the branch in an invalid state. Such a request will be
   * rejected.
   *
   * The `production` branch can be a specific branch, the main
   * branch or disabled. When set to a specific branch it must currently
   * exist. The `enabled` property can be used to enable (`true`) or
   * disable (`false`) it. Only the passed properties will be updated. The
   * properties not passed will be left unchanged. A request without a
   * `production` property will leave the production branch unchanged.
   *
   * It is possible for the `production` branch to be invalid. This
   * happens when it points at a specific branch that has been
   * deleted. This is indicated in the `is_valid` field for the branch. A
   * request that would leave `production` enabled and invalid will be
   * rejected. It is possible to update `production` and make it invalid if
   * it would also be left disabled.
   *
   * The `branch_types` property contains the branch types to be updated.
   * Only the branch types passed will be updated. All updates will be
   * rejected if it would leave the branching model in an invalid state.
   * For branch types this means that:
   *
   * 1. The prefixes for all enabled branch types are valid. For example,
   * it is not possible to use '*' inside a Git prefix.
   * 2. A prefix of an enabled branch type must not be a prefix of another
   * enabled branch type. This is to ensure that a branch can be easily
   * classified by its prefix unambiguously.
   *
   * It is possible to store an invalid prefix if that branch type would be
   * left disabled. Only the passed properties will be updated. The
   * properties not passed will be left unchanged. Each branch type must
   * have a `kind` property to identify it.
   *
   * The `default_branch_deletion` property is a string. The value of `true`
   * indicates to delete branches by default. The value of `false` indicates
   * that branches will not be deleted by default. A request without a
   * `default_branch_deletion` property will leave it unchanged. Other values
   * would be ignored.
   *
   * There is currently a side effect when using this API endpoint. If the
   * repository is inheriting branching model settings from its project,
   * updating the branching model for this repository will disable the
   * project setting inheritance.
   *
   *
   * We have deprecated this side effect and will remove it on 1 August 2022.
   */
  updateBranchingModelSettings(options) {
    return (options.client ?? this.client).put({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/branching-model/settings",
      ...options
    });
  }
  /**
   * Get a commit
   *
   * Returns the specified commit.
   */
  getCommit(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/commit/{commit}",
      ...options
    });
  }
  /**
   * Unapprove a commit
   *
   * Redact the authenticated user's approval of the specified commit.
   *
   * This operation is only available to users that have explicit access to
   * the repository. In contrast, just the fact that a repository is
   * publicly accessible to users does not give them the ability to approve
   * commits.
   */
  deleteCommitApproval(options) {
    return (options.client ?? this.client).delete({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/commit/{commit}/approve",
      ...options
    });
  }
  /**
   * Approve a commit
   *
   * Approve the specified commit as the authenticated user.
   *
   * This operation is only available to users that have explicit access to
   * the repository. In contrast, just the fact that a repository is
   * publicly accessible to users does not give them the ability to approve
   * commits.
   */
  approveCommit(options) {
    return (options.client ?? this.client).post({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/commit/{commit}/approve",
      ...options
    });
  }
  /**
   * List a commit's comments
   *
   * Returns the commit's comments.
   *
   * This includes both global and inline comments.
   *
   * The default sorting is oldest to newest and can be overridden with
   * the `sort` query parameter.
   */
  listCommitComments(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/commit/{commit}/comments",
      ...options
    });
  }
  /**
   * Create comment for a commit
   *
   * Creates new comment on the specified commit.
   *
   * To post a reply to an existing comment, include the `parent.id` field:
   *
   * ```
   * $ curl https://api.bitbucket.org/2.0/repositories/atlassian/prlinks/commit/db9ba1e031d07a02603eae0e559a7adc010257fc/comments/ \
   * -X POST -u evzijst \
   * -H 'Content-Type: application/json' \
   * -d '{"content": {"raw": "One more thing!"},
   * "parent": {"id": 5728901}}'
   * ```
   */
  createCommitComment(options) {
    return (options.client ?? this.client).post({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/commit/{commit}/comments",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * Delete a commit comment
   *
   * Deletes the specified commit comment.
   *
   * Note that deleting comments that have visible replies that point to
   * them will not really delete the resource. This is to retain the integrity
   * of the original comment tree. Instead, the `deleted` element is set to
   * `true` and the content is blanked out. The comment will continue to be
   * returned by the collections and self endpoints.
   */
  deleteCommitComment(options) {
    return (options.client ?? this.client).delete({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/commit/{commit}/comments/{comment_id}",
      ...options
    });
  }
  /**
   * Get a commit comment
   *
   * Returns the specified commit comment.
   */
  getCommitComment(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/commit/{commit}/comments/{comment_id}",
      ...options
    });
  }
  /**
   * Update a commit comment
   *
   * Used to update the contents of a comment. Only the content of the comment can be updated.
   *
   * ```
   * $ curl https://api.bitbucket.org/2.0/repositories/atlassian/prlinks/commit/7f71b5/comments/5728901 \
   * -X PUT -u evzijst \
   * -H 'Content-Type: application/json' \
   * -d '{"content": {"raw": "One more thing!"}'
   * ```
   */
  updateCommitComment(options) {
    return (options.client ?? this.client).put({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/commit/{commit}/comments/{comment_id}",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * Delete a commit application property
   *
   * Delete an [application property](/cloud/bitbucket/application-properties/) value stored against a commit.
   */
  deleteCommitHostedPropertyValue(options) {
    return (options.client ?? this.client).delete({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/commit/{commit}/properties/{app_key}/{property_name}",
      ...options
    });
  }
  /**
   * Get a commit application property
   *
   * Retrieve an [application property](/cloud/bitbucket/application-properties/) value stored against a commit.
   */
  getCommitHostedPropertyValue(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/commit/{commit}/properties/{app_key}/{property_name}",
      ...options
    });
  }
  /**
   * Update a commit application property
   *
   * Update an [application property](/cloud/bitbucket/application-properties/) value stored against a commit.
   */
  updateCommitHostedPropertyValue(options) {
    return (options.client ?? this.client).put({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/commit/{commit}/properties/{app_key}/{property_name}",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * List pull requests that contain a commit
   *
   * Returns a paginated list of all pull requests as part of which this commit was reviewed. Pull Request Commit Links app must be installed first before using this API; installation automatically occurs when 'Go to pull request' is clicked from the web interface for a commit's details.
   */
  getPullrequestsForCommit(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/commit/{commit}/pullrequests",
      ...options
    });
  }
  /**
   * List reports
   *
   * Returns a paginated list of Reports linked to this commit.
   */
  getReportsForCommit(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/commit/{commit}/reports",
      ...options
    });
  }
  /**
   * Delete a report
   *
   * Deletes a single Report matching the provided ID.
   */
  deleteReport(options) {
    return (options.client ?? this.client).delete({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/commit/{commit}/reports/{reportId}",
      ...options
    });
  }
  /**
   * Get a report
   *
   * Returns a single Report matching the provided ID.
   */
  getReport(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/commit/{commit}/reports/{reportId}",
      ...options
    });
  }
  /**
   * Create or update a report
   *
   * Creates or updates a report for the specified commit.
   * To upload a report, make sure to generate an ID that is unique across all reports for that commit. If you want to use an existing id from your own system, we recommend prefixing it with your system's name to avoid collisions, for example, mySystem-001.
   *
   * ### Sample cURL request:
   * ```
   * curl --request PUT 'https://api.bitbucket.org/2.0/repositories/<username>/<reposity-name>/commit/<commit-hash>/reports/mysystem-001' \
   * --header 'Content-Type: application/json' \
   * --data-raw '{
   * "title": "Security scan report",
   * "details": "This pull request introduces 10 new dependency vulnerabilities.",
   * "report_type": "SECURITY",
   * "reporter": "mySystem",
   * "link": "http://www.mysystem.com/reports/001",
   * "result": "FAILED",
   * "data": [
   * {
   * "title": "Duration (seconds)",
   * "type": "DURATION",
   * "value": 14
   * },
   * {
   * "title": "Safe to merge?",
   * "type": "BOOLEAN",
   * "value": false
   * }
   * ]
   * }'
   * ```
   *
   * ### Possible field values:
   * report_type: SECURITY, COVERAGE, TEST, BUG
   * result: PASSED, FAILED, PENDING
   * data.type: BOOLEAN, DATE, DURATION, LINK, NUMBER, PERCENTAGE, TEXT
   *
   * #### Data field formats
   * | Type  Field   | Value Field Type  | Value Field Display |
   * |:--------------|:------------------|:--------------------|
   * | None/ Omitted | Number, String or Boolean (not an array or object) | Plain text |
   * | BOOLEAN	| Boolean | The value will be read as a JSON boolean and displayed as 'Yes' or 'No'. |
   * | DATE  | Number | The value will be read as a JSON number in the form of a Unix timestamp (milliseconds) and will be displayed as a relative date if the date is less than one week ago, otherwise  it will be displayed as an absolute date. |
   * | DURATION | Number | The value will be read as a JSON number in milliseconds and will be displayed in a human readable duration format. |
   * | LINK | Object: `{"text": "Link text here", "href": "https://link.to.annotation/in/external/tool"}` | The value will be read as a JSON object containing the fields "text" and "href" and will be displayed as a clickable link on the report. |
   * | NUMBER | Number | The value will be read as a JSON number and large numbers will be  displayed in a human readable format (e.g. 14.3k). |
   * | PERCENTAGE | Number (between 0 and 100) | The value will be read as a JSON number between 0 and 100 and will be displayed with a percentage sign. |
   * | TEXT | String | The value will be read as a JSON string and will be displayed as-is |
   *
   * Please refer to the [Code Insights documentation](https://confluence.atlassian.com/bitbucket/code-insights-994316785.html) for more information.
   *
   */
  createOrUpdateReport(options) {
    return (options.client ?? this.client).put({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/commit/{commit}/reports/{reportId}",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * List annotations
   *
   * Returns a paginated list of Annotations for a specified report.
   */
  getAnnotationsForReport(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/commit/{commit}/reports/{reportId}/annotations",
      ...options
    });
  }
  /**
   * Bulk create or update annotations
   *
   * Bulk upload of annotations.
   * Annotations are individual findings that have been identified as part of a report, for example, a line of code that represents a vulnerability. These annotations can be attached to a specific file and even a specific line in that file, however, that is optional. Annotations are not mandatory and a report can contain up to 1000 annotations.
   *
   * Add the annotations you want to upload as objects in a JSON array and make sure each annotation has the external_id field set to a unique value. If you want to use an existing id from your own system, we recommend prefixing it with your system's name to avoid collisions, for example, mySystem-annotation001. The external id can later be used to identify the report as an alternative to the generated [UUID](https://developer.atlassian.com/bitbucket/api/2/reference/meta/uri-uuid#uuid). You can upload up to 100 annotations per POST request.
   *
   * ### Sample cURL request:
   * ```
   * curl --location 'https://api.bitbucket.org/2.0/repositories/<username>/<reposity-name>/commit/<commit-hash>/reports/mysystem-001/annotations' \
   * --header 'Content-Type: application/json' \
   * --data-raw '[
   * {
   * "external_id": "mysystem-annotation001",
   * "title": "Security scan report",
   * "annotation_type": "VULNERABILITY",
   * "summary": "This line represents a security threat.",
   * "severity": "HIGH",
   * "path": "my-service/src/main/java/com/myCompany/mysystem/logic/Main.java",
   * "line": 42
   * },
   * {
   * "external_id": "mySystem-annotation002",
   * "title": "Bug report",
   * "annotation_type": "BUG",
   * "result": "FAILED",
   * "summary": "This line might introduce a bug.",
   * "severity": "MEDIUM",
   * "path": "my-service/src/main/java/com/myCompany/mysystem/logic/Helper.java",
   * "line": 13
   * }
   * ]'
   * ```
   *
   * ### Possible field values:
   * annotation_type: VULNERABILITY, CODE_SMELL, BUG
   * result: PASSED, FAILED, IGNORED, SKIPPED
   * severity: HIGH, MEDIUM, LOW, CRITICAL
   *
   * Please refer to the [Code Insights documentation](https://confluence.atlassian.com/bitbucket/code-insights-994316785.html) for more information.
   *
   */
  bulkCreateOrUpdateAnnotations(options) {
    return (options.client ?? this.client).post({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/commit/{commit}/reports/{reportId}/annotations",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * Delete an annotation
   *
   * Deletes a single Annotation matching the provided ID.
   */
  deleteAnnotation(options) {
    return (options.client ?? this.client).delete({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/commit/{commit}/reports/{reportId}/annotations/{annotationId}",
      ...options
    });
  }
  /**
   * Get an annotation
   *
   * Returns a single Annotation matching the provided ID.
   */
  getAnnotation(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/commit/{commit}/reports/{reportId}/annotations/{annotationId}",
      ...options
    });
  }
  /**
   * Create or update an annotation
   *
   * Creates or updates an individual annotation for the specified report.
   * Annotations are individual findings that have been identified as part of a report, for example, a line of code that represents a vulnerability. These annotations can be attached to a specific file and even a specific line in that file, however, that is optional. Annotations are not mandatory and a report can contain up to 1000 annotations.
   *
   * Just as reports, annotation needs to be uploaded with a unique ID that can later be used to identify the report as an alternative to the generated [UUID](https://developer.atlassian.com/bitbucket/api/2/reference/meta/uri-uuid#uuid). If you want to use an existing id from your own system, we recommend prefixing it with your system's name to avoid collisions, for example, mySystem-annotation001.
   *
   * ### Sample cURL request:
   * ```
   * curl --request PUT 'https://api.bitbucket.org/2.0/repositories/<username>/<reposity-name>/commit/<commit-hash>/reports/mySystem-001/annotations/mysystem-annotation001' \
   * --header 'Content-Type: application/json' \
   * --data-raw '{
   * "title": "Security scan report",
   * "annotation_type": "VULNERABILITY",
   * "summary": "This line represents a security thread.",
   * "severity": "HIGH",
   * "path": "my-service/src/main/java/com/myCompany/mysystem/logic/Main.java",
   * "line": 42
   * }'
   * ```
   *
   * ### Possible field values:
   * annotation_type: VULNERABILITY, CODE_SMELL, BUG
   * result: PASSED, FAILED, IGNORED, SKIPPED
   * severity: HIGH, MEDIUM, LOW, CRITICAL
   *
   * Please refer to the [Code Insights documentation](https://confluence.atlassian.com/bitbucket/code-insights-994316785.html) for more information.
   *
   */
  createOrUpdateAnnotation(options) {
    return (options.client ?? this.client).put({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/commit/{commit}/reports/{reportId}/annotations/{annotationId}",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * List commit statuses for a commit
   *
   * Returns all statuses (e.g. build results) for a specific commit.
   */
  listCommitStatuses(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/commit/{commit}/statuses",
      ...options
    });
  }
  /**
   * Create a build status for a commit
   *
   * Creates a new build status against the specified commit.
   *
   * If the specified key already exists, the existing status object will
   * be overwritten.
   *
   * Example:
   *
   * ```
   * curl https://api.bitbucket.org/2.0/repositories/my-workspace/my-repo/commit/e10dae226959c2194f2b07b077c07762d93821cf/statuses/build/           -X POST -u jdoe -H 'Content-Type: application/json'           -d '{
   * "key": "MY-BUILD",
   * "state": "SUCCESSFUL",
   * "description": "42 tests passed",
   * "url": "https://www.example.org/my-build-result"
   * }'
   * ```
   *
   * When creating a new commit status, you can use a URI template for the URL.
   * Templates are URLs that contain variable names that Bitbucket will
   * evaluate at runtime whenever the URL is displayed anywhere similar to
   * parameter substitution in
   * [Bitbucket Connect](https://developer.atlassian.com/bitbucket/concepts/context-parameters.html).
   * For example, one could use `https://foo.com/builds/{repository.full_name}`
   * which Bitbucket will turn into `https://foo.com/builds/foo/bar` at render time.
   * The context variables available are `repository` and `commit`.
   *
   * To associate a commit status to a pull request, the refname field must be set to the source branch
   * of the pull request.
   *
   * Example:
   * ```
   * curl https://api.bitbucket.org/2.0/repositories/my-workspace/my-repo/commit/e10dae226959c2194f2b07b077c07762d93821cf/statuses/build/           -X POST -u jdoe -H 'Content-Type: application/json'           -d '{
   * "key": "MY-BUILD",
   * "state": "SUCCESSFUL",
   * "description": "42 tests passed",
   * "url": "https://www.example.org/my-build-result",
   * "refname": "my-pr-branch"
   * }'
   * ```
   */
  createCommitBuildStatus(options) {
    return (options.client ?? this.client).post({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/commit/{commit}/statuses/build",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * Get a build status for a commit
   *
   * Returns the specified build status for a commit.
   */
  getCommitBuildStatus(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/commit/{commit}/statuses/build/{key}",
      ...options
    });
  }
  /**
   * Update a build status for a commit
   *
   * Used to update the current status of a build status object on the
   * specific commit.
   *
   * This operation can also be used to change other properties of the
   * build status:
   *
   * * `state`
   * * `name`
   * * `description`
   * * `url`
   * * `refname`
   *
   * The `key` cannot be changed.
   */
  updateCommitBuildStatus(options) {
    return (options.client ?? this.client).put({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/commit/{commit}/statuses/build/{key}",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * List commits
   *
   * These are the repository's commits. They are paginated and returned
   * in reverse chronological order, similar to the output of `git log`.
   * Like these tools, the DAG can be filtered.
   *
   * #### GET /repositories/{workspace}/{repo_slug}/commits/
   *
   * Returns all commits in the repo in topological order (newest commit
   * first). All branches and tags are included (similar to
   * `git log --all`).
   *
   * #### GET /repositories/{workspace}/{repo_slug}/commits/?exclude=master
   *
   * Returns all commits in the repo that are not on master
   * (similar to `git log --all ^master`).
   *
   * #### GET /repositories/{workspace}/{repo_slug}/commits/?include=foo&include=bar&exclude=fu&exclude=fubar
   *
   * Returns all commits that are on refs `foo` or `bar`, but not on `fu` or
   * `fubar` (similar to `git log foo bar ^fu ^fubar`).
   *
   * An optional `path` parameter can be specified that will limit the
   * results to commits that affect that path. `path` can either be a file
   * or a directory. If a directory is specified, commits are returned that
   * have modified any file in the directory tree rooted by `path`. It is
   * important to note that if the `path` parameter is specified, the commits
   * returned by this endpoint may no longer be a DAG, parent commits that
   * do not modify the path will be omitted from the response.
   *
   * #### GET /repositories/{workspace}/{repo_slug}/commits/?path=README.md&include=foo&include=bar&exclude=master
   *
   * Returns all commits that are on refs `foo` or `bar`, but not on `master`
   * that changed the file README.md.
   *
   * #### GET /repositories/{workspace}/{repo_slug}/commits/?path=src/&include=foo&include=bar&exclude=master
   *
   * Returns all commits that are on refs `foo` or `bar`, but not on `master`
   * that changed to a file in any file in the directory src or its children.
   *
   * Because the response could include a very large number of commits, it
   * is paginated. Follow the 'next' link in the response to navigate to the
   * next page of commits. As with other paginated resources, do not
   * construct your own links.
   *
   * When the include and exclude parameters are more than can fit in a
   * query string, clients can use a `x-www-form-urlencoded` POST instead.
   */
  listCommits(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/commits",
      ...options
    });
  }
  /**
   * List commits with include/exclude
   *
   * Identical to `GET /repositories/{workspace}/{repo_slug}/commits`,
   * except that POST allows clients to place the include and exclude
   * parameters in the request body to avoid URL length issues.
   *
   * **Note that this resource does NOT support new commit creation.**
   */
  filterCommits(options) {
    return (options.client ?? this.client).post({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/commits",
      ...options
    });
  }
  /**
   * List commits for revision
   *
   * These are the repository's commits. They are paginated and returned
   * in reverse chronological order, similar to the output of `git log`.
   * Like these tools, the DAG can be filtered.
   *
   * #### GET /repositories/{workspace}/{repo_slug}/commits/master
   *
   * Returns all commits on ref `master` (similar to `git log master`).
   *
   * #### GET /repositories/{workspace}/{repo_slug}/commits/dev?include=foo&exclude=master
   *
   * Returns all commits on ref `dev` or `foo`, except those that are reachable on
   * `master` (similar to `git log dev foo ^master`).
   *
   * An optional `path` parameter can be specified that will limit the
   * results to commits that affect that path. `path` can either be a file
   * or a directory. If a directory is specified, commits are returned that
   * have modified any file in the directory tree rooted by `path`. It is
   * important to note that if the `path` parameter is specified, the commits
   * returned by this endpoint may no longer be a DAG, parent commits that
   * do not modify the path will be omitted from the response.
   *
   * #### GET /repositories/{workspace}/{repo_slug}/commits/dev?path=README.md&include=foo&include=bar&exclude=master
   *
   * Returns all commits that are on refs `dev` or `foo` or `bar`, but not on `master`
   * that changed the file README.md.
   *
   * #### GET /repositories/{workspace}/{repo_slug}/commits/dev?path=src/&include=foo&exclude=master
   *
   * Returns all commits that are on refs `dev` or `foo`, but not on `master`
   * that changed to a file in any file in the directory src or its children.
   *
   * Because the response could include a very large number of commits, it
   * is paginated. Follow the 'next' link in the response to navigate to the
   * next page of commits. As with other paginated resources, do not
   * construct your own links.
   *
   * When the include and exclude parameters are more than can fit in a
   * query string, clients can use a `x-www-form-urlencoded` POST instead.
   */
  listCommitsByRevision(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/commits/{revision}",
      ...options
    });
  }
  /**
   * List commits for revision using include/exclude
   *
   * Identical to `GET /repositories/{workspace}/{repo_slug}/commits/{revision}`,
   * except that POST allows clients to place the include and exclude
   * parameters in the request body to avoid URL length issues.
   *
   * **Note that this resource does NOT support new commit creation.**
   */
  filterCommitsByRevision(options) {
    return (options.client ?? this.client).post({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/commits/{revision}",
      ...options
    });
  }
  /**
   * List components
   *
   * Returns the components that have been defined in the issue tracker.
   *
   * This resource is only available on repositories that have the issue
   * tracker enabled.
   *
   * @deprecated
   */
  listComponents(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/components",
      ...options
    });
  }
  /**
   * Get a component for issues
   *
   * Returns the specified issue tracker component object.
   *
   * @deprecated
   */
  getComponent(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/components/{component_id}",
      ...options
    });
  }
  /**
   * List default reviewers
   *
   * Returns the repository's default reviewers.
   *
   * These are the users that are automatically added as reviewers on every
   * new pull request that is created. To obtain the repository's default reviewers
   * as well as the default reviewers inherited from the project, use the
   * [effective-default-reveiwers](#api-repositories-workspace-repo-slug-effective-default-reviewers-get) endpoint.
   */
  listDefaultReviewers(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/default-reviewers",
      ...options
    });
  }
  /**
   * Remove a user from the default reviewers
   *
   * Removes a default reviewer from the repository.
   */
  deleteDefaultReviewer(options) {
    return (options.client ?? this.client).delete({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/default-reviewers/{target_username}",
      ...options
    });
  }
  /**
   * Get a default reviewer
   *
   * Returns the specified reviewer.
   *
   * This can be used to test whether a user is among the repository's
   * default reviewers list. A 404 indicates that that specified user is not
   * a default reviewer.
   */
  getDefaultReviewer(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/default-reviewers/{target_username}",
      ...options
    });
  }
  /**
   * Add a user to the default reviewers
   *
   * Adds the specified user to the repository's list of default
   * reviewers.
   *
   * This method is idempotent. Adding a user a second time has no effect.
   */
  addDefaultReviewer(options) {
    return (options.client ?? this.client).put({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/default-reviewers/{target_username}",
      ...options
    });
  }
  /**
   * List repository deploy keys
   *
   * Returns all deploy-keys belonging to a repository.
   */
  listDeployKeys(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/deploy-keys",
      ...options
    });
  }
  /**
   * Add a repository deploy key
   *
   * Create a new deploy key in a repository. Note: If authenticating a deploy key
   * with an OAuth consumer, any changes to the OAuth consumer will subsequently
   * invalidate the deploy key.
   *
   *
   * Example:
   * ```
   * $ curl -X POST \
   * -H "Authorization <auth header>" \
   * -H "Content-type: application/json" \
   * https://api.bitbucket.org/2.0/repositories/mleu/test/deploy-keys -d \
   * '{
   * "key": "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQDAK/b1cHHDr/TEV1JGQl+WjCwStKG6Bhrv0rFpEsYlyTBm1fzN0VOJJYn4ZOPCPJwqse6fGbXntEs+BbXiptR+++HycVgl65TMR0b5ul5AgwrVdZdT7qjCOCgaSV74/9xlHDK8oqgGnfA7ZoBBU+qpVyaloSjBdJfLtPY/xqj4yHnXKYzrtn/uFc4Kp9Tb7PUg9Io3qohSTGJGVHnsVblq/rToJG7L5xIo0OxK0SJSQ5vuId93ZuFZrCNMXj8JDHZeSEtjJzpRCBEXHxpOPhAcbm4MzULgkFHhAVgp4JbkrT99/wpvZ7r9AdkTg7HGqL3rlaDrEcWfL7Lu6TnhBdq5 mleu@C02W454JHTD8",
   * "label": "mydeploykey"
   * }'
   * ```
   */
  createDeployKey(options) {
    return (options.client ?? this.client).post({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/deploy-keys",
      ...options
    });
  }
  /**
   * Delete a repository deploy key
   *
   * This deletes a deploy key from a repository.
   */
  deleteDeployKey(options) {
    return (options.client ?? this.client).delete({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/deploy-keys/{key_id}",
      ...options
    });
  }
  /**
   * Get a repository deploy key
   *
   * Returns the deploy key belonging to a specific key.
   */
  getDeployKey(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/deploy-keys/{key_id}",
      ...options
    });
  }
  /**
   * Update a repository deploy key
   *
   * Create a new deploy key in a repository.
   *
   * The same key needs to be passed in but the comment and label can change.
   *
   * Example:
   * ```
   * $ curl -X PUT \
   * -H "Authorization <auth header>" \
   * -H "Content-type: application/json" \
   * https://api.bitbucket.org/2.0/repositories/mleu/test/deploy-keys/1234 -d \
   * '{
   * "label": "newlabel",
   * "key": "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQDAK/b1cHHDr/TEV1JGQl+WjCwStKG6Bhrv0rFpEsYlyTBm1fzN0VOJJYn4ZOPCPJwqse6fGbXntEs+BbXiptR+++HycVgl65TMR0b5ul5AgwrVdZdT7qjCOCgaSV74/9xlHDK8oqgGnfA7ZoBBU+qpVyaloSjBdJfLtPY/xqj4yHnXKYzrtn/uFc4Kp9Tb7PUg9Io3qohSTGJGVHnsVblq/rToJG7L5xIo0OxK0SJSQ5vuId93ZuFZrCNMXj8JDHZeSEtjJzpRCBEXHxpOPhAcbm4MzULgkFHhAVgp4JbkrT99/wpvZ7r9AdkTg7HGqL3rlaDrEcWfL7Lu6TnhBdq5 newcomment",
   * }'
   * ```
   */
  updateDeployKey(options) {
    return (options.client ?? this.client).put({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/deploy-keys/{key_id}",
      ...options
    });
  }
  /**
   * List deployments
   *
   * Find deployments
   */
  getDeploymentsForRepository(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/deployments",
      ...options
    });
  }
  /**
   * Get a deployment
   *
   * Retrieve a deployment
   */
  getDeploymentForRepository(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/deployments/{deployment_uuid}",
      ...options
    });
  }
  /**
   * List variables for an environment
   *
   * Find deployment environment level variables.
   */
  getDeploymentVariables(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/deployments_config/environments/{environment_uuid}/variables",
      ...options
    });
  }
  /**
   * Create a variable for an environment
   *
   * Create a deployment environment level variable.
   */
  createDeploymentVariable(options) {
    return (options.client ?? this.client).post({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/deployments_config/environments/{environment_uuid}/variables",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * Delete a variable for an environment
   *
   * Delete a deployment environment level variable.
   */
  deleteDeploymentVariable(options) {
    return (options.client ?? this.client).delete({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/deployments_config/environments/{environment_uuid}/variables/{variable_uuid}",
      ...options
    });
  }
  /**
   * Update a variable for an environment
   *
   * Update a deployment environment level variable.
   */
  updateDeploymentVariable(options) {
    return (options.client ?? this.client).put({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/deployments_config/environments/{environment_uuid}/variables/{variable_uuid}",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * Compare two commits
   *
   * Produces a raw git-style diff.
   *
   * #### Single commit spec
   *
   * If the `spec` argument to this API is a single commit, the diff is
   * produced against the first parent of the specified commit.
   *
   * #### Two commit spec
   *
   * Two commits separated by `..` may be provided as the `spec`, e.g.,
   * `3a8b42..9ff173`. When two commits are provided and the `topic` query
   * parameter is true, this API produces a 2-way three dot diff.
   * This is the diff between source commit and the merge base of the source
   * commit and the destination commit. When the `topic` query param is false,
   * a simple git-style diff is produced.
   *
   * The two commits are interpreted as follows:
   *
   * * First commit: the commit containing the changes we wish to preview
   * * Second commit: the commit representing the state to which we want to
   * compare the first commit
   * * **Note**: This is the opposite of the order used in `git diff`.
   *
   * #### Comparison to patches
   *
   * While similar to patches, diffs:
   *
   * * Don't have a commit header (username, commit message, etc)
   * * Support the optional `path=foo/bar.py` query param to filter
   * the diff to just that one file diff
   *
   * #### Response
   *
   * The raw diff is returned as-is, in whatever encoding the files in the
   * repository use. It is not decoded into unicode. As such, the
   * content-type is `text/plain`.
   */
  getDiff(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/diff/{spec}",
      ...options
    });
  }
  /**
   * Compare two commit diff stats
   *
   * Produces a response in JSON format with a record for every path
   * modified, including information on the type of the change and the
   * number of lines added and removed.
   *
   * #### Single commit spec
   *
   * If the `spec` argument to this API is a single commit, the diff is
   * produced against the first parent of the specified commit.
   *
   * #### Two commit spec
   *
   * Two commits separated by `..` may be provided as the `spec`, e.g.,
   * `3a8b42..9ff173`. When two commits are provided and the `topic` query
   * parameter is true, this API produces a 2-way three dot diff.
   * This is the diff between source commit and the merge base of the source
   * commit and the destination commit. When the `topic` query param is false,
   * a simple git-style diff is produced.
   *
   * The two commits are interpreted as follows:
   *
   * * First commit: the commit containing the changes we wish to preview
   * * Second commit: the commit representing the state to which we want to
   * compare the first commit
   * * **Note**: This is the opposite of the order used in `git diff`.
   */
  getDiffstat(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/diffstat/{spec}",
      ...options
    });
  }
  /**
   * List download artifacts
   *
   * Returns a list of download links associated with the repository.
   */
  listDownloads(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/downloads",
      ...options
    });
  }
  /**
   * Upload a download artifact
   *
   * Upload new download artifacts.
   *
   * To upload files, perform a `multipart/form-data` POST containing one
   * or more `files` fields:
   *
   * $ echo Hello World > hello.txt
   * $ curl -s -u evzijst -X POST https://api.bitbucket.org/2.0/repositories/evzijst/git-tests/downloads -F files=@hello.txt
   *
   * When a file is uploaded with the same name as an existing artifact,
   * then the existing file will be replaced.
   */
  createDownload(options) {
    return (options.client ?? this.client).post({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/downloads",
      ...options
    });
  }
  /**
   * Delete a download artifact
   *
   * Deletes the specified download artifact from the repository.
   */
  deleteDownload(options) {
    return (options.client ?? this.client).delete({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/downloads/{filename}",
      ...options
    });
  }
  /**
   * Get a download artifact link
   *
   * Return a redirect to the contents of a download artifact.
   *
   * This endpoint returns the actual file contents and not the artifact's
   * metadata.
   *
   * $ curl -s -L https://api.bitbucket.org/2.0/repositories/evzijst/git-tests/downloads/hello.txt
   * Hello World
   */
  getDownload(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/downloads/{filename}",
      ...options
    });
  }
  /**
   * Get the effective, or currently applied, branching model for a repository
   */
  getEffectiveBranchingModel(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/effective-branching-model",
      ...options
    });
  }
  /**
   * List effective default reviewers
   *
   * Returns the repository's effective default reviewers. This includes both default
   * reviewers defined at the repository level as well as those inherited from its project.
   *
   * These are the users that are automatically added as reviewers on every
   * new pull request that is created.
   */
  listEffectiveDefaultReviewers(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/effective-default-reviewers",
      ...options
    });
  }
  /**
   * List environments
   *
   * Find environments
   */
  getEnvironmentsForRepository(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/environments",
      ...options
    });
  }
  /**
   * Create an environment
   *
   * Create an environment.
   */
  createEnvironment(options) {
    return (options.client ?? this.client).post({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/environments",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * Delete an environment
   *
   * Delete an environment
   */
  deleteEnvironmentForRepository(options) {
    return (options.client ?? this.client).delete({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/environments/{environment_uuid}",
      ...options
    });
  }
  /**
   * Get an environment
   *
   * Retrieve an environment
   */
  getEnvironmentForRepository(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/environments/{environment_uuid}",
      ...options
    });
  }
  /**
   * Update an environment
   *
   * Update an environment
   */
  updateEnvironmentForRepository(options) {
    return (options.client ?? this.client).post({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/environments/{environment_uuid}/changes",
      ...options
    });
  }
  /**
   * List commits that modified a file
   *
   * Returns a paginated list of commits that modified the specified file.
   *
   * Commits are returned in reverse chronological order. This is roughly
   * equivalent to the following commands:
   *
   * $ git log --follow --date-order <sha> <path>
   *
   * By default, Bitbucket will follow renames and the path name in the
   * returned entries reflects that. This can be turned off using the
   * `?renames=false` query parameter.
   *
   * Results are returned in descending chronological order by default, and
   * like most endpoints you can
   * [filter and sort](/cloud/bitbucket/rest/intro/#filtering) the response to
   * only provide exactly the data you want.
   *
   * The example response returns commits made before 2011-05-18 against a file
   * named `README.rst`. The results are filtered to only return the path and
   * date. This request can be made using:
   *
   * ```
   * $ curl 'https://api.bitbucket.org/2.0/repositories/evzijst/dogslow/filehistory/master/README.rst'\
   * '?fields=values.next,values.path,values.commit.date&q=commit.date<=2011-05-18'
   * ```
   *
   * In the response you can see that the file was renamed to `README.rst`
   * by the commit made on 2011-05-16, and was previously named `README.txt`.
   */
  getFileHistory(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/filehistory/{commit}/{path}",
      ...options
    });
  }
  /**
   * List repository forks
   *
   * Returns a paginated list of all the forks of the specified
   * repository.
   */
  listForks(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/forks",
      ...options
    });
  }
  /**
   * Fork a repository
   *
   * Creates a new fork of the specified repository.
   *
   * #### Forking a repository
   *
   * To create a fork, specify the workspace explicitly as part of the
   * request body:
   *
   * ```
   * $ curl -X POST -u jdoe https://api.bitbucket.org/2.0/repositories/atlassian/bbql/forks \
   * -H 'Content-Type: application/json' -d '{
   * "name": "bbql_fork",
   * "workspace": {
   * "slug": "atlassian"
   * }
   * }'
   * ```
   *
   * To fork a repository into the same workspace, also specify a new `name`.
   *
   * When you specify a value for `name`, it will also affect the `slug`.
   * The `slug` is reflected in the repository URL of the new fork. It is
   * derived from `name` by substituting non-ASCII characters, removes
   * whitespace, and changes characters to lower case. For example,
   * `My repo` would turn into `my_repo`.
   *
   * You need contributor access to create new forks within a workspace.
   *
   *
   * #### Change the properties of a new fork
   *
   * By default the fork inherits most of its properties from the parent.
   * However, since the optional POST body document follows the normal
   * `repository` JSON schema and you can override the new fork's
   * properties.
   *
   * Properties that can be overridden include:
   *
   * * description
   * * fork_policy
   * * language
   * * mainbranch
   * * is_private (note that a private repo's fork_policy might prohibit
   * the creation of public forks, in which `is_private=False` would fail)
   * * has_issues (to initialize or disable the new repo's issue tracker --
   * note that the actual contents of the parent repository's issue
   * tracker are not copied during forking)
   * * has_wiki (to initialize or disable the new repo's wiki --
   * note that the actual contents of the parent repository's wiki are not
   * copied during forking)
   * * project (when forking into a private project, the fork's `is_private`
   * must be `true`)
   *
   * Properties that cannot be modified include:
   *
   * * scm
   * * parent
   * * full_name
   */
  createFork(options) {
    return (options.client ?? this.client).post({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/forks",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * List webhooks for a repository
   *
   * Returns a paginated list of webhooks installed on this repository.
   */
  listRepoHooks(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/hooks",
      ...options
    });
  }
  /**
   * Create a webhook for a repository
   *
   * Creates a new webhook on the specified repository.
   *
   * Example:
   *
   * ```
   * $ curl -X POST -u credentials -H 'Content-Type: application/json'
   * https://api.bitbucket.org/2.0/repositories/my-workspace/my-repo-slug/hooks
   * -d '
   * {
   * "description": "Webhook Description",
   * "url": "https://example.com/",
   * "active": true,
   * "secret": "this is a really bad secret",
   * "events": [
   * "repo:push",
   * "issue:created",
   * "issue:updated"
   * ]
   * }'
   * ```
   *
   * When the `secret` is provided it will be used as the key to generate a HMAC
   * digest value sent in the `X-Hub-Signature` header at delivery time. Passing
   * a `null` or empty `secret` or not passing a `secret` will leave the webhook's
   * secret unset. Bitbucket only generates the `X-Hub-Signature` when the webhook's
   * secret is set.
   *
   * Note that this call requires the webhook scope, as well as any scope
   * that applies to the events that the webhook subscribes to. In the
   * example above that means: `webhook`, `repository` and `issue`.
   *
   * Also note that the `url` must properly resolve and cannot be an
   * internal, non-routed address.
   */
  createRepoHook(options) {
    return (options.client ?? this.client).post({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/hooks",
      ...options
    });
  }
  /**
   * Delete a webhook for a repository
   *
   * Deletes the specified webhook subscription from the given
   * repository.
   */
  deleteRepoHook(options) {
    return (options.client ?? this.client).delete({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/hooks/{uid}",
      ...options
    });
  }
  /**
   * Get a webhook for a repository
   *
   * Returns the webhook with the specified id installed on the specified
   * repository.
   */
  getRepoHook(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/hooks/{uid}",
      ...options
    });
  }
  /**
   * Update a webhook for a repository
   *
   * Updates the specified webhook subscription.
   *
   * The following properties can be mutated:
   *
   * * `description`
   * * `url`
   * * `secret`
   * * `active`
   * * `events`
   *
   * The hook's secret is used as a key to generate the HMAC hex digest sent in the
   * `X-Hub-Signature` header at delivery time. This signature is only generated
   * when the hook has a secret.
   *
   * Set the hook's secret by passing the new value in the `secret` field. Passing a
   * `null` value in the `secret` field will remove the secret from the hook. The
   * hook's secret can be left unchanged by not passing the `secret` field in the
   * request.
   */
  updateRepoHook(options) {
    return (options.client ?? this.client).put({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/hooks/{uid}",
      ...options
    });
  }
  /**
   * List issues
   *
   * Returns the issues in the issue tracker.
   *
   * @deprecated
   */
  listIssues(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/issues",
      ...options
    });
  }
  /**
   * Create an issue
   *
   * Creates a new issue.
   *
   * This call requires authentication. Private repositories or private
   * issue trackers require the caller to authenticate with an account that
   * has appropriate authorization.
   *
   * The authenticated user is used for the issue's `reporter` field.
   *
   * @deprecated
   */
  createIssue(options) {
    return (options.client ?? this.client).post({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/issues",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * Export issues
   *
   * A POST request to this endpoint initiates a new background celery task that archives the repo's issues.
   *
   * When the job has been accepted, it will return a 202 (Accepted) along with a unique url to this job in the
   * 'Location' response header. This url is the endpoint for where the user can obtain their zip files."
   *
   * @deprecated
   */
  exportIssues(options) {
    return (options.client ?? this.client).post({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/issues/export",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * Check issue export status
   *
   * This endpoint is used to poll for the progress of an issue export
   * job and return the zip file after the job is complete.
   * As long as the job is running, this will return a 202 response
   * with in the response body a description of the current status.
   *
   * After the job has been scheduled, but before it starts executing, the endpoint
   * returns a 202 response with status `ACCEPTED`.
   *
   * Once it starts running, it is a 202 response with status `STARTED` and progress filled.
   *
   * After it is finished, it becomes a 200 response with status `SUCCESS` or `FAILURE`.
   *
   * @deprecated
   */
  getIssueExportZip(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/issues/export/{repo_name}-issues-{task_id}.zip",
      ...options
    });
  }
  /**
   * Check issue import status
   *
   * When using GET, this endpoint reports the status of the current import task.
   *
   * After the job has been scheduled, but before it starts executing, the endpoint
   * returns a 202 response with status `ACCEPTED`.
   *
   * Once it starts running, it is a 202 response with status `STARTED` and progress filled.
   *
   * After it is finished, it becomes a 200 response with status `SUCCESS` or `FAILURE`.
   *
   * @deprecated
   */
  getIssueImportStatus(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/issues/import",
      ...options
    });
  }
  /**
   * Import issues
   *
   * A POST request to this endpoint will import the zip file given by the archive parameter into the repository. All
   * existing issues will be deleted and replaced by the contents of the imported zip file.
   *
   * Imports are done through a multipart/form-data POST. There is one valid and required form field, with the name
   * "archive," which needs to be a file field:
   *
   * ```
   * $ curl -u <username> -X POST -F archive=@/path/to/file.zip https://api.bitbucket.org/2.0/repositories/<owner_username>/<repo_slug>/issues/import
   * ```
   *
   * @deprecated
   */
  importIssues(options) {
    return (options.client ?? this.client).post({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/issues/import",
      ...options
    });
  }
  /**
   * Delete an issue
   *
   * Deletes the specified issue. This requires write access to the
   * repository.
   *
   * @deprecated
   */
  deleteIssue(options) {
    return (options.client ?? this.client).delete({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/issues/{issue_id}",
      ...options
    });
  }
  /**
   * Get an issue
   *
   * Returns the specified issue.
   *
   * @deprecated
   */
  getIssue(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/issues/{issue_id}",
      ...options
    });
  }
  /**
   * Update an issue
   *
   * Modifies the issue.
   *
   * ```
   * $ curl https://api.bitbucket.org/2.0/repostories/evzijst/dogslow/issues/123 \
   * -u evzijst -s -X PUT -H 'Content-Type: application/json' \
   * -d '{
   * "title": "Updated title",
   * "assignee": {
   * "account_id": "5d5355e8c6b9320d9ea5b28d"
   * },
   * "priority": "minor",
   * "version": {
   * "name": "1.0"
   * },
   * "component": null
   * }'
   * ```
   *
   * This example changes the `title`, `assignee`, `priority` and the
   * `version`. It also removes the value of the `component` from the issue
   * by setting the field to `null`. Any field not present keeps its existing
   * value.
   *
   * Each time an issue is edited in the UI or through the API, an immutable
   * change record is created under the `/issues/123/changes` endpoint. It
   * also has a comment associated with the change.
   *
   * @deprecated
   */
  updateIssue(options) {
    return (options.client ?? this.client).put({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/issues/{issue_id}",
      ...options
    });
  }
  /**
   * List attachments for an issue
   *
   * Returns all attachments for this issue.
   *
   * This returns the files' meta data. This does not return the files'
   * actual contents.
   *
   * The files are always ordered by their upload date.
   *
   * @deprecated
   */
  listIssueAttachments(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/issues/{issue_id}/attachments",
      ...options
    });
  }
  /**
   * Upload an attachment to an issue
   *
   * Upload new issue attachments.
   *
   * To upload files, perform a `multipart/form-data` POST containing one
   * or more file fields.
   *
   * When a file is uploaded with the same name as an existing attachment,
   * then the existing file will be replaced.
   *
   * @deprecated
   */
  createIssueAttachment(options) {
    return (options.client ?? this.client).post({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/issues/{issue_id}/attachments",
      ...options
    });
  }
  /**
   * Delete an attachment for an issue
   *
   * Deletes an attachment.
   *
   * @deprecated
   */
  deleteIssueAttachment(options) {
    return (options.client ?? this.client).delete({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/issues/{issue_id}/attachments/{path}",
      ...options
    });
  }
  /**
   * Get attachment for an issue
   *
   * Returns the contents of the specified file attachment.
   *
   * Note that this endpoint does not return a JSON response, but instead
   * returns a redirect pointing to the actual file that in turn will return
   * the raw contents.
   *
   * The redirect URL contains a one-time token that has a limited lifetime.
   * As a result, the link should not be persisted, stored, or shared.
   *
   * @deprecated
   */
  getIssueAttachment(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/issues/{issue_id}/attachments/{path}",
      ...options
    });
  }
  /**
   * List changes on an issue
   *
   * Returns the list of all changes that have been made to the specified
   * issue. Changes are returned in chronological order with the oldest
   * change first.
   *
   * Each time an issue is edited in the UI or through the API, an immutable
   * change record is created under the `/issues/123/changes` endpoint. It
   * also has a comment associated with the change.
   *
   * Note that this operation is changing significantly, due to privacy changes.
   * See the [announcement](https://developer.atlassian.com/cloud/bitbucket/bitbucket-api-changes-gdpr/#changes-to-the-issue-changes-api)
   * for details.
   *
   * Changes support [filtering and sorting](/cloud/bitbucket/rest/intro/#filtering) that
   * can be used to search for specific changes. For instance, to see
   * when an issue transitioned to "resolved":
   *
   * ```
   * $ curl -s https://api.bitbucket.org/2.0/repositories/site/master/issues/1/changes \
   * -G --data-urlencode='q=changes.state.new = "resolved"'
   * ```
   *
   * This resource is only available on repositories that have the issue
   * tracker enabled.
   *
   * N.B.
   *
   * The `changes.assignee` and `changes.assignee_account_id` fields are not
   * a `user` object. Instead, they contain the raw `username` and
   * `account_id` of the user. This is to protect the integrity of the audit
   * log even after a user account gets deleted.
   *
   * The `changes.assignee` field is deprecated will disappear in the
   * future. Use `changes.assignee_account_id` instead.
   *
   * @deprecated
   */
  listIssueChanges(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/issues/{issue_id}/changes",
      ...options
    });
  }
  /**
   * Modify the state of an issue
   *
   * Makes a change to the specified issue.
   *
   * For example, to change an issue's state and assignee, create a new
   * change object that modifies these fields:
   *
   * ```
   * curl https://api.bitbucket.org/2.0/site/master/issues/1234/changes \
   * -s -u evzijst -X POST -H "Content-Type: application/json" \
   * -d '{
   * "changes": {
   * "assignee_account_id": {
   * "new": "557058:c0b72ad0-1cb5-4018-9cdc-0cde8492c443"
   * },
   * "state": {
   * "new": 'resolved"
   * }
   * }
   * "message": {
   * "raw": "This is now resolved."
   * }
   * }'
   * ```
   *
   * The above example also includes a custom comment to go alongside the
   * change. This comment will also be visible on the issue page in the UI.
   *
   * The fields of the `changes` object are strings, not objects. This
   * allows for immutable change log records, even after user accounts,
   * milestones, or other objects recorded in a change entry, get renamed or
   * deleted.
   *
   * The `assignee_account_id` field stores the account id. When POSTing a
   * new change and changing the assignee, the client should therefore use
   * the user's account_id in the `changes.assignee_account_id.new` field.
   *
   * This call requires authentication. Private repositories or private
   * issue trackers require the caller to authenticate with an account that
   * has appropriate authorization.
   *
   * @deprecated
   */
  createIssueChange(options) {
    return (options.client ?? this.client).post({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/issues/{issue_id}/changes",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * Get issue change object
   *
   * Returns the specified issue change object.
   *
   * This resource is only available on repositories that have the issue
   * tracker enabled.
   *
   * @deprecated
   */
  getIssueChange(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/issues/{issue_id}/changes/{change_id}",
      ...options
    });
  }
  /**
   * List comments on an issue
   *
   * Returns a paginated list of all comments that were made on the
   * specified issue.
   *
   * The default sorting is oldest to newest and can be overridden with
   * the `sort` query parameter.
   *
   * This endpoint also supports filtering and sorting of the results. See
   * [filtering and sorting](/cloud/bitbucket/rest/intro/#filtering) for more details.
   *
   * @deprecated
   */
  listIssueComments(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/issues/{issue_id}/comments",
      ...options
    });
  }
  /**
   * Create a comment on an issue
   *
   * Creates a new issue comment.
   *
   * ```
   * $ curl https://api.bitbucket.org/2.0/repositories/atlassian/prlinks/issues/42/comments/ \
   * -X POST -u evzijst \
   * -H 'Content-Type: application/json' \
   * -d '{"content": {"raw": "Lorem ipsum."}}'
   * ```
   *
   * @deprecated
   */
  createIssueComment(options) {
    return (options.client ?? this.client).post({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/issues/{issue_id}/comments",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * Delete a comment on an issue
   *
   * Deletes the specified comment.
   *
   * @deprecated
   */
  deleteIssueComment(options) {
    return (options.client ?? this.client).delete({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/issues/{issue_id}/comments/{comment_id}",
      ...options
    });
  }
  /**
   * Get a comment on an issue
   *
   * Returns the specified issue comment object.
   *
   * @deprecated
   */
  getIssueComment(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/issues/{issue_id}/comments/{comment_id}",
      ...options
    });
  }
  /**
   * Update a comment on an issue
   *
   * Updates the content of the specified issue comment. Note that only
   * the `content.raw` field can be modified.
   *
   * ```
   * $ curl https://api.bitbucket.org/2.0/repositories/atlassian/prlinks/issues/42/comments/5728901 \
   * -X PUT -u evzijst \
   * -H 'Content-Type: application/json' \
   * -d '{"content": {"raw": "Lorem ipsum."}'
   * ```
   *
   * @deprecated
   */
  updateIssueComment(options) {
    return (options.client ?? this.client).put({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/issues/{issue_id}/comments/{comment_id}",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * Remove vote for an issue
   *
   * Retract your vote.
   *
   * @deprecated
   */
  deleteIssueVote(options) {
    return (options.client ?? this.client).delete({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/issues/{issue_id}/vote",
      ...options
    });
  }
  /**
   * Check if current user voted for an issue
   *
   * Check whether the authenticated user has voted for this issue.
   * A 204 status code indicates that the user has voted, while a 404
   * implies they haven't.
   *
   * @deprecated
   */
  getIssueVote(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/issues/{issue_id}/vote",
      ...options
    });
  }
  /**
   * Vote for an issue
   *
   * Vote for this issue.
   *
   * To cast your vote, do an empty PUT. The 204 status code indicates that
   * the operation was successful.
   *
   * @deprecated
   */
  addIssueVote(options) {
    return (options.client ?? this.client).put({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/issues/{issue_id}/vote",
      ...options
    });
  }
  /**
   * Stop watching an issue
   *
   * Stop watching this issue.
   *
   * @deprecated
   */
  unwatchIssue(options) {
    return (options.client ?? this.client).delete({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/issues/{issue_id}/watch",
      ...options
    });
  }
  /**
   * Check if current user is watching a issue
   *
   * Indicated whether or not the authenticated user is watching this
   * issue.
   *
   * @deprecated
   */
  getIssueWatchStatus(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/issues/{issue_id}/watch",
      ...options
    });
  }
  /**
   * Watch an issue
   *
   * Start watching this issue.
   *
   * To start watching this issue, do an empty PUT. The 204 status code
   * indicates that the operation was successful.
   *
   * @deprecated
   */
  watchIssue(options) {
    return (options.client ?? this.client).put({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/issues/{issue_id}/watch",
      ...options
    });
  }
  /**
   * Get the common ancestor between two commits
   *
   * Returns the best common ancestor between two commits, specified in a revspec
   * of 2 commits (e.g. 3a8b42..9ff173).
   *
   * If more than one best common ancestor exists, only one will be returned. It is
   * unspecified which will be returned.
   */
  getMergeBase(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/merge-base/{revspec}",
      ...options
    });
  }
  /**
   * List milestones
   *
   * Returns the milestones that have been defined in the issue tracker.
   *
   * This resource is only available on repositories that have the issue
   * tracker enabled.
   *
   * @deprecated
   */
  listMilestones(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/milestones",
      ...options
    });
  }
  /**
   * Get a milestone
   *
   * Returns the specified issue tracker milestone object.
   *
   * @deprecated
   */
  getMilestone(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/milestones/{milestone_id}",
      ...options
    });
  }
  /**
   * Retrieve the inheritance state for repository settings
   */
  getOverrideSettings(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/override-settings",
      ...options
    });
  }
  /**
   * Set the inheritance state for repository settings
   *
   */
  updateOverrideSettings(options) {
    return (options.client ?? this.client).put({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/override-settings",
      ...options
    });
  }
  /**
   * Get a patch for two commits
   *
   * Produces a raw patch for a single commit (diffed against its first
   * parent), or a patch-series for a revspec of 2 commits (e.g.
   * `3a8b42..9ff173` where the first commit represents the source and the
   * second commit the destination).
   *
   * In case of the latter (diffing a revspec), a patch series is returned
   * for the commits on the source branch (`3a8b42` and its ancestors in
   * our example).
   *
   * While similar to diffs, patches:
   *
   * * Have a commit header (username, commit message, etc)
   * * Do not support the `path=foo/bar.py` query parameter
   *
   * The raw patch is returned as-is, in whatever encoding the files in the
   * repository use. It is not decoded into unicode. As such, the
   * content-type is `text/plain`.
   */
  getPatch(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/patch/{spec}",
      ...options
    });
  }
  /**
   * List explicit group permissions for a repository
   *
   * Returns a paginated list of explicit group permissions for the given repository.
   * This endpoint does not support BBQL features.
   */
  listRepoPermissionGroups(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/permissions-config/groups",
      ...options
    });
  }
  /**
   * Delete an explicit group permission for a repository
   *
   * Deletes the repository group permission between the requested repository and group, if one exists.
   *
   * Only users with admin permission for the repository may access this resource.
   *
   * The only authentication method supported for this endpoint is via app passwords.
   */
  deleteRepoPermissionGroup(options) {
    return (options.client ?? this.client).delete({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/permissions-config/groups/{group_slug}",
      ...options
    });
  }
  /**
   * Get an explicit group permission for a repository
   *
   * Returns the group permission for a given group slug and repository
   *
   * Only users with admin permission for the repository may access this resource.
   *
   * Permissions can be:
   *
   * * `admin`
   * * `write`
   * * `read`
   * * `none`
   */
  getRepoPermissionGroup(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/permissions-config/groups/{group_slug}",
      ...options
    });
  }
  /**
   * Update an explicit group permission for a repository
   *
   * Updates the group permission, or grants a new permission if one does not already exist.
   *
   * Only users with admin permission for the repository may access this resource.
   *
   * The only authentication method supported for this endpoint is via app passwords.
   *
   * Permissions can be:
   *
   * * `admin`
   * * `write`
   * * `read`
   */
  updateRepoPermissionGroup(options) {
    return (options.client ?? this.client).put({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/permissions-config/groups/{group_slug}",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * List explicit user permissions for a repository
   *
   * Returns a paginated list of explicit user permissions for the given repository.
   * This endpoint does not support BBQL features.
   */
  listRepoPermissionUsers(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/permissions-config/users",
      ...options
    });
  }
  /**
   * Delete an explicit user permission for a repository
   *
   * Deletes the repository user permission between the requested repository and user, if one exists.
   *
   * Only users with admin permission for the repository may access this resource.
   *
   * The only authentication method for this endpoint is via app passwords.
   */
  deleteRepoPermissionUser(options) {
    return (options.client ?? this.client).delete({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/permissions-config/users/{selected_user_id}",
      ...options
    });
  }
  /**
   * Get an explicit user permission for a repository
   *
   * Returns the explicit user permission for a given user and repository.
   *
   * Only users with admin permission for the repository may access this resource.
   *
   * Permissions can be:
   *
   * * `admin`
   * * `write`
   * * `read`
   * * `none`
   */
  getRepoPermissionUser(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/permissions-config/users/{selected_user_id}",
      ...options
    });
  }
  /**
   * Update an explicit user permission for a repository
   *
   * Updates the explicit user permission for a given user and repository. The selected user must be a member of
   * the workspace, and cannot be the workspace owner.
   * Only users with admin permission for the repository may access this resource.
   *
   * The only authentication method for this endpoint is via app passwords.
   *
   * Permissions can be:
   *
   * * `admin`
   * * `write`
   * * `read`
   */
  updateRepoPermissionUser(options) {
    return (options.client ?? this.client).put({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/permissions-config/users/{selected_user_id}",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * List pipelines
   *
   * Find pipelines in a repository.
   *
   * Note that unlike other endpoints in the Bitbucket API, this endpoint utilizes query parameters to allow filtering
   * and sorting of returned results. See [query parameters](#api-repositories-workspace-repo-slug-pipelines-get-request-Query%20parameters)
   * for specific details.
   *
   */
  getPipelinesForRepository(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pipelines",
      ...options
    });
  }
  /**
   * Run a pipeline
   *
   * Endpoint to create and initiate a pipeline.
   * There are a couple of different options to initiate a pipeline, where the payload of the request will determine which type of pipeline will be instantiated.
   * # Trigger a Pipeline for a branch
   * One way to trigger pipelines is by specifying the branch for which you want to trigger a pipeline.
   * The specified branch will be used to determine which pipeline definition from the `bitbucket-pipelines.yml` file will be applied to initiate the pipeline. The pipeline will then do a clone of the repository and checkout the latest revision of the specified branch.
   *
   * ### Example
   *
   * ```
   * $ curl -X POST -is -u username:password \
   * -H 'Content-Type: application/json' \
   * https://api.bitbucket.org/2.0/repositories/jeroendr/meat-demo2/pipelines/ \
   * -d '
   * {
   * "target": {
   * "ref_type": "branch",
   * "type": "pipeline_ref_target",
   * "ref_name": "master"
   * }
   * }'
   * ```
   * # Trigger a Pipeline for a commit on a branch or tag
   * You can initiate a pipeline for a specific commit and in the context of a specified reference (e.g. a branch, tag or bookmark).
   * The specified reference will be used to determine which pipeline definition from the bitbucket-pipelines.yml file will be applied to initiate the pipeline. The pipeline will clone the repository and then do a checkout the specified reference.
   *
   * The following reference types are supported:
   *
   * * `branch`
   * * `named_branch`
   * * `bookmark`
   * * `tag`
   *
   * ### Example
   *
   * ```
   * $ curl -X POST -is -u username:password \
   * -H 'Content-Type: application/json' \
   * https://api.bitbucket.org/2.0/repositories/jeroendr/meat-demo2/pipelines/ \
   * -d '
   * {
   * "target": {
   * "commit": {
   * "type": "commit",
   * "hash": "ce5b7431602f7cbba007062eeb55225c6e18e956"
   * },
   * "ref_type": "branch",
   * "type": "pipeline_ref_target",
   * "ref_name": "master"
   * }
   * }'
   * ```
   * # Trigger a specific pipeline definition for a commit
   * You can trigger a specific pipeline that is defined in your `bitbucket-pipelines.yml` file for a specific commit.
   * In addition to the commit revision, you specify the type and pattern of the selector that identifies the pipeline definition. The resulting pipeline will then clone the repository and checkout the specified revision.
   *
   * ### Example
   *
   * ```
   * $ curl -X POST -is -u username:password \
   * -H 'Content-Type: application/json' \
   * https://api.bitbucket.org/2.0/repositories/jeroendr/meat-demo2/pipelines/ \
   * -d '
   * {
   * "target": {
   * "commit": {
   * "hash":"a3c4e02c9a3755eccdc3764e6ea13facdf30f923",
   * "type":"commit"
   * },
   * "selector": {
   * "type":"custom",
   * "pattern":"Deploy to production"
   * },
   * "type":"pipeline_commit_target"
   * }
   * }'
   * ```
   * # Trigger a specific pipeline definition for a commit on a branch or tag
   * You can trigger a specific pipeline that is defined in your `bitbucket-pipelines.yml` file for a specific commit in the context of a specified reference.
   * In addition to the commit revision, you specify the type and pattern of the selector that identifies the pipeline definition, as well as the reference information. The resulting pipeline will then clone the repository a checkout the specified reference.
   *
   * ### Example
   *
   * ```
   * $ curl -X POST -is -u username:password \
   * -H 'Content-Type: application/json' \
   * https://api.bitbucket.org/2.0/repositories/jeroendr/meat-demo2/pipelines/ \
   * -d '
   * {
   * "target": {
   * "commit": {
   * "hash":"a3c4e02c9a3755eccdc3764e6ea13facdf30f923",
   * "type":"commit"
   * },
   * "selector": {
   * "type": "custom",
   * "pattern": "Deploy to production"
   * },
   * "type": "pipeline_ref_target",
   * "ref_name": "master",
   * "ref_type": "branch"
   * }
   * }'
   * ```
   *
   *
   * # Trigger a custom pipeline with variables
   * In addition to triggering a custom pipeline that is defined in your `bitbucket-pipelines.yml` file as shown in the examples above, you can specify variables that will be available for your build. In the request, provide a list of variables, specifying the following for each variable: key, value, and whether it should be secured or not (this field is optional and defaults to not secured).
   *
   * ### Example
   *
   * ```
   * $ curl -X POST -is -u username:password \
   * -H 'Content-Type: application/json' \
   * https://api.bitbucket.org/2.0/repositories/{workspace}/{repo_slug}/pipelines/ \
   * -d '
   * {
   * "target": {
   * "type": "pipeline_ref_target",
   * "ref_type": "branch",
   * "ref_name": "master",
   * "selector": {
   * "type": "custom",
   * "pattern": "Deploy to production"
   * }
   * },
   * "variables": [
   * {
   * "key": "var1key",
   * "value": "var1value",
   * "secured": true
   * },
   * {
   * "key": "var2key",
   * "value": "var2value"
   * }
   * ]
   * }'
   * ```
   *
   * # Trigger a pull request pipeline
   *
   * You can also initiate a pipeline for a specific pull request.
   *
   * ### Example
   *
   * ```
   * $ curl -X POST -is -u username:password \
   * -H 'Content-Type: application/json' \
   * https://api.bitbucket.org/2.0/repositories/{workspace}/{repo_slug}/pipelines/ \
   * -d '
   * {
   * "target": {
   * "type": "pipeline_pullrequest_target",
   * "source": "pull-request-branch",
   * "destination": "master",
   * "destination_commit": {
   * "hash": "9f848b7"
   * },
   * "commit": {
   * "hash": "1a372fc"
   * },
   * "pullrequest": {
   * "id": "3"
   * },
   * "selector": {
   * "type": "pull-requests",
   * "pattern": "**"
   * }
   * }
   * }'
   * ```
   *
   */
  createPipelineForRepository(options) {
    return (options.client ?? this.client).post({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pipelines",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * Delete caches
   *
   * Delete repository cache versions by name.
   */
  deleteRepositoryPipelineCaches(options) {
    return (options.client ?? this.client).delete({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pipelines-config/caches",
      ...options
    });
  }
  /**
   * List caches
   *
   * Retrieve the repository pipelines caches.
   */
  getRepositoryPipelineCaches(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pipelines-config/caches",
      ...options
    });
  }
  /**
   * Delete a cache
   *
   * Delete a repository cache.
   */
  deleteRepositoryPipelineCache(options) {
    return (options.client ?? this.client).delete({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pipelines-config/caches/{cache_uuid}",
      ...options
    });
  }
  /**
   * Get cache content URI
   *
   * Retrieve the URI of the content of the specified cache.
   */
  getRepositoryPipelineCacheContentUri(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pipelines-config/caches/{cache_uuid}/content-uri",
      ...options
    });
  }
  /**
   * Get repository runners
   *
   * Retrieve repository runners.
   */
  getRepositoryRunners(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pipelines-config/runners",
      ...options
    });
  }
  /**
   * Create repository runner
   *
   * Create repository runner.
   */
  createRepositoryRunner(options) {
    return (options.client ?? this.client).post({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pipelines-config/runners",
      ...options
    });
  }
  /**
   * Delete repository runner
   *
   * Delete repository runner by uuid.
   */
  deleteRepositoryRunner(options) {
    return (options.client ?? this.client).delete({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pipelines-config/runners/{runner_uuid}",
      ...options
    });
  }
  /**
   * Get repository runner
   *
   * Retrieve repository runner by uuid.
   */
  getRepositoryRunner(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pipelines-config/runners/{runner_uuid}",
      ...options
    });
  }
  /**
   * Update repository runner
   *
   * Update repository runner.
   */
  updateRepositoryRunner(options) {
    return (options.client ?? this.client).put({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pipelines-config/runners/{runner_uuid}",
      ...options
    });
  }
  /**
   * Get a pipeline
   *
   * Retrieve a specified pipeline
   */
  getPipelineForRepository(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pipelines/{pipeline_uuid}",
      ...options
    });
  }
  /**
   * List steps for a pipeline
   *
   * Find steps for the given pipeline.
   */
  getPipelineStepsForRepository(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pipelines/{pipeline_uuid}/steps",
      ...options
    });
  }
  /**
   * Get a step of a pipeline
   *
   * Retrieve a given step of a pipeline.
   */
  getPipelineStepForRepository(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pipelines/{pipeline_uuid}/steps/{step_uuid}",
      ...options
    });
  }
  /**
   * Get log file for a step
   *
   * Retrieve the log file for a given step of a pipeline.
   *
   * This endpoint supports (and encourages!) the use of [HTTP Range requests](https://tools.ietf.org/html/rfc7233) to deal with potentially very large log files.
   */
  getPipelineStepLogForRepository(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pipelines/{pipeline_uuid}/steps/{step_uuid}/log",
      ...options
    });
  }
  /**
   * Get the logs for the build container or a service container for a given step of a pipeline.
   *
   * Retrieve the log file for a build container or service container.
   *
   * This endpoint supports (and encourages!) the use of [HTTP Range requests](https://tools.ietf.org/html/rfc7233) to deal with potentially very large log files.
   */
  getPipelineContainerLog(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pipelines/{pipeline_uuid}/steps/{step_uuid}/logs/{log_uuid}",
      ...options
    });
  }
  /**
   * Get a summary of test reports for a given step of a pipeline.
   */
  getPipelineTestReports(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pipelines/{pipeline_uuid}/steps/{step_uuid}/test_reports",
      ...options
    });
  }
  /**
   * Get test cases for a given step of a pipeline.
   */
  getPipelineTestReportTestCases(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pipelines/{pipeline_uuid}/steps/{step_uuid}/test_reports/test_cases",
      ...options
    });
  }
  /**
   * Get test case reasons (output) for a given test case in a step of a pipeline.
   */
  getPipelineTestReportTestCaseReasons(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pipelines/{pipeline_uuid}/steps/{step_uuid}/test_reports/test_cases/{test_case_uuid}/test_case_reasons",
      ...options
    });
  }
  /**
   * Stop a pipeline
   *
   * Signal the stop of a pipeline and all of its steps that not have completed yet.
   */
  stopPipeline(options) {
    return (options.client ?? this.client).post({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pipelines/{pipeline_uuid}/stopPipeline",
      ...options
    });
  }
  /**
   * Get configuration
   *
   * Retrieve the repository pipelines configuration.
   */
  getRepositoryPipelineConfig(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pipelines_config",
      ...options
    });
  }
  /**
   * Update configuration
   *
   * Update the pipelines configuration for a repository.
   */
  updateRepositoryPipelineConfig(options) {
    return (options.client ?? this.client).put({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pipelines_config",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * Update the next build number
   *
   * Update the next build number that should be assigned to a pipeline. The next build number that will be configured has to be strictly higher than the current latest build number for this repository.
   */
  updateRepositoryBuildNumber(options) {
    return (options.client ?? this.client).put({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pipelines_config/build_number",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * List schedules
   *
   * Retrieve the configured schedules for the given repository.
   */
  getRepositoryPipelineSchedules(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pipelines_config/schedules",
      ...options
    });
  }
  /**
   * Create a schedule
   *
   * Create a schedule for the given repository.
   */
  createRepositoryPipelineSchedule(options) {
    return (options.client ?? this.client).post({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pipelines_config/schedules",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * Delete a schedule
   *
   * Delete a schedule.
   */
  deleteRepositoryPipelineSchedule(options) {
    return (options.client ?? this.client).delete({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pipelines_config/schedules/{schedule_uuid}",
      ...options
    });
  }
  /**
   * Get a schedule
   *
   * Retrieve a schedule by its UUID.
   */
  getRepositoryPipelineSchedule(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pipelines_config/schedules/{schedule_uuid}",
      ...options
    });
  }
  /**
   * Update a schedule
   *
   * Update a schedule.
   */
  updateRepositoryPipelineSchedule(options) {
    return (options.client ?? this.client).put({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pipelines_config/schedules/{schedule_uuid}",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * List executions of a schedule
   *
   * Retrieve the executions of a given schedule.
   */
  getRepositoryPipelineScheduleExecutions(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pipelines_config/schedules/{schedule_uuid}/executions",
      ...options
    });
  }
  /**
   * Delete SSH key pair
   *
   * Delete the repository SSH key pair.
   */
  deleteRepositoryPipelineKeyPair(options) {
    return (options.client ?? this.client).delete({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pipelines_config/ssh/key_pair",
      ...options
    });
  }
  /**
   * Get SSH key pair
   *
   * Retrieve the repository SSH key pair excluding the SSH private key. The private key is a write only field and will never be exposed in the logs or the REST API.
   */
  getRepositoryPipelineSshKeyPair(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pipelines_config/ssh/key_pair",
      ...options
    });
  }
  /**
   * Update SSH key pair
   *
   * Create or update the repository SSH key pair. The private key will be set as a default SSH identity in your build container.
   */
  updateRepositoryPipelineKeyPair(options) {
    return (options.client ?? this.client).put({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pipelines_config/ssh/key_pair",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * List known hosts
   *
   * Find repository level known hosts.
   */
  getRepositoryPipelineKnownHosts(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pipelines_config/ssh/known_hosts",
      ...options
    });
  }
  /**
   * Create a known host
   *
   * Create a repository level known host.
   */
  createRepositoryPipelineKnownHost(options) {
    return (options.client ?? this.client).post({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pipelines_config/ssh/known_hosts",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * Delete a known host
   *
   * Delete a repository level known host.
   */
  deleteRepositoryPipelineKnownHost(options) {
    return (options.client ?? this.client).delete({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pipelines_config/ssh/known_hosts/{known_host_uuid}",
      ...options
    });
  }
  /**
   * Get a known host
   *
   * Retrieve a repository level known host.
   */
  getRepositoryPipelineKnownHost(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pipelines_config/ssh/known_hosts/{known_host_uuid}",
      ...options
    });
  }
  /**
   * Update a known host
   *
   * Update a repository level known host.
   */
  updateRepositoryPipelineKnownHost(options) {
    return (options.client ?? this.client).put({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pipelines_config/ssh/known_hosts/{known_host_uuid}",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * List variables for a repository
   *
   * Find repository level variables.
   */
  getRepositoryPipelineVariables(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pipelines_config/variables",
      ...options
    });
  }
  /**
   * Create a variable for a repository
   *
   * Create a repository level variable.
   */
  createRepositoryPipelineVariable(options) {
    return (options.client ?? this.client).post({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pipelines_config/variables",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * Delete a variable for a repository
   *
   * Delete a repository level variable.
   */
  deleteRepositoryPipelineVariable(options) {
    return (options.client ?? this.client).delete({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pipelines_config/variables/{variable_uuid}",
      ...options
    });
  }
  /**
   * Get a variable for a repository
   *
   * Retrieve a repository level variable.
   */
  getRepositoryPipelineVariable(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pipelines_config/variables/{variable_uuid}",
      ...options
    });
  }
  /**
   * Update a variable for a repository
   *
   * Update a repository level variable.
   */
  updateRepositoryPipelineVariable(options) {
    return (options.client ?? this.client).put({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pipelines_config/variables/{variable_uuid}",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * Delete a repository application property
   *
   * Delete an [application property](/cloud/bitbucket/application-properties/) value stored against a repository.
   */
  deleteRepositoryHostedPropertyValue(options) {
    return (options.client ?? this.client).delete({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/properties/{app_key}/{property_name}",
      ...options
    });
  }
  /**
   * Get a repository application property
   *
   * Retrieve an [application property](/cloud/bitbucket/application-properties/) value stored against a repository.
   */
  getRepositoryHostedPropertyValue(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/properties/{app_key}/{property_name}",
      ...options
    });
  }
  /**
   * Update a repository application property
   *
   * Update an [application property](/cloud/bitbucket/application-properties/) value stored against a repository.
   */
  updateRepositoryHostedPropertyValue(options) {
    return (options.client ?? this.client).put({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/properties/{app_key}/{property_name}",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * List pull requests
   *
   * Returns all pull requests on the specified repository.
   *
   * By default only open pull requests are returned. This can be controlled
   * using the `state` query parameter. To retrieve pull requests that are
   * in one of multiple states, repeat the `state` parameter for each
   * individual state.
   *
   * This endpoint also supports filtering and sorting of the results. See
   * [filtering and sorting](/cloud/bitbucket/rest/intro/#filtering) for more details.
   */
  listPullRequests(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pullrequests",
      ...options
    });
  }
  /**
   * Create a pull request
   *
   * Creates a new pull request where the destination repository is
   * this repository and the author is the authenticated user.
   *
   * The minimum required fields to create a pull request are `title` and
   * `source`, specified by a branch name.
   *
   * ```
   * curl https://api.bitbucket.org/2.0/repositories/my-workspace/my-repository/pullrequests \
   * -u my-username:my-password \
   * --request POST \
   * --header 'Content-Type: application/json' \
   * --data '{
   * "title": "My Title",
   * "source": {
   * "branch": {
   * "name": "staging"
   * }
   * }
   * }'
   * ```
   *
   * If the pull request's `destination` is not specified, it will default
   * to the `repository.mainbranch`. To open a pull request to a
   * different branch, say from a feature branch to a staging branch,
   * specify a `destination` (same format as the `source`):
   *
   * ```
   * {
   * "title": "My Title",
   * "source": {
   * "branch": {
   * "name": "my-feature-branch"
   * }
   * },
   * "destination": {
   * "branch": {
   * "name": "staging"
   * }
   * }
   * }
   * ```
   *
   * Reviewers can be specified by adding an array of user objects as the
   * `reviewers` property.
   *
   * ```
   * {
   * "title": "My Title",
   * "source": {
   * "branch": {
   * "name": "my-feature-branch"
   * }
   * },
   * "reviewers": [
   * {
   * "uuid": "{504c3b62-8120-4f0c-a7bc-87800b9d6f70}"
   * }
   * ]
   * }
   * ```
   *
   * Other fields:
   *
   * * `description` - a string
   * * `close_source_branch` - boolean that specifies if the source branch should be closed upon merging
   * * `draft` - boolean that specifies whether the pull request is a draft
   */
  createPullRequest(options) {
    return (options.client ?? this.client).post({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pullrequests",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * List a pull request activity log
   *
   * Returns a paginated list of the pull request's activity log.
   *
   * This handler serves both a v20 and internal endpoint. The v20 endpoint
   * returns reviewer comments, updates, approvals and request changes. The internal
   * endpoint includes those plus tasks and attachments.
   *
   * Comments created on a file or a line of code have an inline property.
   *
   * Comment example:
   * ```
   * {
   * "pagelen": 20,
   * "values": [
   * {
   * "comment": {
   * "links": {
   * "self": {
   * "href": "https://api.bitbucket.org/2.0/repositories/atlassian/atlaskit-mk-2/pullrequests/5695/comments/118571088"
   * },
   * "html": {
   * "href": "https://bitbucket.org/atlassian/atlaskit-mk-2/pull-requests/5695/_/diff#comment-118571088"
   * }
   * },
   * "deleted": false,
   * "pullrequest": {
   * "type": "pullrequest",
   * "id": 5695,
   * "links": {
   * "self": {
   * "href": "https://api.bitbucket.org/2.0/repositories/atlassian/atlaskit-mk-2/pullrequests/5695"
   * },
   * "html": {
   * "href": "https://bitbucket.org/atlassian/atlaskit-mk-2/pull-requests/5695"
   * }
   * },
   * "title": "username/NONE: small change from onFocus to onClick to handle tabbing through the page and not expand the editor unless a click event triggers it"
   * },
   * "content": {
   * "raw": "inline with to a dn from lines",
   * "markup": "markdown",
   * "html": "<p>inline with to a dn from lines</p>",
   * "type": "rendered"
   * },
   * "created_on": "2019-09-27T00:33:46.039178+00:00",
   * "user": {
   * "display_name": "Name Lastname",
   * "uuid": "{}",
   * "links": {
   * "self": {
   * "href": "https://api.bitbucket.org/2.0/users/%7B%7D"
   * },
   * "html": {
   * "href": "https://bitbucket.org/%7B%7D/"
   * },
   * "avatar": {
   * "href": "https://avatar-management--avatars.us-west-2.prod.public.atl-paas.net/:/128"
   * }
   * },
   * "type": "user",
   * "nickname": "Name",
   * "account_id": ""
   * },
   * "created_on": "2019-09-27T00:33:46.039178+00:00",
   * "user": {
   * "display_name": "Name Lastname",
   * "uuid": "{}",
   * "links": {
   * "self": {
   * "href": "https://api.bitbucket.org/2.0/users/%7B%7D"
   * },
   * "html": {
   * "href": "https://bitbucket.org/%7B%7D/"
   * },
   * "avatar": {
   * "href": "https://avatar-management--avatars.us-west-2.prod.public.atl-paas.net/:/128"
   * }
   * },
   * "type": "user",
   * "nickname": "Name",
   * "account_id": ""
   * },
   * "updated_on": "2019-09-27T00:33:46.055384+00:00",
   * "inline": {
   * "context_lines": "",
   * "to": null,
   * "path": "",
   * "outdated": false,
   * "from": 211
   * },
   * "type": "pullrequest_comment",
   * "id": 118571088
   * },
   * "pull_request": {
   * "type": "pullrequest",
   * "id": 5695,
   * "links": {
   * "self": {
   * "href": "https://api.bitbucket.org/2.0/repositories/atlassian/atlaskit-mk-2/pullrequests/5695"
   * },
   * "html": {
   * "href": "https://bitbucket.org/atlassian/atlaskit-mk-2/pull-requests/5695"
   * }
   * },
   * "title": "username/NONE: small change from onFocus to onClick to handle tabbing through the page and not expand the editor unless a click event triggers it"
   * }
   * }
   * ]
   * }
   * ```
   *
   * Updates include a state property of OPEN, MERGED, or DECLINED.
   *
   * Update example:
   * ```
   * {
   * "pagelen": 20,
   * "values": [
   * {
   * "update": {
   * "description": "",
   * "title": "username/NONE: small change from onFocus to onClick to handle tabbing through the page and not expand the editor unless a click event triggers it",
   * "destination": {
   * "commit": {
   * "type": "commit",
   * "hash": "6a2c16e4a152",
   * "links": {
   * "self": {
   * "href": "https://api.bitbucket.org/2.0/repositories/atlassian/atlaskit-mk-2/commit/6a2c16e4a152"
   * },
   * "html": {
   * "href": "https://bitbucket.org/atlassian/atlaskit-mk-2/commits/6a2c16e4a152"
   * }
   * }
   * },
   * "branch": {
   * "name": "master"
   * },
   * "repository": {
   * "name": "Atlaskit-MK-2",
   * "type": "repository",
   * "full_name": "atlassian/atlaskit-mk-2",
   * "links": {
   * "self": {
   * "href": "https://api.bitbucket.org/2.0/repositories/atlassian/atlaskit-mk-2"
   * },
   * "html": {
   * "href": "https://bitbucket.org/atlassian/atlaskit-mk-2"
   * },
   * "avatar": {
   * "href": "https://bytebucket.org/ravatar/%7B%7D?ts=js"
   * }
   * },
   * "uuid": "{}"
   * }
   * },
   * "reason": "",
   * "source": {
   * "commit": {
   * "type": "commit",
   * "hash": "728c8bad1813",
   * "links": {
   * "self": {
   * "href": "https://api.bitbucket.org/2.0/repositories/atlassian/atlaskit-mk-2/commit/728c8bad1813"
   * },
   * "html": {
   * "href": "https://bitbucket.org/atlassian/atlaskit-mk-2/commits/728c8bad1813"
   * }
   * }
   * },
   * "branch": {
   * "name": "username/NONE-add-onClick-prop-for-accessibility"
   * },
   * "repository": {
   * "name": "Atlaskit-MK-2",
   * "type": "repository",
   * "full_name": "atlassian/atlaskit-mk-2",
   * "links": {
   * "self": {
   * "href": "https://api.bitbucket.org/2.0/repositories/atlassian/atlaskit-mk-2"
   * },
   * "html": {
   * "href": "https://bitbucket.org/atlassian/atlaskit-mk-2"
   * },
   * "avatar": {
   * "href": "https://bytebucket.org/ravatar/%7B%7D?ts=js"
   * }
   * },
   * "uuid": "{}"
   * }
   * },
   * "state": "OPEN",
   * "author": {
   * "display_name": "Name Lastname",
   * "uuid": "{}",
   * "links": {
   * "self": {
   * "href": "https://api.bitbucket.org/2.0/users/%7B%7D"
   * },
   * "html": {
   * "href": "https://bitbucket.org/%7B%7D/"
   * },
   * "avatar": {
   * "href": "https://avatar-management--avatars.us-west-2.prod.public.atl-paas.net/:/128"
   * }
   * },
   * "type": "user",
   * "nickname": "Name",
   * "account_id": ""
   * },
   * "date": "2019-05-10T06:48:25.305565+00:00"
   * },
   * "pull_request": {
   * "type": "pullrequest",
   * "id": 5695,
   * "links": {
   * "self": {
   * "href": "https://api.bitbucket.org/2.0/repositories/atlassian/atlaskit-mk-2/pullrequests/5695"
   * },
   * "html": {
   * "href": "https://bitbucket.org/atlassian/atlaskit-mk-2/pull-requests/5695"
   * }
   * },
   * "title": "username/NONE: small change from onFocus to onClick to handle tabbing through the page and not expand the editor unless a click event triggers it"
   * }
   * }
   * ]
   * }
   * ```
   *
   * Approval example:
   * ```
   * {
   * "pagelen": 20,
   * "values": [
   * {
   * "approval": {
   * "date": "2019-09-27T00:37:19.849534+00:00",
   * "pullrequest": {
   * "type": "pullrequest",
   * "id": 5695,
   * "links": {
   * "self": {
   * "href": "https://api.bitbucket.org/2.0/repositories/atlassian/atlaskit-mk-2/pullrequests/5695"
   * },
   * "html": {
   * "href": "https://bitbucket.org/atlassian/atlaskit-mk-2/pull-requests/5695"
   * }
   * },
   * "title": "username/NONE: small change from onFocus to onClick to handle tabbing through the page and not expand the editor unless a click event triggers it"
   * },
   * "user": {
   * "display_name": "Name Lastname",
   * "uuid": "{}",
   * "links": {
   * "self": {
   * "href": "https://api.bitbucket.org/2.0/users/%7B%7D"
   * },
   * "html": {
   * "href": "https://bitbucket.org/%7B%7D/"
   * },
   * "avatar": {
   * "href": "https://avatar-management--avatars.us-west-2.prod.public.atl-paas.net/:/128"
   * }
   * },
   * "type": "user",
   * "nickname": "Name",
   * "account_id": ""
   * }
   * },
   * "pull_request": {
   * "type": "pullrequest",
   * "id": 5695,
   * "links": {
   * "self": {
   * "href": "https://api.bitbucket.org/2.0/repositories/atlassian/atlaskit-mk-2/pullrequests/5695"
   * },
   * "html": {
   * "href": "https://bitbucket.org/atlassian/atlaskit-mk-2/pull-requests/5695"
   * }
   * },
   * "title": "username/NONE: small change from onFocus to onClick to handle tabbing through the page and not expand the editor unless a click event triggers it"
   * }
   * }
   * ]
   * }
   * ```
   */
  listPullRequestsActivity(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pullrequests/activity",
      ...options
    });
  }
  /**
   * Get a pull request
   *
   * Returns the specified pull request.
   */
  getPullRequest(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}",
      ...options
    });
  }
  /**
   * Update a pull request
   *
   * Mutates the specified pull request.
   *
   * This can be used to change the pull request's branches or description.
   *
   * Only open pull requests can be mutated.
   */
  updatePullRequest(options) {
    return (options.client ?? this.client).put({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * List a pull request activity log
   *
   * Returns a paginated list of the pull request's activity log.
   *
   * This handler serves both a v20 and internal endpoint. The v20 endpoint
   * returns reviewer comments, updates, approvals and request changes. The internal
   * endpoint includes those plus tasks and attachments.
   *
   * Comments created on a file or a line of code have an inline property.
   *
   * Comment example:
   * ```
   * {
   * "pagelen": 20,
   * "values": [
   * {
   * "comment": {
   * "links": {
   * "self": {
   * "href": "https://api.bitbucket.org/2.0/repositories/atlassian/atlaskit-mk-2/pullrequests/5695/comments/118571088"
   * },
   * "html": {
   * "href": "https://bitbucket.org/atlassian/atlaskit-mk-2/pull-requests/5695/_/diff#comment-118571088"
   * }
   * },
   * "deleted": false,
   * "pullrequest": {
   * "type": "pullrequest",
   * "id": 5695,
   * "links": {
   * "self": {
   * "href": "https://api.bitbucket.org/2.0/repositories/atlassian/atlaskit-mk-2/pullrequests/5695"
   * },
   * "html": {
   * "href": "https://bitbucket.org/atlassian/atlaskit-mk-2/pull-requests/5695"
   * }
   * },
   * "title": "username/NONE: small change from onFocus to onClick to handle tabbing through the page and not expand the editor unless a click event triggers it"
   * },
   * "content": {
   * "raw": "inline with to a dn from lines",
   * "markup": "markdown",
   * "html": "<p>inline with to a dn from lines</p>",
   * "type": "rendered"
   * },
   * "created_on": "2019-09-27T00:33:46.039178+00:00",
   * "user": {
   * "display_name": "Name Lastname",
   * "uuid": "{}",
   * "links": {
   * "self": {
   * "href": "https://api.bitbucket.org/2.0/users/%7B%7D"
   * },
   * "html": {
   * "href": "https://bitbucket.org/%7B%7D/"
   * },
   * "avatar": {
   * "href": "https://avatar-management--avatars.us-west-2.prod.public.atl-paas.net/:/128"
   * }
   * },
   * "type": "user",
   * "nickname": "Name",
   * "account_id": ""
   * },
   * "created_on": "2019-09-27T00:33:46.039178+00:00",
   * "user": {
   * "display_name": "Name Lastname",
   * "uuid": "{}",
   * "links": {
   * "self": {
   * "href": "https://api.bitbucket.org/2.0/users/%7B%7D"
   * },
   * "html": {
   * "href": "https://bitbucket.org/%7B%7D/"
   * },
   * "avatar": {
   * "href": "https://avatar-management--avatars.us-west-2.prod.public.atl-paas.net/:/128"
   * }
   * },
   * "type": "user",
   * "nickname": "Name",
   * "account_id": ""
   * },
   * "updated_on": "2019-09-27T00:33:46.055384+00:00",
   * "inline": {
   * "context_lines": "",
   * "to": null,
   * "path": "",
   * "outdated": false,
   * "from": 211
   * },
   * "type": "pullrequest_comment",
   * "id": 118571088
   * },
   * "pull_request": {
   * "type": "pullrequest",
   * "id": 5695,
   * "links": {
   * "self": {
   * "href": "https://api.bitbucket.org/2.0/repositories/atlassian/atlaskit-mk-2/pullrequests/5695"
   * },
   * "html": {
   * "href": "https://bitbucket.org/atlassian/atlaskit-mk-2/pull-requests/5695"
   * }
   * },
   * "title": "username/NONE: small change from onFocus to onClick to handle tabbing through the page and not expand the editor unless a click event triggers it"
   * }
   * }
   * ]
   * }
   * ```
   *
   * Updates include a state property of OPEN, MERGED, or DECLINED.
   *
   * Update example:
   * ```
   * {
   * "pagelen": 20,
   * "values": [
   * {
   * "update": {
   * "description": "",
   * "title": "username/NONE: small change from onFocus to onClick to handle tabbing through the page and not expand the editor unless a click event triggers it",
   * "destination": {
   * "commit": {
   * "type": "commit",
   * "hash": "6a2c16e4a152",
   * "links": {
   * "self": {
   * "href": "https://api.bitbucket.org/2.0/repositories/atlassian/atlaskit-mk-2/commit/6a2c16e4a152"
   * },
   * "html": {
   * "href": "https://bitbucket.org/atlassian/atlaskit-mk-2/commits/6a2c16e4a152"
   * }
   * }
   * },
   * "branch": {
   * "name": "master"
   * },
   * "repository": {
   * "name": "Atlaskit-MK-2",
   * "type": "repository",
   * "full_name": "atlassian/atlaskit-mk-2",
   * "links": {
   * "self": {
   * "href": "https://api.bitbucket.org/2.0/repositories/atlassian/atlaskit-mk-2"
   * },
   * "html": {
   * "href": "https://bitbucket.org/atlassian/atlaskit-mk-2"
   * },
   * "avatar": {
   * "href": "https://bytebucket.org/ravatar/%7B%7D?ts=js"
   * }
   * },
   * "uuid": "{}"
   * }
   * },
   * "reason": "",
   * "source": {
   * "commit": {
   * "type": "commit",
   * "hash": "728c8bad1813",
   * "links": {
   * "self": {
   * "href": "https://api.bitbucket.org/2.0/repositories/atlassian/atlaskit-mk-2/commit/728c8bad1813"
   * },
   * "html": {
   * "href": "https://bitbucket.org/atlassian/atlaskit-mk-2/commits/728c8bad1813"
   * }
   * }
   * },
   * "branch": {
   * "name": "username/NONE-add-onClick-prop-for-accessibility"
   * },
   * "repository": {
   * "name": "Atlaskit-MK-2",
   * "type": "repository",
   * "full_name": "atlassian/atlaskit-mk-2",
   * "links": {
   * "self": {
   * "href": "https://api.bitbucket.org/2.0/repositories/atlassian/atlaskit-mk-2"
   * },
   * "html": {
   * "href": "https://bitbucket.org/atlassian/atlaskit-mk-2"
   * },
   * "avatar": {
   * "href": "https://bytebucket.org/ravatar/%7B%7D?ts=js"
   * }
   * },
   * "uuid": "{}"
   * }
   * },
   * "state": "OPEN",
   * "author": {
   * "display_name": "Name Lastname",
   * "uuid": "{}",
   * "links": {
   * "self": {
   * "href": "https://api.bitbucket.org/2.0/users/%7B%7D"
   * },
   * "html": {
   * "href": "https://bitbucket.org/%7B%7D/"
   * },
   * "avatar": {
   * "href": "https://avatar-management--avatars.us-west-2.prod.public.atl-paas.net/:/128"
   * }
   * },
   * "type": "user",
   * "nickname": "Name",
   * "account_id": ""
   * },
   * "date": "2019-05-10T06:48:25.305565+00:00"
   * },
   * "pull_request": {
   * "type": "pullrequest",
   * "id": 5695,
   * "links": {
   * "self": {
   * "href": "https://api.bitbucket.org/2.0/repositories/atlassian/atlaskit-mk-2/pullrequests/5695"
   * },
   * "html": {
   * "href": "https://bitbucket.org/atlassian/atlaskit-mk-2/pull-requests/5695"
   * }
   * },
   * "title": "username/NONE: small change from onFocus to onClick to handle tabbing through the page and not expand the editor unless a click event triggers it"
   * }
   * }
   * ]
   * }
   * ```
   *
   * Approval example:
   * ```
   * {
   * "pagelen": 20,
   * "values": [
   * {
   * "approval": {
   * "date": "2019-09-27T00:37:19.849534+00:00",
   * "pullrequest": {
   * "type": "pullrequest",
   * "id": 5695,
   * "links": {
   * "self": {
   * "href": "https://api.bitbucket.org/2.0/repositories/atlassian/atlaskit-mk-2/pullrequests/5695"
   * },
   * "html": {
   * "href": "https://bitbucket.org/atlassian/atlaskit-mk-2/pull-requests/5695"
   * }
   * },
   * "title": "username/NONE: small change from onFocus to onClick to handle tabbing through the page and not expand the editor unless a click event triggers it"
   * },
   * "user": {
   * "display_name": "Name Lastname",
   * "uuid": "{}",
   * "links": {
   * "self": {
   * "href": "https://api.bitbucket.org/2.0/users/%7B%7D"
   * },
   * "html": {
   * "href": "https://bitbucket.org/%7B%7D/"
   * },
   * "avatar": {
   * "href": "https://avatar-management--avatars.us-west-2.prod.public.atl-paas.net/:/128"
   * }
   * },
   * "type": "user",
   * "nickname": "Name",
   * "account_id": ""
   * }
   * },
   * "pull_request": {
   * "type": "pullrequest",
   * "id": 5695,
   * "links": {
   * "self": {
   * "href": "https://api.bitbucket.org/2.0/repositories/atlassian/atlaskit-mk-2/pullrequests/5695"
   * },
   * "html": {
   * "href": "https://bitbucket.org/atlassian/atlaskit-mk-2/pull-requests/5695"
   * }
   * },
   * "title": "username/NONE: small change from onFocus to onClick to handle tabbing through the page and not expand the editor unless a click event triggers it"
   * }
   * }
   * ]
   * }
   * ```
   */
  getPullRequestActivity(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/activity",
      ...options
    });
  }
  /**
   * Unapprove a pull request
   *
   * Redact the authenticated user's approval of the specified pull
   * request.
   */
  deletePullRequestApproval(options) {
    return (options.client ?? this.client).delete({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/approve",
      ...options
    });
  }
  /**
   * Approve a pull request
   *
   * Approve the specified pull request as the authenticated user.
   */
  approvePullRequest(options) {
    return (options.client ?? this.client).post({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/approve",
      ...options
    });
  }
  /**
   * List comments on a pull request
   *
   * Returns a paginated list of the pull request's comments.
   *
   * This includes both global, inline comments and replies.
   *
   * The default sorting is oldest to newest and can be overridden with
   * the `sort` query parameter.
   *
   * This endpoint also supports filtering and sorting of the results. See
   * [filtering and sorting](/cloud/bitbucket/rest/intro/#filtering) for more
   * details.
   */
  listPullRequestComments(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/comments",
      ...options
    });
  }
  /**
   * Create a comment on a pull request
   *
   * Creates a new pull request comment.
   *
   * Returns the newly created pull request comment.
   */
  createPullRequestComment(options) {
    return (options.client ?? this.client).post({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/comments",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * Delete a comment on a pull request
   *
   * Deletes a specific pull request comment.
   */
  deletePullRequestComment(options) {
    return (options.client ?? this.client).delete({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/comments/{comment_id}",
      ...options
    });
  }
  /**
   * Get a comment on a pull request
   *
   * Returns a specific pull request comment.
   */
  getPullRequestComment(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/comments/{comment_id}",
      ...options
    });
  }
  /**
   * Update a comment on a pull request
   *
   * Updates a specific pull request comment.
   */
  updatePullRequestComment(options) {
    return (options.client ?? this.client).put({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/comments/{comment_id}",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * Reopen a comment thread
   */
  unresolvePullRequestComment(options) {
    return (options.client ?? this.client).delete({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/comments/{comment_id}/resolve",
      ...options
    });
  }
  /**
   * Resolve a comment thread
   */
  resolvePullRequestComment(options) {
    return (options.client ?? this.client).post({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/comments/{comment_id}/resolve",
      ...options
    });
  }
  /**
   * List commits on a pull request
   *
   * Returns a paginated list of the pull request's commits.
   *
   * These are the commits that are being merged into the destination
   * branch when the pull requests gets accepted.
   */
  listPullRequestCommits(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/commits",
      ...options
    });
  }
  /**
   * Decline a pull request
   *
   * Declines the pull request.
   */
  declinePullRequest(options) {
    return (options.client ?? this.client).post({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/decline",
      ...options
    });
  }
  /**
   * List changes in a pull request
   *
   * Redirects to the [repository diff](/cloud/bitbucket/rest/api-group-commits/#api-repositories-workspace-repo-slug-diff-spec-get)
   * with the revspec that corresponds to the pull request.
   */
  getPullRequestDiff(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/diff",
      ...options
    });
  }
  /**
   * Get the diff stat for a pull request
   *
   * Redirects to the [repository diffstat](/cloud/bitbucket/rest/api-group-commits/#api-repositories-workspace-repo-slug-diffstat-spec-get)
   * with the revspec that corresponds to the pull request.
   */
  getPullRequestDiffstat(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/diffstat",
      ...options
    });
  }
  /**
   * Merge a pull request
   *
   * Merges the pull request.
   */
  mergePullRequest(options) {
    return (options.client ?? this.client).post({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/merge",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * Get the merge task status for a pull request
   *
   * When merging a pull request takes too long, the client receives a
   * task ID along with a 202 status code. The task ID can be used in a call
   * to this endpoint to check the status of a merge task.
   *
   * ```
   * curl -X GET https://api.bitbucket.org/2.0/repositories/atlassian/bitbucket/pullrequests/2286/merge/task-status/<task_id>
   * ```
   *
   * If the merge task is not yet finished, a PENDING status will be returned.
   *
   * ```
   * HTTP/2 200
   * {
   * "task_status": "PENDING",
   * "links": {
   * "self": {
   * "href": "https://api.bitbucket.org/2.0/repositories/atlassian/bitbucket/pullrequests/2286/merge/task-status/<task_id>"
   * }
   * }
   * }
   * ```
   *
   * If the merge was successful, a SUCCESS status will be returned.
   *
   * ```
   * HTTP/2 200
   * {
   * "task_status": "SUCCESS",
   * "links": {
   * "self": {
   * "href": "https://api.bitbucket.org/2.0/repositories/atlassian/bitbucket/pullrequests/2286/merge/task-status/<task_id>"
   * }
   * },
   * "merge_result": <the merged pull request object>
   * }
   * ```
   *
   * If the merge task failed, an error will be returned.
   *
   * ```
   * {
   * "type": "error",
   * "error": {
   * "message": "<error message>"
   * }
   * }
   * ```
   */
  getPullRequestMergeTaskStatus(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/merge/task-status/{task_id}",
      ...options
    });
  }
  /**
   * Get the patch for a pull request
   *
   * Redirects to the [repository patch](/cloud/bitbucket/rest/api-group-commits/#api-repositories-workspace-repo-slug-patch-spec-get)
   * with the revspec that corresponds to pull request.
   */
  getPullRequestPatch(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/patch",
      ...options
    });
  }
  /**
   * Remove change request for a pull request
   */
  deletePullRequestChangeRequest(options) {
    return (options.client ?? this.client).delete({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/request-changes",
      ...options
    });
  }
  /**
   * Request changes for a pull request
   */
  requestPullRequestChanges(options) {
    return (options.client ?? this.client).post({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/request-changes",
      ...options
    });
  }
  /**
   * List commit statuses for a pull request
   *
   * Returns all statuses (e.g. build results) for the given pull
   * request.
   */
  listPullRequestStatuses(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/statuses",
      ...options
    });
  }
  /**
   * List tasks on a pull request
   *
   * Returns a paginated list of the pull request's tasks.
   *
   * This endpoint supports filtering and sorting of the results by the 'task' field.
   * See [filtering and sorting](/cloud/bitbucket/rest/intro/#filtering) for more details.
   */
  listPullRequestTasks(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/tasks",
      ...options
    });
  }
  /**
   * Create a task on a pull request
   *
   * Creates a new pull request task.
   *
   * Returns the newly created pull request task.
   *
   * Tasks can optionally be created in relation to a comment specified by the comment's ID which
   * will cause the task to appear below the comment on a pull request when viewed in Bitbucket.
   */
  createPullRequestTask(options) {
    return (options.client ?? this.client).post({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/tasks",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * Delete a task on a pull request
   *
   * Deletes a specific pull request task.
   */
  deletePullRequestTask(options) {
    return (options.client ?? this.client).delete({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/tasks/{task_id}",
      ...options
    });
  }
  /**
   * Get a task on a pull request
   *
   * Returns a specific pull request task.
   */
  getPullRequestTask(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/tasks/{task_id}",
      ...options
    });
  }
  /**
   * Update a task on a pull request
   *
   * Updates a specific pull request task.
   */
  updatePullRequestTask(options) {
    return (options.client ?? this.client).put({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/tasks/{task_id}",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * Delete a pull request application property
   *
   * Delete an [application property](/cloud/bitbucket/application-properties/) value stored against a pull request.
   */
  deletePullRequestHostedPropertyValue(options) {
    return (options.client ?? this.client).delete({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pullrequests/{pullrequest_id}/properties/{app_key}/{property_name}",
      ...options
    });
  }
  /**
   * Get a pull request application property
   *
   * Retrieve an [application property](/cloud/bitbucket/application-properties/) value stored against a pull request.
   */
  getPullRequestHostedPropertyValue(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pullrequests/{pullrequest_id}/properties/{app_key}/{property_name}",
      ...options
    });
  }
  /**
   * Update a pull request application property
   *
   * Update an [application property](/cloud/bitbucket/application-properties/) value stored against a pull request.
   */
  updatePullRequestHostedPropertyValue(options) {
    return (options.client ?? this.client).put({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/pullrequests/{pullrequest_id}/properties/{app_key}/{property_name}",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * List branches and tags
   *
   * Returns the branches and tags in the repository.
   *
   * By default, results will be in the order the underlying source control system returns them and identical to
   * the ordering one sees when running "$ git show-ref". Note that this follows simple
   * lexical ordering of the ref names.
   *
   * This can be undesirable as it does apply any natural sorting semantics, meaning for instance that refs are
   * sorted ["branch1", "branch10", "branch2", "v10", "v11", "v9"] instead of ["branch1", "branch2",
   * "branch10", "v9", "v10", "v11"].
   *
   * Sorting can be changed using the ?sort= query parameter. When using ?sort=name to explicitly sort on ref name,
   * Bitbucket will apply natural sorting and interpret numerical values as numbers instead of strings.
   */
  listRefs(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/refs",
      ...options
    });
  }
  /**
   * List open branches
   *
   * Returns a list of all open branches within the specified repository.
   * Results will be in the order the source control manager returns them.
   *
   * Branches support [filtering and sorting](/cloud/bitbucket/rest/intro/#filtering)
   * that can be used to search for specific branches. For instance, to find
   * all branches that have "stab" in their name:
   *
   * ```
   * curl -s https://api.bitbucket.org/2.0/repositories/atlassian/aui/refs/branches -G --data-urlencode 'q=name ~ "stab"'
   * ```
   *
   * By default, results will be in the order the underlying source control system returns them and identical to
   * the ordering one sees when running "$ git branch --list". Note that this follows simple
   * lexical ordering of the ref names.
   *
   * This can be undesirable as it does apply any natural sorting semantics, meaning for instance that tags are
   * sorted ["v10", "v11", "v9"] instead of ["v9", "v10", "v11"].
   *
   * Sorting can be changed using the ?q= query parameter. When using ?q=name to explicitly sort on ref name,
   * Bitbucket will apply natural sorting and interpret numerical values as numbers instead of strings.
   */
  listBranches(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/refs/branches",
      ...options
    });
  }
  /**
   * Create a branch
   *
   * Creates a new branch in the specified repository.
   *
   * The payload of the POST should consist of a JSON document that
   * contains the name of the tag and the target hash.
   *
   * ```
   * curl https://api.bitbucket.org/2.0/repositories/seanfarley/hg/refs/branches \
   * -s -u seanfarley -X POST -H "Content-Type: application/json" \
   * -d '{
   * "name" : "smf/create-feature",
   * "target" : {
   * "hash" : "default",
   * }
   * }'
   * ```
   *
   * This call requires authentication. Private repositories require the
   * caller to authenticate with an account that has appropriate
   * authorization.
   *
   * The branch name should not include any prefixes (e.g.
   * refs/heads). This endpoint does support using short hash prefixes for
   * the commit hash, but it may return a 400 response if the provided
   * prefix is ambiguous. Using a full commit hash is the preferred
   * approach.
   */
  createBranch(options) {
    return (options.client ?? this.client).post({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/refs/branches",
      ...options
    });
  }
  /**
   * Delete a branch
   *
   * Delete a branch in the specified repository.
   *
   * The main branch is not allowed to be deleted and will return a 400
   * response.
   *
   * The branch name should not include any prefixes (e.g.
   * refs/heads).
   */
  deleteBranch(options) {
    return (options.client ?? this.client).delete({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/refs/branches/{name}",
      ...options
    });
  }
  /**
   * Get a branch
   *
   * Returns a branch object within the specified repository.
   *
   * This call requires authentication. Private repositories require the
   * caller to authenticate with an account that has appropriate
   * authorization.
   *
   * For Git, the branch name should not include any prefixes (e.g.
   * refs/heads).
   */
  getBranch(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/refs/branches/{name}",
      ...options
    });
  }
  /**
   * List tags
   *
   * Returns the tags in the repository.
   *
   * By default, results will be in the order the underlying source control system returns them and identical to
   * the ordering one sees when running "$ git tag --list". Note that this follows simple
   * lexical ordering of the ref names.
   *
   * This can be undesirable as it does apply any natural sorting semantics, meaning for instance that tags are
   * sorted ["v10", "v11", "v9"] instead of ["v9", "v10", "v11"].
   *
   * Sorting can be changed using the ?sort= query parameter. When using ?sort=name to explicitly sort on ref name,
   * Bitbucket will apply natural sorting and interpret numerical values as numbers instead of strings.
   */
  listTags(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/refs/tags",
      ...options
    });
  }
  /**
   * Create a tag
   *
   * Creates a new tag in the specified repository.
   *
   * The payload of the POST should consist of a JSON document that
   * contains the name of the tag and the target hash.
   *
   * ```
   * curl https://api.bitbucket.org/2.0/repositories/jdoe/myrepo/refs/tags \
   * -s -u jdoe -X POST -H "Content-Type: application/json" \
   * -d '{
   * "name" : "new-tag-name",
   * "target" : {
   * "hash" : "a1b2c3d4e5f6",
   * }
   * }'
   * ```
   *
   * This endpoint does support using short hash prefixes for the commit
   * hash, but it may return a 400 response if the provided prefix is
   * ambiguous. Using a full commit hash is the preferred approach.
   */
  createTag(options) {
    return (options.client ?? this.client).post({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/refs/tags",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * Delete a tag
   *
   * Delete a tag in the specified repository.
   *
   * The tag name should not include any prefixes (e.g. refs/tags).
   */
  deleteTag(options) {
    return (options.client ?? this.client).delete({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/refs/tags/{name}",
      ...options
    });
  }
  /**
   * Get a tag
   *
   * Returns the specified tag.
   *
   * ```
   * $ curl -s https://api.bitbucket.org/2.0/repositories/seanfarley/hg/refs/tags/3.8 -G | jq .
   * {
   * "name": "3.8",
   * "links": {
   * "commits": {
   * "href": "https://api.bitbucket.org/2.0/repositories/seanfarley/hg/commits/3.8"
   * },
   * "self": {
   * "href": "https://api.bitbucket.org/2.0/repositories/seanfarley/hg/refs/tags/3.8"
   * },
   * "html": {
   * "href": "https://bitbucket.org/seanfarley/hg/commits/tag/3.8"
   * }
   * },
   * "tagger": {
   * "raw": "Matt Mackall <mpm@selenic.com>",
   * "type": "author",
   * "user": {
   * "username": "mpmselenic",
   * "nickname": "mpmselenic",
   * "display_name": "Matt Mackall",
   * "type": "user",
   * "uuid": "{a4934530-db4c-419c-a478-9ab4964c2ee7}",
   * "links": {
   * "self": {
   * "href": "https://api.bitbucket.org/2.0/users/mpmselenic"
   * },
   * "html": {
   * "href": "https://bitbucket.org/mpmselenic/"
   * },
   * "avatar": {
   * "href": "https://bitbucket.org/account/mpmselenic/avatar/32/"
   * }
   * }
   * }
   * },
   * "date": "2016-05-01T18:52:25+00:00",
   * "message": "Added tag 3.8 for changeset f85de28eae32",
   * "type": "tag",
   * "target": {
   * "hash": "f85de28eae32e7d3064b1a1321309071bbaaa069",
   * "repository": {
   * "links": {
   * "self": {
   * "href": "https://api.bitbucket.org/2.0/repositories/seanfarley/hg"
   * },
   * "html": {
   * "href": "https://bitbucket.org/seanfarley/hg"
   * },
   * "avatar": {
   * "href": "https://bitbucket.org/seanfarley/hg/avatar/32/"
   * }
   * },
   * "type": "repository",
   * "name": "hg",
   * "full_name": "seanfarley/hg",
   * "uuid": "{c75687fb-e99d-4579-9087-190dbd406d30}"
   * },
   * "links": {
   * "self": {
   * "href": "https://api.bitbucket.org/2.0/repositories/seanfarley/hg/commit/f85de28eae32e7d3064b1a1321309071bbaaa069"
   * },
   * "comments": {
   * "href": "https://api.bitbucket.org/2.0/repositories/seanfarley/hg/commit/f85de28eae32e7d3064b1a1321309071bbaaa069/comments"
   * },
   * "patch": {
   * "href": "https://api.bitbucket.org/2.0/repositories/seanfarley/hg/patch/f85de28eae32e7d3064b1a1321309071bbaaa069"
   * },
   * "html": {
   * "href": "https://bitbucket.org/seanfarley/hg/commits/f85de28eae32e7d3064b1a1321309071bbaaa069"
   * },
   * "diff": {
   * "href": "https://api.bitbucket.org/2.0/repositories/seanfarley/hg/diff/f85de28eae32e7d3064b1a1321309071bbaaa069"
   * },
   * "approve": {
   * "href": "https://api.bitbucket.org/2.0/repositories/seanfarley/hg/commit/f85de28eae32e7d3064b1a1321309071bbaaa069/approve"
   * },
   * "statuses": {
   * "href": "https://api.bitbucket.org/2.0/repositories/seanfarley/hg/commit/f85de28eae32e7d3064b1a1321309071bbaaa069/statuses"
   * }
   * },
   * "author": {
   * "raw": "Sean Farley <sean@farley.io>",
   * "type": "author",
   * "user": {
   * "username": "seanfarley",
   * "nickname": "seanfarley",
   * "display_name": "Sean Farley",
   * "type": "user",
   * "uuid": "{a295f8a8-5876-4d43-89b5-3ad8c6c3c51d}",
   * "links": {
   * "self": {
   * "href": "https://api.bitbucket.org/2.0/users/seanfarley"
   * },
   * "html": {
   * "href": "https://bitbucket.org/seanfarley/"
   * },
   * "avatar": {
   * "href": "https://bitbucket.org/account/seanfarley/avatar/32/"
   * }
   * }
   * }
   * },
   * "parents": [
   * {
   * "hash": "9a98d0e5b07fc60887f9d3d34d9ac7d536f470d2",
   * "type": "commit",
   * "links": {
   * "self": {
   * "href": "https://api.bitbucket.org/2.0/repositories/seanfarley/hg/commit/9a98d0e5b07fc60887f9d3d34d9ac7d536f470d2"
   * },
   * "html": {
   * "href": "https://bitbucket.org/seanfarley/hg/commits/9a98d0e5b07fc60887f9d3d34d9ac7d536f470d2"
   * }
   * }
   * }
   * ],
   * "date": "2016-05-01T04:21:17+00:00",
   * "message": "debian: alphabetize build deps",
   * "type": "commit"
   * }
   * }
   * ```
   */
  getTag(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/refs/tags/{name}",
      ...options
    });
  }
  /**
   * Get the root directory of the main branch
   *
   * This endpoint redirects the client to the directory listing of the
   * root directory on the main branch.
   *
   * This is equivalent to directly hitting
   * [/2.0/repositories/{username}/{repo_slug}/src/{commit}/{path}](src/%7Bcommit%7D/%7Bpath%7D)
   * without having to know the name or SHA1 of the repo's main branch.
   *
   * To create new commits, [POST to this endpoint](#post)
   */
  listSrcRoot(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/src",
      ...options
    });
  }
  /**
   * Create a commit by uploading a file
   *
   * This endpoint is used to create new commits in the repository by
   * uploading files.
   *
   * To add a new file to a repository:
   *
   * ```
   * $ curl https://api.bitbucket.org/2.0/repositories/username/slug/src \
   * -F /repo/path/to/image.png=@image.png
   * ```
   *
   * This will create a new commit on top of the main branch, inheriting the
   * contents of the main branch, but adding (or overwriting) the
   * `image.png` file to the repository in the `/repo/path/to` directory.
   *
   * To create a commit that deletes files, use the `files` parameter:
   *
   * ```
   * $ curl https://api.bitbucket.org/2.0/repositories/username/slug/src \
   * -F files=/file/to/delete/1.txt \
   * -F files=/file/to/delete/2.txt
   * ```
   *
   * You can add/modify/delete multiple files in a request. Rename/move a
   * file by deleting the old path and adding the content at the new path.
   *
   * This endpoint accepts `multipart/form-data` (as in the examples above),
   * as well as `application/x-www-form-urlencoded`.
   *
   * Note: `multipart/form-data` is currently not supported by Forge apps
   * for this API.
   *
   * #### multipart/form-data
   *
   * A `multipart/form-data` post contains a series of "form fields" that
   * identify both the individual files that are being uploaded, as well as
   * additional, optional meta data.
   *
   * Files are uploaded in file form fields (those that have a
   * `Content-Disposition` parameter) whose field names point to the remote
   * path in the repository where the file should be stored. Path field
   * names are always interpreted to be absolute from the root of the
   * repository, regardless whether the client uses a leading slash (as the
   * above `curl` example did).
   *
   * File contents are treated as bytes and are not decoded as text.
   *
   * The commit message, as well as other non-file meta data for the
   * request, is sent along as normal form field elements. Meta data fields
   * share the same namespace as the file objects. For `multipart/form-data`
   * bodies that should not lead to any ambiguity, as the
   * `Content-Disposition` header will contain the `filename` parameter to
   * distinguish between a file named "message" and the commit message field.
   *
   * #### application/x-www-form-urlencoded
   *
   * It is also possible to upload new files using a simple
   * `application/x-www-form-urlencoded` POST. This can be convenient when
   * uploading pure text files:
   *
   * ```
   * $ curl https://api.bitbucket.org/2.0/repositories/atlassian/bbql/src \
   * --data-urlencode "/path/to/me.txt=Lorem ipsum." \
   * --data-urlencode "message=Initial commit" \
   * --data-urlencode "author=Erik van Zijst <erik.van.zijst@gmail.com>"
   * ```
   *
   * There could be a field name clash if a client were to upload a file
   * named "message", as this filename clashes with the meta data property
   * for the commit message. To avoid this and to upload files whose names
   * clash with the meta data properties, use a leading slash for the files,
   * e.g. `curl --data-urlencode "/message=file contents"`.
   *
   * When an explicit slash is omitted for a file whose path matches that of
   * a meta data parameter, then it is interpreted as meta data, not as a
   * file.
   *
   * #### Executables and links
   *
   * While this API aims to facilitate the most common use cases, it is
   * possible to perform some more advanced operations like creating a new
   * symlink in the repository, or creating an executable file.
   *
   * Files can be supplied with a `x-attributes` value in the
   * `Content-Disposition` header. For example, to upload an executable
   * file, as well as create a symlink from `README.txt` to `README`:
   *
   * ```
   * --===============1438169132528273974==
   * Content-Type: text/plain; charset="us-ascii"
   * MIME-Version: 1.0
   * Content-Transfer-Encoding: 7bit
   * Content-ID: "bin/shutdown.sh"
   * Content-Disposition: attachment; filename="shutdown.sh"; x-attributes:"executable"
   *
   * #!/bin/sh
   * halt
   *
   * --===============1438169132528273974==
   * Content-Type: text/plain; charset="us-ascii"
   * MIME-Version: 1.0
   * Content-Transfer-Encoding: 7bit
   * Content-ID: "/README.txt"
   * Content-Disposition: attachment; filename="README.txt"; x-attributes:"link"
   *
   * README
   * --===============1438169132528273974==--
   * ```
   *
   * Links are files that contain the target path and have
   * `x-attributes:"link"` set.
   *
   * When overwriting links with files, or vice versa, the newly uploaded
   * file determines both the new contents, as well as the attributes. That
   * means uploading a file without specifying `x-attributes="link"` will
   * create a regular file, even if the parent commit hosted a symlink at
   * the same path.
   *
   * The same applies to executables. When modifying an existing executable
   * file, the form-data file element must include
   * `x-attributes="executable"` in order to preserve the executable status
   * of the file.
   *
   * Note that this API does not support the creation or manipulation of
   * subrepos / submodules.
   */
  createSrcFileCommit(options) {
    return (options.client ?? this.client).post({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/src",
      ...options
    });
  }
  /**
   * Get file or directory contents
   *
   * This endpoints is used to retrieve the contents of a single file,
   * or the contents of a directory at a specified revision.
   *
   * #### Raw file contents
   *
   * When `path` points to a file, this endpoint returns the raw contents.
   * The response's Content-Type is derived from the filename
   * extension (not from the contents). The file contents are not processed
   * and no character encoding/recoding is performed and as a result no
   * character encoding is included as part of the Content-Type.
   *
   * The `Content-Disposition` header will be "attachment" to prevent
   * browsers from running executable files.
   *
   * If the file is managed by LFS, then a 301 redirect pointing to
   * Atlassian's media services platform is returned.
   *
   * The response includes an ETag that is based on the contents of the file
   * and its attributes. This means that an empty `__init__.py` always
   * returns the same ETag, regardless on the directory it lives in, or the
   * commit it is on.
   *
   * #### File meta data
   *
   * When the request for a file path includes the query parameter
   * `?format=meta`, instead of returning the file's raw contents, Bitbucket
   * instead returns the JSON object describing the file's properties:
   *
   * ```javascript
   * $ curl https://api.bitbucket.org/2.0/repositories/atlassian/bbql/src/eefd5ef/tests/__init__.py?format=meta
   * {
   * "links": {
   * "self": {
   * "href": "https://api.bitbucket.org/2.0/repositories/atlassian/bbql/src/eefd5ef5d3df01aed629f650959d6706d54cd335/tests/__init__.py"
   * },
   * "meta": {
   * "href": "https://api.bitbucket.org/2.0/repositories/atlassian/bbql/src/eefd5ef5d3df01aed629f650959d6706d54cd335/tests/__init__.py?format=meta"
   * }
   * },
   * "path": "tests/__init__.py",
   * "commit": {
   * "type": "commit",
   * "hash": "eefd5ef5d3df01aed629f650959d6706d54cd335",
   * "links": {
   * "self": {
   * "href": "https://api.bitbucket.org/2.0/repositories/atlassian/bbql/commit/eefd5ef5d3df01aed629f650959d6706d54cd335"
   * },
   * "html": {
   * "href": "https://bitbucket.org/atlassian/bbql/commits/eefd5ef5d3df01aed629f650959d6706d54cd335"
   * }
   * }
   * },
   * "attributes": [],
   * "type": "commit_file",
   * "size": 0
   * }
   * ```
   *
   * File objects contain an `attributes` element that contains a list of
   * possible modifiers. Currently defined values are:
   *
   * * `link` -- indicates that the entry is a symbolic link. The contents
   * of the file represent the path the link points to.
   * * `executable` -- indicates that the file has the executable bit set.
   * * `subrepository` -- indicates that the entry points to a submodule or
   * subrepo. The contents of the file is the SHA1 of the repository
   * pointed to.
   * * `binary` -- indicates whether Bitbucket thinks the file is binary.
   *
   * This endpoint can provide an alternative to how a HEAD request can be
   * used to check for the existence of a file, or a file's size without
   * incurring the overhead of receiving its full contents.
   *
   *
   * #### Directory listings
   *
   * When `path` points to a directory instead of a file, the response is a
   * paginated list of directory and file objects in the same order as the
   * underlying SCM system would return them.
   *
   * For example:
   *
   * ```javascript
   * $ curl https://api.bitbucket.org/2.0/repositories/atlassian/bbql/src/eefd5ef/tests
   * {
   * "pagelen": 10,
   * "values": [
   * {
   * "path": "tests/test_project",
   * "type": "commit_directory",
   * "links": {
   * "self": {
   * "href": "https://api.bitbucket.org/2.0/repositories/atlassian/bbql/src/eefd5ef5d3df01aed629f650959d6706d54cd335/tests/test_project/"
   * },
   * "meta": {
   * "href": "https://api.bitbucket.org/2.0/repositories/atlassian/bbql/src/eefd5ef5d3df01aed629f650959d6706d54cd335/tests/test_project/?format=meta"
   * }
   * },
   * "commit": {
   * "type": "commit",
   * "hash": "eefd5ef5d3df01aed629f650959d6706d54cd335",
   * "links": {
   * "self": {
   * "href": "https://api.bitbucket.org/2.0/repositories/atlassian/bbql/commit/eefd5ef5d3df01aed629f650959d6706d54cd335"
   * },
   * "html": {
   * "href": "https://bitbucket.org/atlassian/bbql/commits/eefd5ef5d3df01aed629f650959d6706d54cd335"
   * }
   * }
   * }
   * },
   * {
   * "links": {
   * "self": {
   * "href": "https://api.bitbucket.org/2.0/repositories/atlassian/bbql/src/eefd5ef5d3df01aed629f650959d6706d54cd335/tests/__init__.py"
   * },
   * "meta": {
   * "href": "https://api.bitbucket.org/2.0/repositories/atlassian/bbql/src/eefd5ef5d3df01aed629f650959d6706d54cd335/tests/__init__.py?format=meta"
   * }
   * },
   * "path": "tests/__init__.py",
   * "commit": {
   * "type": "commit",
   * "hash": "eefd5ef5d3df01aed629f650959d6706d54cd335",
   * "links": {
   * "self": {
   * "href": "https://api.bitbucket.org/2.0/repositories/atlassian/bbql/commit/eefd5ef5d3df01aed629f650959d6706d54cd335"
   * },
   * "html": {
   * "href": "https://bitbucket.org/atlassian/bbql/commits/eefd5ef5d3df01aed629f650959d6706d54cd335"
   * }
   * }
   * },
   * "attributes": [],
   * "type": "commit_file",
   * "size": 0
   * }
   * ],
   * "page": 1,
   * "size": 2
   * }
   * ```
   *
   * When listing the contents of the repo's root directory, the use of a
   * trailing slash at the end of the URL is required.
   *
   * The response by default is not recursive, meaning that only the direct contents of
   * a path are returned. The response does not recurse down into
   * subdirectories. In order to "walk" the entire directory tree, the
   * client can either parse each response and follow the `self` links of each
   * `commit_directory` object, or can specify a `max_depth` to recurse to.
   *
   * The max_depth parameter will do a breadth-first search to return the contents of the subdirectories
   * up to the depth specified. Breadth-first search was chosen as it leads to the least amount of
   * file system operations for git. If the `max_depth` parameter is specified to be too
   * large, the call will time out and return a 555.
   *
   * Each returned object is either a `commit_file`, or a `commit_directory`,
   * both of which contain a `path` element. This path is the absolute path
   * from the root of the repository. Each object also contains a `commit`
   * object which embeds the commit the file is on. Note that this is merely
   * the commit that was used in the URL. It is *not* the commit that last
   * modified the file.
   *
   * Directory objects have 2 representations. Their `self` link returns the
   * paginated contents of the directory. The `meta` link on the other hand
   * returns the actual `directory` object itself, e.g.:
   *
   * ```javascript
   * {
   * "path": "tests/test_project",
   * "type": "commit_directory",
   * "links": {
   * "self": {
   * "href": "https://api.bitbucket.org/2.0/repositories/atlassian/bbql/src/eefd5ef5d3df01aed629f650959d6706d54cd335/tests/test_project/"
   * },
   * "meta": {
   * "href": "https://api.bitbucket.org/2.0/repositories/atlassian/bbql/src/eefd5ef5d3df01aed629f650959d6706d54cd335/tests/test_project/?format=meta"
   * }
   * },
   * "commit": { ... }
   * }
   * ```
   *
   * #### Querying, filtering and sorting
   *
   * Like most API endpoints, this API supports the Bitbucket
   * querying/filtering syntax and so you could filter a directory listing
   * to only include entries that match certain criteria. For instance, to
   * list all binary files over 1kb use the expression:
   *
   * `size > 1024 and attributes = "binary"`
   *
   * which after urlencoding yields the query string:
   *
   * `?q=size%3E1024+and+attributes%3D%22binary%22`
   *
   * To change the ordering of the response, use the `?sort` parameter:
   *
   * `.../src/eefd5ef/?sort=-size`
   *
   * See [filtering and sorting](/cloud/bitbucket/rest/intro/#filtering) for more
   * details.
   */
  getSrcFile(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/src/{commit}/{path}",
      ...options
    });
  }
  /**
   * List defined versions for issues
   *
   * Returns the versions that have been defined in the issue tracker.
   *
   * This resource is only available on repositories that have the issue
   * tracker enabled.
   *
   * @deprecated
   */
  listVersions(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/versions",
      ...options
    });
  }
  /**
   * Get a defined version for issues
   *
   * Returns the specified issue tracker version object.
   *
   * @deprecated
   */
  getVersion(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/versions/{version_id}",
      ...options
    });
  }
  /**
   * List repositories watchers
   *
   * Returns a paginated list of all the watchers on the specified
   * repository.
   */
  listRepoWatchers(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/repositories/{workspace}/{repo_slug}/watchers",
      ...options
    });
  }
  /**
   * List snippets
   *
   * **This endpoint is deprecated. Please use the
   * [workspace scoped alternative](/cloud/bitbucket/rest/api-group-snippets/#api-snippets-workspace-get).**
   *
   * Returns all snippets. Like pull requests, repositories and workspaces, the
   * full set of snippets is defined by what the current user has access to.
   *
   * This includes all snippets owned by any of the workspaces the user is a member of,
   * or snippets by other users that the current user is either watching or has collaborated
   * on (for instance by commenting on it).
   *
   * To limit the set of returned snippets, apply the
   * `?role=[owner|contributor|member]` query parameter where the roles are
   * defined as follows:
   *
   * * `owner`: all snippets owned by the current user
   * * `contributor`: all snippets owned by, or watched by the current user
   * * `member`: created in a workspaces or watched by the current user
   *
   * When no role is specified, all public snippets are returned, as well as all
   * privately owned snippets watched or commented on.
   *
   * The returned response is a normal paginated JSON list. This endpoint
   * only supports `application/json` responses and no
   * `multipart/form-data` or `multipart/related`. As a result, it is not
   * possible to include the file contents.
   *
   * @deprecated
   */
  listSnippets(options) {
    return (options?.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/snippets",
      ...options
    });
  }
  /**
   * Create a snippet
   *
   * Creates a new snippet under the authenticated user's account.
   *
   * Snippets can contain multiple files. Both text and binary files are
   * supported.
   *
   * The simplest way to create a new snippet from a local file:
   *
   * $ curl -u username:password -X POST https://api.bitbucket.org/2.0/snippets               -F file=@image.png
   *
   * Creating snippets through curl has a few limitations and so let's look
   * at a more complicated scenario.
   *
   * Snippets are created with a multipart POST. Both `multipart/form-data`
   * and `multipart/related` are supported. Both allow the creation of
   * snippets with both meta data (title, etc), as well as multiple text
   * and binary files.
   *
   * The main difference is that `multipart/related` can use rich encoding
   * for the meta data (currently JSON).
   *
   *
   * multipart/related (RFC-2387)
   * ----------------------------
   *
   * This is the most advanced and efficient way to create a paste.
   *
   * POST /2.0/snippets/evzijst HTTP/1.1
   * Content-Length: 1188
   * Content-Type: multipart/related; start="snippet"; boundary="===============1438169132528273974=="
   * MIME-Version: 1.0
   *
   * --===============1438169132528273974==
   * Content-Type: application/json; charset="utf-8"
   * MIME-Version: 1.0
   * Content-ID: snippet
   *
   * {
   * "title": "My snippet",
   * "is_private": true,
   * "scm": "git",
   * "files": {
   * "foo.txt": {},
   * "image.png": {}
   * }
   * }
   *
   * --===============1438169132528273974==
   * Content-Type: text/plain; charset="us-ascii"
   * MIME-Version: 1.0
   * Content-Transfer-Encoding: 7bit
   * Content-ID: "foo.txt"
   * Content-Disposition: attachment; filename="foo.txt"
   *
   * foo
   *
   * --===============1438169132528273974==
   * Content-Type: image/png
   * MIME-Version: 1.0
   * Content-Transfer-Encoding: base64
   * Content-ID: "image.png"
   * Content-Disposition: attachment; filename="image.png"
   *
   * iVBORw0KGgoAAAANSUhEUgAAABQAAAAoCAYAAAD+MdrbAAABD0lEQVR4Ae3VMUoDQRTG8ccUaW2m
   * TKONFxArJYJamCvkCnZTaa+VnQdJSBFl2SMsLFrEWNjZBZs0JgiL/+KrhhVmJRbCLPx4O+/DT2TB
   * cbblJxf+UWFVVRNsEGAtgvJxnLm2H+A5RQ93uIl+3632PZyl/skjfOn9Gvdwmlcw5aPUwimG+NT5
   * EnNN036IaZePUuIcK533NVfal7/5yjWeot2z9ta1cAczHEf7I+3J0ws9Cgx0fsOFpmlfwKcWPuBQ
   * 73Oc4FHzBaZ8llq4q1mr5B2mOUCt815qYR8eB1hG2VJ7j35q4RofaH7IG+Xrf/PfJhfmwtfFYoIN
   * AqxFUD6OMxcvkO+UfKfkOyXfKdsv/AYCHMLVkHAFWgAAAABJRU5ErkJggg==
   * --===============1438169132528273974==--
   *
   * The request contains multiple parts and is structured as follows.
   *
   * The first part is the JSON document that describes the snippet's
   * properties or meta data. It either has to be the first part, or the
   * request's `Content-Type` header must contain the `start` parameter to
   * point to it.
   *
   * The remaining parts are the files of which there can be zero or more.
   * Each file part should contain the `Content-ID` MIME header through
   * which the JSON meta data's `files` element addresses it. The value
   * should be the name of the file.
   *
   * `Content-Disposition` is an optional MIME header. The header's
   * optional `filename` parameter can be used to specify the file name
   * that Bitbucket should use when writing the file to disk. When present,
   * `filename` takes precedence over the value of `Content-ID`.
   *
   * When the JSON body omits the `files` element, the remaining parts are
   * not ignored. Instead, each file is added to the new snippet as if its
   * name was explicitly linked (the use of the `files` elements is
   * mandatory for some operations like deleting or renaming files).
   *
   *
   * multipart/form-data
   * -------------------
   *
   * The use of JSON for the snippet's meta data is optional. Meta data can
   * also be supplied as regular form fields in a more conventional
   * `multipart/form-data` request:
   *
   * $ curl -X POST -u credentials https://api.bitbucket.org/2.0/snippets               -F title="My snippet"               -F file=@foo.txt -F file=@image.png
   *
   * POST /2.0/snippets HTTP/1.1
   * Content-Length: 951
   * Content-Type: multipart/form-data; boundary=----------------------------63a4b224c59f
   *
   * ------------------------------63a4b224c59f
   * Content-Disposition: form-data; name="file"; filename="foo.txt"
   * Content-Type: text/plain
   *
   * foo
   *
   * ------------------------------63a4b224c59f
   * Content-Disposition: form-data; name="file"; filename="image.png"
   * Content-Type: application/octet-stream
   *
   * ?PNG
   *
   * IHDR?1??I.....
   * ------------------------------63a4b224c59f
   * Content-Disposition: form-data; name="title"
   *
   * My snippet
   * ------------------------------63a4b224c59f--
   *
   * Here the meta data properties are included as flat, top-level form
   * fields. The file attachments use the `file` field name. To attach
   * multiple files, simply repeat the field.
   *
   * The advantage of `multipart/form-data` over `multipart/related` is
   * that it can be easier to build clients.
   *
   * Essentially all properties are optional, `title` and `files` included.
   *
   *
   * Sharing and Visibility
   * ----------------------
   *
   * Snippets can be either public (visible to anyone on Bitbucket, as well
   * as anonymous users), or private (visible only to members of the workspace).
   * This is controlled through the snippet's `is_private` element:
   *
   * * **is_private=false** -- everyone, including anonymous users can view
   * the snippet
   * * **is_private=true** -- only workspace members can view the snippet
   *
   * To create the snippet under a workspace, just append the workspace ID
   * to the URL. See [`/2.0/snippets/{workspace}`](/cloud/bitbucket/rest/api-group-snippets/#api-snippets-workspace-post).
   */
  createSnippet(options) {
    return (options.client ?? this.client).post({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/snippets",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * List snippets in a workspace
   *
   * Identical to [`/snippets`](/cloud/bitbucket/rest/api-group-snippets/#api-snippets-get), except that the result is further filtered
   * by the snippet owner and only those that are owned by `{workspace}` are
   * returned.
   */
  listWorkspaceSnippets(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/snippets/{workspace}",
      ...options
    });
  }
  /**
   * Create a snippet for a workspace
   *
   * Identical to [`/snippets`](/cloud/bitbucket/rest/api-group-snippets/#api-snippets-post), except that the new snippet will be
   * created under the workspace specified in the path parameter
   * `{workspace}`.
   */
  createWorkspaceSnippet(options) {
    return (options.client ?? this.client).post({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/snippets/{workspace}",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * Delete a snippet
   *
   * Deletes a snippet and returns an empty response.
   */
  deleteSnippet(options) {
    return (options.client ?? this.client).delete({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/snippets/{workspace}/{encoded_id}",
      ...options
    });
  }
  /**
   * Get a snippet
   *
   * Retrieves a single snippet.
   *
   * Snippets support multiple content types:
   *
   * * application/json
   * * multipart/related
   * * multipart/form-data
   *
   *
   * application/json
   * ----------------
   *
   * The default content type of the response is `application/json`.
   * Since JSON is always `utf-8`, it cannot reliably contain file contents
   * for files that are not text. Therefore, JSON snippet documents only
   * contain the filename and links to the file contents.
   *
   * This means that in order to retrieve all parts of a snippet, N+1
   * requests need to be made (where N is the number of files in the
   * snippet).
   *
   *
   * multipart/related
   * -----------------
   *
   * To retrieve an entire snippet in a single response, use the
   * `Accept: multipart/related` HTTP request header.
   *
   * $ curl -H "Accept: multipart/related" https://api.bitbucket.org/2.0/snippets/evzijst/1
   *
   * Response:
   *
   * HTTP/1.1 200 OK
   * Content-Length: 2214
   * Content-Type: multipart/related; start="snippet"; boundary="===============1438169132528273974=="
   * MIME-Version: 1.0
   *
   * --===============1438169132528273974==
   * Content-Type: application/json; charset="utf-8"
   * MIME-Version: 1.0
   * Content-ID: snippet
   *
   * {
   * "links": {
   * "self": {
   * "href": "https://api.bitbucket.org/2.0/snippets/evzijst/kypj"
   * },
   * "html": {
   * "href": "https://bitbucket.org/snippets/evzijst/kypj"
   * },
   * "comments": {
   * "href": "https://api.bitbucket.org/2.0/snippets/evzijst/kypj/comments"
   * },
   * "watchers": {
   * "href": "https://api.bitbucket.org/2.0/snippets/evzijst/kypj/watchers"
   * },
   * "commits": {
   * "href": "https://api.bitbucket.org/2.0/snippets/evzijst/kypj/commits"
   * }
   * },
   * "id": kypj,
   * "title": "My snippet",
   * "created_on": "2014-12-29T22:22:04.790331+00:00",
   * "updated_on": "2014-12-29T22:22:04.790331+00:00",
   * "is_private": false,
   * "files": {
   * "foo.txt": {
   * "links": {
   * "self": {
   * "href": "https://api.bitbucket.org/2.0/snippets/evzijst/kypj/files/367ab19/foo.txt"
   * },
   * "html": {
   * "href": "https://bitbucket.org/snippets/evzijst/kypj#file-foo.txt"
   * }
   * }
   * },
   * "image.png": {
   * "links": {
   * "self": {
   * "href": "https://api.bitbucket.org/2.0/snippets/evzijst/kypj/files/367ab19/image.png"
   * },
   * "html": {
   * "href": "https://bitbucket.org/snippets/evzijst/kypj#file-image.png"
   * }
   * }
   * }
   * ],
   * "owner": {
   * "username": "evzijst",
   * "nickname": "evzijst",
   * "display_name": "Erik van Zijst",
   * "uuid": "{d301aafa-d676-4ee0-88be-962be7417567}",
   * "links": {
   * "self": {
   * "href": "https://api.bitbucket.org/2.0/users/evzijst"
   * },
   * "html": {
   * "href": "https://bitbucket.org/evzijst"
   * },
   * "avatar": {
   * "href": "https://bitbucket-staging-assetroot.s3.amazonaws.com/c/photos/2013/Jul/31/erik-avatar-725122544-0_avatar.png"
   * }
   * }
   * },
   * "creator": {
   * "username": "evzijst",
   * "nickname": "evzijst",
   * "display_name": "Erik van Zijst",
   * "uuid": "{d301aafa-d676-4ee0-88be-962be7417567}",
   * "links": {
   * "self": {
   * "href": "https://api.bitbucket.org/2.0/users/evzijst"
   * },
   * "html": {
   * "href": "https://bitbucket.org/evzijst"
   * },
   * "avatar": {
   * "href": "https://bitbucket-staging-assetroot.s3.amazonaws.com/c/photos/2013/Jul/31/erik-avatar-725122544-0_avatar.png"
   * }
   * }
   * }
   * }
   *
   * --===============1438169132528273974==
   * Content-Type: text/plain; charset="us-ascii"
   * MIME-Version: 1.0
   * Content-Transfer-Encoding: 7bit
   * Content-ID: "foo.txt"
   * Content-Disposition: attachment; filename="foo.txt"
   *
   * foo
   *
   * --===============1438169132528273974==
   * Content-Type: image/png
   * MIME-Version: 1.0
   * Content-Transfer-Encoding: base64
   * Content-ID: "image.png"
   * Content-Disposition: attachment; filename="image.png"
   *
   * iVBORw0KGgoAAAANSUhEUgAAABQAAAAoCAYAAAD+MdrbAAABD0lEQVR4Ae3VMUoDQRTG8ccUaW2m
   * TKONFxArJYJamCvkCnZTaa+VnQdJSBFl2SMsLFrEWNjZBZs0JgiL/+KrhhVmJRbCLPx4O+/DT2TB
   * cbblJxf+UWFVVRNsEGAtgvJxnLm2H+A5RQ93uIl+3632PZyl/skjfOn9Gvdwmlcw5aPUwimG+NT5
   * EnNN036IaZePUuIcK533NVfal7/5yjWeot2z9ta1cAczHEf7I+3J0ws9Cgx0fsOFpmlfwKcWPuBQ
   * 73Oc4FHzBaZ8llq4q1mr5B2mOUCt815qYR8eB1hG2VJ7j35q4RofaH7IG+Xrf/PfJhfmwtfFYoIN
   * AqxFUD6OMxcvkO+UfKfkOyXfKdsv/AYCHMLVkHAFWgAAAABJRU5ErkJggg==
   * --===============1438169132528273974==--
   *
   * multipart/form-data
   * -------------------
   *
   * As with creating new snippets, `multipart/form-data` can be used as an
   * alternative to `multipart/related`. However, the inherently flat
   * structure of form-data means that only basic, root-level properties
   * can be returned, while nested elements like `links` are omitted:
   *
   * $ curl -H "Accept: multipart/form-data" https://api.bitbucket.org/2.0/snippets/evzijst/kypj
   *
   * Response:
   *
   * HTTP/1.1 200 OK
   * Content-Length: 951
   * Content-Type: multipart/form-data; boundary=----------------------------63a4b224c59f
   *
   * ------------------------------63a4b224c59f
   * Content-Disposition: form-data; name="title"
   * Content-Type: text/plain; charset="utf-8"
   *
   * My snippet
   * ------------------------------63a4b224c59f--
   * Content-Disposition: attachment; name="file"; filename="foo.txt"
   * Content-Type: text/plain
   *
   * foo
   *
   * ------------------------------63a4b224c59f
   * Content-Disposition: attachment; name="file"; filename="image.png"
   * Content-Transfer-Encoding: base64
   * Content-Type: application/octet-stream
   *
   * iVBORw0KGgoAAAANSUhEUgAAABQAAAAoCAYAAAD+MdrbAAABD0lEQVR4Ae3VMUoDQRTG8ccUaW2m
   * TKONFxArJYJamCvkCnZTaa+VnQdJSBFl2SMsLFrEWNjZBZs0JgiL/+KrhhVmJRbCLPx4O+/DT2TB
   * cbblJxf+UWFVVRNsEGAtgvJxnLm2H+A5RQ93uIl+3632PZyl/skjfOn9Gvdwmlcw5aPUwimG+NT5
   * EnNN036IaZePUuIcK533NVfal7/5yjWeot2z9ta1cAczHEf7I+3J0ws9Cgx0fsOFpmlfwKcWPuBQ
   * 73Oc4FHzBaZ8llq4q1mr5B2mOUCt815qYR8eB1hG2VJ7j35q4RofaH7IG+Xrf/PfJhfmwtfFYoIN
   * AqxFUD6OMxcvkO+UfKfkOyXfKdsv/AYCHMLVkHAFWgAAAABJRU5ErkJggg==
   * ------------------------------5957323a6b76--
   */
  getSnippet(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/snippets/{workspace}/{encoded_id}",
      ...options
    });
  }
  /**
   * Update a snippet
   *
   * Used to update a snippet. Use this to add and delete files and to
   * change a snippet's title.
   *
   * To update a snippet, one can either PUT a full snapshot, or only the
   * parts that need to be changed.
   *
   * The contract for PUT on this API is that properties missing from the
   * request remain untouched so that snippets can be efficiently
   * manipulated with differential payloads.
   *
   * To delete a property (e.g. the title, or a file), include its name in
   * the request, but omit its value (use `null`).
   *
   * As in Git, explicit renaming of files is not supported. Instead, to
   * rename a file, delete it and add it again under another name. This can
   * be done atomically in a single request. Rename detection is left to
   * the SCM.
   *
   * PUT supports three different content types for both request and
   * response bodies:
   *
   * * `application/json`
   * * `multipart/related`
   * * `multipart/form-data`
   *
   * The content type used for the request body can be different than that
   * used for the response. Content types are specified using standard HTTP
   * headers.
   *
   * Use the `Content-Type` and `Accept` headers to select the desired
   * request and response format.
   *
   *
   * application/json
   * ----------------
   *
   * As with creation and retrieval, the content type determines what
   * properties can be manipulated. `application/json` does not support
   * file contents and is therefore limited to a snippet's meta data.
   *
   * To update the title, without changing any of its files:
   *
   * $ curl -X POST -H "Content-Type: application/json" https://api.bitbucket.org/2.0/snippets/evzijst/kypj             -d '{"title": "Updated title"}'
   *
   *
   * To delete the title:
   *
   * $ curl -X POST -H "Content-Type: application/json" https://api.bitbucket.org/2.0/snippets/evzijst/kypj             -d '{"title": null}'
   *
   * Not all parts of a snippet can be manipulated. The owner and creator
   * for instance are immutable.
   *
   *
   * multipart/related
   * -----------------
   *
   * `multipart/related` can be used to manipulate all of a snippet's
   * properties. The body is identical to a POST. properties omitted from
   * the request are left unchanged. Since the `start` part contains JSON,
   * the mechanism for manipulating the snippet's meta data is identical
   * to `application/json` requests.
   *
   * To update one of a snippet's file contents, while also changing its
   * title:
   *
   * PUT /2.0/snippets/evzijst/kypj HTTP/1.1
   * Content-Length: 288
   * Content-Type: multipart/related; start="snippet"; boundary="===============1438169132528273974=="
   * MIME-Version: 1.0
   *
   * --===============1438169132528273974==
   * Content-Type: application/json; charset="utf-8"
   * MIME-Version: 1.0
   * Content-ID: snippet
   *
   * {
   * "title": "My updated snippet",
   * "files": {
   * "foo.txt": {}
   * }
   * }
   *
   * --===============1438169132528273974==
   * Content-Type: text/plain; charset="us-ascii"
   * MIME-Version: 1.0
   * Content-Transfer-Encoding: 7bit
   * Content-ID: "foo.txt"
   * Content-Disposition: attachment; filename="foo.txt"
   *
   * Updated file contents.
   *
   * --===============1438169132528273974==--
   *
   * Here only the parts that are changed are included in the body. The
   * other files remain untouched.
   *
   * Note the use of the `files` list in the JSON part. This list contains
   * the files that are being manipulated. This list should have
   * corresponding multiparts in the request that contain the new contents
   * of these files.
   *
   * If a filename in the `files` list does not have a corresponding part,
   * it will be deleted from the snippet, as shown below:
   *
   * PUT /2.0/snippets/evzijst/kypj HTTP/1.1
   * Content-Length: 188
   * Content-Type: multipart/related; start="snippet"; boundary="===============1438169132528273974=="
   * MIME-Version: 1.0
   *
   * --===============1438169132528273974==
   * Content-Type: application/json; charset="utf-8"
   * MIME-Version: 1.0
   * Content-ID: snippet
   *
   * {
   * "files": {
   * "image.png": {}
   * }
   * }
   *
   * --===============1438169132528273974==--
   *
   * To simulate a rename, delete a file and add the same file under
   * another name:
   *
   * PUT /2.0/snippets/evzijst/kypj HTTP/1.1
   * Content-Length: 212
   * Content-Type: multipart/related; start="snippet"; boundary="===============1438169132528273974=="
   * MIME-Version: 1.0
   *
   * --===============1438169132528273974==
   * Content-Type: application/json; charset="utf-8"
   * MIME-Version: 1.0
   * Content-ID: snippet
   *
   * {
   * "files": {
   * "foo.txt": {},
   * "bar.txt": {}
   * }
   * }
   *
   * --===============1438169132528273974==
   * Content-Type: text/plain; charset="us-ascii"
   * MIME-Version: 1.0
   * Content-Transfer-Encoding: 7bit
   * Content-ID: "bar.txt"
   * Content-Disposition: attachment; filename="bar.txt"
   *
   * foo
   *
   * --===============1438169132528273974==--
   *
   *
   * multipart/form-data
   * -----------------
   *
   * Again, one can also use `multipart/form-data` to manipulate file
   * contents and meta data atomically.
   *
   * $ curl -X PUT http://localhost:12345/2.0/snippets/evzijst/kypj             -F title="My updated snippet" -F file=@foo.txt
   *
   * PUT /2.0/snippets/evzijst/kypj HTTP/1.1
   * Content-Length: 351
   * Content-Type: multipart/form-data; boundary=----------------------------63a4b224c59f
   *
   * ------------------------------63a4b224c59f
   * Content-Disposition: form-data; name="file"; filename="foo.txt"
   * Content-Type: text/plain
   *
   * foo
   *
   * ------------------------------63a4b224c59f
   * Content-Disposition: form-data; name="title"
   *
   * My updated snippet
   * ------------------------------63a4b224c59f
   *
   * To delete a file, omit its contents while including its name in the
   * `files` field:
   *
   * $ curl -X PUT https://api.bitbucket.org/2.0/snippets/evzijst/kypj -F files=image.png
   *
   * PUT /2.0/snippets/evzijst/kypj HTTP/1.1
   * Content-Length: 149
   * Content-Type: multipart/form-data; boundary=----------------------------ef8871065a86
   *
   * ------------------------------ef8871065a86
   * Content-Disposition: form-data; name="files"
   *
   * image.png
   * ------------------------------ef8871065a86--
   *
   * The explicit use of the `files` element in `multipart/related` and
   * `multipart/form-data` is only required when deleting files.
   * The default mode of operation is for file parts to be processed,
   * regardless of whether or not they are listed in `files`, as a
   * convenience to the client.
   */
  updateSnippet(options) {
    return (options.client ?? this.client).put({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/snippets/{workspace}/{encoded_id}",
      ...options
    });
  }
  /**
   * List comments on a snippet
   *
   * Used to retrieve a paginated list of all comments for a specific
   * snippet.
   *
   * This resource works identical to commit and pull request comments.
   *
   * The default sorting is oldest to newest and can be overridden with
   * the `sort` query parameter.
   */
  listSnippetComments(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/snippets/{workspace}/{encoded_id}/comments",
      ...options
    });
  }
  /**
   * Create a comment on a snippet
   *
   * Creates a new comment.
   *
   * The only required field in the body is `content.raw`.
   *
   * To create a threaded reply to an existing comment, include `parent.id`.
   */
  createSnippetComment(options) {
    return (options.client ?? this.client).post({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/snippets/{workspace}/{encoded_id}/comments",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * Delete a comment on a snippet
   *
   * Deletes a snippet comment.
   *
   * Comments can only be removed by the comment author, snippet creator, or workspace admin.
   */
  deleteSnippetComment(options) {
    return (options.client ?? this.client).delete({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/snippets/{workspace}/{encoded_id}/comments/{comment_id}",
      ...options
    });
  }
  /**
   * Get a comment on a snippet
   *
   * Returns the specific snippet comment.
   */
  getSnippetComment(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/snippets/{workspace}/{encoded_id}/comments/{comment_id}",
      ...options
    });
  }
  /**
   * Update a comment on a snippet
   *
   * Updates a comment.
   *
   * The only required field in the body is `content.raw`.
   *
   * Comments can only be updated by their author.
   */
  updateSnippetComment(options) {
    return (options.client ?? this.client).put({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/snippets/{workspace}/{encoded_id}/comments/{comment_id}",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * List snippet changes
   *
   * Returns the changes (commits) made on this snippet.
   */
  listSnippetCommits(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/snippets/{workspace}/{encoded_id}/commits",
      ...options
    });
  }
  /**
   * Get a previous snippet change
   *
   * Returns the changes made on this snippet in this commit.
   */
  getSnippetCommit(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/snippets/{workspace}/{encoded_id}/commits/{revision}",
      ...options
    });
  }
  /**
   * Get a snippet's raw file at HEAD
   *
   * Convenience resource for getting to a snippet's raw files without the
   * need for first having to retrieve the snippet itself and having to pull
   * out the versioned file links.
   */
  getSnippetFile(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/snippets/{workspace}/{encoded_id}/files/{path}",
      ...options
    });
  }
  /**
   * Stop watching a snippet
   *
   * Used to stop watching a specific snippet. Returns 204 (No Content)
   * to indicate success.
   */
  unwatchSnippet(options) {
    return (options.client ?? this.client).delete({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/snippets/{workspace}/{encoded_id}/watch",
      ...options
    });
  }
  /**
   * Check if the current user is watching a snippet
   *
   * Used to check if the current user is watching a specific snippet.
   *
   * Returns 204 (No Content) if the user is watching the snippet and 404 if
   * not.
   *
   * Hitting this endpoint anonymously always returns a 404.
   */
  getSnippetWatchStatus(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/snippets/{workspace}/{encoded_id}/watch",
      ...options
    });
  }
  /**
   * Watch a snippet
   *
   * Used to start watching a specific snippet. Returns 204 (No Content).
   */
  watchSnippet(options) {
    return (options.client ?? this.client).put({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/snippets/{workspace}/{encoded_id}/watch",
      ...options
    });
  }
  /**
   * List users watching a snippet
   *
   * Returns a paginated list of all users watching a specific snippet.
   *
   * @deprecated
   */
  listSnippetWatchers(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/snippets/{workspace}/{encoded_id}/watchers",
      ...options
    });
  }
  /**
   * Delete a previous revision of a snippet
   *
   * Deletes the snippet.
   *
   * Note that this only works for versioned URLs that point to the latest
   * commit of the snippet. Pointing to an older commit results in a 405
   * status code.
   *
   * To delete a snippet, regardless of whether or not concurrent changes
   * are being made to it, use `DELETE /snippets/{encoded_id}` instead.
   */
  deleteSnippetRevision(options) {
    return (options.client ?? this.client).delete({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/snippets/{workspace}/{encoded_id}/{node_id}",
      ...options
    });
  }
  /**
   * Get a previous revision of a snippet
   *
   * Identical to `GET /snippets/encoded_id`, except that this endpoint
   * can be used to retrieve the contents of the snippet as it was at an
   * older revision, while `/snippets/encoded_id` always returns the
   * snippet's current revision.
   *
   * Note that only the snippet's file contents are versioned, not its
   * meta data properties like the title.
   *
   * Other than that, the two endpoints are identical in behavior.
   */
  getSnippetRevision(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/snippets/{workspace}/{encoded_id}/{node_id}",
      ...options
    });
  }
  /**
   * Update a previous revision of a snippet
   *
   * Identical to `UPDATE /snippets/encoded_id`, except that this endpoint
   * takes an explicit commit revision. Only the snippet's "HEAD"/"tip"
   * (most recent) version can be updated and requests on all other,
   * older revisions fail by returning a 405 status.
   *
   * Usage of this endpoint over the unrestricted `/snippets/encoded_id`
   * could be desired if the caller wants to be sure no concurrent
   * modifications have taken place between the moment of the UPDATE
   * request and the original GET.
   *
   * This can be considered a so-called "Compare And Swap", or CAS
   * operation.
   *
   * Other than that, the two endpoints are identical in behavior.
   */
  updateSnippetRevision(options) {
    return (options.client ?? this.client).put({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/snippets/{workspace}/{encoded_id}/{node_id}",
      ...options
    });
  }
  /**
   * Get a snippet's raw file
   *
   * Retrieves the raw contents of a specific file in the snippet. The
   * `Content-Disposition` header will be "attachment" to avoid issues with
   * malevolent executable files.
   *
   * The file's mime type is derived from its filename and returned in the
   * `Content-Type` header.
   *
   * Note that for text files, no character encoding is included as part of
   * the content type.
   */
  getSnippetRevisionFile(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/snippets/{workspace}/{encoded_id}/{node_id}/files/{path}",
      ...options
    });
  }
  /**
   * Get snippet changes between versions
   *
   * Returns the diff of the specified commit against its first parent.
   *
   * Note that this resource is different in functionality from the `patch`
   * resource.
   *
   * The differences between a diff and a patch are:
   *
   * * patches have a commit header with the username, message, etc
   * * diffs support the optional `path=foo/bar.py` query param to filter the
   * diff to just that one file diff (not supported for patches)
   * * for a merge, the diff will show the diff between the merge commit and
   * its first parent (identical to how PRs work), while patch returns a
   * response containing separate patches for each commit on the second
   * parent's ancestry, up to the oldest common ancestor (identical to
   * its reachability).
   *
   * Note that the character encoding of the contents of the diff is
   * unspecified as Git does not track this, making it hard for
   * Bitbucket to reliably determine this.
   */
  getSnippetDiff(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/snippets/{workspace}/{encoded_id}/{revision}/diff",
      ...options
    });
  }
  /**
   * Get snippet patch between versions
   *
   * Returns the patch of the specified commit against its first
   * parent.
   *
   * Note that this resource is different in functionality from the `diff`
   * resource.
   *
   * The differences between a diff and a patch are:
   *
   * * patches have a commit header with the username, message, etc
   * * diffs support the optional `path=foo/bar.py` query param to filter the
   * diff to just that one file diff (not supported for patches)
   * * for a merge, the diff will show the diff between the merge commit and
   * its first parent (identical to how PRs work), while patch returns a
   * response containing separate patches for each commit on the second
   * parent's ancestry, up to the oldest common ancestor (identical to
   * its reachability).
   *
   * Note that the character encoding of the contents of the patch is
   * unspecified as Git does not track this, making it hard for
   * Bitbucket to reliably determine this.
   */
  getSnippetPatch(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/snippets/{workspace}/{encoded_id}/{revision}/patch",
      ...options
    });
  }
  /**
   * List variables for an account
   *
   * Find account level variables.
   * This endpoint has been deprecated, and you should use the new workspaces endpoint. For more information, see [the announcement](https://developer.atlassian.com/cloud/bitbucket/bitbucket-api-teams-deprecation/).
   *
   * @deprecated
   */
  getPipelineVariablesForTeam(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/teams/{username}/pipelines_config/variables",
      ...options
    });
  }
  /**
   * Create a variable for a user
   *
   * Create an account level variable.
   * This endpoint has been deprecated, and you should use the new workspaces endpoint. For more information, see [the announcement](https://developer.atlassian.com/cloud/bitbucket/bitbucket-api-teams-deprecation/).
   *
   * @deprecated
   */
  createPipelineVariableForTeam(options) {
    return (options.client ?? this.client).post({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/teams/{username}/pipelines_config/variables",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * Delete a variable for a team
   *
   * Delete a team level variable.
   * This endpoint has been deprecated, and you should use the new workspaces endpoint. For more information, see [the announcement](https://developer.atlassian.com/cloud/bitbucket/bitbucket-api-teams-deprecation/).
   *
   * @deprecated
   */
  deletePipelineVariableForTeam(options) {
    return (options.client ?? this.client).delete({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/teams/{username}/pipelines_config/variables/{variable_uuid}",
      ...options
    });
  }
  /**
   * Get a variable for a team
   *
   * Retrieve a team level variable.
   * This endpoint has been deprecated, and you should use the new workspaces endpoint. For more information, see [the announcement](https://developer.atlassian.com/cloud/bitbucket/bitbucket-api-teams-deprecation/).
   *
   * @deprecated
   */
  getPipelineVariableForTeam(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/teams/{username}/pipelines_config/variables/{variable_uuid}",
      ...options
    });
  }
  /**
   * Update a variable for a team
   *
   * Update a team level variable.
   * This endpoint has been deprecated, and you should use the new workspaces endpoint. For more information, see [the announcement](https://developer.atlassian.com/cloud/bitbucket/bitbucket-api-teams-deprecation/).
   *
   * @deprecated
   */
  updatePipelineVariableForTeam(options) {
    return (options.client ?? this.client).put({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/teams/{username}/pipelines_config/variables/{variable_uuid}",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * Search for code in a team's repositories
   *
   * Search for code in the repositories of the specified team.
   *
   * Note that searches can match in the file's text (`content_matches`),
   * the path (`path_matches`), or both.
   *
   * You can use the same syntax for the search query as in the UI.
   * E.g. to search for "foo" only within the repository "demo",
   * use the query parameter `search_query=foo+repo:demo`.
   *
   * Similar to other APIs, you can request more fields using a
   * `fields` query parameter. E.g. to get some more information about
   * the repository of matched files, use the query parameter
   * `search_query=foo&fields=%2Bvalues.file.commit.repository`
   * (the `%2B` is a URL-encoded `+`).
   *
   * Try `fields=%2Bvalues.*.*.*.*` to get an idea what's possible.
   *
   */
  searchTeam(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/teams/{username}/search/code",
      ...options
    });
  }
  /**
   * Get current user
   *
   * Returns the currently logged in user.
   */
  getUser(options) {
    return (options?.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/user",
      ...options
    });
  }
  /**
   * List email addresses for current user
   *
   * Returns all the authenticated user's email addresses. Both
   * confirmed and unconfirmed.
   */
  getUserEmails(options) {
    return (options?.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/user/emails",
      ...options
    });
  }
  /**
   * Get an email address for current user
   *
   * Returns details about a specific one of the authenticated user's
   * email addresses.
   *
   * Details describe whether the address has been confirmed by the user and
   * whether it is the user's primary address or not.
   */
  getUserEmail(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/user/emails/{email}",
      ...options
    });
  }
  /**
   * List repository permissions for a user
   *
   * **This endpoint is deprecated. Please use the
   * [workspace scoped alternative](/cloud/bitbucket/rest/api-group-repositories/#api-user-workspaces-workspace-permissions-repositories-get).**
   *
   * Returns an object for each repository the caller has explicit access
   * to and their effective permission — the highest level of permission the
   * caller has. This does not return public repositories that the user was
   * not granted any specific permission in, and does not distinguish between
   * explicit and implicit privileges.
   *
   * Permissions can be:
   *
   * * `admin`
   * * `write`
   * * `read`
   *
   * Results may be further [filtered or sorted](/cloud/bitbucket/rest/intro/#filtering) by
   * repository or permission by adding the following query string
   * parameters:
   *
   * * `q=repository.name="geordi"` or `q=permission>"read"`
   * * `sort=repository.name`
   *
   * Note that the query parameter values need to be URL escaped so that `=`
   * would become `%3D`.
   *
   * @deprecated
   */
  getUserPermissionsRepositories(options) {
    return (options?.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/user/permissions/repositories",
      ...options
    });
  }
  /**
   * List workspaces for the current user
   *
   * **This endpoint is deprecated. Please use the supported alternatives:**
   * * [List workspaces for user](/cloud/bitbucket/rest/api-group-workspaces/#api-user-workspaces-get)
   * * [Get user permission on a workspace](/cloud/bitbucket/rest/api-group-workspaces/#api-user-workspaces-workspace-permission-get)
   *
   * Returns an object for each workspace the caller is a member of, and
   * their effective role - the highest level of privilege the caller has.
   * If a user is a member of multiple groups with distinct roles, only the
   * highest level is returned.
   *
   * Permissions can be:
   *
   * * `owner`
   * * `collaborator`
   * * `member`
   *
   * **The `collaborator` role is being removed from the Bitbucket Cloud API. For more information,
   * see the [deprecation announcement](/cloud/bitbucket/deprecation-notice-collaborator-role/).**
   *
   * **When you move your administration from Bitbucket Cloud to admin.atlassian.com, the following fields on
   * `workspace_membership` will no longer be present: `last_accessed` and `added_on`. See the
   * [deprecation announcement](/cloud/bitbucket/announcement-breaking-change-workspace-membership/).**
   *
   * Results may be further [filtered or sorted](/cloud/bitbucket/rest/intro/#filtering) by
   * workspace or permission by adding the following query string parameters:
   *
   * * `q=workspace.slug="bbworkspace1"` or `q=permission="owner"`
   * * `sort=workspace.slug`
   *
   * Note that the query parameter values need to be URL escaped so that `=`
   * would become `%3D`.
   *
   * @deprecated
   */
  getUserPermissionsWorkspaces(options) {
    return (options?.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/user/permissions/workspaces",
      ...options
    });
  }
  /**
   * List workspaces for the current user
   *
   * Returns an object for each workspace accessible to the caller. This object
   * also contains details on whether the caller has admin permissions on the workspace
   * (`"administrator" = true`) or not (`"administrator" = false`).
   *
   * Queries support filtering based on administrator permissions,
   * [sorting](/cloud/bitbucket/rest/intro/#sorting-query-results) or
   * [filtering](/cloud/bitbucket/rest/intro/#filtering) by `slug`. Results can
   * be [paginated](/cloud/bitbucket/rest/intro/#pagination).
   */
  getUserWorkspaces(options) {
    return (options?.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/user/workspaces",
      ...options
    });
  }
  /**
   * Get user permission on a workspace
   *
   * Returns the caller's effective role; as in, the highest level of privilege
   * the caller has for the workspace.
   * If the calling user is a member of multiple groups with distinct roles, only the
   * highest level is returned.
   *
   * Permissions can be:
   *
   * * `owner`
   * * `create-project`
   * * `collaborator` (deprecated; see this
   * [deprecation announcement](/cloud/bitbucket/deprecation-notice-collaborator-role/) for more details)
   * * `member`
   */
  getUserWorkspacePermission(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/user/workspaces/{workspace}/permission",
      ...options
    });
  }
  /**
   * List repository permissions in a workspace for a user
   *
   * Returns an object for each repository the caller has explicit access to in the
   * specified workspace and their effective permission — the highest level of
   * permission the caller has. This does not return public repositories that the
   * user was not granted any specific permission in, and does not distinguish between
   * explicit and implicit privileges.
   *
   * Permissions can be:
   *
   * * `admin`
   * * `write`
   * * `read`
   *
   * Results may be further [filtered or sorted](/cloud/bitbucket/rest/intro/#filtering) by
   * repository or permission by adding the following query string
   * parameters:
   *
   * * `q=repository.name="bits"` or `q=permission>"read"`
   * * `sort=repository.name`
   *
   * Note that the query parameter values need to be URL escaped so that `=`
   * would become `%3D`.
   */
  listUserWorkspaceRepoPermissions(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/user/workspaces/{workspace}/permissions/repositories",
      ...options
    });
  }
  /**
   * Get a user
   *
   * Gets the public information associated with a user account.
   *
   * If the user's profile is private, `location`, `website` and
   * `created_on` elements are omitted.
   *
   * Note that the user object returned by this operation is changing significantly, due to privacy changes.
   * See the [announcement](https://developer.atlassian.com/cloud/bitbucket/bitbucket-api-changes-gdpr/#changes-to-bitbucket-user-objects) for details.
   */
  getUserProfile(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/users/{selected_user}",
      ...options
    });
  }
  /**
   * List GPG keys
   *
   * Returns a paginated list of the user's GPG public keys.
   * The `key` and `subkeys` fields can also be requested from the endpoint.
   * See [Partial Responses](/cloud/bitbucket/rest/intro/#partial-response) for more details.
   */
  listUserGpgKeys(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/users/{selected_user}/gpg-keys",
      ...options
    });
  }
  /**
   * Add a new GPG key
   *
   * Adds a new GPG public key to the specified user account and returns the resulting key.
   *
   * Example:
   *
   * ```
   * $ curl -X POST -H "Content-Type: application/json" -d
   * '{"key": "<insert GPG Key>"}'
   * https://api.bitbucket.org/2.0/users/{d7dd0e2d-3994-4a50-a9ee-d260b6cefdab}/gpg-keys
   * ```
   */
  createUserGpgKey(options) {
    return (options.client ?? this.client).post({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/users/{selected_user}/gpg-keys",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * Delete a GPG key
   *
   * Deletes a specific GPG public key from a user's account.
   */
  deleteUserGpgKey(options) {
    return (options.client ?? this.client).delete({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/users/{selected_user}/gpg-keys/{fingerprint}",
      ...options
    });
  }
  /**
   * Get a GPG key
   *
   * Returns a specific GPG public key belonging to a user.
   * The `key` and `subkeys` fields can also be requested from the endpoint.
   * See [Partial Responses](/cloud/bitbucket/rest/intro/#partial-response) for more details.
   */
  getUserGpgKey(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/users/{selected_user}/gpg-keys/{fingerprint}",
      ...options
    });
  }
  /**
   * List variables for a user
   *
   * Find user level variables.
   * This endpoint has been deprecated, and you should use the new workspaces endpoint. For more information, see [the announcement](https://developer.atlassian.com/cloud/bitbucket/bitbucket-api-teams-deprecation/).
   *
   * @deprecated
   */
  getPipelineVariablesForUser(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/users/{selected_user}/pipelines_config/variables",
      ...options
    });
  }
  /**
   * Create a variable for a user
   *
   * Create a user level variable.
   * This endpoint has been deprecated, and you should use the new workspaces endpoint. For more information, see [the announcement](https://developer.atlassian.com/cloud/bitbucket/bitbucket-api-teams-deprecation/).
   *
   * @deprecated
   */
  createPipelineVariableForUser(options) {
    return (options.client ?? this.client).post({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/users/{selected_user}/pipelines_config/variables",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * Delete a variable for a user
   *
   * Delete an account level variable.
   * This endpoint has been deprecated, and you should use the new workspaces endpoint. For more information, see [the announcement](https://developer.atlassian.com/cloud/bitbucket/bitbucket-api-teams-deprecation/).
   *
   * @deprecated
   */
  deletePipelineVariableForUser(options) {
    return (options.client ?? this.client).delete({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/users/{selected_user}/pipelines_config/variables/{variable_uuid}",
      ...options
    });
  }
  /**
   * Get a variable for a user
   *
   * Retrieve a user level variable.
   * This endpoint has been deprecated, and you should use the new workspaces endpoint. For more information, see [the announcement](https://developer.atlassian.com/cloud/bitbucket/bitbucket-api-teams-deprecation/).
   *
   * @deprecated
   */
  getPipelineVariableForUser(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/users/{selected_user}/pipelines_config/variables/{variable_uuid}",
      ...options
    });
  }
  /**
   * Update a variable for a user
   *
   * Update a user level variable.
   * This endpoint has been deprecated, and you should use the new workspaces endpoint. For more information, see [the announcement](https://developer.atlassian.com/cloud/bitbucket/bitbucket-api-teams-deprecation/).
   *
   * @deprecated
   */
  updatePipelineVariableForUser(options) {
    return (options.client ?? this.client).put({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/users/{selected_user}/pipelines_config/variables/{variable_uuid}",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * Delete a user application property
   *
   * Delete an [application property](/cloud/bitbucket/application-properties/) value stored against a user.
   */
  deleteUserHostedPropertyValue(options) {
    return (options.client ?? this.client).delete({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/users/{selected_user}/properties/{app_key}/{property_name}",
      ...options
    });
  }
  /**
   * Get a user application property
   *
   * Retrieve an [application property](/cloud/bitbucket/application-properties/) value stored against a user.
   */
  retrieveUserHostedPropertyValue(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/users/{selected_user}/properties/{app_key}/{property_name}",
      ...options
    });
  }
  /**
   * Update a user application property
   *
   * Update an [application property](/cloud/bitbucket/application-properties/) value stored against a user.
   */
  updateUserHostedPropertyValue(options) {
    return (options.client ?? this.client).put({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/users/{selected_user}/properties/{app_key}/{property_name}",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * Search for code in a user's repositories
   *
   * Search for code in the repositories of the specified user.
   *
   * Note that searches can match in the file's text (`content_matches`),
   * the path (`path_matches`), or both.
   *
   * You can use the same syntax for the search query as in the UI.
   * E.g. to search for "foo" only within the repository "demo",
   * use the query parameter `search_query=foo+repo:demo`.
   *
   * Similar to other APIs, you can request more fields using a
   * `fields` query parameter. E.g. to get some more information about
   * the repository of matched files, use the query parameter
   * `search_query=foo&fields=%2Bvalues.file.commit.repository`
   * (the `%2B` is a URL-encoded `+`).
   *
   */
  searchAccount(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/users/{selected_user}/search/code",
      ...options
    });
  }
  /**
   * List SSH keys
   *
   * Returns a paginated list of the user's SSH public keys.
   */
  listUserSshKeys(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/users/{selected_user}/ssh-keys",
      ...options
    });
  }
  /**
   * Add a new SSH key
   *
   * Adds a new SSH public key to the specified user account and returns the resulting key.
   *
   * Example:
   *
   * ```
   * $ curl -X POST -H "Content-Type: application/json" -d '{"key": "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKqP3Cr632C2dNhhgKVcon4ldUSAeKiku2yP9O9/bDtY user@myhost"}' https://api.bitbucket.org/2.0/users/{ed08f5e1-605b-4f4a-aee4-6c97628a673e}/ssh-keys
   * ```
   */
  createUserSshKey(options) {
    return (options.client ?? this.client).post({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/users/{selected_user}/ssh-keys",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * Delete a SSH key
   *
   * Deletes a specific SSH public key from a user's account.
   */
  deleteUserSshKey(options) {
    return (options.client ?? this.client).delete({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/users/{selected_user}/ssh-keys/{key_id}",
      ...options
    });
  }
  /**
   * Get a SSH key
   *
   * Returns a specific SSH public key belonging to a user.
   */
  getUserSshKey(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/users/{selected_user}/ssh-keys/{key_id}",
      ...options
    });
  }
  /**
   * Update a SSH key
   *
   * Updates a specific SSH public key on a user's account
   *
   * Note: Only the 'comment' field can be updated using this API. To modify the key or comment values, you must delete and add the key again.
   *
   * Example:
   *
   * ```
   * $ curl -X PUT -H "Content-Type: application/json" -d '{"label": "Work key"}' https://api.bitbucket.org/2.0/users/{ed08f5e1-605b-4f4a-aee4-6c97628a673e}/ssh-keys/{b15b6026-9c02-4626-b4ad-b905f99f763a}
   * ```
   */
  updateUserSshKey(options) {
    return (options.client ?? this.client).put({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/users/{selected_user}/ssh-keys/{key_id}",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * List workspaces for user
   *
   * **This endpoint is deprecated. Please use the
   * [supported alternative](/cloud/bitbucket/rest/api-group-workspaces/#api-user-workspaces-get).**
   *
   * Returns a list of workspaces accessible by the authenticated user.
   *
   * Results may be further [filtered or sorted](/cloud/bitbucket/rest/intro/#filtering) by
   * workspace or permission by adding the following query string parameters:
   *
   * * `q=slug="bbworkspace1"` or `q=is_private=true`
   * * `sort=created_on`
   *
   * Note that the query parameter values need to be URL escaped so that `=`
   * would become `%3D`.
   *
   * **The `collaborator` role is being removed from the Bitbucket Cloud API. For more information,
   * see the [deprecation announcement](/cloud/bitbucket/deprecation-notice-collaborator-role/).**
   *
   * @deprecated
   */
  listWorkspaces(options) {
    return (options?.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/workspaces",
      ...options
    });
  }
  /**
   * Get a workspace
   *
   * Returns the requested workspace.
   */
  getWorkspace(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/workspaces/{workspace}",
      ...options
    });
  }
  /**
   * List webhooks for a workspace
   *
   * Returns a paginated list of webhooks installed on this workspace.
   */
  listWorkspaceHooks(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/workspaces/{workspace}/hooks",
      ...options
    });
  }
  /**
   * Create a webhook for a workspace
   *
   * Creates a new webhook on the specified workspace.
   *
   * Workspace webhooks are fired for events from all repositories contained
   * by that workspace.
   *
   * Example:
   *
   * ```
   * $ curl -X POST -u credentials -H 'Content-Type: application/json'
   * https://api.bitbucket.org/2.0/workspaces/my-workspace/hooks
   * -d '
   * {
   * "description": "Webhook Description",
   * "url": "https://example.com/",
   * "active": true,
   * "secret": "this is a really bad secret",
   * "events": [
   * "repo:push",
   * "issue:created",
   * "issue:updated"
   * ]
   * }'
   * ```
   *
   * When the `secret` is provided it will be used as the key to generate a HMAC
   * digest value sent in the `X-Hub-Signature` header at delivery time. Passing
   * a `null` or empty `secret` or not passing a `secret` will leave the webhook's
   * secret unset. Bitbucket only generates the `X-Hub-Signature` when the webhook's
   * secret is set.
   *
   * This call requires the webhook scope, as well as any scope
   * that applies to the events that the webhook subscribes to. In the
   * example above that means: `webhook`, `repository` and `issue`.
   *
   * The `url` must properly resolve and cannot be an internal, non-routed address.
   *
   * Only workspace owners can install webhooks on workspaces.
   */
  createWorkspaceHook(options) {
    return (options.client ?? this.client).post({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/workspaces/{workspace}/hooks",
      ...options
    });
  }
  /**
   * Delete a webhook for a workspace
   *
   * Deletes the specified webhook subscription from the given workspace.
   */
  deleteWorkspaceHook(options) {
    return (options.client ?? this.client).delete({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/workspaces/{workspace}/hooks/{uid}",
      ...options
    });
  }
  /**
   * Get a webhook for a workspace
   *
   * Returns the webhook with the specified id installed on the given
   * workspace.
   */
  getWorkspaceHook(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/workspaces/{workspace}/hooks/{uid}",
      ...options
    });
  }
  /**
   * Update a webhook for a workspace
   *
   * Updates the specified webhook subscription.
   *
   * The following properties can be mutated:
   *
   * * `description`
   * * `url`
   * * `secret`
   * * `active`
   * * `events`
   *
   * The hook's secret is used as a key to generate the HMAC hex digest sent in the
   * `X-Hub-Signature` header at delivery time. This signature is only generated
   * when the hook has a secret.
   *
   * Set the hook's secret by passing the new value in the `secret` field. Passing a
   * `null` value in the `secret` field will remove the secret from the hook. The
   * hook's secret can be left unchanged by not passing the `secret` field in the
   * request.
   */
  updateWorkspaceHook(options) {
    return (options.client ?? this.client).put({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/workspaces/{workspace}/hooks/{uid}",
      ...options
    });
  }
  /**
   * List users in a workspace
   *
   * Returns all members of the requested workspace.
   *
   * This endpoint additionally supports [filtering](/cloud/bitbucket/rest/intro/#filtering) by
   * email address, if called by a workspace administrator, integration or workspace access
   * token. This is done by adding the following query string parameter:
   *
   * * `q=user.email IN ("user1@org.com","user2@org.com")`
   *
   * When filtering by email, you can query up to 90 addresses at a time.
   * Note that the query parameter values need to be URL escaped, so the final query string
   * should be:
   *
   * * `q=user.email%20IN%20(%22user1@org.com%22,%22user2@org.com%22)`
   *
   * Email addresses that you filter by (and only these email addresses) can be included in the
   * response using the `fields` query parameter:
   *
   * * `&fields=+values.user.email` - add the `email` field to the default `user` response object
   * * `&fields=values.user.email,values.user.account_id` - only return user email addresses and
   * account IDs
   *
   * Once again, all query parameter values must be URL escaped.
   */
  listWorkspaceMembers(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/workspaces/{workspace}/members",
      ...options
    });
  }
  /**
   * Get user membership for a workspace
   *
   * Returns the workspace membership, which includes
   * a `User` object for the member and a `Workspace` object
   * for the requested workspace.
   */
  getWorkspaceMember(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/workspaces/{workspace}/members/{member}",
      ...options
    });
  }
  /**
   * List user permissions in a workspace
   *
   * Returns the list of members in a workspace
   * and their permission levels.
   * Permission can be:
   * * `owner`
   * * `collaborator`
   * * `member`
   *
   * **The `collaborator` role is being removed from the Bitbucket Cloud API. For more information,
   * see the [deprecation announcement](/cloud/bitbucket/deprecation-notice-collaborator-role/).**
   *
   * **When you move your administration from Bitbucket Cloud to admin.atlassian.com, the following fields on
   * `workspace_membership` will no longer be present: `last_accessed` and `added_on`. See the
   * [deprecation announcement](/cloud/bitbucket/announcement-breaking-change-workspace-membership/).**
   *
   * Results may be further [filtered](/cloud/bitbucket/rest/intro/#filtering) by
   * permission by adding the following query string parameters:
   *
   * * `q=permission="owner"`
   */
  listWorkspacePermissions(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/workspaces/{workspace}/permissions",
      ...options
    });
  }
  /**
   * List all repository permissions for a workspace
   *
   * Returns an object for each repository permission for all of a
   * workspace's repositories.
   *
   * Permissions returned are effective permissions: the highest level of
   * permission the user has. This does not distinguish between direct and
   * indirect (group) privileges.
   *
   * Only users with admin permission for the team may access this resource.
   *
   * Permissions can be:
   *
   * * `admin`
   * * `write`
   * * `read`
   *
   * Results may be further [filtered or sorted](/cloud/bitbucket/rest/intro/#filtering)
   * by repository, user, or permission by adding the following query string
   * parameters:
   *
   * * `q=repository.name="geordi"` or `q=permission>"read"`
   * * `sort=user.display_name`
   *
   * Note that the query parameter values need to be URL escaped so that `=`
   * would become `%3D`.
   */
  listWorkspaceRepoPermissions(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/workspaces/{workspace}/permissions/repositories",
      ...options
    });
  }
  /**
   * List a repository permissions for a workspace
   *
   * Returns an object for the repository permission of each user in the
   * requested repository.
   *
   * Permissions returned are effective permissions: the highest level of
   * permission the user has. This does not distinguish between direct and
   * indirect (group) privileges.
   *
   * Only users with admin permission for the repository may access this resource.
   *
   * Permissions can be:
   *
   * * `admin`
   * * `write`
   * * `read`
   *
   * Results may be further [filtered or sorted](/cloud/bitbucket/rest/intro/#filtering)
   * by user, or permission by adding the following query string parameters:
   *
   * * `q=permission>"read"`
   * * `sort=user.display_name`
   *
   * Note that the query parameter values need to be URL escaped so that `=`
   * would become `%3D`.
   */
  getWorkspaceRepoPermission(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/workspaces/{workspace}/permissions/repositories/{repo_slug}",
      ...options
    });
  }
  /**
   * Get OpenID configuration for OIDC in Pipelines
   *
   * This is part of OpenID Connect for Pipelines, see https://support.atlassian.com/bitbucket-cloud/docs/integrate-pipelines-with-resource-servers-using-oidc/
   */
  getOidcConfiguration(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/workspaces/{workspace}/pipelines-config/identity/oidc/.well-known/openid-configuration",
      ...options
    });
  }
  /**
   * Get keys for OIDC in Pipelines
   *
   * This is part of OpenID Connect for Pipelines, see https://support.atlassian.com/bitbucket-cloud/docs/integrate-pipelines-with-resource-servers-using-oidc/
   */
  getOidcKeys(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/workspaces/{workspace}/pipelines-config/identity/oidc/keys.json",
      ...options
    });
  }
  /**
   * Get workspace runners
   *
   * Retrieve workspace runners.
   */
  getWorkspaceRunners(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/workspaces/{workspace}/pipelines-config/runners",
      ...options
    });
  }
  /**
   * Create workspace runner
   *
   * Create workspace runner.
   */
  createWorkspaceRunner(options) {
    return (options.client ?? this.client).post({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/workspaces/{workspace}/pipelines-config/runners",
      ...options
    });
  }
  /**
   * Delete workspace runner
   *
   * Delete workspace runner by uuid.
   */
  deleteWorkspaceRunner(options) {
    return (options.client ?? this.client).delete({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/workspaces/{workspace}/pipelines-config/runners/{runner_uuid}",
      ...options
    });
  }
  /**
   * Get workspace runner
   *
   * Get workspace runner by uuid.
   */
  getWorkspaceRunner(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/workspaces/{workspace}/pipelines-config/runners/{runner_uuid}",
      ...options
    });
  }
  /**
   * Update workspace runner
   *
   * Update workspace runner.
   */
  updateWorkspaceRunner(options) {
    return (options.client ?? this.client).put({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/workspaces/{workspace}/pipelines-config/runners/{runner_uuid}",
      ...options
    });
  }
  /**
   * List variables for a workspace
   *
   * Find workspace level variables.
   */
  getPipelineVariablesForWorkspace(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/workspaces/{workspace}/pipelines-config/variables",
      ...options
    });
  }
  /**
   * Create a variable for a workspace
   *
   * Create a workspace level variable.
   */
  createPipelineVariableForWorkspace(options) {
    return (options.client ?? this.client).post({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/workspaces/{workspace}/pipelines-config/variables",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * Delete a variable for a workspace
   *
   * Delete a workspace level variable.
   */
  deletePipelineVariableForWorkspace(options) {
    return (options.client ?? this.client).delete({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/workspaces/{workspace}/pipelines-config/variables/{variable_uuid}",
      ...options
    });
  }
  /**
   * Get variable for a workspace
   *
   * Retrieve a workspace level variable.
   */
  getPipelineVariableForWorkspace(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/workspaces/{workspace}/pipelines-config/variables/{variable_uuid}",
      ...options
    });
  }
  /**
   * Update variable for a workspace
   *
   * Update a workspace level variable.
   */
  updatePipelineVariableForWorkspace(options) {
    return (options.client ?? this.client).put({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/workspaces/{workspace}/pipelines-config/variables/{variable_uuid}",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * List projects in a workspace
   *
   * Returns the list of projects in this workspace.
   */
  listProjects(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/workspaces/{workspace}/projects",
      ...options
    });
  }
  /**
   * Create a project in a workspace
   *
   * Creates a new project.
   *
   * Note that the avatar has to be embedded as either a data-url
   * or a URL to an external image as shown in the examples below:
   *
   * ```
   * $ body=$(cat << EOF
   * {
   * "name": "Mars Project",
   * "key": "MARS",
   * "description": "Software for colonizing mars.",
   * "links": {
   * "avatar": {
   * "href": "data:image/gif;base64,R0lGODlhEAAQAMQAAORHHOVSKudfOulrSOp3WOyDZu6QdvCchPGolfO0o/..."
   * }
   * },
   * "is_private": false
   * }
   * EOF
   * )
   * $ curl -H "Content-Type: application/json" \
   * -X POST \
   * -d "$body" \
   * https://api.bitbucket.org/2.0/workspaces/teams-in-space/projects/ | jq .
   * {
   * // Serialized project document
   * }
   * ```
   *
   * or even:
   *
   * ```
   * $ body=$(cat << EOF
   * {
   * "name": "Mars Project",
   * "key": "MARS",
   * "description": "Software for colonizing mars.",
   * "links": {
   * "avatar": {
   * "href": "http://i.imgur.com/72tRx4w.gif"
   * }
   * },
   * "is_private": false
   * }
   * EOF
   * )
   * $ curl -H "Content-Type: application/json" \
   * -X POST \
   * -d "$body" \
   * https://api.bitbucket.org/2.0/workspaces/teams-in-space/projects/ | jq .
   * {
   * // Serialized project document
   * }
   * ```
   */
  createProject(options) {
    return (options.client ?? this.client).post({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/workspaces/{workspace}/projects",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * Delete a project for a workspace
   *
   * Deletes this project. This is an irreversible operation.
   *
   * You cannot delete a project that still contains repositories.
   * To delete the project, [delete](/cloud/bitbucket/rest/api-group-repositories/#api-repositories-workspace-repo-slug-delete)
   * or transfer the repositories first.
   *
   * Example:
   * ```
   * $ curl -X DELETE https://api.bitbucket.org/2.0/workspaces/bbworkspace1/projects/PROJ
   * ```
   */
  deleteProject(options) {
    return (options.client ?? this.client).delete({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/workspaces/{workspace}/projects/{project_key}",
      ...options
    });
  }
  /**
   * Get a project for a workspace
   *
   * Returns the requested project.
   */
  getProject(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/workspaces/{workspace}/projects/{project_key}",
      ...options
    });
  }
  /**
   * Update a project for a workspace
   *
   * Since this endpoint can be used to both update and to create a
   * project, the request body depends on the intent.
   *
   * #### Creation
   *
   * See the POST documentation for the project collection for an
   * example of the request body.
   *
   * Note: The `key` should not be specified in the body of request
   * (since it is already present in the URL). The `name` is required,
   * everything else is optional.
   *
   * #### Update
   *
   * See the POST documentation for the project collection for an
   * example of the request body.
   *
   * Note: The key is not required in the body (since it is already in
   * the URL). The key may be specified in the body, if the intent is
   * to change the key itself. In such a scenario, the location of the
   * project is changed and is returned in the `Location` header of the
   * response.
   */
  updateProject(options) {
    return (options.client ?? this.client).put({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/workspaces/{workspace}/projects/{project_key}",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * Get the branching model for a project
   *
   * Return the branching model set at the project level. This view is
   * read-only. The branching model settings can be changed using the
   * [settings](#api-workspaces-workspace-projects-project-key-branching-model-settings-get)
   * API.
   *
   * The returned object:
   *
   * 1. Always has a `development` property. `development.name` is
   * the user-specified branch that can be inherited by an individual repository's
   * branching model.
   * 2. Might have a `production` property. `production` will not
   * be present when `production` is disabled.
   * `production.name` is the user-specified branch that can be
   * inherited by an individual repository's branching model.
   * 3. Always has a `branch_types` array which contains all enabled branch
   * types.
   */
  getProjectBranchingModel(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/workspaces/{workspace}/projects/{project_key}/branching-model",
      ...options
    });
  }
  /**
   * Get the branching model config for a project
   *
   * Return the branching model configuration for a project. The returned
   * object:
   *
   * 1. Always has a `development` property for the development branch.
   * 2. Always a `production` property for the production branch. The
   * production branch can be disabled.
   * 3. The `branch_types` contains all the branch types.
   * 4. `default_branch_deletion` indicates whether branches will be
   * deleted by default on merge.
   *
   *
   * This is the raw configuration for the branching model. A client
   * wishing to see the branching model with its actual current branches may find the
   * [active model API](#api-workspaces-workspace-projects-project-key-branching-model-get)
   * more useful.
   */
  getProjectBranchingModelSettings(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/workspaces/{workspace}/projects/{project_key}/branching-model/settings",
      ...options
    });
  }
  /**
   * Update the branching model config for a project
   *
   * Update the branching model configuration for a project.
   *
   * The `development` branch can be configured to a specific branch or to
   * track the main branch. Any branch name can be supplied, but will only
   * successfully be applied to a repository via inheritance if that branch
   * exists for that repository. Only the passed properties will be updated. The
   * properties not passed will be left unchanged. A request without a
   * `development` property will leave the development branch unchanged.
   *
   * The `production` branch can be a specific branch, the main
   * branch or disabled. Any branch name can be supplied, but will only
   * successfully be applied to a repository via inheritance if that branch
   * exists for that repository. The `enabled` property can be used to enable (`true`)
   * or disable (`false`) it. Only the passed properties will be updated. The
   * properties not passed will be left unchanged. A request without a
   * `production` property will leave the production branch unchanged.
   *
   * The `branch_types` property contains the branch types to be updated.
   * Only the branch types passed will be updated. All updates will be
   * rejected if it would leave the branching model in an invalid state.
   * For branch types this means that:
   *
   * 1. The prefixes for all enabled branch types are valid. For example,
   * it is not possible to use '*' inside a Git prefix.
   * 2. A prefix of an enabled branch type must not be a prefix of another
   * enabled branch type. This is to ensure that a branch can be easily
   * classified by its prefix unambiguously.
   *
   * It is possible to store an invalid prefix if that branch type would be
   * left disabled. Only the passed properties will be updated. The
   * properties not passed will be left unchanged. Each branch type must
   * have a `kind` property to identify it.
   *
   * The `default_branch_deletion` property is a string. The value of `true`
   * indicates to delete branches by default. The value of `false` indicates
   * that branches will not be deleted by default. A request without a
   * `default_branch_deletion` property will leave it unchanged. Other values
   * would be ignored.
   */
  updateProjectBranchingModelSettings(options) {
    return (options.client ?? this.client).put({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/workspaces/{workspace}/projects/{project_key}/branching-model/settings",
      ...options
    });
  }
  /**
   * List the default reviewers in a project
   *
   * Return a list of all default reviewers for a project. This is a list of users that will be added as default
   * reviewers to pull requests for any repository within the project.
   */
  listProjectDefaultReviewers(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/workspaces/{workspace}/projects/{project_key}/default-reviewers",
      ...options
    });
  }
  /**
   * Remove the specific user from the project's default reviewers
   *
   * Removes a default reviewer from the project.
   *
   * Example:
   * ```
   * $ curl https://api.bitbucket.org/2.0/.../default-reviewers/%7Bf0e0e8e9-66c1-4b85-a784-44a9eb9ef1a6%7D
   *
   * HTTP/1.1 204
   * ```
   */
  deleteProjectDefaultReviewer(options) {
    return (options.client ?? this.client).delete({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/workspaces/{workspace}/projects/{project_key}/default-reviewers/{selected_user}",
      ...options
    });
  }
  /**
   * Get a default reviewer
   *
   * Returns the specified default reviewer.
   */
  getProjectDefaultReviewer(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/workspaces/{workspace}/projects/{project_key}/default-reviewers/{selected_user}",
      ...options
    });
  }
  /**
   * Add the specific user as a default reviewer for the project
   *
   * Adds the specified user to the project's list of default reviewers. The method is
   * idempotent. Accepts an optional body containing the `uuid` of the user to be added.
   */
  addProjectDefaultReviewer(options) {
    return (options.client ?? this.client).put({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/workspaces/{workspace}/projects/{project_key}/default-reviewers/{selected_user}",
      ...options
    });
  }
  /**
   * List project deploy keys
   *
   * Returns all deploy keys belonging to a project.
   */
  listProjectDeployKeys(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/workspaces/{workspace}/projects/{project_key}/deploy-keys",
      ...options
    });
  }
  /**
   * Create a project deploy key
   *
   * Create a new deploy key in a project.
   *
   * Example:
   * ```
   * $ curl -X POST \
   * -H "Authorization <auth header>" \
   * -H "Content-type: application/json" \
   * https://api.bitbucket.org/2.0/workspaces/standard/projects/TEST_PROJECT/deploy-keys/ -d \
   * '{
   * "key": "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQDAK/b1cHHDr/TEV1JGQl+WjCwStKG6Bhrv0rFpEsYlyTBm1fzN0VOJJYn4ZOPCPJwqse6fGbXntEs+BbXiptR+++HycVgl65TMR0b5ul5AgwrVdZdT7qjCOCgaSV74/9xlHDK8oqgGnfA7ZoBBU+qpVyaloSjBdJfLtPY/xqj4yHnXKYzrtn/uFc4Kp9Tb7PUg9Io3qohSTGJGVHnsVblq/rToJG7L5xIo0OxK0SJSQ5vuId93ZuFZrCNMXj8JDHZeSEtjJzpRCBEXHxpOPhAcbm4MzULgkFHhAVgp4JbkrT99/wpvZ7r9AdkTg7HGqL3rlaDrEcWfL7Lu6TnhBdq5 mleu@C02W454JHTD8",
   * "label": "mydeploykey"
   * }'
   * ```
   */
  createProjectDeployKey(options) {
    return (options.client ?? this.client).post({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/workspaces/{workspace}/projects/{project_key}/deploy-keys",
      ...options
    });
  }
  /**
   * Delete a deploy key from a project
   *
   * This deletes a deploy key from a project.
   */
  deleteProjectDeployKey(options) {
    return (options.client ?? this.client).delete({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/workspaces/{workspace}/projects/{project_key}/deploy-keys/{key_id}",
      ...options
    });
  }
  /**
   * Get a project deploy key
   *
   * Returns the deploy key belonging to a specific key ID.
   */
  getProjectDeployKey(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/workspaces/{workspace}/projects/{project_key}/deploy-keys/{key_id}",
      ...options
    });
  }
  /**
   * List explicit group permissions for a project
   *
   * Returns a paginated list of explicit group permissions for the given project.
   * This endpoint does not support BBQL features.
   */
  listProjectPermissionGroups(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/workspaces/{workspace}/projects/{project_key}/permissions-config/groups",
      ...options
    });
  }
  /**
   * Delete an explicit group permission for a project
   *
   * Deletes the project group permission between the requested project and group, if one exists.
   *
   * Only users with admin permission for the project may access this resource.
   */
  deleteProjectPermissionGroup(options) {
    return (options.client ?? this.client).delete({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/workspaces/{workspace}/projects/{project_key}/permissions-config/groups/{group_slug}",
      ...options
    });
  }
  /**
   * Get an explicit group permission for a project
   *
   * Returns the group permission for a given group and project.
   *
   * Only users with admin permission for the project may access this resource.
   *
   * Permissions can be:
   *
   * * `admin`
   * * `create-repo`
   * * `write`
   * * `read`
   * * `none`
   */
  getProjectPermissionGroup(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/workspaces/{workspace}/projects/{project_key}/permissions-config/groups/{group_slug}",
      ...options
    });
  }
  /**
   * Update an explicit group permission for a project
   *
   * Updates the group permission, or grants a new permission if one does not already exist.
   *
   * Only users with admin permission for the project may access this resource.
   *
   * Due to security concerns, the JWT and OAuth authentication methods are unsupported.
   * This is to ensure integrations and add-ons are not allowed to change permissions.
   *
   * Permissions can be:
   *
   * * `admin`
   * * `create-repo`
   * * `write`
   * * `read`
   */
  updateProjectPermissionGroup(options) {
    return (options.client ?? this.client).put({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/workspaces/{workspace}/projects/{project_key}/permissions-config/groups/{group_slug}",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * List explicit user permissions for a project
   *
   * Returns a paginated list of explicit user permissions for the given project.
   * This endpoint does not support BBQL features.
   */
  listProjectPermissionUsers(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/workspaces/{workspace}/projects/{project_key}/permissions-config/users",
      ...options
    });
  }
  /**
   * Delete an explicit user permission for a project
   *
   * Deletes the project user permission between the requested project and user, if one exists.
   *
   * Only users with admin permission for the project may access this resource.
   *
   * Due to security concerns, the JWT and OAuth authentication methods are unsupported.
   * This is to ensure integrations and add-ons are not allowed to change permissions.
   */
  deleteProjectPermissionUser(options) {
    return (options.client ?? this.client).delete({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/workspaces/{workspace}/projects/{project_key}/permissions-config/users/{selected_user_id}",
      ...options
    });
  }
  /**
   * Get an explicit user permission for a project
   *
   * Returns the explicit user permission for a given user and project.
   *
   * Only users with admin permission for the project may access this resource.
   *
   * Permissions can be:
   *
   * * `admin`
   * * `create-repo`
   * * `write`
   * * `read`
   * * `none`
   */
  getProjectPermissionUser(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/workspaces/{workspace}/projects/{project_key}/permissions-config/users/{selected_user_id}",
      ...options
    });
  }
  /**
   * Update an explicit user permission for a project
   *
   * Updates the explicit user permission for a given user and project. The selected
   * user must be a member of the workspace, and cannot be the workspace owner.
   *
   * Only users with admin permission for the project may access this resource.
   *
   * Due to security concerns, the JWT and OAuth authentication methods are unsupported.
   * This is to ensure integrations and add-ons are not allowed to change permissions.
   *
   * Permissions can be:
   *
   * * `admin`
   * * `create-repo`
   * * `write`
   * * `read`
   */
  updateProjectPermissionUser(options) {
    return (options.client ?? this.client).put({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/workspaces/{workspace}/projects/{project_key}/permissions-config/users/{selected_user_id}",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * List workspace pull requests for a user
   *
   * Returns all workspace pull requests authored by the specified user.
   *
   * By default only open pull requests are returned. This can be controlled
   * using the `state` query parameter. To retrieve pull requests that are
   * in one of multiple states, repeat the `state` parameter for each
   * individual state.
   *
   * This endpoint also supports filtering and sorting of the results. See
   * [filtering and sorting](/cloud/bitbucket/rest/intro/#filtering) for more details.
   */
  listWorkspaceUserPullRequests(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/workspaces/{workspace}/pullrequests/{selected_user}",
      ...options
    });
  }
  /**
   * Search for code in a workspace
   *
   * Search for code in the repositories of the specified workspace.
   *
   * Note that searches can match in the file's text (`content_matches`),
   * the path (`path_matches`), or both.
   *
   * You can use the same syntax for the search query as in the UI.
   * E.g. to search for "foo" only within the repository "demo",
   * use the query parameter `search_query=foo+repo:demo`.
   *
   * Similar to other APIs, you can request more fields using a
   * `fields` query parameter. E.g. to get some more information about
   * the repository of matched files, use the query parameter
   * `search_query=foo&fields=%2Bvalues.file.commit.repository`
   * (the `%2B` is a URL-encoded `+`).
   *
   * Try `fields=%2Bvalues.*.*.*.*` to get an idea what's possible.
   *
   */
  searchWorkspace(options) {
    return (options.client ?? this.client).get({
      security: [
        { scheme: "bearer", type: "http" },
        { scheme: "basic", type: "http" },
        { name: "Authorization", type: "apiKey" }
      ],
      url: "/workspaces/{workspace}/search/code",
      ...options
    });
  }
};
export {
  BitbucketClient,
  client,
  createClient,
  createConfig,
  mergeHeaders
};
