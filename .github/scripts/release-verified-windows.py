"""Manually promote existing successful CI bytes; never rebuild release assets."""
import hashlib
import http.client
import json
import os
from datetime import datetime, timezone
from pathlib import Path
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
import zipfile

TAG = "v0.1.0"
VERSION = "0.1.0"
EXPECTED_WORKFLOW = ".github/workflows/windows.yml"
OUTPUT = Path("release-output")
COMBINED = Path("release-input/combined")
EVIDENCE = Path("release-input/evidence")


def require(condition, code):
    if not condition:
        raise ValueError(code)


def digest(path, algorithm="sha256"):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, algorithm).hexdigest()


def decode_json(path):
    raw = path.read_bytes()
    encoding = "utf-16" if raw.startswith((b"\xff\xfe", b"\xfe\xff")) else "utf-8-sig"
    return json.loads(raw.decode(encoding))


def save_json(path, data):
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def elapsed(start, finish):
    start_time = datetime.fromisoformat(start.replace("Z", "+00:00"))
    finish_time = datetime.fromisoformat(finish.replace("Z", "+00:00"))
    require(start_time.utcoffset() is not None and finish_time.utcoffset() is not None, "TIMESTAMP_TIMEZONE_REQUIRED")
    seconds = int((finish_time - start_time).total_seconds())
    require(seconds >= 0, "TIMESTAMP_ORDER_INVALID")
    return f"{seconds // 3600:02d}:{seconds % 3600 // 60:02d}:{seconds % 60:02d}"


def bundled_dim_sum():
    directory = Path("docs/release-assets")
    catalog = decode_json(directory / "catalog.json")
    require(catalog.get("schemaVersion") == 1, "IMAGE_CATALOG_SCHEMA_MISMATCH")
    entries = [item for item in catalog.get("images", []) if item.get("id") == "hk-dish-0001"]
    require(len(entries) == 1, "VERIFIED_DIM_SUM_ENTRY_REQUIRED")
    item = entries[0]
    require(item.get("file") == "hk-dish-0001-classic-har-gow.png"
            and item.get("sha256") == "c6ff2d32938f1e4c4ea685442f69227b8cd387f302ab8f8a62e8dd96c62b5ac0"
            and item.get("bytes") == 2406444 and item.get("width") == item.get("height") == 1254
            and item.get("name") == {"en": "Classic Har Gow", "zhHant": "蝦餃"}
            and item.get("mediaType") == "image/png", "VERIFIED_DIM_SUM_CATALOG_MISMATCH")
    image = directory / item["file"]
    require(image.is_file() and not image.is_symlink() and image.stat().st_size == item["bytes"]
            and digest(image) == item["sha256"], "VERIFIED_DIM_SUM_BYTES_MISMATCH")
    with image.open("rb") as stream:
        header = stream.read(24)
    require(header[:8] == b"\x89PNG\r\n\x1a\n" and header[12:16] == b"IHDR"
            and int.from_bytes(header[16:20], "big") == 1254
            and int.from_bytes(header[20:24], "big") == 1254, "VERIFIED_DIM_SUM_PNG_MISMATCH")
    return image, {"name": item["name"], "file": image.name, "bytes": item["bytes"], "sha256": item["sha256"],
                   "catalogSha256": digest(directory / "catalog.json")}


def timing_notes(source, promotion, finish, published):
    timing = source["sourceTiming"]
    milestone = "Published" if published else "Promotion verification completed"
    return ("\n\nObserved timing (UTC; elapsed HH:mm:ss):\n\n"
            f"- Source build started: `{timing['buildStartedAtUtc']}`.\n"
            f"- Source build and verification completed: `{timing['verificationCompletedAtUtc']}` "
            f"({timing['buildAndVerificationElapsed']}).\n"
            f"- Promotion started: `{promotion['startedAtUtc']}`.\n"
            f"- {milestone}: `{finish}` ({elapsed(promotion['startedAtUtc'], finish)} since promotion started).\n"
            f"- Elapsed since source build started, including waiting: `{elapsed(timing['buildStartedAtUtc'], finish)}`.\n")


def api(path, method="GET", payload=None, absent=False):
    require(path.startswith("/repos/"), "INVALID_API_PATH")
    headers = {"Authorization": f"Bearer {os.environ['GH_TOKEN']}",
               "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28",
               "User-Agent": "material-file-encryptor-verified-release"}
    data = None
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    try:
        with urllib.request.urlopen(urllib.request.Request("https://api.github.com" + path,
                                                          data=data, headers=headers, method=method), timeout=60) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        if absent and error.code == 404:
            return None
        raise ValueError(f"GITHUB_API_HTTP_{error.code}") from None


def configuration():
    repo = os.environ.get("GITHUB_REPOSITORY", "")
    run_id = os.environ.get("SOURCE_RUN_ID", "")
    require(re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repo), "INVALID_REPOSITORY")
    require(re.fullmatch(r"[1-9][0-9]*", run_id), "INVALID_SOURCE_RUN_ID")
    require(os.environ.get("GITHUB_REF") == "refs/heads/main", "MAIN_DISPATCH_REQUIRED")
    require(os.environ.get("GITHUB_EVENT_NAME") == "workflow_dispatch", "MANUAL_DISPATCH_REQUIRED")
    dry_run = os.environ.get("RELEASE_DRY_RUN", "true")
    require(dry_run in ("true", "false"), "INVALID_DRY_RUN")
    return repo, run_id, dry_run == "true"


def check_no_existing_release(repo):
    base = f"/repos/{repo}"
    require(api(f"{base}/git/ref/tags/{TAG}", absent=True) is None, "EXISTING_TAG_REFUSED")
    require(api(f"{base}/releases/tags/{TAG}", absent=True) is None, "EXISTING_RELEASE_REFUSED")
    # Include drafts, which are not always returned by the tag lookup.
    for page in range(1, 101):
        releases = api(f"{base}/releases?per_page=100&page={page}")
        require(not any(item["tag_name"] == TAG for item in releases), "EXISTING_DRAFT_REFUSED")
        if len(releases) < 100:
            return
    raise ValueError("RELEASE_LIST_BOUND_EXCEEDED")


def source_run(repo, run_id):
    base = f"/repos/{repo}"
    run = api(f"{base}/actions/runs/{run_id}")
    require(str(run["id"]) == run_id and run["repository"]["full_name"] == repo
            and run["head_repository"]["full_name"] == repo, "SOURCE_REPOSITORY_MISMATCH")
    require(run["status"] == "completed" and run["conclusion"] == "success", "SOURCE_RUN_NOT_SUCCESSFUL")
    require(run["head_branch"] == "main" and run["event"] in ("push", "workflow_dispatch"), "SOURCE_MAIN_RUN_REQUIRED")
    workflow = api(f"{base}/actions/workflows/{run['workflow_id']}")
    require(workflow["path"] == EXPECTED_WORKFLOW and run["path"] == EXPECTED_WORKFLOW, "SOURCE_WORKFLOW_MISMATCH")
    require(re.fullmatch(r"[0-9a-f]{40}", run["head_sha"]), "INVALID_SOURCE_COMMIT")
    jobs = api(f"{base}/actions/runs/{run_id}/attempts/{run['run_attempt']}/jobs?per_page=100")
    require(jobs["total_count"] == 1 and len(jobs["jobs"]) == 1, "EXPECTED_ONE_SOURCE_JOB")
    job = jobs["jobs"][0]
    require(job["conclusion"] == "success" and str(job["run_id"]) == run_id, "SOURCE_JOB_NOT_SUCCESSFUL")
    steps = job["steps"]
    build = [step for step in steps if step["name"] == "Build using the documented entry point"]
    maker = [step for step in steps if step["name"] == "Create the genuine unsigned Squirrel installer"]
    lifecycle = [step for step in steps if step["name"] == "Verify installer contents and per-user install lifecycle"]
    require(len(build) == len(maker) == len(lifecycle) == 1
            and all(step["conclusion"] == "success" for step in build + maker + lifecycle), "SOURCE_BUILD_STEPS_INCOMPLETE")
    timing = {"buildStartedAtUtc": build[0]["started_at"], "installerBuiltAtUtc": maker[0]["completed_at"],
              "verificationCompletedAtUtc": job["completed_at"],
              "buildAndVerificationElapsed": elapsed(build[0]["started_at"], job["completed_at"])}
    artifacts = api(f"{base}/actions/runs/{run_id}/artifacts?per_page=100")
    require(artifacts["total_count"] <= 100, "ARTIFACT_LIST_BOUND_EXCEEDED")
    selected = {}
    for name in ("windows-installer-and-evidence", "windows-verification-evidence"):
        matches = [item for item in artifacts["artifacts"] if item["name"] == name]
        require(len(matches) == 1 and not matches[0]["expired"], "EXPECTED_ONE_CURRENT_ARTIFACT")
        item = matches[0]
        require(str(item["workflow_run"]["id"]) == run_id and item["workflow_run"]["head_sha"] == run["head_sha"], "ARTIFACT_SOURCE_MISMATCH")
        selected[name] = {"id": item["id"], "sizeBytes": item["size_in_bytes"], "digest": item.get("digest")}
    return {"repository": repo, "runId": run_id, "runAttempt": str(run["run_attempt"]),
            "sourceCommit": run["head_sha"], "sourceTiming": timing, "artifacts": selected}


def shared_receipt(name):
    packaged = COMBINED / "evidence" / name
    separate = EVIDENCE / name
    require(packaged.is_file() and separate.is_file(), "SHARED_RECEIPT_MISSING")
    require(digest(packaged) == digest(separate), "SHARED_RECEIPT_MISMATCH")
    return decode_json(packaged)


def check_desktop(receipt):
    require(receipt.get("passed") is True and receipt.get("platform") == "win32"
            and receipt.get("mountedFilesystemChecked") is True
            and receipt.get("fixtureRetained") is False and receipt.get("cleanupErrors") == [], "DESKTOP_PROOF_INCOMPLETE")
    require(receipt.get("packagedArtifact", {}).get("launchedBuiltArtifact") is True
            and receipt["packagedArtifact"].get("asar") is True, "PACKAGED_DESKTOP_PROOF_MISSING")
    startup = receipt.get("startupRegistration") or {}
    require(startup.get("disabledReadback") is False and startup.get("enabledReadback") is True, "STARTUP_PROOF_MISSING")
    require(receipt.get("security") == {"sandbox": True, "contextIsolation": True, "nodeIntegration": False}, "DESKTOP_SECURITY_PROOF_MISSING")


def verify_downloads(source):
    build = shared_receipt("build-receipt.json")
    require(build.get("jobStatus") == "success" and build.get("runnerOS") == "Windows"
            and build.get("unsignedInstaller") is True, "BUILD_RECEIPT_FAILED")
    installer = shared_receipt("installer-check.json")
    snapshot = shared_receipt("tested-package-manifest.json")
    for receipt, commit_key in ((build, "commit"), (installer, "sourceCommit"), (snapshot, "commit")):
        require(receipt.get(commit_key) == source["sourceCommit"] and str(receipt.get("runId")) == source["runId"]
                and str(receipt.get("runAttempt")) == source["runAttempt"], "RECEIPT_SOURCE_MISMATCH")
    require(installer.get("passed") is True and installer.get("phase") == "complete"
            and installer.get("failure") is None and installer.get("installRetained") is False
            and installer.get("unsignedInstaller") is True, "INSTALLER_LIFECYCLE_FAILED")
    require(installer.get("package") == {"id": "MaterialFileEncryptor", "version": VERSION, "architecture": "x64"}, "PACKAGE_IDENTITY_MISMATCH")
    install = installer.get("install", {})
    require(install.get("exitCode") == 0 and install.get("freshPerUserRoot") is True
            and install.get("uninstallRegistrationPresent") is True
            and install.get("installedExecutableSignature") == "NotSigned", "INSTALL_PROOF_MISSING")
    uninstall = installer.get("uninstall", {})
    require(uninstall.get("exitCode") == 0 and uninstall.get("attempted") is True
            and all(uninstall.get(key) is True for key in ("applicationDirectoriesRemoved", "registrationRemoved", "startupRemoved", "noInstalledProcesses")), "UNINSTALL_PROOF_MISSING")
    installed = installer.get("installedApplication", {})
    require(installed.get("passed") is True and installed.get("harnessExitCode") == 0
            and installed.get("gracefulCleanup") is True and installed.get("noProcessesAfterExit") is True, "INSTALLED_APP_PROOF_MISSING")
    desktop = shared_receipt("desktop-check.json")
    check_desktop(desktop)
    check_desktop(decode_json(EVIDENCE / "installed" / "desktop-check.json"))
    native = shared_receipt("mounted-filesystem.json")
    checks = native.get("checks", [])
    require(native.get("selfTest") is True and native.get("filesystem") == "WinFsp"
            and len(checks) >= 34 and len(set(checks)) == len(checks), "NATIVE_PROOF_INCOMPLETE")
    require({"cross-process-filesystem", "busy-unmount", "dpapi-unlock", "pinned-offline-mounted-read", "wrong-keyfile", "saved-credential-data-root"}.issubset(checks), "NATIVE_CASES_MISSING")
    hashes = installer["artifactHashes"]
    require(digest(COMBINED / "evidence/tested-package-manifest.json") == hashes["testedManifestSha256"]
            and snapshot.get("packagedDesktopPassed") is True
            and digest(COMBINED / "evidence/desktop-check.json") == snapshot["desktopReceiptSha256"], "SNAPSHOT_BINDING_FAILED")
    directory = COMBINED / "make/squirrel.windows/x64"
    assets = sorted(path for path in directory.iterdir() if path.is_file())
    setup = directory / "MaterialFileEncryptor-Setup.exe"
    releases = directory / "RELEASES"
    packages = list(directory.glob("*-full.nupkg"))
    require(len(assets) == 3 and setup in assets and releases in assets and len(packages) == 1
            and packages[0] in assets, "EXPECTED_EXACT_THREE_INSTALLER_ASSETS")
    package = packages[0]
    for path, key in ((setup, "setupSha256"), (package, "nupkgSha256"), (releases, "releasesSha256")):
        require(digest(path) == hashes[key], "INSTALLER_ASSET_DIGEST_MISMATCH")
    rows = [line for line in releases.read_text(encoding="utf-8-sig").splitlines() if line.strip()]
    require(len(rows) == 1, "FIRST_RELEASE_EXPECTED_ONE_FULL_PACKAGE")
    match = re.fullmatch(r"([a-fA-F0-9]{40})\s+([A-Za-z0-9_.-]+\.nupkg)\s+([0-9]+)", rows[0])
    require(match and match[2] == package.name and int(match[3]) == package.stat().st_size
            and match[1].lower() == digest(package, "sha1"), "RELEASES_ENTRY_MISMATCH")
    require(hashes.get("fullPackages") == 1 and hashes.get("deltaPackages") == 0
            and hashes.get("releasesDigestAndSizeVerified") is True, "RELEASE_PACKAGE_SET_MISMATCH")
    files = snapshot.get("files", [])
    require(len(files) > 5 and len({item["entry"] for item in files}) == len(files), "INVALID_TESTED_MANIFEST")
    payload = installer.get("payload", {})
    require(payload.get("testedEntries") == len(files) and payload.get("nupkgEntriesMatched") == len(files)
            and install.get("installedPayloadEntriesMatched") == len(files)
            and payload.get("requiredResourcesPresent") is True and payload.get("trustedDriverDigestAndSignature") is True, "PAYLOAD_PROOF_INCOMPLETE")
    with zipfile.ZipFile(package) as archive:
        entries = {}
        for info in archive.infolist():
            name = urllib.parse.unquote(info.filename).replace("\\", "/")
            require(not name.startswith("/") and ":" not in name and ".." not in name.split("/"), "UNSAFE_PACKAGE_ENTRY")
            require(name.lower() not in entries, "DUPLICATE_PACKAGE_ENTRY")
            entries[name.lower()] = info
        for item in files:
            key = "lib/net45/" + item["entry"].lower()
            require(key in entries and entries[key].file_size == item["bytes"], "TESTED_PAYLOAD_ENTRY_MISMATCH")
            with archive.open(entries[key]) as stream:
                require(hashlib.file_digest(stream, "sha256").hexdigest() == item["sha256"], "TESTED_PAYLOAD_DIGEST_MISMATCH")
    executable = next(item for item in files if item["entry"] == "MaterialFileEncryptor.exe")
    require(executable["sha256"] == install["installedExecutableSha256"], "INSTALLED_EXECUTABLE_BINDING_FAILED")
    receipt = {"schemaVersion": 1, **source, "tag": TAG, "packageVersion": VERSION,
               "observedPlatform": "GitHub-hosted Windows Server 2022", "unsignedApplication": True,
               "trustedBundledWinFspVerified": True, "nativeCaseCount": len(checks),
               "packagedDesktopPassed": True, "installedDesktopPassed": True, "installAndUninstallPassed": True,
               "selectedRuntimeEntryCount": len(files), "installedExecutableSha256": executable["sha256"],
               "installerReceiptSha256": digest(COMBINED / "evidence/installer-check.json"),
               "unverified": ["Windows 10/11", "fresh sign-in", "provider clients", "cloud transport", "updater behavior"],
               "assets": [{"name": path.name, "bytes": path.stat().st_size, "sha256": digest(path)} for path in assets]}
    return assets, receipt


def upload_asset(repo, release_id, path):
    connection = http.client.HTTPSConnection("uploads.github.com", timeout=180)
    endpoint = f"/repos/{repo}/releases/{release_id}/assets?name=" + urllib.parse.quote(path.name, safe="")
    try:
        connection.putrequest("POST", endpoint)
        connection.putheader("Authorization", f"Bearer {os.environ['GH_TOKEN']}")
        connection.putheader("Accept", "application/vnd.github+json")
        connection.putheader("Content-Type", "application/octet-stream")
        connection.putheader("Content-Length", str(path.stat().st_size))
        connection.putheader("User-Agent", "material-file-encryptor-verified-release")
        connection.endheaders()
        with path.open("rb") as stream:
            while block := stream.read(1024 * 1024):
                connection.send(block)
        response = connection.getresponse()
        require(response.status == 201, "RELEASE_ASSET_UPLOAD_FAILED")
        uploaded = json.load(response)
        require(uploaded["name"] == path.name and uploaded["size"] == path.stat().st_size
                and uploaded.get("digest") == "sha256:" + digest(path), "UPLOADED_ASSET_DIGEST_MISMATCH")
    finally:
        connection.close()


def main():
    require(len(sys.argv) == 2 and sys.argv[1] in ("preflight", "release"), "EXPECTED_PHASE_ARGUMENT")
    repo, run_id, dry_run = configuration()
    OUTPUT.mkdir(exist_ok=True)
    source = source_run(repo, run_id)
    check_no_existing_release(repo)
    if sys.argv[1] == "preflight":
        promotion_id = os.environ.get("GITHUB_RUN_ID", "")
        require(re.fullmatch(r"[1-9][0-9]*", promotion_id) and promotion_id != run_id, "INVALID_PROMOTION_RUN_ID")
        promotion = api(f"/repos/{repo}/actions/runs/{promotion_id}")
        require(promotion["path"] == ".github/workflows/release-verified-windows.yml"
                and promotion["event"] == "workflow_dispatch" and promotion["head_branch"] == "main", "PROMOTION_WORKFLOW_MISMATCH")
        save_json(OUTPUT / "promotion-run.json", {"runId": promotion_id, "startedAtUtc": promotion["run_started_at"]})
        bundled_dim_sum()
        save_json(OUTPUT / "source-run.json", source)
        print("Successful main Windows run and both artifact identities checked; release and tag are absent.")
        return
    require(decode_json(OUTPUT / "source-run.json") == source, "SOURCE_CHANGED_SINCE_PREFLIGHT")
    assets, receipt = verify_downloads(source)
    image, image_receipt = bundled_dim_sum()
    assets.append(image)
    promotion = decode_json(OUTPUT / "promotion-run.json")
    require(promotion["runId"] == os.environ.get("GITHUB_RUN_ID"), "PROMOTION_RUN_MISMATCH")
    verified_at = utc_now()
    receipt["promotionVerification"] = {**promotion, "verifiedAtUtc": verified_at,
                                         "elapsed": elapsed(promotion["startedAtUtc"], verified_at),
                                         "preparationCommit": os.environ["GITHUB_SHA"]}
    receipt["dimSumImage"] = image_receipt
    receipt["assets"].append({"name": image.name, "bytes": image.stat().st_size, "sha256": digest(image)})
    receipt_path = OUTPUT / "verification-receipt.json"
    save_json(receipt_path, receipt)
    notes_base = (f"Unsigned Squirrel.Windows preview for x64. Built and tested at `{source['sourceCommit']}`.\n\n"
             f"Observed on GitHub-hosted Windows Server 2022: {receipt['nativeCaseCount']} native filesystem checks, "
             "packaged and installed application checks, startup registration, graceful exit, and real per-user install/uninstall. "
             "Bundled WinFsp installer hash and trusted signature verified.\n\n"
             "Windows 10/11, fresh sign-in, provider clients, cloud transport, and updater behavior remain unverified. "
             "Application and Setup are unsigned and may trigger Windows unknown-publisher or SmartScreen warnings.\n\n"
             "呢個係未簽署嘅 Windows 預覽版。已喺 Windows Server 2022 測試檔案系統、安裝後嘅程式、開機啟動設定同解除安裝。"
             "內附 WinFsp 安裝程式嘅雜湊同可信簽署已核對。Windows 10/11、重新登入、雲端供應商程式、雲端傳輸同更新流程仍未驗證。"
             "程式同 Setup 未簽署，Windows 可能會顯示發行者不明或者 SmartScreen 警告。\n\n"
             f"![Classic Har Gow 蝦餃](https://github.com/{repo}/releases/download/{TAG}/{image.name})\n")
    notes = notes_base + timing_notes(source, promotion, verified_at, False)
    (OUTPUT / "release-notes.md").write_text(notes, encoding="utf-8")
    plan = {"dryRun": dry_run, "prerelease": True, "tag": TAG, "targetCommit": source["sourceCommit"],
            "sourceRunId": run_id, "overwriteAllowed": False,
            "assets": receipt["assets"] + [{"name": receipt_path.name, "bytes": receipt_path.stat().st_size, "sha256": digest(receipt_path)}]}
    save_json(OUTPUT / "release-plan.json", plan)
    print(json.dumps(plan, indent=2))
    if dry_run:
        print("Dry run complete. No tag, release, or asset was created.")
        return
    # Recheck immediately before creating immutable references. Failures retain the
    # newly owned draft for inspection; never delete or overwrite any existing item.
    check_no_existing_release(repo)
    base = f"/repos/{repo}"
    api(f"{base}/git/refs", method="POST", payload={"ref": f"refs/tags/{TAG}", "sha": source["sourceCommit"]})
    release = api(f"{base}/releases", method="POST", payload={"tag_name": TAG, "target_commitish": source["sourceCommit"],
                  "name": "Material File Encryptor v0.1.0 preview", "body": notes, "draft": True, "prerelease": True, "make_latest": "false"})
    require(release["draft"] is True and release["assets"] == [], "NEW_DRAFT_NOT_EMPTY")
    for path in assets + [receipt_path]:
        upload_asset(repo, release["id"], path)
    uploaded = api(f"{base}/releases/{release['id']}/assets?per_page=100")
    require(len(uploaded) == 5 and {asset["name"] for asset in uploaded} == {path.name for path in assets + [receipt_path]}, "FINAL_ASSET_SET_MISMATCH")
    require(api(f"{base}/git/ref/tags/{TAG}")["object"]["sha"] == source["sourceCommit"], "TAG_TARGET_MISMATCH")
    published = api(f"{base}/releases/{release['id']}", method="PATCH", payload={"draft": False, "prerelease": True, "make_latest": "false"})
    require(published["draft"] is False and published["prerelease"] is True, "PRERELEASE_PUBLICATION_INCOMPLETE")
    plan["publishedReleaseId"] = published["id"]
    plan["publishedAtUtc"] = published["published_at"]
    save_json(OUTPUT / "release-plan.json", plan)
    final_notes = notes_base + timing_notes(source, promotion, published["published_at"], True)
    api(f"{base}/releases/{release['id']}", method="PATCH", payload={"body": final_notes})
    (OUTPUT / "release-notes.md").write_text(final_notes, encoding="utf-8")
    print("Published the verified prerelease with three installer assets, its verification receipt, and the verified dim sum image.")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        code = str(error) if isinstance(error, ValueError) and re.fullmatch(r"[A-Z][A-Z0-9_]+", str(error)) else type(error).__name__
        print(f"Verified release stopped: {code}.", file=sys.stderr)
        sys.exit(1)
