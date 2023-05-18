import json
import os
import boto3
from bs4 import BeautifulSoup


def handler(event, context):
    bucket = event["HtmlFile"]["Bucket"]
    key = event["HtmlFile"]["Key"]
    s3 = boto3.client("s3")

    content = s3.get_object(Bucket=bucket, Key=key)["Body"].read()
    extractedContent = extract(content)

    etlBucket = os.environ["ETL_BUCKET"]
    base = os.path.splitext(key)[0]

    xml_key = base + ".xml"
    s3.put_object(Body=extractedContent, Bucket=etlBucket, Key=xml_key)

    return {"Bucket": etlBucket, "Key": xml_key}


def extract(contents):
    data = "<pXML>"
    soup = BeautifulSoup(contents, "lxml")

    links = soup.find_all("a")
    for child in links:
        child.replace_with(child.text)

    em = soup.find_all("em")
    for child in em:
        child.unwrap()

    strong = soup.find_all("strong")
    for child in strong:
        child.unwrap()

    breaks = soup.find_all("br")
    for child in breaks:
        child.extract()

    for child in soup.article.descendants:
        if is_image(child) and not has_no_audio_class(child):
            data = data + f"<p>{child['alt']}</p>"
        elif keep_tag(child):
            data = data + str(child)
    data = data + "</pXML>"
    return data


def keep_tag(tag):
    tagsToKeep = ["p", "h2", "h3", "h4", "li"]
    if tag.name in tagsToKeep and not has_image_only(tag):
        return True
    return False


def is_image(tag):
    if tag.name == "img":
        return True
    return False


def has_no_audio_class(tag):
    return "no-voice" in tag.get("class", "")


def has_image_only(tag):
    if tag.name == "p":
        for child in tag.children:
            if child.name == "img":
                length = sum(1 for _ in tag)
                return length == 1
    return False
