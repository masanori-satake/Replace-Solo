import subprocess
import json
import re
import sys
import os

def get_base_commit():
    # In CI, we usually want to compare against the base branch (e.g. origin/main)
    # If not in CI, compare with the last commit that modified projects/app/version.json
    try:
        # Check if we are in a GitHub Action
        if os.getenv('GITHUB_EVENT_NAME') == 'pull_request':
            # For PRs, compare against the base branch
            base_ref = os.getenv('GITHUB_BASE_REF')
            if base_ref:
                return f"origin/{base_ref}"

        # Fallback: get the last version commit
        cmd = ["git", "log", "-1", "--format=%H", "projects/app/version.json"]
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        return result.stdout.strip()
    except subprocess.CalledProcessError:
        return None

def get_commits_since(commit_hash, paths=None):
    if not commit_hash:
        return []

    cmd = ["git", "log", f"{commit_hash}..HEAD", "--format=%B", "-z"]
    if paths:
        cmd.append("--")
        cmd.extend(paths)

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        commits = result.stdout.split('\0')
        return [c.strip() for c in commits if c.strip()]
    except subprocess.CalledProcessError:
        # If the commit_hash is not reachable (e.g. shallow clone or different branch history)
        # try to get commits since the common ancestor
        try:
            cmd_merge_base = ["git", "merge-base", commit_hash, "HEAD"]
            res_mb = subprocess.run(cmd_merge_base, capture_output=True, text=True, check=True)
            mb = res_mb.stdout.strip()
            cmd = ["git", "log", f"{mb}..HEAD", "--format=%B", "-z"]
            if paths:
                cmd.append("--")
                cmd.extend(paths)
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            commits = result.stdout.split('\0')
            return [c.strip() for c in commits if c.strip()]
        except Exception:
            return []

def get_version_from_file(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f).get('version')
    except Exception:
        return None

def get_version_at_commit(filepath, commit_hash):
    try:
        cmd = ["git", "show", f"{commit_hash}:{filepath}"]
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        return json.loads(result.stdout).get('version')
    except:
        return None

def determine_required_bump(commits):
    bump = None
    for body in commits:
        if bump != "major":
            if "BREAKING CHANGE" in body or re.search(r'^[a-zA-Z]+!:', body, re.MULTILINE):
                bump = "major"
            elif re.search(r'^feat(\(.*\))?:', body, re.MULTILINE) and bump != "major":
                bump = "minor"
            elif re.search(r'^fix(\(.*\))?:', body, re.MULTILINE) and bump is None:
                bump = "patch"
    return bump

def check_impact():
    base_commit = get_base_commit()
    print(f"Comparing against base commit: {base_commit}")

    # Only consider commits that touch app-related files
    impactful_paths = ["projects/app/"]
    commits = get_commits_since(base_commit, impactful_paths)
    required_bump = determine_required_bump(commits)

    if not required_bump:
        print("No feature or fix commits detected. Version bump may not be required.")
        return True

    current_version = get_version_from_file('projects/app/version.json')
    base_version = get_version_at_commit('projects/app/version.json', base_commit)

    if not base_version or not current_version:
        print("Could not determine version. Skipping impact check.")
        return True

    print(f"Base version: {base_version}")
    print(f"Current version: {current_version}")
    print(f"Required bump detected: {required_bump}")

    b_major, b_minor, b_patch = map(int, base_version.split('.'))
    c_major, c_minor, c_patch = map(int, current_version.split('.'))

    if required_bump == "major":
        if c_major > b_major:
            return True
        else:
            print("Error: A BREAKING CHANGE was detected, but the Major version was not bumped.")
            return False
    elif required_bump == "minor":
        if c_major > b_major or (c_major == b_major and c_minor > b_minor):
            return True
        else:
            print("Error: A new feature (feat) was detected, but the Minor version was not bumped.")
            return False
    elif required_bump == "patch":
        if c_major > b_major or (c_major == b_major and c_minor > b_minor) or (c_major == b_major and c_minor == b_minor and c_patch > b_patch):
            return True
        else:
            print("Error: A fix was detected, but the version was not bumped.")
            return False

    return True

if __name__ == "__main__":
    if not check_impact():
        sys.exit(1)
    print("Version impact verification passed.")
