const AWS = require("aws-sdk");
const { Octokit } = require("@octokit/rest");

let octokit;
const owner = process.env.OWNER;
const repo = process.env.REPO;
let pullRequestNumber = -1;

exports.handler = async (event) => {
  pullRequestNumber = event.detail.pr_number;
  if (pullRequestNumber == -1) {
    throw new Error("Pull Request Info not available!");
  }

  await initializeOctokit();
  const pullRequestInfo = await getPullRequest(pullRequestNumber);
  return pullRequestInfo;
};

const initializeOctokit = async () => {
  if (!octokit) {
    const gitHubSecret = await getSecretValue(
      process.env.APP_SECRETS,
      "github-token"
    );
    octokit = new Octokit({ auth: gitHubSecret });
  }
};

const getPullRequest = async (pullRequestNumber) => {
  if (octokit) {
    const result = await octokit.rest.pulls.get({
      owner: owner,
      repo: repo,
      pull_number: pullRequestNumber,
    });

    prData = {};
    prData["PullRequestCommitSha"] = result.data.head.sha;
    prData["PullRequestBranch"] = result.data.head.ref;
    prData["PullRequestNumber"] = pullRequestNumber;
    return prData;
  }
};

async function getSecretValue(secretName, secretValue) {
  const client = new AWS.SecretsManager();
  const data = await client.getSecretValue({ SecretId: secretName }).promise();

  if ("SecretString" in data) {
    const secretObject = JSON.parse(data.SecretString);
    return secretObject[secretValue].toString();
  } else {
    throw new Error("Secret value not found");
  }
}
