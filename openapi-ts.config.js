export default {
  input: "https://dac-static.atlassian.com/cloud/bitbucket/swagger.v3.json",
  output: "src",
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
