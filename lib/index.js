// src/core/bodySerializer.gen.ts
var jsonBodySerializer = {
  bodySerializer: (body) => JSON.stringify(
    body,
    (_key, value) => typeof value === "bigint" ? value.toString() : value
  )
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
        if (!response.ok)
          throw new Error(
            `SSE failed: ${response.status} ${response.statusText}`
          );
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
                  const parsed = Number.parseInt(
                    line.replace(/^retry:\s*/, ""),
                    10
                  );
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
        const backoff = Math.min(
          retryDelay * 2 ** (attempt - 1),
          sseMaxRetryDelay ?? 3e4
        );
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
      values = [
        ...values,
        key,
        allowReserved ? v : encodeURIComponent(v)
      ];
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
        url = url.replace(
          match,
          serializeArrayParam({ explode, name, style, value })
        );
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
  allowReserved,
  array,
  object
} = {}) => {
  const querySerializer = (queryParams) => {
    const search = [];
    if (queryParams && typeof queryParams === "object") {
      for (const name in queryParams) {
        const value = queryParams[name];
        if (value === void 0 || value === null) {
          continue;
        }
        if (Array.isArray(value)) {
          const serializedArray = serializeArrayParam({
            allowReserved,
            explode: true,
            name,
            style: "form",
            value,
            ...array
          });
          if (serializedArray) search.push(serializedArray);
        } else if (typeof value === "object") {
          const serializedObject = serializeObjectParam({
            allowReserved,
            explode: true,
            name,
            style: "deepObject",
            value,
            ...object
          });
          if (serializedObject) search.push(serializedObject);
        } else {
          const serializedPrimitive = serializePrimitiveParam({
            allowReserved,
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
  if (["application/", "audio/", "image/", "video/"].some(
    (type) => cleanContent.startsWith(type)
  )) {
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
    let response = await _fetch(request2);
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
        case "json":
        case "text":
          data = await response[parseAs]();
          break;
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
var client = createClient(createConfig({
  baseUrl: "https://api.bitbucket.org/2.0"
}));

// src/sdk.gen.ts
var deleteAddon = (options) => {
  return (options?.client ?? client).delete({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/addon",
    ...options
  });
};
var updateAddon = (options) => {
  return (options?.client ?? client).put({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/addon",
    ...options
  });
};
var getAddonLinkers = (options) => {
  return (options?.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/addon/linkers",
    ...options
  });
};
var getAddonLinker = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/addon/linkers/{linker_key}",
    ...options
  });
};
var deleteAddonLinkerValues = (options) => {
  return (options.client ?? client).delete({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/addon/linkers/{linker_key}/values",
    ...options
  });
};
var getAddonLinkerValues = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/addon/linkers/{linker_key}/values",
    ...options
  });
};
var createAddonLinkerValues = (options) => {
  return (options.client ?? client).post({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/addon/linkers/{linker_key}/values",
    ...options
  });
};
var updateAddonLinkerValues = (options) => {
  return (options.client ?? client).put({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/addon/linkers/{linker_key}/values",
    ...options
  });
};
var deleteAddonLinkerValue = (options) => {
  return (options.client ?? client).delete({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/addon/linkers/{linker_key}/values/{value_id}",
    ...options
  });
};
var getAddonLinkerValue = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/addon/linkers/{linker_key}/values/{value_id}",
    ...options
  });
};
var getHookEvents = (options) => {
  return (options?.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/hook_events",
    ...options
  });
};
var getHookEventsBySubjectType = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/hook_events/{subject_type}",
    ...options
  });
};
var listRepositories = (options) => {
  return (options?.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories",
    ...options
  });
};
var listWorkspaceRepositories = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}",
    ...options
  });
};
var deleteRepository = (options) => {
  return (options.client ?? client).delete({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}",
    ...options
  });
};
var getRepository = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}",
    ...options
  });
};
var createRepository = (options) => {
  return (options.client ?? client).post({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
var updateRepository = (options) => {
  return (options.client ?? client).put({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
var listBranchRestrictions = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/branch-restrictions",
    ...options
  });
};
var createBranchRestriction = (options) => {
  return (options.client ?? client).post({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/branch-restrictions",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
var deleteBranchRestriction = (options) => {
  return (options.client ?? client).delete({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/branch-restrictions/{id}",
    ...options
  });
};
var getBranchRestriction = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/branch-restrictions/{id}",
    ...options
  });
};
var updateBranchRestriction = (options) => {
  return (options.client ?? client).put({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/branch-restrictions/{id}",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
var getBranchingModel = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/branching-model",
    ...options
  });
};
var getBranchingModelSettings = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/branching-model/settings",
    ...options
  });
};
var updateBranchingModelSettings = (options) => {
  return (options.client ?? client).put({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/branching-model/settings",
    ...options
  });
};
var getCommit = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/commit/{commit}",
    ...options
  });
};
var deleteCommitApproval = (options) => {
  return (options.client ?? client).delete({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/commit/{commit}/approve",
    ...options
  });
};
var approveCommit = (options) => {
  return (options.client ?? client).post({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/commit/{commit}/approve",
    ...options
  });
};
var listCommitComments = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/commit/{commit}/comments",
    ...options
  });
};
var createCommitComment = (options) => {
  return (options.client ?? client).post({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/commit/{commit}/comments",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
var deleteCommitComment = (options) => {
  return (options.client ?? client).delete({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/commit/{commit}/comments/{comment_id}",
    ...options
  });
};
var getCommitComment = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/commit/{commit}/comments/{comment_id}",
    ...options
  });
};
var updateCommitComment = (options) => {
  return (options.client ?? client).put({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/commit/{commit}/comments/{comment_id}",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
var deleteCommitHostedPropertyValue = (options) => {
  return (options.client ?? client).delete({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/commit/{commit}/properties/{app_key}/{property_name}",
    ...options
  });
};
var getCommitHostedPropertyValue = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/commit/{commit}/properties/{app_key}/{property_name}",
    ...options
  });
};
var updateCommitHostedPropertyValue = (options) => {
  return (options.client ?? client).put({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/commit/{commit}/properties/{app_key}/{property_name}",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
var getPullrequestsForCommit = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/commit/{commit}/pullrequests",
    ...options
  });
};
var getReportsForCommit = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/commit/{commit}/reports",
    ...options
  });
};
var deleteReport = (options) => {
  return (options.client ?? client).delete({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/commit/{commit}/reports/{reportId}",
    ...options
  });
};
var getReport = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/commit/{commit}/reports/{reportId}",
    ...options
  });
};
var createOrUpdateReport = (options) => {
  return (options.client ?? client).put({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/commit/{commit}/reports/{reportId}",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
var getAnnotationsForReport = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/commit/{commit}/reports/{reportId}/annotations",
    ...options
  });
};
var bulkCreateOrUpdateAnnotations = (options) => {
  return (options.client ?? client).post({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/commit/{commit}/reports/{reportId}/annotations",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
var deleteAnnotation = (options) => {
  return (options.client ?? client).delete({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/commit/{commit}/reports/{reportId}/annotations/{annotationId}",
    ...options
  });
};
var getAnnotation = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/commit/{commit}/reports/{reportId}/annotations/{annotationId}",
    ...options
  });
};
var createOrUpdateAnnotation = (options) => {
  return (options.client ?? client).put({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/commit/{commit}/reports/{reportId}/annotations/{annotationId}",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
var listCommitStatuses = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/commit/{commit}/statuses",
    ...options
  });
};
var createCommitBuildStatus = (options) => {
  return (options.client ?? client).post({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/commit/{commit}/statuses/build",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
var getCommitBuildStatus = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/commit/{commit}/statuses/build/{key}",
    ...options
  });
};
var updateCommitBuildStatus = (options) => {
  return (options.client ?? client).put({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/commit/{commit}/statuses/build/{key}",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
var listCommits = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/commits",
    ...options
  });
};
var filterCommits = (options) => {
  return (options.client ?? client).post({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/commits",
    ...options
  });
};
var listCommitsByRevision = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/commits/{revision}",
    ...options
  });
};
var filterCommitsByRevision = (options) => {
  return (options.client ?? client).post({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/commits/{revision}",
    ...options
  });
};
var listComponents = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/components",
    ...options
  });
};
var getComponent = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/components/{component_id}",
    ...options
  });
};
var listDefaultReviewers = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/default-reviewers",
    ...options
  });
};
var deleteDefaultReviewer = (options) => {
  return (options.client ?? client).delete({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/default-reviewers/{target_username}",
    ...options
  });
};
var getDefaultReviewer = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/default-reviewers/{target_username}",
    ...options
  });
};
var addDefaultReviewer = (options) => {
  return (options.client ?? client).put({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/default-reviewers/{target_username}",
    ...options
  });
};
var listDeployKeys = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/deploy-keys",
    ...options
  });
};
var createDeployKey = (options) => {
  return (options.client ?? client).post({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/deploy-keys",
    ...options
  });
};
var deleteDeployKey = (options) => {
  return (options.client ?? client).delete({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/deploy-keys/{key_id}",
    ...options
  });
};
var getDeployKey = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/deploy-keys/{key_id}",
    ...options
  });
};
var updateDeployKey = (options) => {
  return (options.client ?? client).put({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/deploy-keys/{key_id}",
    ...options
  });
};
var getDeploymentsForRepository = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/deployments",
    ...options
  });
};
var getDeploymentForRepository = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/deployments/{deployment_uuid}",
    ...options
  });
};
var getDeploymentVariables = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/deployments_config/environments/{environment_uuid}/variables",
    ...options
  });
};
var createDeploymentVariable = (options) => {
  return (options.client ?? client).post({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/deployments_config/environments/{environment_uuid}/variables",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
var deleteDeploymentVariable = (options) => {
  return (options.client ?? client).delete({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/deployments_config/environments/{environment_uuid}/variables/{variable_uuid}",
    ...options
  });
};
var updateDeploymentVariable = (options) => {
  return (options.client ?? client).put({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/deployments_config/environments/{environment_uuid}/variables/{variable_uuid}",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
var getDiff = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/diff/{spec}",
    ...options
  });
};
var getDiffstat = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/diffstat/{spec}",
    ...options
  });
};
var listDownloads = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/downloads",
    ...options
  });
};
var createDownload = (options) => {
  return (options.client ?? client).post({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/downloads",
    ...options
  });
};
var deleteDownload = (options) => {
  return (options.client ?? client).delete({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/downloads/{filename}",
    ...options
  });
};
var getDownload = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/downloads/{filename}",
    ...options
  });
};
var getEffectiveBranchingModel = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/effective-branching-model",
    ...options
  });
};
var listEffectiveDefaultReviewers = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/effective-default-reviewers",
    ...options
  });
};
var getEnvironmentsForRepository = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/environments",
    ...options
  });
};
var createEnvironment = (options) => {
  return (options.client ?? client).post({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/environments",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
var deleteEnvironmentForRepository = (options) => {
  return (options.client ?? client).delete({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/environments/{environment_uuid}",
    ...options
  });
};
var getEnvironmentForRepository = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/environments/{environment_uuid}",
    ...options
  });
};
var updateEnvironmentForRepository = (options) => {
  return (options.client ?? client).post({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/environments/{environment_uuid}/changes",
    ...options
  });
};
var getFileHistory = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/filehistory/{commit}/{path}",
    ...options
  });
};
var listForks = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/forks",
    ...options
  });
};
var createFork = (options) => {
  return (options.client ?? client).post({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/forks",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
var listRepoHooks = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/hooks",
    ...options
  });
};
var createRepoHook = (options) => {
  return (options.client ?? client).post({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/hooks",
    ...options
  });
};
var deleteRepoHook = (options) => {
  return (options.client ?? client).delete({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/hooks/{uid}",
    ...options
  });
};
var getRepoHook = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/hooks/{uid}",
    ...options
  });
};
var updateRepoHook = (options) => {
  return (options.client ?? client).put({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/hooks/{uid}",
    ...options
  });
};
var listIssues = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/issues",
    ...options
  });
};
var createIssue = (options) => {
  return (options.client ?? client).post({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/issues",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
var exportIssues = (options) => {
  return (options.client ?? client).post({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/issues/export",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
var getIssueExportZip = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/issues/export/{repo_name}-issues-{task_id}.zip",
    ...options
  });
};
var getIssueImportStatus = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/issues/import",
    ...options
  });
};
var importIssues = (options) => {
  return (options.client ?? client).post({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/issues/import",
    ...options
  });
};
var deleteIssue = (options) => {
  return (options.client ?? client).delete({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/issues/{issue_id}",
    ...options
  });
};
var getIssue = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/issues/{issue_id}",
    ...options
  });
};
var updateIssue = (options) => {
  return (options.client ?? client).put({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/issues/{issue_id}",
    ...options
  });
};
var listIssueAttachments = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/issues/{issue_id}/attachments",
    ...options
  });
};
var createIssueAttachment = (options) => {
  return (options.client ?? client).post({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/issues/{issue_id}/attachments",
    ...options
  });
};
var deleteIssueAttachment = (options) => {
  return (options.client ?? client).delete({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/issues/{issue_id}/attachments/{path}",
    ...options
  });
};
var getIssueAttachment = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/issues/{issue_id}/attachments/{path}",
    ...options
  });
};
var listIssueChanges = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/issues/{issue_id}/changes",
    ...options
  });
};
var createIssueChange = (options) => {
  return (options.client ?? client).post({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/issues/{issue_id}/changes",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
var getIssueChange = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/issues/{issue_id}/changes/{change_id}",
    ...options
  });
};
var listIssueComments = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/issues/{issue_id}/comments",
    ...options
  });
};
var createIssueComment = (options) => {
  return (options.client ?? client).post({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/issues/{issue_id}/comments",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
var deleteIssueComment = (options) => {
  return (options.client ?? client).delete({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/issues/{issue_id}/comments/{comment_id}",
    ...options
  });
};
var getIssueComment = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/issues/{issue_id}/comments/{comment_id}",
    ...options
  });
};
var updateIssueComment = (options) => {
  return (options.client ?? client).put({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/issues/{issue_id}/comments/{comment_id}",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
var deleteIssueVote = (options) => {
  return (options.client ?? client).delete({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/issues/{issue_id}/vote",
    ...options
  });
};
var getIssueVote = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/issues/{issue_id}/vote",
    ...options
  });
};
var addIssueVote = (options) => {
  return (options.client ?? client).put({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/issues/{issue_id}/vote",
    ...options
  });
};
var unwatchIssue = (options) => {
  return (options.client ?? client).delete({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/issues/{issue_id}/watch",
    ...options
  });
};
var getIssueWatchStatus = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/issues/{issue_id}/watch",
    ...options
  });
};
var watchIssue = (options) => {
  return (options.client ?? client).put({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/issues/{issue_id}/watch",
    ...options
  });
};
var getMergeBase = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/merge-base/{revspec}",
    ...options
  });
};
var listMilestones = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/milestones",
    ...options
  });
};
var getMilestone = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/milestones/{milestone_id}",
    ...options
  });
};
var getOverrideSettings = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/override-settings",
    ...options
  });
};
var updateOverrideSettings = (options) => {
  return (options.client ?? client).put({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/override-settings",
    ...options
  });
};
var getPatch = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/patch/{spec}",
    ...options
  });
};
var listRepoPermissionGroups = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/permissions-config/groups",
    ...options
  });
};
var deleteRepoPermissionGroup = (options) => {
  return (options.client ?? client).delete({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/permissions-config/groups/{group_slug}",
    ...options
  });
};
var getRepoPermissionGroup = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/permissions-config/groups/{group_slug}",
    ...options
  });
};
var updateRepoPermissionGroup = (options) => {
  return (options.client ?? client).put({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/permissions-config/groups/{group_slug}",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
var listRepoPermissionUsers = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/permissions-config/users",
    ...options
  });
};
var deleteRepoPermissionUser = (options) => {
  return (options.client ?? client).delete({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/permissions-config/users/{selected_user_id}",
    ...options
  });
};
var getRepoPermissionUser = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/permissions-config/users/{selected_user_id}",
    ...options
  });
};
var updateRepoPermissionUser = (options) => {
  return (options.client ?? client).put({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/permissions-config/users/{selected_user_id}",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
var getPipelinesForRepository = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pipelines",
    ...options
  });
};
var createPipelineForRepository = (options) => {
  return (options.client ?? client).post({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pipelines",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
var deleteRepositoryPipelineCaches = (options) => {
  return (options.client ?? client).delete({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pipelines-config/caches",
    ...options
  });
};
var getRepositoryPipelineCaches = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pipelines-config/caches",
    ...options
  });
};
var deleteRepositoryPipelineCache = (options) => {
  return (options.client ?? client).delete({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pipelines-config/caches/{cache_uuid}",
    ...options
  });
};
var getRepositoryPipelineCacheContentUri = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pipelines-config/caches/{cache_uuid}/content-uri",
    ...options
  });
};
var getRepositoryRunners = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pipelines-config/runners",
    ...options
  });
};
var createRepositoryRunner = (options) => {
  return (options.client ?? client).post({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pipelines-config/runners",
    ...options
  });
};
var deleteRepositoryRunner = (options) => {
  return (options.client ?? client).delete({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pipelines-config/runners/{runner_uuid}",
    ...options
  });
};
var getRepositoryRunner = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pipelines-config/runners/{runner_uuid}",
    ...options
  });
};
var updateRepositoryRunner = (options) => {
  return (options.client ?? client).put({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pipelines-config/runners/{runner_uuid}",
    ...options
  });
};
var getPipelineForRepository = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pipelines/{pipeline_uuid}",
    ...options
  });
};
var getPipelineStepsForRepository = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pipelines/{pipeline_uuid}/steps",
    ...options
  });
};
var getPipelineStepForRepository = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pipelines/{pipeline_uuid}/steps/{step_uuid}",
    ...options
  });
};
var getPipelineStepLogForRepository = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pipelines/{pipeline_uuid}/steps/{step_uuid}/log",
    ...options
  });
};
var getPipelineContainerLog = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pipelines/{pipeline_uuid}/steps/{step_uuid}/logs/{log_uuid}",
    ...options
  });
};
var getPipelineTestReports = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pipelines/{pipeline_uuid}/steps/{step_uuid}/test_reports",
    ...options
  });
};
var getPipelineTestReportTestCases = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pipelines/{pipeline_uuid}/steps/{step_uuid}/test_reports/test_cases",
    ...options
  });
};
var getPipelineTestReportTestCaseReasons = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pipelines/{pipeline_uuid}/steps/{step_uuid}/test_reports/test_cases/{test_case_uuid}/test_case_reasons",
    ...options
  });
};
var stopPipeline = (options) => {
  return (options.client ?? client).post({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pipelines/{pipeline_uuid}/stopPipeline",
    ...options
  });
};
var getRepositoryPipelineConfig = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pipelines_config",
    ...options
  });
};
var updateRepositoryPipelineConfig = (options) => {
  return (options.client ?? client).put({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pipelines_config",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
var updateRepositoryBuildNumber = (options) => {
  return (options.client ?? client).put({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pipelines_config/build_number",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
var getRepositoryPipelineSchedules = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pipelines_config/schedules",
    ...options
  });
};
var createRepositoryPipelineSchedule = (options) => {
  return (options.client ?? client).post({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pipelines_config/schedules",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
var deleteRepositoryPipelineSchedule = (options) => {
  return (options.client ?? client).delete({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pipelines_config/schedules/{schedule_uuid}",
    ...options
  });
};
var getRepositoryPipelineSchedule = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pipelines_config/schedules/{schedule_uuid}",
    ...options
  });
};
var updateRepositoryPipelineSchedule = (options) => {
  return (options.client ?? client).put({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pipelines_config/schedules/{schedule_uuid}",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
var getRepositoryPipelineScheduleExecutions = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pipelines_config/schedules/{schedule_uuid}/executions",
    ...options
  });
};
var deleteRepositoryPipelineKeyPair = (options) => {
  return (options.client ?? client).delete({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pipelines_config/ssh/key_pair",
    ...options
  });
};
var getRepositoryPipelineSshKeyPair = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pipelines_config/ssh/key_pair",
    ...options
  });
};
var updateRepositoryPipelineKeyPair = (options) => {
  return (options.client ?? client).put({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pipelines_config/ssh/key_pair",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
var getRepositoryPipelineKnownHosts = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pipelines_config/ssh/known_hosts",
    ...options
  });
};
var createRepositoryPipelineKnownHost = (options) => {
  return (options.client ?? client).post({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pipelines_config/ssh/known_hosts",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
var deleteRepositoryPipelineKnownHost = (options) => {
  return (options.client ?? client).delete({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pipelines_config/ssh/known_hosts/{known_host_uuid}",
    ...options
  });
};
var getRepositoryPipelineKnownHost = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pipelines_config/ssh/known_hosts/{known_host_uuid}",
    ...options
  });
};
var updateRepositoryPipelineKnownHost = (options) => {
  return (options.client ?? client).put({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pipelines_config/ssh/known_hosts/{known_host_uuid}",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
var getRepositoryPipelineVariables = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pipelines_config/variables",
    ...options
  });
};
var createRepositoryPipelineVariable = (options) => {
  return (options.client ?? client).post({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pipelines_config/variables",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
var deleteRepositoryPipelineVariable = (options) => {
  return (options.client ?? client).delete({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pipelines_config/variables/{variable_uuid}",
    ...options
  });
};
var getRepositoryPipelineVariable = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pipelines_config/variables/{variable_uuid}",
    ...options
  });
};
var updateRepositoryPipelineVariable = (options) => {
  return (options.client ?? client).put({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pipelines_config/variables/{variable_uuid}",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
var deleteRepositoryHostedPropertyValue = (options) => {
  return (options.client ?? client).delete({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/properties/{app_key}/{property_name}",
    ...options
  });
};
var getRepositoryHostedPropertyValue = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/properties/{app_key}/{property_name}",
    ...options
  });
};
var updateRepositoryHostedPropertyValue = (options) => {
  return (options.client ?? client).put({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/properties/{app_key}/{property_name}",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
var listPullRequests = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pullrequests",
    ...options
  });
};
var createPullRequest = (options) => {
  return (options.client ?? client).post({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pullrequests",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
var listPullRequestsActivity = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pullrequests/activity",
    ...options
  });
};
var getPullRequest = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}",
    ...options
  });
};
var updatePullRequest = (options) => {
  return (options.client ?? client).put({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
var getPullRequestActivity = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/activity",
    ...options
  });
};
var deletePullRequestApproval = (options) => {
  return (options.client ?? client).delete({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/approve",
    ...options
  });
};
var approvePullRequest = (options) => {
  return (options.client ?? client).post({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/approve",
    ...options
  });
};
var listPullRequestComments = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/comments",
    ...options
  });
};
var createPullRequestComment = (options) => {
  return (options.client ?? client).post({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/comments",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
var deletePullRequestComment = (options) => {
  return (options.client ?? client).delete({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/comments/{comment_id}",
    ...options
  });
};
var getPullRequestComment = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/comments/{comment_id}",
    ...options
  });
};
var updatePullRequestComment = (options) => {
  return (options.client ?? client).put({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/comments/{comment_id}",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
var unresolvePullRequestComment = (options) => {
  return (options.client ?? client).delete({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/comments/{comment_id}/resolve",
    ...options
  });
};
var resolvePullRequestComment = (options) => {
  return (options.client ?? client).post({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/comments/{comment_id}/resolve",
    ...options
  });
};
var listPullRequestCommits = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/commits",
    ...options
  });
};
var declinePullRequest = (options) => {
  return (options.client ?? client).post({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/decline",
    ...options
  });
};
var getPullRequestDiff = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/diff",
    ...options
  });
};
var getPullRequestDiffstat = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/diffstat",
    ...options
  });
};
var mergePullRequest = (options) => {
  return (options.client ?? client).post({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/merge",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
var getPullRequestMergeTaskStatus = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/merge/task-status/{task_id}",
    ...options
  });
};
var getPullRequestPatch = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/patch",
    ...options
  });
};
var deletePullRequestChangeRequest = (options) => {
  return (options.client ?? client).delete({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/request-changes",
    ...options
  });
};
var requestPullRequestChanges = (options) => {
  return (options.client ?? client).post({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/request-changes",
    ...options
  });
};
var listPullRequestStatuses = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/statuses",
    ...options
  });
};
var listPullRequestTasks = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/tasks",
    ...options
  });
};
var createPullRequestTask = (options) => {
  return (options.client ?? client).post({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/tasks",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
var deletePullRequestTask = (options) => {
  return (options.client ?? client).delete({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/tasks/{task_id}",
    ...options
  });
};
var getPullRequestTask = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/tasks/{task_id}",
    ...options
  });
};
var updatePullRequestTask = (options) => {
  return (options.client ?? client).put({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/tasks/{task_id}",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
var deletePullRequestHostedPropertyValue = (options) => {
  return (options.client ?? client).delete({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pullrequests/{pullrequest_id}/properties/{app_key}/{property_name}",
    ...options
  });
};
var getPullRequestHostedPropertyValue = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pullrequests/{pullrequest_id}/properties/{app_key}/{property_name}",
    ...options
  });
};
var updatePullRequestHostedPropertyValue = (options) => {
  return (options.client ?? client).put({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/pullrequests/{pullrequest_id}/properties/{app_key}/{property_name}",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
var listRefs = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/refs",
    ...options
  });
};
var listBranches = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/refs/branches",
    ...options
  });
};
var createBranch = (options) => {
  return (options.client ?? client).post({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/refs/branches",
    ...options
  });
};
var deleteBranch = (options) => {
  return (options.client ?? client).delete({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/refs/branches/{name}",
    ...options
  });
};
var getBranch = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/refs/branches/{name}",
    ...options
  });
};
var listTags = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/refs/tags",
    ...options
  });
};
var createTag = (options) => {
  return (options.client ?? client).post({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/refs/tags",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
var deleteTag = (options) => {
  return (options.client ?? client).delete({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/refs/tags/{name}",
    ...options
  });
};
var getTag = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/refs/tags/{name}",
    ...options
  });
};
var listSrcRoot = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/src",
    ...options
  });
};
var createSrcFileCommit = (options) => {
  return (options.client ?? client).post({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/src",
    ...options
  });
};
var getSrcFile = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/src/{commit}/{path}",
    ...options
  });
};
var listVersions = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/versions",
    ...options
  });
};
var getVersion = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/versions/{version_id}",
    ...options
  });
};
var listRepoWatchers = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/repositories/{workspace}/{repo_slug}/watchers",
    ...options
  });
};
var listSnippets = (options) => {
  return (options?.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/snippets",
    ...options
  });
};
var createSnippet = (options) => {
  return (options.client ?? client).post({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/snippets",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
var listWorkspaceSnippets = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/snippets/{workspace}",
    ...options
  });
};
var createWorkspaceSnippet = (options) => {
  return (options.client ?? client).post({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/snippets/{workspace}",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
var deleteSnippet = (options) => {
  return (options.client ?? client).delete({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/snippets/{workspace}/{encoded_id}",
    ...options
  });
};
var getSnippet = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/snippets/{workspace}/{encoded_id}",
    ...options
  });
};
var updateSnippet = (options) => {
  return (options.client ?? client).put({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/snippets/{workspace}/{encoded_id}",
    ...options
  });
};
var listSnippetComments = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/snippets/{workspace}/{encoded_id}/comments",
    ...options
  });
};
var createSnippetComment = (options) => {
  return (options.client ?? client).post({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/snippets/{workspace}/{encoded_id}/comments",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
var deleteSnippetComment = (options) => {
  return (options.client ?? client).delete({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/snippets/{workspace}/{encoded_id}/comments/{comment_id}",
    ...options
  });
};
var getSnippetComment = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/snippets/{workspace}/{encoded_id}/comments/{comment_id}",
    ...options
  });
};
var updateSnippetComment = (options) => {
  return (options.client ?? client).put({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/snippets/{workspace}/{encoded_id}/comments/{comment_id}",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
var listSnippetCommits = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/snippets/{workspace}/{encoded_id}/commits",
    ...options
  });
};
var getSnippetCommit = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/snippets/{workspace}/{encoded_id}/commits/{revision}",
    ...options
  });
};
var getSnippetFile = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/snippets/{workspace}/{encoded_id}/files/{path}",
    ...options
  });
};
var unwatchSnippet = (options) => {
  return (options.client ?? client).delete({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/snippets/{workspace}/{encoded_id}/watch",
    ...options
  });
};
var getSnippetWatchStatus = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/snippets/{workspace}/{encoded_id}/watch",
    ...options
  });
};
var watchSnippet = (options) => {
  return (options.client ?? client).put({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/snippets/{workspace}/{encoded_id}/watch",
    ...options
  });
};
var listSnippetWatchers = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/snippets/{workspace}/{encoded_id}/watchers",
    ...options
  });
};
var deleteSnippetRevision = (options) => {
  return (options.client ?? client).delete({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/snippets/{workspace}/{encoded_id}/{node_id}",
    ...options
  });
};
var getSnippetRevision = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/snippets/{workspace}/{encoded_id}/{node_id}",
    ...options
  });
};
var updateSnippetRevision = (options) => {
  return (options.client ?? client).put({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/snippets/{workspace}/{encoded_id}/{node_id}",
    ...options
  });
};
var getSnippetRevisionFile = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/snippets/{workspace}/{encoded_id}/{node_id}/files/{path}",
    ...options
  });
};
var getSnippetDiff = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/snippets/{workspace}/{encoded_id}/{revision}/diff",
    ...options
  });
};
var getSnippetPatch = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/snippets/{workspace}/{encoded_id}/{revision}/patch",
    ...options
  });
};
var getPipelineVariablesForTeam = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/teams/{username}/pipelines_config/variables",
    ...options
  });
};
var createPipelineVariableForTeam = (options) => {
  return (options.client ?? client).post({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/teams/{username}/pipelines_config/variables",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
var deletePipelineVariableForTeam = (options) => {
  return (options.client ?? client).delete({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/teams/{username}/pipelines_config/variables/{variable_uuid}",
    ...options
  });
};
var getPipelineVariableForTeam = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/teams/{username}/pipelines_config/variables/{variable_uuid}",
    ...options
  });
};
var updatePipelineVariableForTeam = (options) => {
  return (options.client ?? client).put({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/teams/{username}/pipelines_config/variables/{variable_uuid}",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
var searchTeam = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/teams/{username}/search/code",
    ...options
  });
};
var getUser = (options) => {
  return (options?.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/user",
    ...options
  });
};
var getUserEmails = (options) => {
  return (options?.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/user/emails",
    ...options
  });
};
var getUserEmail = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/user/emails/{email}",
    ...options
  });
};
var getUserPermissionsRepositories = (options) => {
  return (options?.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/user/permissions/repositories",
    ...options
  });
};
var getUserPermissionsWorkspaces = (options) => {
  return (options?.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/user/permissions/workspaces",
    ...options
  });
};
var getUserWorkspaces = (options) => {
  return (options?.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/user/workspaces",
    ...options
  });
};
var getUserWorkspacePermission = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/user/workspaces/{workspace}/permission",
    ...options
  });
};
var getUserProfile = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/users/{selected_user}",
    ...options
  });
};
var listUserGpgKeys = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/users/{selected_user}/gpg-keys",
    ...options
  });
};
var createUserGpgKey = (options) => {
  return (options.client ?? client).post({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/users/{selected_user}/gpg-keys",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
var deleteUserGpgKey = (options) => {
  return (options.client ?? client).delete({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/users/{selected_user}/gpg-keys/{fingerprint}",
    ...options
  });
};
var getUserGpgKey = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/users/{selected_user}/gpg-keys/{fingerprint}",
    ...options
  });
};
var getPipelineVariablesForUser = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/users/{selected_user}/pipelines_config/variables",
    ...options
  });
};
var createPipelineVariableForUser = (options) => {
  return (options.client ?? client).post({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/users/{selected_user}/pipelines_config/variables",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
var deletePipelineVariableForUser = (options) => {
  return (options.client ?? client).delete({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/users/{selected_user}/pipelines_config/variables/{variable_uuid}",
    ...options
  });
};
var getPipelineVariableForUser = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/users/{selected_user}/pipelines_config/variables/{variable_uuid}",
    ...options
  });
};
var updatePipelineVariableForUser = (options) => {
  return (options.client ?? client).put({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/users/{selected_user}/pipelines_config/variables/{variable_uuid}",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
var deleteUserHostedPropertyValue = (options) => {
  return (options.client ?? client).delete({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/users/{selected_user}/properties/{app_key}/{property_name}",
    ...options
  });
};
var retrieveUserHostedPropertyValue = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/users/{selected_user}/properties/{app_key}/{property_name}",
    ...options
  });
};
var updateUserHostedPropertyValue = (options) => {
  return (options.client ?? client).put({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/users/{selected_user}/properties/{app_key}/{property_name}",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
var searchAccount = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/users/{selected_user}/search/code",
    ...options
  });
};
var listUserSshKeys = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/users/{selected_user}/ssh-keys",
    ...options
  });
};
var createUserSshKey = (options) => {
  return (options.client ?? client).post({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/users/{selected_user}/ssh-keys",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
var deleteUserSshKey = (options) => {
  return (options.client ?? client).delete({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/users/{selected_user}/ssh-keys/{key_id}",
    ...options
  });
};
var getUserSshKey = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/users/{selected_user}/ssh-keys/{key_id}",
    ...options
  });
};
var updateUserSshKey = (options) => {
  return (options.client ?? client).put({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/users/{selected_user}/ssh-keys/{key_id}",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
var listWorkspaces = (options) => {
  return (options?.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/workspaces",
    ...options
  });
};
var getWorkspace = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/workspaces/{workspace}",
    ...options
  });
};
var listWorkspaceHooks = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/workspaces/{workspace}/hooks",
    ...options
  });
};
var createWorkspaceHook = (options) => {
  return (options.client ?? client).post({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/workspaces/{workspace}/hooks",
    ...options
  });
};
var deleteWorkspaceHook = (options) => {
  return (options.client ?? client).delete({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/workspaces/{workspace}/hooks/{uid}",
    ...options
  });
};
var getWorkspaceHook = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/workspaces/{workspace}/hooks/{uid}",
    ...options
  });
};
var updateWorkspaceHook = (options) => {
  return (options.client ?? client).put({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/workspaces/{workspace}/hooks/{uid}",
    ...options
  });
};
var listWorkspaceMembers = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/workspaces/{workspace}/members",
    ...options
  });
};
var getWorkspaceMember = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/workspaces/{workspace}/members/{member}",
    ...options
  });
};
var listWorkspacePermissions = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/workspaces/{workspace}/permissions",
    ...options
  });
};
var listWorkspaceRepoPermissions = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/workspaces/{workspace}/permissions/repositories",
    ...options
  });
};
var getWorkspaceRepoPermission = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/workspaces/{workspace}/permissions/repositories/{repo_slug}",
    ...options
  });
};
var getOidcConfiguration = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/workspaces/{workspace}/pipelines-config/identity/oidc/.well-known/openid-configuration",
    ...options
  });
};
var getOidcKeys = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/workspaces/{workspace}/pipelines-config/identity/oidc/keys.json",
    ...options
  });
};
var getWorkspaceRunners = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/workspaces/{workspace}/pipelines-config/runners",
    ...options
  });
};
var createWorkspaceRunner = (options) => {
  return (options.client ?? client).post({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/workspaces/{workspace}/pipelines-config/runners",
    ...options
  });
};
var deleteWorkspaceRunner = (options) => {
  return (options.client ?? client).delete({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/workspaces/{workspace}/pipelines-config/runners/{runner_uuid}",
    ...options
  });
};
var getWorkspaceRunner = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/workspaces/{workspace}/pipelines-config/runners/{runner_uuid}",
    ...options
  });
};
var updateWorkspaceRunner = (options) => {
  return (options.client ?? client).put({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/workspaces/{workspace}/pipelines-config/runners/{runner_uuid}",
    ...options
  });
};
var getPipelineVariablesForWorkspace = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/workspaces/{workspace}/pipelines-config/variables",
    ...options
  });
};
var createPipelineVariableForWorkspace = (options) => {
  return (options.client ?? client).post({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/workspaces/{workspace}/pipelines-config/variables",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
var deletePipelineVariableForWorkspace = (options) => {
  return (options.client ?? client).delete({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/workspaces/{workspace}/pipelines-config/variables/{variable_uuid}",
    ...options
  });
};
var getPipelineVariableForWorkspace = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/workspaces/{workspace}/pipelines-config/variables/{variable_uuid}",
    ...options
  });
};
var updatePipelineVariableForWorkspace = (options) => {
  return (options.client ?? client).put({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/workspaces/{workspace}/pipelines-config/variables/{variable_uuid}",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
var listProjects = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/workspaces/{workspace}/projects",
    ...options
  });
};
var createProject = (options) => {
  return (options.client ?? client).post({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/workspaces/{workspace}/projects",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
var deleteProject = (options) => {
  return (options.client ?? client).delete({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/workspaces/{workspace}/projects/{project_key}",
    ...options
  });
};
var getProject = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/workspaces/{workspace}/projects/{project_key}",
    ...options
  });
};
var updateProject = (options) => {
  return (options.client ?? client).put({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/workspaces/{workspace}/projects/{project_key}",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
var getProjectBranchingModel = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/workspaces/{workspace}/projects/{project_key}/branching-model",
    ...options
  });
};
var getProjectBranchingModelSettings = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/workspaces/{workspace}/projects/{project_key}/branching-model/settings",
    ...options
  });
};
var updateProjectBranchingModelSettings = (options) => {
  return (options.client ?? client).put({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/workspaces/{workspace}/projects/{project_key}/branching-model/settings",
    ...options
  });
};
var listProjectDefaultReviewers = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/workspaces/{workspace}/projects/{project_key}/default-reviewers",
    ...options
  });
};
var deleteProjectDefaultReviewer = (options) => {
  return (options.client ?? client).delete({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/workspaces/{workspace}/projects/{project_key}/default-reviewers/{selected_user}",
    ...options
  });
};
var getProjectDefaultReviewer = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/workspaces/{workspace}/projects/{project_key}/default-reviewers/{selected_user}",
    ...options
  });
};
var addProjectDefaultReviewer = (options) => {
  return (options.client ?? client).put({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/workspaces/{workspace}/projects/{project_key}/default-reviewers/{selected_user}",
    ...options
  });
};
var listProjectDeployKeys = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/workspaces/{workspace}/projects/{project_key}/deploy-keys",
    ...options
  });
};
var createProjectDeployKey = (options) => {
  return (options.client ?? client).post({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/workspaces/{workspace}/projects/{project_key}/deploy-keys",
    ...options
  });
};
var deleteProjectDeployKey = (options) => {
  return (options.client ?? client).delete({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/workspaces/{workspace}/projects/{project_key}/deploy-keys/{key_id}",
    ...options
  });
};
var getProjectDeployKey = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/workspaces/{workspace}/projects/{project_key}/deploy-keys/{key_id}",
    ...options
  });
};
var listProjectPermissionGroups = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/workspaces/{workspace}/projects/{project_key}/permissions-config/groups",
    ...options
  });
};
var deleteProjectPermissionGroup = (options) => {
  return (options.client ?? client).delete({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/workspaces/{workspace}/projects/{project_key}/permissions-config/groups/{group_slug}",
    ...options
  });
};
var getProjectPermissionGroup = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/workspaces/{workspace}/projects/{project_key}/permissions-config/groups/{group_slug}",
    ...options
  });
};
var updateProjectPermissionGroup = (options) => {
  return (options.client ?? client).put({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/workspaces/{workspace}/projects/{project_key}/permissions-config/groups/{group_slug}",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
var listProjectPermissionUsers = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/workspaces/{workspace}/projects/{project_key}/permissions-config/users",
    ...options
  });
};
var deleteProjectPermissionUser = (options) => {
  return (options.client ?? client).delete({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/workspaces/{workspace}/projects/{project_key}/permissions-config/users/{selected_user_id}",
    ...options
  });
};
var getProjectPermissionUser = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/workspaces/{workspace}/projects/{project_key}/permissions-config/users/{selected_user_id}",
    ...options
  });
};
var updateProjectPermissionUser = (options) => {
  return (options.client ?? client).put({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/workspaces/{workspace}/projects/{project_key}/permissions-config/users/{selected_user_id}",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
var listWorkspaceUserPullRequests = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/workspaces/{workspace}/pullrequests/{selected_user}",
    ...options
  });
};
var searchWorkspace = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      },
      {
        scheme: "basic",
        type: "http"
      },
      {
        name: "Authorization",
        type: "apiKey"
      }
    ],
    url: "/workspaces/{workspace}/search/code",
    ...options
  });
};
export {
  addDefaultReviewer,
  addIssueVote,
  addProjectDefaultReviewer,
  approveCommit,
  approvePullRequest,
  bulkCreateOrUpdateAnnotations,
  client,
  createAddonLinkerValues,
  createBranch,
  createBranchRestriction,
  createClient,
  createCommitBuildStatus,
  createCommitComment,
  createConfig,
  createDeployKey,
  createDeploymentVariable,
  createDownload,
  createEnvironment,
  createFork,
  createIssue,
  createIssueAttachment,
  createIssueChange,
  createIssueComment,
  createOrUpdateAnnotation,
  createOrUpdateReport,
  createPipelineForRepository,
  createPipelineVariableForTeam,
  createPipelineVariableForUser,
  createPipelineVariableForWorkspace,
  createProject,
  createProjectDeployKey,
  createPullRequest,
  createPullRequestComment,
  createPullRequestTask,
  createRepoHook,
  createRepository,
  createRepositoryPipelineKnownHost,
  createRepositoryPipelineSchedule,
  createRepositoryPipelineVariable,
  createRepositoryRunner,
  createSnippet,
  createSnippetComment,
  createSrcFileCommit,
  createTag,
  createUserGpgKey,
  createUserSshKey,
  createWorkspaceHook,
  createWorkspaceRunner,
  createWorkspaceSnippet,
  declinePullRequest,
  deleteAddon,
  deleteAddonLinkerValue,
  deleteAddonLinkerValues,
  deleteAnnotation,
  deleteBranch,
  deleteBranchRestriction,
  deleteCommitApproval,
  deleteCommitComment,
  deleteCommitHostedPropertyValue,
  deleteDefaultReviewer,
  deleteDeployKey,
  deleteDeploymentVariable,
  deleteDownload,
  deleteEnvironmentForRepository,
  deleteIssue,
  deleteIssueAttachment,
  deleteIssueComment,
  deleteIssueVote,
  deletePipelineVariableForTeam,
  deletePipelineVariableForUser,
  deletePipelineVariableForWorkspace,
  deleteProject,
  deleteProjectDefaultReviewer,
  deleteProjectDeployKey,
  deleteProjectPermissionGroup,
  deleteProjectPermissionUser,
  deletePullRequestApproval,
  deletePullRequestChangeRequest,
  deletePullRequestComment,
  deletePullRequestHostedPropertyValue,
  deletePullRequestTask,
  deleteRepoHook,
  deleteRepoPermissionGroup,
  deleteRepoPermissionUser,
  deleteReport,
  deleteRepository,
  deleteRepositoryHostedPropertyValue,
  deleteRepositoryPipelineCache,
  deleteRepositoryPipelineCaches,
  deleteRepositoryPipelineKeyPair,
  deleteRepositoryPipelineKnownHost,
  deleteRepositoryPipelineSchedule,
  deleteRepositoryPipelineVariable,
  deleteRepositoryRunner,
  deleteSnippet,
  deleteSnippetComment,
  deleteSnippetRevision,
  deleteTag,
  deleteUserGpgKey,
  deleteUserHostedPropertyValue,
  deleteUserSshKey,
  deleteWorkspaceHook,
  deleteWorkspaceRunner,
  exportIssues,
  filterCommits,
  filterCommitsByRevision,
  getAddonLinker,
  getAddonLinkerValue,
  getAddonLinkerValues,
  getAddonLinkers,
  getAnnotation,
  getAnnotationsForReport,
  getBranch,
  getBranchRestriction,
  getBranchingModel,
  getBranchingModelSettings,
  getCommit,
  getCommitBuildStatus,
  getCommitComment,
  getCommitHostedPropertyValue,
  getComponent,
  getDefaultReviewer,
  getDeployKey,
  getDeploymentForRepository,
  getDeploymentVariables,
  getDeploymentsForRepository,
  getDiff,
  getDiffstat,
  getDownload,
  getEffectiveBranchingModel,
  getEnvironmentForRepository,
  getEnvironmentsForRepository,
  getFileHistory,
  getHookEvents,
  getHookEventsBySubjectType,
  getIssue,
  getIssueAttachment,
  getIssueChange,
  getIssueComment,
  getIssueExportZip,
  getIssueImportStatus,
  getIssueVote,
  getIssueWatchStatus,
  getMergeBase,
  getMilestone,
  getOidcConfiguration,
  getOidcKeys,
  getOverrideSettings,
  getPatch,
  getPipelineContainerLog,
  getPipelineForRepository,
  getPipelineStepForRepository,
  getPipelineStepLogForRepository,
  getPipelineStepsForRepository,
  getPipelineTestReportTestCaseReasons,
  getPipelineTestReportTestCases,
  getPipelineTestReports,
  getPipelineVariableForTeam,
  getPipelineVariableForUser,
  getPipelineVariableForWorkspace,
  getPipelineVariablesForTeam,
  getPipelineVariablesForUser,
  getPipelineVariablesForWorkspace,
  getPipelinesForRepository,
  getProject,
  getProjectBranchingModel,
  getProjectBranchingModelSettings,
  getProjectDefaultReviewer,
  getProjectDeployKey,
  getProjectPermissionGroup,
  getProjectPermissionUser,
  getPullRequest,
  getPullRequestActivity,
  getPullRequestComment,
  getPullRequestDiff,
  getPullRequestDiffstat,
  getPullRequestHostedPropertyValue,
  getPullRequestMergeTaskStatus,
  getPullRequestPatch,
  getPullRequestTask,
  getPullrequestsForCommit,
  getRepoHook,
  getRepoPermissionGroup,
  getRepoPermissionUser,
  getReport,
  getReportsForCommit,
  getRepository,
  getRepositoryHostedPropertyValue,
  getRepositoryPipelineCacheContentUri,
  getRepositoryPipelineCaches,
  getRepositoryPipelineConfig,
  getRepositoryPipelineKnownHost,
  getRepositoryPipelineKnownHosts,
  getRepositoryPipelineSchedule,
  getRepositoryPipelineScheduleExecutions,
  getRepositoryPipelineSchedules,
  getRepositoryPipelineSshKeyPair,
  getRepositoryPipelineVariable,
  getRepositoryPipelineVariables,
  getRepositoryRunner,
  getRepositoryRunners,
  getSnippet,
  getSnippetComment,
  getSnippetCommit,
  getSnippetDiff,
  getSnippetFile,
  getSnippetPatch,
  getSnippetRevision,
  getSnippetRevisionFile,
  getSnippetWatchStatus,
  getSrcFile,
  getTag,
  getUser,
  getUserEmail,
  getUserEmails,
  getUserGpgKey,
  getUserPermissionsRepositories,
  getUserPermissionsWorkspaces,
  getUserProfile,
  getUserSshKey,
  getUserWorkspacePermission,
  getUserWorkspaces,
  getVersion,
  getWorkspace,
  getWorkspaceHook,
  getWorkspaceMember,
  getWorkspaceRepoPermission,
  getWorkspaceRunner,
  getWorkspaceRunners,
  importIssues,
  listBranchRestrictions,
  listBranches,
  listCommitComments,
  listCommitStatuses,
  listCommits,
  listCommitsByRevision,
  listComponents,
  listDefaultReviewers,
  listDeployKeys,
  listDownloads,
  listEffectiveDefaultReviewers,
  listForks,
  listIssueAttachments,
  listIssueChanges,
  listIssueComments,
  listIssues,
  listMilestones,
  listProjectDefaultReviewers,
  listProjectDeployKeys,
  listProjectPermissionGroups,
  listProjectPermissionUsers,
  listProjects,
  listPullRequestComments,
  listPullRequestCommits,
  listPullRequestStatuses,
  listPullRequestTasks,
  listPullRequests,
  listPullRequestsActivity,
  listRefs,
  listRepoHooks,
  listRepoPermissionGroups,
  listRepoPermissionUsers,
  listRepoWatchers,
  listRepositories,
  listSnippetComments,
  listSnippetCommits,
  listSnippetWatchers,
  listSnippets,
  listSrcRoot,
  listTags,
  listUserGpgKeys,
  listUserSshKeys,
  listVersions,
  listWorkspaceHooks,
  listWorkspaceMembers,
  listWorkspacePermissions,
  listWorkspaceRepoPermissions,
  listWorkspaceRepositories,
  listWorkspaceSnippets,
  listWorkspaceUserPullRequests,
  listWorkspaces,
  mergeHeaders,
  mergePullRequest,
  requestPullRequestChanges,
  resolvePullRequestComment,
  retrieveUserHostedPropertyValue,
  searchAccount,
  searchTeam,
  searchWorkspace,
  stopPipeline,
  unresolvePullRequestComment,
  unwatchIssue,
  unwatchSnippet,
  updateAddon,
  updateAddonLinkerValues,
  updateBranchRestriction,
  updateBranchingModelSettings,
  updateCommitBuildStatus,
  updateCommitComment,
  updateCommitHostedPropertyValue,
  updateDeployKey,
  updateDeploymentVariable,
  updateEnvironmentForRepository,
  updateIssue,
  updateIssueComment,
  updateOverrideSettings,
  updatePipelineVariableForTeam,
  updatePipelineVariableForUser,
  updatePipelineVariableForWorkspace,
  updateProject,
  updateProjectBranchingModelSettings,
  updateProjectPermissionGroup,
  updateProjectPermissionUser,
  updatePullRequest,
  updatePullRequestComment,
  updatePullRequestHostedPropertyValue,
  updatePullRequestTask,
  updateRepoHook,
  updateRepoPermissionGroup,
  updateRepoPermissionUser,
  updateRepository,
  updateRepositoryBuildNumber,
  updateRepositoryHostedPropertyValue,
  updateRepositoryPipelineConfig,
  updateRepositoryPipelineKeyPair,
  updateRepositoryPipelineKnownHost,
  updateRepositoryPipelineSchedule,
  updateRepositoryPipelineVariable,
  updateRepositoryRunner,
  updateSnippet,
  updateSnippetComment,
  updateSnippetRevision,
  updateUserHostedPropertyValue,
  updateUserSshKey,
  updateWorkspaceHook,
  updateWorkspaceRunner,
  watchIssue,
  watchSnippet
};
