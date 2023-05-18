import json
import os
import boto3
from xml.etree import ElementTree


def handler(event, context):
    bucket = event["XML"]["Bucket"]
    key = event["XML"]["Key"]
    s3 = boto3.client("s3")

    content = s3.get_object(Bucket=bucket, Key=key)["Body"].read()
    ssml = convert_to_ssml(content)

    base = os.path.splitext(key)[0]
    ssml_key = base + ".ssml"
    s3.put_object(Body=ssml, Bucket=bucket, Key=ssml_key)

    return {"Bucket": bucket, "Key": ssml_key, "Content": ssml}


def convert_to_ssml(contents):
    ssml = "<speak>"
    root = ElementTree.fromstring(contents)
    for child in root:
        if child.tag == "p":
            ssml = ssml + ElementTree.tostring(child, encoding="unicode")
        elif child.tag == "h2":
            ssml = ssml + '<break strength="x-strong"/>'
            ssml = ssml + child.text
        elif child.tag == "li":
            ssml = ssml + "<p>" + child.text + "</p>"
    ssml = ssml + "</speak>"
    return ssml
