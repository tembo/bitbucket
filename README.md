<h1 align="center">@tembo-io/bitbucket</h1>

<p align="center">A fully typed TypeScript client for the <a href="https://developer.atlassian.com/cloud/bitbucket/rest/intro/">Bitbucket Cloud REST API</a>. Generated from the <a href="https://dac-static.atlassian.com/cloud/bitbucket/swagger.v3.json?_v=2.300.151">official OpenAPI spec.</p>

## Install

```bash
npm install @tembo-io/bitbucket
```

## Quick Start

The package exports a pre-configured `client` instance pointing at `https://api.bitbucket.org/2.0`. Set your auth token once, then call any SDK function:

```ts
import { client, getUser } from "@tembo-io/bitbucket";

client.setConfig({
  auth: "your-access-token",
});

const { data, error } = await getUser();

if (error) {
  console.error(error);
} else {
  console.log(data);
}
```

## Authentication

All SDK functions support Bearer token, Basic auth, and API key authentication. Pass `auth` when configuring the client:

**Bearer token (most common):**

```ts
client.setConfig({
  auth: "your-oauth-access-token",
});
```

**Basic auth:**

```ts
client.setConfig({
  auth: `${username}:${appPassword}`,
});
```

**Dynamic auth (e.g. refreshing tokens):**

```ts
client.setConfig({
  auth: (auth) => {
    if (auth.scheme === "bearer") {
      return getAccessToken();
    }
  },
});
```

## Usage

Every endpoint in the [Bitbucket Cloud REST API](https://developer.atlassian.com/cloud/bitbucket/rest/intro/) has a corresponding typed function. Path and query parameters are passed via the `path` and `query` fields.

### Repositories

```ts
import {
  listWorkspaceRepositories,
  getRepository,
} from "@tembo-io/bitbucket";

// List all repositories in a workspace
const { data: repos } = await listWorkspaceRepositories({
  path: { workspace: "my-workspace" },
});

// Get a specific repository
const { data: repo } = await getRepository({
  path: { workspace: "my-workspace", repo_slug: "my-repo" },
});
```

### Pull Requests

```ts
import {
  listPullRequests,
  createPullRequest,
  mergePullRequest,
} from "@tembo-io/bitbucket";

// List pull requests
const { data: prs } = await listPullRequests({
  path: { workspace: "my-workspace", repo_slug: "my-repo" },
  query: { state: "OPEN" },
});

// Create a pull request
const { data: newPr } = await createPullRequest({
  path: { workspace: "my-workspace", repo_slug: "my-repo" },
  body: {
    title: "My feature",
    source: { branch: { name: "feature-branch" } },
    destination: { branch: { name: "main" } },
  },
});

// Merge a pull request
await mergePullRequest({
  path: {
    workspace: "my-workspace",
    repo_slug: "my-repo",
    pull_request_id: 42,
  },
});
```

### Branches & Tags

```ts
import {
  listBranches,
  createBranch,
  listTags,
} from "@tembo-io/bitbucket";

// List branches
const { data: branches } = await listBranches({
  path: { workspace: "my-workspace", repo_slug: "my-repo" },
});

// Create a branch
await createBranch({
  path: { workspace: "my-workspace", repo_slug: "my-repo" },
  body: {
    name: "new-branch",
    target: { hash: "main" },
  },
});

// List tags
const { data: tags } = await listTags({
  path: { workspace: "my-workspace", repo_slug: "my-repo" },
});
```

### Pipelines

```ts
import {
  createPipelineForRepository,
  getPipelinesForRepository,
} from "@tembo-io/bitbucket";

// Trigger a pipeline
const { data: pipeline } = await createPipelineForRepository({
  path: { workspace: "my-workspace", repo_slug: "my-repo" },
  body: {
    target: {
      ref_type: "branch",
      type: "pipeline_ref_target",
      ref_name: "main",
    },
  },
});

// List pipelines
const { data: pipelines } = await getPipelinesForRepository({
  path: { workspace: "my-workspace", repo_slug: "my-repo" },
});
```

### Workspaces

```ts
import {
  getUserWorkspaces,
  getWorkspace,
  listWorkspaceMembers,
} from "@tembo-io/bitbucket";

// List your workspaces
const { data: workspaces } = await getUserWorkspaces();

// Get a specific workspace
const { data: workspace } = await getWorkspace({
  path: { workspace: "my-workspace" },
});

// List workspace members
const { data: members } = await listWorkspaceMembers({
  path: { workspace: "my-workspace" },
});
```

### Current User

```ts
import { getUser, getUserEmails } from "@tembo-io/bitbucket";

const { data: me } = await getUser();
const { data: emails } = await getUserEmails();
```

## Custom Client

If you need multiple clients (e.g. different auth per workspace), create your own instead of using the default:

```ts
import { createClient, createConfig, getUser } from "@tembo-io/bitbucket";

const myClient = createClient(
  createConfig({
    baseUrl: "https://api.bitbucket.org/2.0",
    auth: "my-token",
  })
);

const { data } = await getUser({ client: myClient });
```

## Error Handling

By default, errors are returned in the response object. You can opt into throwing instead:

```ts
import { getUser } from "@tembo-io/bitbucket";

// Default: errors returned as `error` field
const { data, error } = await getUser();

// Opt-in: throw on error
const { data } = await getUser({ throwOnError: true });
```

## Interceptors

Add request/response interceptors for logging, retries, or custom headers:

```ts
import { client } from "@tembo-io/bitbucket";

client.interceptors.request.use((request) => {
  console.log("->", request.method, request.url);
  return request;
});

client.interceptors.response.use((response) => {
  console.log("<-", response.status);
  return response;
});
```

## License

MIT
