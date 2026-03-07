const operationIdRenames = {
  // Addon
  putAddon: "updateAddon",
  getAddonLinkersByLinkerKey: "getAddonLinker",
  deleteAddonLinkersByLinkerKeyValues: "deleteAddonLinkerValues",
  getAddonLinkersByLinkerKeyValues: "getAddonLinkerValues",
  postAddonLinkersByLinkerKeyValues: "createAddonLinkerValues",
  putAddonLinkersByLinkerKeyValues: "updateAddonLinkerValues",
  deleteAddonLinkersByLinkerKeyValuesByValueId: "deleteAddonLinkerValue",
  getAddonLinkersByLinkerKeyValuesByValueId: "getAddonLinkerValue",
  
  // Repositories (top-level)
  getRepositories: "listRepositories",
  getRepositoriesByWorkspace: "listWorkspaceRepositories",
  deleteRepositoriesByWorkspaceByRepoSlug: "deleteRepository",
  getRepositoriesByWorkspaceByRepoSlug: "getRepository",
  postRepositoriesByWorkspaceByRepoSlug: "createRepository",
  putRepositoriesByWorkspaceByRepoSlug: "updateRepository",
  
  // Branch restrictions
  getRepositoriesByWorkspaceByRepoSlugBranchRestrictions: "listBranchRestrictions",
  postRepositoriesByWorkspaceByRepoSlugBranchRestrictions: "createBranchRestriction",
  deleteRepositoriesByWorkspaceByRepoSlugBranchRestrictionsById: "deleteBranchRestriction",
  getRepositoriesByWorkspaceByRepoSlugBranchRestrictionsById: "getBranchRestriction",
  putRepositoriesByWorkspaceByRepoSlugBranchRestrictionsById: "updateBranchRestriction",
  
  // Branching model
  getRepositoriesByWorkspaceByRepoSlugBranchingModel: "getBranchingModel",
  getRepositoriesByWorkspaceByRepoSlugBranchingModelSettings: "getBranchingModelSettings",
  putRepositoriesByWorkspaceByRepoSlugBranchingModelSettings: "updateBranchingModelSettings",
  
  // Commits
  getRepositoriesByWorkspaceByRepoSlugCommitByCommit: "getCommit",
  deleteRepositoriesByWorkspaceByRepoSlugCommitByCommitApprove: "deleteCommitApproval",
  postRepositoriesByWorkspaceByRepoSlugCommitByCommitApprove: "approveCommit",
  getRepositoriesByWorkspaceByRepoSlugCommitByCommitComments: "listCommitComments",
  postRepositoriesByWorkspaceByRepoSlugCommitByCommitComments: "createCommitComment",
  deleteRepositoriesByWorkspaceByRepoSlugCommitByCommitCommentsByCommentId: "deleteCommitComment",
  getRepositoriesByWorkspaceByRepoSlugCommitByCommitCommentsByCommentId: "getCommitComment",
  putRepositoriesByWorkspaceByRepoSlugCommitByCommitCommentsByCommentId: "updateCommitComment",
  getRepositoriesByWorkspaceByRepoSlugCommitByCommitStatuses: "listCommitStatuses",
  postRepositoriesByWorkspaceByRepoSlugCommitByCommitStatusesBuild: "createCommitBuildStatus",
  getRepositoriesByWorkspaceByRepoSlugCommitByCommitStatusesBuildByKey: "getCommitBuildStatus",
  putRepositoriesByWorkspaceByRepoSlugCommitByCommitStatusesBuildByKey: "updateCommitBuildStatus",
  getRepositoriesByWorkspaceByRepoSlugCommits: "listCommits",
  postRepositoriesByWorkspaceByRepoSlugCommits: "filterCommits",
  getRepositoriesByWorkspaceByRepoSlugCommitsByRevision: "listCommitsByRevision",
  postRepositoriesByWorkspaceByRepoSlugCommitsByRevision: "filterCommitsByRevision",
  
  // Components
  getRepositoriesByWorkspaceByRepoSlugComponents: "listComponents",
  getRepositoriesByWorkspaceByRepoSlugComponentsByComponentId: "getComponent",
  
  // Default reviewers
  getRepositoriesByWorkspaceByRepoSlugDefaultReviewers: "listDefaultReviewers",
  deleteRepositoriesByWorkspaceByRepoSlugDefaultReviewersByTargetUsername: "deleteDefaultReviewer",
  getRepositoriesByWorkspaceByRepoSlugDefaultReviewersByTargetUsername: "getDefaultReviewer",
  putRepositoriesByWorkspaceByRepoSlugDefaultReviewersByTargetUsername: "addDefaultReviewer",
  
  // Deploy keys
  getRepositoriesByWorkspaceByRepoSlugDeployKeys: "listDeployKeys",
  postRepositoriesByWorkspaceByRepoSlugDeployKeys: "createDeployKey",
  deleteRepositoriesByWorkspaceByRepoSlugDeployKeysByKeyId: "deleteDeployKey",
  getRepositoriesByWorkspaceByRepoSlugDeployKeysByKeyId: "getDeployKey",
  putRepositoriesByWorkspaceByRepoSlugDeployKeysByKeyId: "updateDeployKey",
  
  // Diff
  getRepositoriesByWorkspaceByRepoSlugDiffBySpec: "getDiff",
  getRepositoriesByWorkspaceByRepoSlugDiffstatBySpec: "getDiffstat",
  
  // Downloads
  getRepositoriesByWorkspaceByRepoSlugDownloads: "listDownloads",
  postRepositoriesByWorkspaceByRepoSlugDownloads: "createDownload",
  deleteRepositoriesByWorkspaceByRepoSlugDownloadsByFilename: "deleteDownload",
  getRepositoriesByWorkspaceByRepoSlugDownloadsByFilename: "getDownload",
  
  // Effective models
  getRepositoriesByWorkspaceByRepoSlugEffectiveBranchingModel: "getEffectiveBranchingModel",
  getRepositoriesByWorkspaceByRepoSlugEffectiveDefaultReviewers: "listEffectiveDefaultReviewers",
  
  // File history
  getRepositoriesByWorkspaceByRepoSlugFilehistoryByCommitByPath: "getFileHistory",
  
  // Forks
  getRepositoriesByWorkspaceByRepoSlugForks: "listForks",
  postRepositoriesByWorkspaceByRepoSlugForks: "createFork",
  
  // Repo hooks
  getRepositoriesByWorkspaceByRepoSlugHooks: "listRepoHooks",
  postRepositoriesByWorkspaceByRepoSlugHooks: "createRepoHook",
  deleteRepositoriesByWorkspaceByRepoSlugHooksByUid: "deleteRepoHook",
  getRepositoriesByWorkspaceByRepoSlugHooksByUid: "getRepoHook",
  putRepositoriesByWorkspaceByRepoSlugHooksByUid: "updateRepoHook",
  
  // Issues
  getRepositoriesByWorkspaceByRepoSlugIssues: "listIssues",
  postRepositoriesByWorkspaceByRepoSlugIssues: "createIssue",
  deleteRepositoriesByWorkspaceByRepoSlugIssuesByIssueId: "deleteIssue",
  getRepositoriesByWorkspaceByRepoSlugIssuesByIssueId: "getIssue",
  putRepositoriesByWorkspaceByRepoSlugIssuesByIssueId: "updateIssue",
  getRepositoriesByWorkspaceByRepoSlugIssuesByIssueIdAttachments: "listIssueAttachments",
  postRepositoriesByWorkspaceByRepoSlugIssuesByIssueIdAttachments: "createIssueAttachment",
  deleteRepositoriesByWorkspaceByRepoSlugIssuesByIssueIdAttachmentsByPath: "deleteIssueAttachment",
  getRepositoriesByWorkspaceByRepoSlugIssuesByIssueIdAttachmentsByPath: "getIssueAttachment",
  getRepositoriesByWorkspaceByRepoSlugIssuesByIssueIdChanges: "listIssueChanges",
  postRepositoriesByWorkspaceByRepoSlugIssuesByIssueIdChanges: "createIssueChange",
  getRepositoriesByWorkspaceByRepoSlugIssuesByIssueIdChangesByChangeId: "getIssueChange",
  getRepositoriesByWorkspaceByRepoSlugIssuesByIssueIdComments: "listIssueComments",
  postRepositoriesByWorkspaceByRepoSlugIssuesByIssueIdComments: "createIssueComment",
  deleteRepositoriesByWorkspaceByRepoSlugIssuesByIssueIdCommentsByCommentId: "deleteIssueComment",
  getRepositoriesByWorkspaceByRepoSlugIssuesByIssueIdCommentsByCommentId: "getIssueComment",
  putRepositoriesByWorkspaceByRepoSlugIssuesByIssueIdCommentsByCommentId: "updateIssueComment",
  deleteRepositoriesByWorkspaceByRepoSlugIssuesByIssueIdVote: "deleteIssueVote",
  getRepositoriesByWorkspaceByRepoSlugIssuesByIssueIdVote: "getIssueVote",
  putRepositoriesByWorkspaceByRepoSlugIssuesByIssueIdVote: "addIssueVote",
  deleteRepositoriesByWorkspaceByRepoSlugIssuesByIssueIdWatch: "unwatchIssue",
  getRepositoriesByWorkspaceByRepoSlugIssuesByIssueIdWatch: "getIssueWatchStatus",
  putRepositoriesByWorkspaceByRepoSlugIssuesByIssueIdWatch: "watchIssue",
  getRepositoriesByWorkspaceByRepoSlugIssuesExportByRepoNameIssuesByTaskIdZip: "getIssueExportZip",
  postRepositoriesByWorkspaceByRepoSlugIssuesExport: "exportIssues",
  getRepositoriesByWorkspaceByRepoSlugIssuesImport: "getIssueImportStatus",
  postRepositoriesByWorkspaceByRepoSlugIssuesImport: "importIssues",
  
  // Merge base
  getRepositoriesByWorkspaceByRepoSlugMergeBaseByRevspec: "getMergeBase",
  
  // Milestones
  getRepositoriesByWorkspaceByRepoSlugMilestones: "listMilestones",
  getRepositoriesByWorkspaceByRepoSlugMilestonesByMilestoneId: "getMilestone",
  
  // Override settings
  getRepositoriesByWorkspaceByRepoSlugOverrideSettings: "getOverrideSettings",
  putRepositoriesByWorkspaceByRepoSlugOverrideSettings: "updateOverrideSettings",
  
  // Patch
  getRepositoriesByWorkspaceByRepoSlugPatchBySpec: "getPatch",
  
  // Repo permissions
  getRepositoriesByWorkspaceByRepoSlugPermissionsConfigGroups: "listRepoPermissionGroups",
  deleteRepositoriesByWorkspaceByRepoSlugPermissionsConfigGroupsByGroupSlug: "deleteRepoPermissionGroup",
  getRepositoriesByWorkspaceByRepoSlugPermissionsConfigGroupsByGroupSlug: "getRepoPermissionGroup",
  putRepositoriesByWorkspaceByRepoSlugPermissionsConfigGroupsByGroupSlug: "updateRepoPermissionGroup",
  getRepositoriesByWorkspaceByRepoSlugPermissionsConfigUsers: "listRepoPermissionUsers",
  deleteRepositoriesByWorkspaceByRepoSlugPermissionsConfigUsersBySelectedUserId: "deleteRepoPermissionUser",
  getRepositoriesByWorkspaceByRepoSlugPermissionsConfigUsersBySelectedUserId: "getRepoPermissionUser",
  putRepositoriesByWorkspaceByRepoSlugPermissionsConfigUsersBySelectedUserId: "updateRepoPermissionUser",
  
  // Pull requests
  getRepositoriesByWorkspaceByRepoSlugPullrequests: "listPullRequests",
  postRepositoriesByWorkspaceByRepoSlugPullrequests: "createPullRequest",
  getRepositoriesByWorkspaceByRepoSlugPullrequestsActivity: "listPullRequestsActivity",
  getRepositoriesByWorkspaceByRepoSlugPullrequestsByPullRequestId: "getPullRequest",
  putRepositoriesByWorkspaceByRepoSlugPullrequestsByPullRequestId: "updatePullRequest",
  getRepositoriesByWorkspaceByRepoSlugPullrequestsByPullRequestIdActivity: "getPullRequestActivity",
  deleteRepositoriesByWorkspaceByRepoSlugPullrequestsByPullRequestIdApprove: "deletePullRequestApproval",
  postRepositoriesByWorkspaceByRepoSlugPullrequestsByPullRequestIdApprove: "approvePullRequest",
  getRepositoriesByWorkspaceByRepoSlugPullrequestsByPullRequestIdComments: "listPullRequestComments",
  postRepositoriesByWorkspaceByRepoSlugPullrequestsByPullRequestIdComments: "createPullRequestComment",
  deleteRepositoriesByWorkspaceByRepoSlugPullrequestsByPullRequestIdCommentsByCommentId: "deletePullRequestComment",
  getRepositoriesByWorkspaceByRepoSlugPullrequestsByPullRequestIdCommentsByCommentId: "getPullRequestComment",
  putRepositoriesByWorkspaceByRepoSlugPullrequestsByPullRequestIdCommentsByCommentId: "updatePullRequestComment",
  deleteRepositoriesByWorkspaceByRepoSlugPullrequestsByPullRequestIdCommentsByCommentIdResolve: "unresolvePullRequestComment",
  postRepositoriesByWorkspaceByRepoSlugPullrequestsByPullRequestIdCommentsByCommentIdResolve: "resolvePullRequestComment",
  getRepositoriesByWorkspaceByRepoSlugPullrequestsByPullRequestIdCommits: "listPullRequestCommits",
  getRepositoriesByWorkspaceByRepoSlugPullrequestsByPullRequestIdDiff: "getPullRequestDiff",
  getRepositoriesByWorkspaceByRepoSlugPullrequestsByPullRequestIdDiffstat: "getPullRequestDiffstat",
  postRepositoriesByWorkspaceByRepoSlugPullrequestsByPullRequestIdDecline: "declinePullRequest",
  postRepositoriesByWorkspaceByRepoSlugPullrequestsByPullRequestIdMerge: "mergePullRequest",
  getRepositoriesByWorkspaceByRepoSlugPullrequestsByPullRequestIdMergeTaskStatusByTaskId: "getPullRequestMergeTaskStatus",
  getRepositoriesByWorkspaceByRepoSlugPullrequestsByPullRequestIdPatch: "getPullRequestPatch",
  deleteRepositoriesByWorkspaceByRepoSlugPullrequestsByPullRequestIdRequestChanges: "deletePullRequestChangeRequest",
  postRepositoriesByWorkspaceByRepoSlugPullrequestsByPullRequestIdRequestChanges: "requestPullRequestChanges",
  getRepositoriesByWorkspaceByRepoSlugPullrequestsByPullRequestIdStatuses: "listPullRequestStatuses",
  getRepositoriesByWorkspaceByRepoSlugPullrequestsByPullRequestIdTasks: "listPullRequestTasks",
  postRepositoriesByWorkspaceByRepoSlugPullrequestsByPullRequestIdTasks: "createPullRequestTask",
  deleteRepositoriesByWorkspaceByRepoSlugPullrequestsByPullRequestIdTasksByTaskId: "deletePullRequestTask",
  getRepositoriesByWorkspaceByRepoSlugPullrequestsByPullRequestIdTasksByTaskId: "getPullRequestTask",
  putRepositoriesByWorkspaceByRepoSlugPullrequestsByPullRequestIdTasksByTaskId: "updatePullRequestTask",
  
  // Refs / branches / tags
  getRepositoriesByWorkspaceByRepoSlugRefs: "listRefs",
  getRepositoriesByWorkspaceByRepoSlugRefsBranches: "listBranches",
  postRepositoriesByWorkspaceByRepoSlugRefsBranches: "createBranch",
  deleteRepositoriesByWorkspaceByRepoSlugRefsBranchesByName: "deleteBranch",
  getRepositoriesByWorkspaceByRepoSlugRefsBranchesByName: "getBranch",
  getRepositoriesByWorkspaceByRepoSlugRefsTags: "listTags",
  postRepositoriesByWorkspaceByRepoSlugRefsTags: "createTag",
  deleteRepositoriesByWorkspaceByRepoSlugRefsTagsByName: "deleteTag",
  getRepositoriesByWorkspaceByRepoSlugRefsTagsByName: "getTag",
  
  // Source
  getRepositoriesByWorkspaceByRepoSlugSrc: "listSrcRoot",
  postRepositoriesByWorkspaceByRepoSlugSrc: "createSrcFileCommit",
  getRepositoriesByWorkspaceByRepoSlugSrcByCommitByPath: "getSrcFile",
  
  // Versions
  getRepositoriesByWorkspaceByRepoSlugVersions: "listVersions",
  getRepositoriesByWorkspaceByRepoSlugVersionsByVersionId: "getVersion",
  
  // Watchers
  getRepositoriesByWorkspaceByRepoSlugWatchers: "listRepoWatchers",
  
  // Snippets
  getSnippets: "listSnippets",
  postSnippets: "createSnippet",
  getSnippetsByWorkspace: "listWorkspaceSnippets",
  postSnippetsByWorkspace: "createWorkspaceSnippet",
  deleteSnippetsByWorkspaceByEncodedId: "deleteSnippet",
  getSnippetsByWorkspaceByEncodedId: "getSnippet",
  putSnippetsByWorkspaceByEncodedId: "updateSnippet",
  deleteSnippetsByWorkspaceByEncodedIdByNodeId: "deleteSnippetRevision",
  getSnippetsByWorkspaceByEncodedIdByNodeId: "getSnippetRevision",
  putSnippetsByWorkspaceByEncodedIdByNodeId: "updateSnippetRevision",
  getSnippetsByWorkspaceByEncodedIdByNodeIdFilesByPath: "getSnippetRevisionFile",
  getSnippetsByWorkspaceByEncodedIdByRevisionDiff: "getSnippetDiff",
  getSnippetsByWorkspaceByEncodedIdByRevisionPatch: "getSnippetPatch",
  getSnippetsByWorkspaceByEncodedIdComments: "listSnippetComments",
  postSnippetsByWorkspaceByEncodedIdComments: "createSnippetComment",
  deleteSnippetsByWorkspaceByEncodedIdCommentsByCommentId: "deleteSnippetComment",
  getSnippetsByWorkspaceByEncodedIdCommentsByCommentId: "getSnippetComment",
  putSnippetsByWorkspaceByEncodedIdCommentsByCommentId: "updateSnippetComment",
  getSnippetsByWorkspaceByEncodedIdCommits: "listSnippetCommits",
  getSnippetsByWorkspaceByEncodedIdCommitsByRevision: "getSnippetCommit",
  getSnippetsByWorkspaceByEncodedIdFilesByPath: "getSnippetFile",
  deleteSnippetsByWorkspaceByEncodedIdWatch: "unwatchSnippet",
  getSnippetsByWorkspaceByEncodedIdWatch: "getSnippetWatchStatus",
  putSnippetsByWorkspaceByEncodedIdWatch: "watchSnippet",
  getSnippetsByWorkspaceByEncodedIdWatchers: "listSnippetWatchers",
  
  // Users
  getUserEmailsByEmail: "getUserEmail",
  getUserWorkspacesByWorkspacePermission: "getUserWorkspacePermission",
  getUsersBySelectedUser: "getUserProfile",
  getUsersBySelectedUserGpgKeys: "listUserGpgKeys",
  getUsersBySelectedUserGpgKeysByFingerprint: "getUserGpgKey",
  postUsersBySelectedUserGpgKeys: "createUserGpgKey",
  deleteUsersBySelectedUserGpgKeysByFingerprint: "deleteUserGpgKey",
  getUsersBySelectedUserSshKeys: "listUserSshKeys",
  getUsersBySelectedUserSshKeysByKeyId: "getUserSshKey",
  postUsersBySelectedUserSshKeys: "createUserSshKey",
  deleteUsersBySelectedUserSshKeysByKeyId: "deleteUserSshKey",
  putUsersBySelectedUserSshKeysByKeyId: "updateUserSshKey",
  
  // Workspaces
  getWorkspaces: "listWorkspaces",
  getWorkspacesByWorkspace: "getWorkspace",
  getWorkspacesByWorkspaceHooks: "listWorkspaceHooks",
  postWorkspacesByWorkspaceHooks: "createWorkspaceHook",
  deleteWorkspacesByWorkspaceHooksByUid: "deleteWorkspaceHook",
  getWorkspacesByWorkspaceHooksByUid: "getWorkspaceHook",
  putWorkspacesByWorkspaceHooksByUid: "updateWorkspaceHook",
  getWorkspacesByWorkspaceMembers: "listWorkspaceMembers",
  getWorkspacesByWorkspaceMembersByMember: "getWorkspaceMember",
  getWorkspacesByWorkspacePermissions: "listWorkspacePermissions",
  getWorkspacesByWorkspacePermissionsRepositories: "listWorkspaceRepoPermissions",
  getWorkspacesByWorkspacePermissionsRepositoriesByRepoSlug: "getWorkspaceRepoPermission",
  
  // Projects
  getWorkspacesByWorkspaceProjects: "listProjects",
  postWorkspacesByWorkspaceProjects: "createProject",
  deleteWorkspacesByWorkspaceProjectsByProjectKey: "deleteProject",
  getWorkspacesByWorkspaceProjectsByProjectKey: "getProject",
  putWorkspacesByWorkspaceProjectsByProjectKey: "updateProject",
  getWorkspacesByWorkspaceProjectsByProjectKeyBranchingModel: "getProjectBranchingModel",
  getWorkspacesByWorkspaceProjectsByProjectKeyBranchingModelSettings: "getProjectBranchingModelSettings",
  putWorkspacesByWorkspaceProjectsByProjectKeyBranchingModelSettings: "updateProjectBranchingModelSettings",
  getWorkspacesByWorkspaceProjectsByProjectKeyDefaultReviewers: "listProjectDefaultReviewers",
  deleteWorkspacesByWorkspaceProjectsByProjectKeyDefaultReviewersBySelectedUser: "deleteProjectDefaultReviewer",
  getWorkspacesByWorkspaceProjectsByProjectKeyDefaultReviewersBySelectedUser: "getProjectDefaultReviewer",
  putWorkspacesByWorkspaceProjectsByProjectKeyDefaultReviewersBySelectedUser: "addProjectDefaultReviewer",
  getWorkspacesByWorkspaceProjectsByProjectKeyDeployKeys: "listProjectDeployKeys",
  postWorkspacesByWorkspaceProjectsByProjectKeyDeployKeys: "createProjectDeployKey",
  deleteWorkspacesByWorkspaceProjectsByProjectKeyDeployKeysByKeyId: "deleteProjectDeployKey",
  getWorkspacesByWorkspaceProjectsByProjectKeyDeployKeysByKeyId: "getProjectDeployKey",
  getWorkspacesByWorkspaceProjectsByProjectKeyPermissionsConfigGroups: "listProjectPermissionGroups",
  deleteWorkspacesByWorkspaceProjectsByProjectKeyPermissionsConfigGroupsByGroupSlug: "deleteProjectPermissionGroup",
  getWorkspacesByWorkspaceProjectsByProjectKeyPermissionsConfigGroupsByGroupSlug: "getProjectPermissionGroup",
  putWorkspacesByWorkspaceProjectsByProjectKeyPermissionsConfigGroupsByGroupSlug: "updateProjectPermissionGroup",
  getWorkspacesByWorkspaceProjectsByProjectKeyPermissionsConfigUsers: "listProjectPermissionUsers",
  deleteWorkspacesByWorkspaceProjectsByProjectKeyPermissionsConfigUsersBySelectedUserId: "deleteProjectPermissionUser",
  getWorkspacesByWorkspaceProjectsByProjectKeyPermissionsConfigUsersBySelectedUserId: "getProjectPermissionUser",
  putWorkspacesByWorkspaceProjectsByProjectKeyPermissionsConfigUsersBySelectedUserId: "updateProjectPermissionUser",
  getWorkspacesByWorkspacePullrequestsBySelectedUser: "listWorkspaceUserPullRequests",
  
  // User workspace permissions
  getUserWorkspacesByWorkspacePermissionsRepositories: "listUserWorkspaceRepoPermissions",
};

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
