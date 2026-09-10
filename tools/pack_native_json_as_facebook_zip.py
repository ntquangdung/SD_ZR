from __future__ import annotations

import io
import json
import re
import sys
import unicodedata
import zipfile
from pathlib import Path
from typing import Any


NATIVE_FORMAT = "facebook-activity-native-json"
COMMENTS_PATH = "your_facebook_activity/groups/your_comments_in_groups.json"
REACTIONS_PATH = (
    "your_facebook_activity/comments_and_reactions/likes_and_reactions.json"
)


def text(value: Any) -> str:
    if value is None:
        return ""
    return " ".join(str(value).split())


def integer(value: Any) -> int:
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, (int, float)):
        return int(value)
    try:
        return int(text(value))
    except ValueError:
        return 0


def ascii_archive_name(value: str, fallback: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    cleaned = re.sub(r"[^A-Za-z0-9_-]+", "", ascii_text)
    return cleaned or fallback


def media_attachments(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    attachments = []
    for item in value:
        if not isinstance(item, dict):
            continue
        uri = text(item.get("uri"))
        if not uri:
            continue
        media: dict[str, Any] = {"uri": uri}
        creation_timestamp = integer(item.get("creationTimestamp"))
        if creation_timestamp > 0:
            media["creation_timestamp"] = creation_timestamp
        attachments.append({"data": [{"media": media}]})
    return attachments


def facebook_comment(value: dict[str, Any]) -> dict[str, Any] | None:
    author = text(value.get("authorName"))
    content = text(value.get("content"))
    media = media_attachments(value.get("media"))
    if not author and not content and not media:
        return None

    activity_timestamp = integer(value.get("commentTime"))
    comment: dict[str, Any] = {
        "timestamp": activity_timestamp,
        "comment": content,
        "author": author,
        "group": text(value.get("group")) or text(value.get("commentLocation")),
    }
    if media:
        comment["attachments"] = media
    comment_id = text(value.get("commentId"))
    if comment_id:
        comment["comment_id"] = comment_id

    result: dict[str, Any] = {
        "timestamp": activity_timestamp,
        "data": [{"comment": comment}],
        "title": text(value.get("title")),
    }
    url = text(value.get("commentLink")) or text(value.get("postUrl"))
    if url:
        result["permalink_url"] = url
    return result


def name_section(title: str, names: Any) -> dict[str, Any] | None:
    if not isinstance(names, list):
        return None
    values = [text(name) for name in names if text(name)]
    if not values:
        return None
    return {
        "dict": [
            {
                "dict": [{"label": "Tên", "value": name} for name in values],
                "title": "",
            }
        ],
        "title": title,
    }


def facebook_reaction(value: dict[str, Any]) -> dict[str, Any] | None:
    reaction = text(value.get("reaction"))
    url = text(value.get("linkPost"))
    activity_timestamp = integer(value.get("reactionTime"))
    if not reaction and not url and activity_timestamp <= 0:
        return None

    labels: list[dict[str, Any]] = [{"label": "Cảm xúc", "value": reaction}]
    if url:
        labels.append({"label": "URL", "value": url, "href": url})
    group_section = name_section("Nhóm", value.get("targetGroupNames"))
    author_section = name_section("Tác giả", value.get("targetAuthorNames"))
    if group_section:
        labels.append(group_section)
    if author_section:
        labels.append(author_section)

    result: dict[str, Any] = {
        "timestamp": activity_timestamp,
        "media": [],
        "label_values": labels,
    }
    fbid = text(value.get("fbid"))
    if fbid:
        result["fbid"] = fbid
    return result


def json_bytes(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, indent=2).encode("utf-8")


def build_account_zip(account: dict[str, Any]) -> tuple[bytes, int, int]:
    comments = [
        record
        for item in account.get("comments", [])
        if isinstance(item, dict) and (record := facebook_comment(item)) is not None
    ]
    reactions = [
        record
        for item in account.get("reactions", [])
        if isinstance(item, dict) and (record := facebook_reaction(item)) is not None
    ]

    buffer = io.BytesIO()
    with zipfile.ZipFile(
        buffer, mode="w", compression=zipfile.ZIP_DEFLATED, compresslevel=9
    ) as archive:
        if comments:
            archive.writestr(COMMENTS_PATH, json_bytes({"group_comments_v2": comments}))
        if reactions:
            archive.writestr(REACTIONS_PATH, json_bytes(reactions))
    return buffer.getvalue(), len(comments), len(reactions)


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    if len(sys.argv) != 3:
        raise SystemExit(
            "Usage: pack_native_json_as_facebook_zip.py INPUT.json OUTPUT.zip"
        )

    input_path = Path(sys.argv[1]).resolve()
    output_path = Path(sys.argv[2]).resolve()
    source = json.loads(input_path.read_text(encoding="utf-8"))
    if not isinstance(source, dict) or source.get("format") != NATIVE_FORMAT:
        raise ValueError("Input is not a supported native JSON export")
    accounts = source.get("accounts")
    if not isinstance(accounts, list) or not accounts:
        raise ValueError("Native JSON does not contain accounts")

    outer_folder = ascii_archive_name(input_path.stem, "facebook-activity")
    used_names: set[str] = set()
    summary = {"accounts": 0, "comments": 0, "reactions": 0}

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(
        output_path, mode="w", compression=zipfile.ZIP_DEFLATED, compresslevel=9
    ) as outer_zip:
        for index, account in enumerate(accounts, start=1):
            if not isinstance(account, dict):
                continue
            account_name = text(account.get("accountName")) or f"Account{index}"
            base_name = ascii_archive_name(account_name, f"Account{index}")
            archive_name = base_name
            suffix = 2
            while archive_name.casefold() in used_names:
                archive_name = f"{base_name}-{suffix}"
                suffix += 1
            used_names.add(archive_name.casefold())

            account_zip, comment_count, reaction_count = build_account_zip(account)
            if comment_count == 0 and reaction_count == 0:
                continue
            outer_zip.writestr(f"{outer_folder}/{archive_name}.zip", account_zip)
            summary["accounts"] += 1
            summary["comments"] += comment_count
            summary["reactions"] += reaction_count

    print(json.dumps(summary, ensure_ascii=False))
    print(str(output_path))


if __name__ == "__main__":
    main()
