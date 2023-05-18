const AWS = require("aws-sdk");

const s3 = new AWS.S3();
let octokit;
const stagingBucket = process.env.S3_STAGING_BUCKET;

exports.handler = async (event) => {
  let fileSlug = event.MarkdownFile.fileSlug;
  let s3Key = fileSlug + "/index.html";
  const objectFound = await objectExists(stagingBucket, s3Key);
  console.log("ObjectFound: " + objectFound);

  if (objectFound) {
    return {
      Bucket: stagingBucket,
      Key: s3Key,
    };
  } else {
    return "NOT FOUND";
  }
};

async function objectExists(bucket, key) {
  const params = {
    Bucket: bucket,
    Key: key,
  };

  try {
    await s3.headObject(params).promise();
    return true;
  } catch (error) {
    return false;
  }
}
