<h1 align="center">@tembo-io/bitbucket</h1>

<p align="center">A fully typed TypeScript client for the <a href="https://developer.atlassian.com/cloud/bitbucket/rest/intro/">Bitbucket Cloud REST API</a>. Generated from the <a href="https://dac-static.atlassian.com/cloud/bitbucket/swagger.v3.json">official OpenAPI spec</a> with clean, idiomatic method names.</p>

## Install

```bash
npm install @tembo-io/bitbucket
```

## Quick Start

Create a `BitbucketClient` instance and start making requests:

```ts
import { BitbucketClient } from "@tembo-io/bitbucket";

const bitbucket = new BitbucketClient({
  client: createClient(
    createConfig({
      baseUrl: "https://api.bitbucket.org/2.0",
      auth: "your-access-token",
    })
  ),
});

const { data, error } = await bitbucket.getUser();

if (error) {
  console.error(error);
} else {
  console.log(data);
}
```

Or use the default client and configure auth after:

```ts
import { BitbucketClient } from "@tembo-io/bitbucket";

const bitbucket = new BitbucketClient();

// The default client points at https://api.bitbucket.org/2.0
// Configure auth on its underlying client:
bitbucket.client.setConfig({
  auth: "your-access-token",
});

const { data } = await bitbucket.getUser();
```

## Authentication

All methods support Bearer token, Basic auth, and API key authentication.

**Bearer token (most common):**

```ts
const bitbucket = new BitbucketClient({
  client: createClient(
    createConfig({
      baseUrl: "https://api.bitbucket.org/2.0",
      auth: "your-oauth-access-token",
    })
  ),
});
```

**Basic auth:**

```ts
const bitbucket = new BitbucketClient({
  client: createClient(
    createConfig({
      baseUrl: "https://api.bitbucket.org/2.0",
      auth: `${username}:${appPassword}`,
    })
  ),
});
```

**Dynamic auth (e.g. refreshing tokens):**

```ts
const bitbucket = new BitbucketClient({
  client: createClient(
    createConfig({
      baseUrl: "https://api.bitbucket.org/2.0",
      auth: (auth) => {
        if (auth.scheme === "bearer") {
          return getAccessToken();
        }
      },
    })
  ),
});
```

## Usage

Every endpoint in the [Bitbucket Cloud REST API](https://developer.atlassian.com/cloud/bitbucket/rest/intro/) has a corresponding typed method on `BitbucketClient`. Path and query parameters are passed via the `path` and `query` fields, and request bodies via `body`.

### Repositories

```ts
const { data: repos } = await bitbucket.listWorkspaceRepositories({
  path: { workspace: "my-workspace" },
});

const { data: repo } = await bitbucket.getRepository({
  path: { workspace: "my-workspace", repo_slug: "my-repo" },
});

const { data: newRepo } = await bitbucket.createRepository({
  path: { workspace: "my-workspace", repo_slug: "my-new-repo" },
  body: { scm: "git", is_private: true },
});
```

### Pull Requests

```ts
const { data: prs } = await bitbucket.listPullRequests({
  path: { workspace: "my-workspace", repo_slug: "my-repo" },
  query: { state: "OPEN" },
});

const { data: newPr } = await bitbucket.createPullRequest({
  path: { workspace: "my-workspace", repo_slug: "my-repo" },
  body: {
    title: "My feature",
    source: { branch: { name: "feature-branch" } },
    destination: { branch: { name: "main" } },
  },
});

await bitbucket.approvePullRequest({
  path: { workspace: "my-workspace", repo_slug: "my-repo", pull_request_id: 42 },
});

await bitbucket.mergePullRequest({
  path: { workspace: "my-workspace", repo_slug: "my-repo", pull_request_id: 42 },
});

const { data: comments } = await bitbucket.listPullRequestComments({
  path: { workspace: "my-workspace", repo_slug: "my-repo", pull_request_id: 42 },
});

await bitbucket.createPullRequestComment({
  path: { workspace: "my-workspace", repo_slug: "my-repo", pull_request_id: 42 },
  body: { content: { raw: "Looks good!" } },
});
```

### Branches & Tags

```ts
const { data: branches } = await bitbucket.listBranches({
  path: { workspace: "my-workspace", repo_slug: "my-repo" },
});

await bitbucket.createBranch({
  path: { workspace: "my-workspace", repo_slug: "my-repo" },
  body: { name: "new-branch", target: { hash: "main" } },
});

const { data: tags } = await bitbucket.listTags({
  path: { workspace: "my-workspace", repo_slug: "my-repo" },
});

await bitbucket.createTag({
  path: { workspace: "my-workspace", repo_slug: "my-repo" },
  body: { name: "v1.0.0", target: { hash: "abc123" } },
});
```

### Commits

```ts
const { data: commits } = await bitbucket.listCommits({
  path: { workspace: "my-workspace", repo_slug: "my-repo" },
});

const { data: commit } = await bitbucket.getCommit({
  path: { workspace: "my-workspace", repo_slug: "my-repo", commit: "abc123" },
});

await bitbucket.approveCommit({
  path: { workspace: "my-workspace", repo_slug: "my-repo", commit: "abc123" },
});
```

### Pipelines

```ts
const { data: pipeline } = await bitbucket.createPipelineForRepository({
  path: { workspace: "my-workspace", repo_slug: "my-repo" },
  body: {
    target: {
      ref_type: "branch",
      type: "pipeline_ref_target",
      ref_name: "main",
    },
  },
});

const { data: pipelines } = await bitbucket.getPipelinesForRepository({
  path: { workspace: "my-workspace", repo_slug: "my-repo" },
});
```

### Issues

```ts
const { data: issues } = await bitbucket.listIssues({
  path: { workspace: "my-workspace", repo_slug: "my-repo" },
});

const { data: issue } = await bitbucket.createIssue({
  path: { workspace: "my-workspace", repo_slug: "my-repo" },
  body: { title: "Bug report", kind: "bug", priority: "major" },
});
```

### Workspaces & Projects

```ts
const { data: workspaces } = await bitbucket.getUserWorkspaces();

const { data: workspace } = await bitbucket.getWorkspace({
  path: { workspace: "my-workspace" },
});

const { data: members } = await bitbucket.listWorkspaceMembers({
  path: { workspace: "my-workspace" },
});

const { data: projects } = await bitbucket.listProjects({
  path: { workspace: "my-workspace" },
});
```

### Current User

```ts
const { data: me } = await bitbucket.getUser();
const { data: emails } = await bitbucket.getUserEmails();
```

## Multiple Clients

Create separate client instances for different workspaces or auth tokens:

```ts
import { BitbucketClient } from "@tembo-io/bitbucket";
import { createClient, createConfig } from "@tembo-io/bitbucket";

const workspace1 = new BitbucketClient({
  client: createClient(createConfig({
    baseUrl: "https://api.bitbucket.org/2.0",
    auth: "token-for-workspace-1",
  })),
});

const workspace2 = new BitbucketClient({
  client: createClient(createConfig({
    baseUrl: "https://api.bitbucket.org/2.0",
    auth: "token-for-workspace-2",
  })),
});
```

## Error Handling

By default, errors are returned in the response object alongside `data`:

```ts
const { data, error } = await bitbucket.getUser();

if (error) {
  console.error(error);
}
```

Opt into throwing on errors instead:

```ts
try {
  const { data } = await bitbucket.getUser({ throwOnError: true });
} catch (err) {
  console.error(err);
}
```

## Interceptors

Add request, response, and error interceptors for logging, retries, or custom headers:

```ts
const bitbucket = new BitbucketClient();

bitbucket.client.interceptors.request.use((request) => {
  console.log("->", request.method, request.url);
  return request;
});

bitbucket.client.interceptors.response.use((response) => {
  console.log("<-", response.status);
  return response;
});

bitbucket.client.interceptors.error.use((error) => {
  console.error("!", error);
  return error;
});
```

## Development

Regenerate the SDK from the latest Bitbucket OpenAPI spec and apply method name cleanup:

```bash
bun run generate
bun run postprocess
```

## License

MIT
