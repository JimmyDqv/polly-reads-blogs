const AWS = require("aws-sdk");
const { Octokit } = require("@octokit/rest");
const path = require("path");
const fs = require("fs");
const https = require("https");
const matter = require("gray-matter");

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

  const fileSlug = getFileSlug(event.MarkdownFile.path);

  const downloadUrl = await getDownloadUrl(
    event.PullRequestInfo.PullRequestCommitSha,
    event.MarkdownFile.path
  );

  filePath = fileSlug + "/" + event.MarkdownFile.path;
  await downloadFile(downloadUrl, filePath);
  await updateFrontMatter(filePath, event);
  const result = await uploadToS3(filePath);
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

const getDownloadUrl = async (pullRequestNumber, filePath) => {
  if (octokit) {
    const result = await octokit.rest.repos.getContent({
      owner: owner,
      repo: repo,
      path: filePath,
      ref: pullRequestNumber,
    });
    return result.data["download_url"];
  }
};

const downloadFile = async (url, filepath) => {
  const dir = path.dirname(filepath);
  const tmpPath = `/tmp/${dir}`;

  if (!fs.existsSync(tmpPath)) {
    fs.mkdirSync(tmpPath, { recursive: true });
  }

  const fileStream = fs.createWriteStream(`/tmp/${filepath}`, {
    encoding: "utf8",
  });

  await new Promise((resolve, reject) => {
    https.get(url, (res) => {
      res.pipe(fileStream);
      fileStream.on("finish", () => {
        fileStream.close();
        resolve();
      });
      fileStream.on("error", (err) => {
        reject(err);
      });
    });
  });
};

const uploadToS3 = async (filePath) => {
  let S3 = new AWS.S3();

  const blob = fs.readFileSync("/tmp/" + filePath, "utf8");

  var params = {
    Bucket: process.env.S3_ETL_BUCKET,
    Key: filePath,
    Body: blob,
  };

  const result = await S3.upload(params).promise();
  return result.Location;
};

const updateFrontMatter = async (filePath, event) => {
  const fileContent = fs.readFileSync("/tmp/" + filePath, "utf8");
  const { data, content } = matter(fileContent);
  data.audio =
    "/assets/audio/" +
    event.MarkdownFile.fileSlug +
    "/" +
    event.Voice.LanguageCode +
    "/" +
    event.Voice.VoiceId +
    ".mp3";
  const updatedContents = matter.stringify(content, data);
  fs.writeFileSync("/tmp/" + filePath, updatedContents);
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
