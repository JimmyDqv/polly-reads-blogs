const AWS = require("aws-sdk");
const { Octokit } = require("@octokit/rest");
const path = require("path");

let octokit;
const owner = process.env.OWNER;
const repo = process.env.REPO;
let pullRequestNumber = -1;

exports.handler = async (event) => {
  pullRequestNumber = event.PullRequestInfo.PullRequestNumber;
  if (pullRequestNumber == -1) {
    throw new Error("Pull Request Info not available!");
  }

  await initializeOctokit();
  const file = await getPullRequestMarkdownFile(pullRequestNumber);

  fileSlug = getFileSlug(file);

  let markdownFile = {
    path: file,
    fileSlug: fileSlug,
  };

  return markdownFile;
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

const getPullRequestMarkdownFile = async (pullRequestNumber) => {
  if (octokit) {
    const result = await octokit.rest.pulls.listFiles({
      owner: owner,
      repo: repo,
      pull_number: pullRequestNumber,
    });

    for (const element of result.data) {
      if (element["filename"].endsWith(".md")) {
        return element["filename"];
      }
    }

    return undefined;
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

function getFileSlug(filePath) {
  const extname = path.extname(filePath);
  const basename = path.basename(filePath, extname);
  const regex = /^\d{4}-\d{2}-\d{2}-(.*)/;
  const match = basename.match(regex);
  return match ? match[1] : basename;
}
