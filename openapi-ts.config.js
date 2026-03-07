import { operationIdRenames } from "./scripts/operation-id-renames.js";

export default {
  input: "https://dac-static.atlassian.com/cloud/bitbucket/swagger.v3.json",
  output: "src",
  parser: {
    patch: {
      operations: (_method, _path, operation) => {
        if (!operation?.operationId) {
          return;
        }

        const renamedOperationId = operationIdRenames[operation.operationId];
        if (renamedOperationId) {
          operation.operationId = renamedOperationId;
        }
      },
    },
  },
  plugins: [
    {
      name: "@hey-api/sdk",
      operations: {
        strategy: "single",
        containerName: "BitbucketClient",
      },
    },
  ],
};
