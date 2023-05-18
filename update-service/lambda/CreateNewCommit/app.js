const AWS = require("aws-sdk");
const { Octokit } = require("@octokit/rest");
const path = require("path");
const fs = require("fs");
const https = require("https");
const fg = require("fast-glob");
const { readFile } = require("fs").promises;

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
  const fileSlug = event.MarkdownFile.fileSlug;
  const fileName = path.basename(event.MarkdownFile.path);
  await downloadObjectFromS3(
    `${event.S3Location.MarkdownFolder}${fileName}`,
    `${event.S3Location.MarkdownFolder}${fileName}`
  );

  await uploadToRepo(`/tmp/${fileSlug}`, event.PullRequestInfo);
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

const downloadObjectFromS3 = async (key) => {
  const s3 = new AWS.S3();
  const dir = path.dirname(key);
  const tmpDir = `/tmp/${dir}`;
  const fileName = path.basename(key);
  const tempPath = `${tmpDir}/${fileName}`;

  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  const file = await s3
    .getObject({ Bucket: process.env.S3_ETL_BUCKET, Key: key })
    .promise();
  fs.writeFileSync(tempPath, file.Body);

  return tempPath;
};

const uploadToRepo = async (coursePath, pullRequestInfo) => {
  const currentCommit = pullRequestInfo.PullRequestCommitSha;
  const branch = pullRequestInfo.PullRequestBranch;
  const filesPaths = await fg(coursePath + "/**/*.md");
  const filesBlobs = await Promise.all(filesPaths.map(createBlobForFile()));

  const pathsForBlobs = filesPaths.map((fullPath) =>
    path.relative(coursePath, fullPath)
  );

  const newTree = await createNewTree(
    filesBlobs,
    pathsForBlobs,
    pullRequestInfo.PullRequestCommitSha
  );
  const commitMessage = "Added audio file";
  const newCommit = await createNewCommit(
    commitMessage,
    newTree.sha,
    pullRequestInfo.PullRequestCommitSha
  );
  await setBranchToCommit(newCommit.sha, pullRequestInfo);
};

const getFileAsUTF8 = (filePath) => readFile(filePath, "utf8");

const createBlobForFile = () => async (filePath) => {
  const utf8Content = await getFileAsUTF8(filePath);
  const blobData = await octokit.rest.git.createBlob({
    owner: owner,
    repo: repo,
    content: utf8Content,
    encoding: "utf-8",
  });
  return blobData.data;
};

const createNewTree = async (blobs, paths, parentTreeSha) => {
  const tree = blobs.map(({ sha }, index) => ({
    path: paths[index],
    mode: `100644`,
    type: `blob`,
    sha,
  }));
  const { data } = await octokit.rest.git.createTree({
    owner: owner,
    repo: repo,
    tree,
    base_tree: parentTreeSha,
  });
  return data;
};

const createNewCommit = async (message, currentTreeSha, currentCommitSha) =>
  (
    await octokit.rest.git.createCommit({
      owner: owner,
      repo: repo,
      message,
      tree: currentTreeSha,
      parents: [currentCommitSha],
    })
  ).data;

const setBranchToCommit = (commitSha, pullRequestInfo) =>
  octokit.rest.git.updateRef({
    owner: owner,
    repo: repo,
    ref: `heads/${pullRequestInfo.PullRequestBranch}`,
    sha: commitSha,
  });

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
